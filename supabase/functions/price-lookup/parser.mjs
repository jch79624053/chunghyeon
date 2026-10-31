export function gramwonURL(input){try{const u=new URL(input);if(u.protocol!=='https:'||u.port||u.username||u.password||!['gramwon.com','www.gramwon.com'].includes(u.hostname))return null;if(!/^\/product\/(?:[^/]+\/\d+\/|detail\.html$)/.test(u.pathname))return null;if(u.pathname.endsWith('detail.html')&&!/^\d+$/.test(u.searchParams.get('product_no')||''))return null;u.hash='';for(const key of [...u.searchParams.keys()])if(key!=='product_no')u.searchParams.delete(key);return u.href}catch{return null}}
export function extractCandidate(html){
 if(typeof html!=='string'||html.length>1500000)return null;
 const candidates=[];
 function walk(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(walk);return}if(value['@graph'])walk(value['@graph']);const types=[value['@type']].flat();if(!types.includes('Product'))return;const offers=[value.offers].flat().filter(Boolean);if(offers.length!==1)return;const offer=offers[0];if(offer['@type']!=='Offer'||offer.priceCurrency!=='KRW'||(offer.availability&&!String(offer.availability).endsWith('/InStock')))return;const price=typeof offer.price==='number'?offer.price:/^\d+(?:\.\d{1,2})?$/.test(String(offer.price))?Number(offer.price):NaN;if(!(price>0&&price<100000000000)||typeof value.name!=='string'||value.name.length>300)return;candidates.push({price,name:value.name})}
 for(const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){try{walk(JSON.parse(match[1]))}catch{}}
 return candidates.length===1?candidates[0]:null;
}
export function robotsAllowsProduct(text,path){
 const groups=[];let group=null;
 for(const raw of text.split(/\r?\n/)){const line=raw.split('#')[0].trim();const split=line.indexOf(':');if(split<0)continue;const key=line.slice(0,split).toLowerCase(),value=line.slice(split+1).trim();if(key==='user-agent'){if(!group||group.rules.length){group={agents:[],rules:[]};groups.push(group)}group.agents.push(value.toLowerCase())}else if(group&&['allow','disallow'].includes(key)&&value)group.rules.push({allow:key==='allow',value})}
 const rules=groups.filter(g=>g.agents.includes('*')).flatMap(g=>g.rules).filter(r=>{try{const pattern=r.value.split('*').map(p=>p.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*');return new RegExp('^'+pattern).test(path)}catch{return true}}).sort((a,b)=>b.value.length-a.value.length||Number(b.allow)-Number(a.allow));
 return !rules.length||rules[0].allow;
}
