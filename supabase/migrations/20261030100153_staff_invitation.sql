alter table manager_private.invitations add column request_id uuid not null default gen_random_uuid();
create policy internal_only on manager_private.bootstrap for all to authenticated using(false) with check(false);
create policy internal_only on manager_private.invitations for all to authenticated using(false) with check(false);
create function manager_private.reserve_invite(p_email text,p_name text,p_role text) returns uuid language plpgsql security definer set search_path='' as $$
declare token uuid;begin
 if not manager_private.is_owner() then raise exception '대표자만 초대할 수 있습니다.' using errcode='42501';end if;
 if p_role not in ('manager','staff') or length(trim(p_name)) not between 1 and 80 or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception '이름·이메일·권한을 확인하세요.';end if;
 if exists(select 1 from auth.users where lower(email)=lower(trim(p_email))) then raise exception '이미 가입된 이메일입니다. 기존 계정은 직원 관리에서 확인하세요.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from public.access_audit where actor=auth.uid() and action='invite_requested' and created_at>now()-interval '1 day')>=10 then raise exception '하루 초대 한도(10회)를 초과했습니다.';end if;
 delete from manager_private.invitations where email=lower(trim(p_email)) and created_at<now()-interval '10 minutes';
 insert into manager_private.invitations(email,display_name,role,invited_by) values(lower(trim(p_email)),trim(p_name),p_role,auth.uid()) returning request_id into token;
 insert into public.access_audit(actor,action,details) values(auth.uid(),'invite_requested',jsonb_build_object('email',lower(trim(p_email)),'role',p_role));
 return token;
end $$;
create function manager_private.release_invite(p_email text,p_request uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not manager_private.is_owner() then raise exception '대표자 권한 필요' using errcode='42501';end if;
 delete from manager_private.invitations where email=lower(trim(p_email)) and request_id=p_request and invited_by=auth.uid() and not exists(select 1 from auth.users where lower(email)=lower(trim(p_email)));
end $$;
create function manager_private.accept_invitation() returns trigger language plpgsql security definer set search_path='' as $$declare invitation manager_private.invitations;begin
 select * into invitation from manager_private.invitations where email=lower(new.email) and created_at>now()-interval '10 minutes' for update;
 if found then
  insert into public.staff_profiles(user_id,display_name,role,secret_access,active) values(new.id,invitation.display_name,invitation.role,false,true);
  insert into public.access_audit(actor,target,action,details) values(invitation.invited_by,new.id,'staff_invited',jsonb_build_object('role',invitation.role));
  delete from manager_private.invitations where email=invitation.email;
 end if;
 return new;
end $$;
create trigger manager_accept_invitation after insert on auth.users for each row execute function manager_private.accept_invitation();
create function public.reserve_invite(p_email text,p_name text,p_role text) returns uuid language sql security invoker set search_path='' as $$select manager_private.reserve_invite(p_email,p_name,p_role)$$;
create function public.release_invite(p_email text,p_request uuid) returns void language sql security invoker set search_path='' as $$select manager_private.release_invite(p_email,p_request)$$;
revoke all on function manager_private.reserve_invite(text,text,text),manager_private.release_invite(text,uuid),manager_private.accept_invitation() from public,anon,authenticated;
grant execute on function manager_private.reserve_invite(text,text,text),manager_private.release_invite(text,uuid) to authenticated;
revoke all on function public.reserve_invite(text,text,text),public.release_invite(text,uuid) from public,anon;
grant execute on function public.reserve_invite(text,text,text),public.release_invite(text,uuid) to authenticated;
notify pgrst,'reload schema';
