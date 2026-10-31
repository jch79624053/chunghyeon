// Normalized records only. Source-specific cell mapping requires verified workbook contents.
const kinds=new Set(['revenue','revenue_refund','expense','expense_refund','transfer','financing_in','financing_out','capital','owner_draw']);
export function summarizeMonths(records){
 if(!Array.isArray(records))throw new Error('정산 내역이 필요합니다.');
 const groups=new Map(),seen=new Set();
 for(const row of records){
  if(!row||typeof row.store!=='string'||!row.store.trim()||!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month)||!kinds.has(row.kind)||typeof row.amount!=='number'||!Number.isFinite(row.amount)||row.amount<0||row.amount>1e12||typeof row.sourceKey!=='string'||!row.sourceKey.trim())throw new Error('매장·월·분류·금액·원본 위치를 확인하세요.');
  const sourceId=JSON.stringify([row.store,row.sourceKey]);if(seen.has(sourceId))throw new Error('원본 위치가 중복됩니다. 합계·세부행 또는 재가져오기를 확인하세요.');seen.add(sourceId);
  const key=JSON.stringify([row.store,row.month]);
  if(!groups.has(key))groups.set(key,{store:row.store,month:row.month,revenue:0,expenses:0,categories:Object.create(null),excluded:[],sourceCount:0});
  const g=groups.get(key);g.sourceCount++;
  if(row.kind==='revenue'||row.kind==='revenue_refund'){g.revenue+=(row.kind==='revenue'?1:-1)*row.amount;continue}
  if(row.kind==='expense'||row.kind==='expense_refund'){
   if(typeof row.category!=='string'||!row.category.trim())throw new Error('지출 항목을 확인하세요.');
   const amount=(row.kind==='expense'?1:-1)*row.amount;g.expenses+=amount;g.categories[row.category]=(g.categories[row.category]||0)+amount;
  }else g.excluded.push({...row});
 }
 return [...groups.values()].map(g=>({...g,balance:g.revenue-g.expenses,expenseRatio:g.revenue>0?g.expenses/g.revenue*100:null,balanceRatio:g.revenue>0?(g.revenue-g.expenses)/g.revenue*100:null,categories:Object.entries(g.categories).map(([category,amount])=>({category,amount,revenueRatio:g.revenue>0?amount/g.revenue*100:null})).sort((a,b)=>b.amount-a.amount)})).sort((a,b)=>a.store.localeCompare(b.store,'ko')||a.month.localeCompare(b.month));
}
function previousMonth(month){const [y,m]=month.split('-').map(Number);return `${m===1?y-1:y}-${String(m===1?12:m-1).padStart(2,'0')}`}
export function compareMonth(current,history){
 const previous=history.find(r=>r.store===current.store&&r.month===previousMonth(current.month));
 if(!previous)return {previous:null,changes:[],observations:['직전 월 자료가 없어 전월 비교를 보류합니다.']};
 const names=new Set([...current.categories,...previous.categories].map(c=>c.category));
 const changes=[...names].map(category=>{const now=current.categories.find(c=>c.category===category),before=previous.categories.find(c=>c.category===category);const amount=now?.amount||0,oldAmount=before?.amount||0,ratio=current.revenue>0?amount/current.revenue*100:null,oldRatio=previous.revenue>0?oldAmount/previous.revenue*100:null;return {category,amount,previousAmount:oldAmount,change:amount-oldAmount,changePercent:oldAmount>0?(amount-oldAmount)/oldAmount*100:null,ratioChangePoints:ratio!==null&&oldRatio!==null?ratio-oldRatio:null}}).sort((a,b)=>(b.ratioChangePoints??-Infinity)-(a.ratioChangePoints??-Infinity));
 const observations=[];
 if(current.revenue<=0||previous.revenue<=0)observations.push('매출이 0 이하인 월은 비중·증감률 판단을 보류합니다.');
 for(const c of changes){if(c.change>0&&c.ratioChangePoints>0)observations.push(`${c.category}: 금액과 매출 대비 비중이 함께 늘었습니다. 단가·수량·일회성 지출을 확인하세요.`)}
 if(current.excluded.length)observations.push('이체·차입·시설투자·대표자 인출은 비용 비중에서 분리했습니다. 현금 잔액과 혼동하지 않도록 별도 확인하세요.');
 observations.push('비중 변화만으로 비용 감축이나 투자 확대를 확정하지 않습니다. 영업일수·재고·일회성 항목·해당 지출의 성과를 함께 확인하세요.');
 return {previous,changes,observations};
}
