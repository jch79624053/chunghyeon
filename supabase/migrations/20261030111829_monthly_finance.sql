create table public.finance_sources (
 store_key text primary key check(store_key ~ '^[a-z_]{2,30}$'),store_name text not null,
 spreadsheet_id text not null,format text not null check(format in ('bhs','ilo','pocha')),
 source_modified_at timestamptz,imported_at timestamptz not null default clock_timestamp()
);
create table public.finance_grants (
 user_id uuid not null references public.staff_profiles(user_id) on delete restrict,store_key text not null references public.finance_sources(store_key) on delete restrict,
 primary key(user_id,store_key)
);
create index finance_grants_store_idx on public.finance_grants(store_key);
create table public.finance_months (
 store_key text not null references public.finance_sources(store_key) on delete restrict,month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 status text not null check(status in ('available','provisional','missing_revenue','future')),
 revenue numeric(16,2) check(revenue>=0 and revenue<1000000000000),reported_expenses numeric(16,2) check(reported_expenses>=0 and reported_expenses<1000000000000),
 payload jsonb not null check(jsonb_typeof(payload)='object'),imported_at timestamptz not null default clock_timestamp(),
 primary key(store_key,month)
);
create function manager_private.can_finance(p_store text) returns boolean language sql stable security definer set search_path='' as $$
select manager_private.is_owner() or (manager_private.is_editor() and exists(select 1 from public.finance_grants where user_id=auth.uid() and store_key=p_store))
$$;
alter table public.finance_sources enable row level security;
alter table public.finance_grants enable row level security;
alter table public.finance_months enable row level security;
create policy finance_source_read on public.finance_sources for select to authenticated using(manager_private.can_finance(store_key));
create policy finance_month_read on public.finance_months for select to authenticated using(manager_private.can_finance(store_key));
create policy finance_grant_read on public.finance_grants for select to authenticated using(user_id=(select auth.uid()) or (select manager_private.is_owner()));
revoke all on public.finance_sources,public.finance_grants,public.finance_months from public,anon,authenticated;
grant select on public.finance_sources,public.finance_grants,public.finance_months to authenticated;
create function manager_private.finance_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not manager_private.is_editor() then raise exception '정산 조회 권한이 없습니다.' using errcode='42501';end if;
 return jsonb_build_object('sources',coalesce((select jsonb_agg(to_jsonb(s) order by store_key) from public.finance_sources s where manager_private.can_finance(s.store_key)),'[]'),'months',coalesce((select jsonb_agg(jsonb_build_object('store_key',m.store_key,'month',m.month,'data',m.payload,'imported_at',m.imported_at) order by m.store_key,m.month) from public.finance_months m where manager_private.can_finance(m.store_key)),'[]'),'grants',case when manager_private.is_owner() then coalesce((select jsonb_agg(to_jsonb(g)) from public.finance_grants g),'[]') else '[]'::jsonb end);
end $$;
create function manager_private.set_finance_access(p_user uuid,p_store text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not manager_private.is_owner() then raise exception '대표자만 정산 권한을 변경할 수 있습니다.' using errcode='42501';end if;
 if not exists(select 1 from public.staff_profiles where user_id=p_user and role='manager' and active) or p_enabled is null then raise exception '활성 관리자 계정만 매장별 정산 조회를 승인할 수 있습니다.';end if;
 if p_enabled then insert into public.finance_grants(user_id,store_key) values(p_user,p_store) on conflict do nothing;else delete from public.finance_grants where user_id=p_user and store_key=p_store;end if;
 insert into public.access_audit(actor,target,action,details) values(auth.uid(),p_user,'finance_access_updated',jsonb_build_object('store_key',p_store,'enabled',p_enabled));
end $$;
create function manager_private.import_finance(p_store text,p_months jsonb,p_expected timestamptz) returns integer language plpgsql security definer set search_path='' as $$
declare src public.finance_sources;item jsonb;g jsonb;count_imported integer:=0;begin
 if not manager_private.is_owner() then raise exception '대표자만 정산 자료를 가져올 수 있습니다.' using errcode='42501';end if;
 select * into src from public.finance_sources where store_key=p_store for update;if not found then raise exception '매장 설정 없음';end if;
 if p_expected is null or p_expected<>src.imported_at then raise exception '새 자료가 이미 반영됐습니다. 새로고침 후 다시 가져오세요.' using errcode='40001';end if;
 if jsonb_typeof(p_months) is distinct from 'array' or jsonb_array_length(p_months) not between 1 and 24 then raise exception '1~24개월 자료만 가져올 수 있습니다.';end if;
 if (select count(*) from jsonb_array_elements(p_months))<>(select count(distinct x->>'month') from jsonb_array_elements(p_months)x) then raise exception '월이 중복됩니다.';end if;
 for item in select * from jsonb_array_elements(p_months) loop
  if item->>'month' !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or item->>'status' not in ('available','provisional','missing_revenue','future') or jsonb_typeof(item->'groups') is distinct from 'array' or jsonb_array_length(item->'groups')>100 or jsonb_typeof(item->'issues') is distinct from 'array' then raise exception '월·상태·비용 분류를 확인하세요.';end if;
  for g in select * from jsonb_array_elements(item->'groups') loop
   if length(g->>'category') not between 1 and 150 or (g->>'amount')::numeric<0 or (g->>'amount')::numeric>=1000000000000 or jsonb_typeof(g->'cells') is distinct from 'array' then raise exception '비용 항목 입력 오류';end if;
  end loop;
  insert into public.finance_months(store_key,month,status,revenue,reported_expenses,payload) values(p_store,item->>'month',item->>'status',(item->>'revenue')::numeric,(item->>'reportedExpenses')::numeric,item||jsonb_build_object('store',src.store_name)) on conflict(store_key,month) do update set status=excluded.status,revenue=excluded.revenue,reported_expenses=excluded.reported_expenses,payload=excluded.payload,imported_at=clock_timestamp();
  count_imported:=count_imported+1;
 end loop;
 update public.finance_sources set imported_at=clock_timestamp() where store_key=p_store;
 insert into public.access_audit(actor,action,details) values(auth.uid(),'finance_imported',jsonb_build_object('store_key',p_store,'months',count_imported));return count_imported;
end $$;
create function public.finance_snapshot() returns jsonb language sql security invoker set search_path='' as $$select manager_private.finance_snapshot()$$;
create function public.set_finance_access(p_user uuid,p_store text,p_enabled boolean) returns void language sql security invoker set search_path='' as $$select manager_private.set_finance_access(p_user,p_store,p_enabled)$$;
create function public.import_finance(p_store text,p_months jsonb,p_expected timestamptz) returns integer language sql security invoker set search_path='' as $$select manager_private.import_finance(p_store,p_months,p_expected)$$;
revoke all on function manager_private.can_finance(text),manager_private.finance_snapshot(),manager_private.set_finance_access(uuid,text,boolean),manager_private.import_finance(text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function manager_private.can_finance(text),manager_private.finance_snapshot(),manager_private.set_finance_access(uuid,text,boolean),manager_private.import_finance(text,jsonb,timestamptz) to authenticated;
revoke all on function public.finance_snapshot(),public.set_finance_access(uuid,text,boolean),public.import_finance(text,jsonb,timestamptz) from public,anon;
grant execute on function public.finance_snapshot(),public.set_finance_access(uuid,text,boolean),public.import_finance(text,jsonb,timestamptz) to authenticated;
notify pgrst,'reload schema';
