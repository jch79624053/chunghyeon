import {createClient} from 'npm:@supabase/supabase-js@2.95.0';
const site='https://jch79624053.github.io/chunghyeon/';
const cors={'Access-Control-Allow-Origin':'https://jch79624053.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
export async function handler(req:Request){
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'POST 요청만 가능합니다.'},405);
 if(Number(req.headers.get('content-length')||0)>4096)return reply({error:'요청이 너무 큽니다.'},413);
 const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return reply({error:'로그인이 필요합니다.'},401);
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
 const caller=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await caller.auth.getUser(token);
 if(authError||!auth.user)return reply({error:'로그인을 다시 해주세요.'},401);
 const {data:profile,error:profileError}=await caller.from('staff_profiles').select('role,active').eq('user_id',auth.user.id).single();
 if(profileError||!profile?.active||profile.role!=='owner')return reply({error:'대표자만 초대할 수 있습니다.'},403);
 let body;try{const raw=await req.text();if(raw.length>4096)return reply({error:'요청이 너무 큽니다.'},413);body=JSON.parse(raw)}catch{return reply({error:'입력값을 확인하세요.'},400)}
 const email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim(),role=body.role;
 if(!name||name.length>80||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!['manager','staff'].includes(role))return reply({error:'이름·이메일·권한을 확인하세요.'},400);
 const {data:reservation,error:reserveError}=await caller.rpc('reserve_invite',{p_email:email,p_name:name,p_role:role});
 if(reserveError)return reply({error:reserveError.message},400);
 try{
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:site+'?type=invite'});
  if(error){await caller.rpc('release_invite',{p_email:email,p_request:reservation});return reply({error:'초대 이메일 발송에 실패했습니다. 이메일 설정·발송 한도를 확인한 뒤 다시 시도하세요.'},502)}
  if(!data.user)return reply({error:'초대 결과를 확인할 수 없습니다. 직원 목록을 새로고침하세요.'},502);
  return reply({ok:true});
 }catch{await caller.rpc('release_invite',{p_email:email,p_request:reservation});return reply({error:'초대 처리 연결에 실패했습니다. 직원 목록 확인 후 다시 시도하세요.'},502)}
}

