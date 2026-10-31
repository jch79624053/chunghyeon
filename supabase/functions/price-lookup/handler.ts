import {createClient} from 'npm:@supabase/supabase-js@2.95.0';
import {gramwonURL,extractCandidate,robotsAllowsProduct} from './parser.mjs';
const cors={'Access-Control-Allow-Origin':'https://jch79624053.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
async function fetchText(url:string,maxBytes:number){
 const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'ChunghyeonManager/1.0 (single-product price check)','Accept':'text/html,text/plain'}});
 if(!response.ok)throw new Error('구매처가 공개 조회에 응답하지 않았습니다. 구매 링크에서 직접 확인하세요.');
 if(Number(response.headers.get('content-length')||0)>maxBytes)throw new Error('응답 크기가 커서 자동 조회를 중단했습니다.');
 const reader=response.body?.getReader();if(!reader)throw new Error('응답 없음');let length=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes){await reader.cancel();throw new Error('응답 크기 초과')}chunks.push(value)}
 const buffer=new Uint8Array(length);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length}return new TextDecoder().decode(buffer);
}
export async function handler(req:Request){
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return reply({error:'POST 요청만 가능합니다.'},405);
 const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return reply({error:'로그인이 필요합니다.'},401);
 const url=Deno.env.get('SUPABASE_URL')!,caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await caller.auth.getUser(token);if(authError||!auth.user)return reply({error:'로그인을 다시 해주세요.'},401);
 let materialId;try{const raw=await req.text();if(raw.length>1024)return reply({error:'잘못된 요청'},400);materialId=JSON.parse(raw).material_id}catch{return reply({error:'원자재를 선택하세요.'},400)}
 if(!Number.isSafeInteger(materialId)||materialId<=0)return reply({error:'원자재를 선택하세요.'},400);
 const {data:job,error}=await caller.rpc('request_price_check',{p_material:materialId});if(error)return reply({error:error.message},403);
 if(job.cached)return reply({ok:true,...job});
 const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 let result:{status:string;message:string;price?:number;product_name?:string};
 const target=gramwonURL(job.source_url);
 if(!target){result={status:'manual',message:'이 구매처는 검증된 무료 자동 조회 경로가 연결되지 않았습니다. 구매 링크에서 같은 옵션을 확인해 입력하세요.'}}
 else{try{const u=new URL(target),robots=await fetchText(u.origin+'/robots.txt',100000);if(!robotsAllowsProduct(robots,u.pathname+u.search))throw new Error('판매처의 자동 수집 제한에 따라 직접 확인이 필요합니다.');const html=await fetchText(target,1500000),candidate=extractCandidate(html);result=candidate?{status:'candidate',price:candidate.price,product_name:candidate.name,message:'공개 기본 판매가 후보입니다. 포장·옵션·배송비·할인·재고를 직접 확인한 뒤 저장하세요.'}:{status:'manual',message:'동일 상품의 단일 판매가를 확정할 수 없습니다. 구매 링크에서 직접 확인하세요.'}}catch(error){result={status:'error',message:error instanceof Error?error.message:'가격 조회 연결에 실패했습니다.'}}}
 const {data:saved,error:saveError}=await admin.from('price_checks').update({...result,checked_at:new Date().toISOString()}).eq('id',job.id).select().single();
 if(saveError)return reply({error:'조회 결과 저장에 실패했습니다. 구매가는 변경하지 않았습니다.'},500);
 return reply({ok:true,...saved,cached:false});
}

