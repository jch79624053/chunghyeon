import {handler as invite} from '../supabase/functions/invite-staff/handler.ts';
import {handler as price} from '../supabase/functions/price-lookup/handler.ts';
for(const [name,handler] of [['invite',invite],['price',price]] as const){
 Deno.test(`${name}: anonymous POST is rejected before any privileged action`,async()=>{const res=await handler(new Request('https://example.invalid/function',{method:'POST',body:'{}'}));if(res.status!==401)throw Error(`Expected 401, got ${res.status}`);});
 Deno.test(`${name}: only POST can trigger an operation`,async()=>{const res=await handler(new Request('https://example.invalid/function'));if(res.status!==405)throw Error(`Expected 405, got ${res.status}`);});
 Deno.test(`${name}: preflight is allowed only for production origin`,async()=>{const res=await handler(new Request('https://example.invalid/function',{method:'OPTIONS',headers:{Origin:'https://evil.example'}}));if(res.headers.get('Access-Control-Allow-Origin')!=='https://jch79624053.github.io')throw Error('Unexpected origin');});
}
