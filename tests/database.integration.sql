begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.manager',gen_random_uuid()::text,true),set_config('test.staff',gen_random_uuid()::text,true),set_config('test.stranger',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values
(current_setting('test.owner')::uuid,'integration-owner@example.invalid',now()),
(current_setting('test.manager')::uuid,'integration-manager@example.invalid',now()),
(current_setting('test.staff')::uuid,'integration-staff@example.invalid',now()),
(current_setting('test.stranger')::uuid,'integration-stranger@example.invalid',now());
insert into public.staff_profiles(user_id,display_name,role,secret_access) values
(current_setting('test.owner')::uuid,'검증 대표자','owner',true),
(current_setting('test.manager')::uuid,'검증 관리자','manager',false),
(current_setting('test.staff')::uuid,'검증 직원','staff',false);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$
declare m bigint;s bigint;r bigint;updated timestamptz;before_count integer;v jsonb;job jsonb;begin
 assert public.activate_owner()=false,'지정 이메일 외 대표자 부트스트랩 금지';
 m:=public.save_material(null,'{"name":"검증 밀가루","purchase_price":12000,"purchase_quantity":2,"unit":"kg","purchase_url":"https://www.gramwon.com/product/test/208/"}',null);
 select updated_at into updated from public.materials where id=m;
 assert (select count(*) from public.material_price_history where material_id=m)=1,'최초 가격 이력';
 perform public.save_material(m,'{"name":"검증 밀가루","purchase_price":12000,"purchase_quantity":4,"unit":"kg","purchase_url":"https://www.gramwon.com/product/test/208/"}',updated);
 assert (select count(*) from public.material_price_history where material_id=m)=2,'포장 규격 변경도 이력 저장';job:=public.request_price_check(m);assert (job->>'cached')::boolean=false,'최초 조회 예약';job:=public.request_price_check(m);assert (job->>'cached')::boolean=true,'중복 조회 캐시';
 begin perform public.save_material(m,'{"name":"덮어쓰기","purchase_price":999,"purchase_quantity":2,"unit":"kg","purchase_url":"https://www.gramwon.com/product/test/208/"}',updated);raise exception 'FAIL stale write accepted';exception when serialization_failure then null;end;
 s:=public.save_recipe(null,'{"name":"검증 소스","yield_quantity":200,"yield_unit":"g"}',jsonb_build_array(jsonb_build_object('material_id',m,'amount',100)),true,null);
 r:=public.save_recipe(null,'{"name":"검증 메뉴","selling_price":20000,"instructions":"끓인다"}',jsonb_build_array(jsonb_build_object('material_id',m,'amount',100),jsonb_build_object('secret_recipe_id',s,'amount',50)),false,null);
 perform set_config('test.recipe',r::text,true);perform set_config('test.material',m::text,true);perform set_config('test.secret',s::text,true);
 v:=public.management_snapshot();assert (v->'recipe_costs'->>r::text)::numeric=375,'비밀 배합 포함 원가';
 select updated_at into updated from public.recipes where id=r;
 begin perform public.save_recipe(r,'{"name":"실패시 원복","selling_price":100}',jsonb_build_array(jsonb_build_object('material_id',-1,'amount',50)),false,updated);raise exception 'FAIL invalid ingredient accepted';exception when foreign_key_violation then null;end;
 assert (select name from public.recipes where id=r)='검증 메뉴','레시피 본문 원복';
 assert (select count(*) from public.recipe_items where recipe_id=r)=2,'재료 목록 원복';
 begin perform public.set_staff_access(current_setting('test.owner')::uuid,'staff',false,false);raise exception 'FAIL owner changed';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin insert into public.materials(name,unit) values('직접입력','g');raise exception 'FAIL direct write accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.manager'),true);
set local role authenticated;
do $$declare v jsonb;begin
 assert (select count(*) from public.secret_recipe_items)=0,'미승인 관리자 비밀 배합 차단';
 v:=public.management_snapshot();assert jsonb_array_length(v->'secret_recipe_items')=0,'관리 스냅샷 배합 누출 없음';
 assert (v->'recipe_costs'->>current_setting('test.recipe'))::numeric=375,'미승인 관리자 집계 원가 조회';
 begin perform public.set_staff_access(current_setting('test.staff')::uuid,'manager',true,true);raise exception 'FAIL manager escalated';exception when insufficient_privilege then null;end;
 begin perform public.reserve_invite('not-sent@example.invalid','테스트','staff');raise exception 'FAIL manager invited';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.staff'),true);
set local role authenticated;
do $$declare v jsonb;begin
 assert (select count(*) from public.materials)=0,'직원 구매가 차단';begin perform public.request_price_check(current_setting('test.material')::bigint);raise exception 'FAIL staff price lookup';exception when insufficient_privilege then null;end;
 assert (select count(*) from public.secret_recipes)=0,'직원 배합 테이블 차단';
 v:=public.staff_recipe_view();assert jsonb_array_length(v)=1,'직원 조리 정보';
 assert not (v->0 ? 'selling_price'),'직원 판매가 없음';
 assert not (v->0 ? 'cost'),'직원 원가 없음';
 assert v->0->>'instructions'='끓인다','직원 조리 순서';
 begin perform public.management_snapshot();raise exception 'FAIL staff management access';exception when insufficient_privilege then null;end;
 begin perform public.save_material(null,'{"name":"권한없음","unit":"g"}',null);raise exception 'FAIL staff writes';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select public.set_staff_access(current_setting('test.staff')::uuid,'staff',true,true);
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.staff'),true);
set local role authenticated;
do $$begin assert jsonb_array_length(public.staff_recipe_view())=2,'승인 직원의 조리용 배합 접근';assert (select count(*) from public.materials)=0,'배합 승인 후에도 원가 차단';end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select public.set_staff_access(current_setting('test.staff')::uuid,'staff',false,false);
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.staff'),true);
set local role authenticated;
do $$begin begin perform public.staff_recipe_view();raise exception 'FAIL inactive staff reads';exception when insufficient_privilege then null;end;end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.stranger'),true);
set local role authenticated;
do $$begin assert not public.activate_owner(),'외부 가입자 대표자 활성화 차단';assert (select count(*) from public.materials)=0,'미등록 사용자 조회 차단';end $$;
reset role;
set local role anon;
do $$begin begin perform public.management_snapshot();raise exception 'FAIL anonymous RPC';exception when insufficient_privilege then null;end;begin perform manager_private.is_editor();raise exception 'FAIL anonymous private schema';exception when insufficient_privilege then null;end;end $$;
reset role;
select 'PASS: role isolation, secret approval, atomic rollback, stale-write protection, price history; all fixture rows rolled back' as result;
rollback;
