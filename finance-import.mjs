const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const norm=v=>String(v??'').replace(/\s/g,'');
function col(index){let s='';for(index++;index>0;index=Math.floor((index-1)/26))s=String.fromCharCode(65+(index-1)%26)+s;return s}
export function parseSettlement({store,format,year,sheet,rows,asOfMonth}){
 if(!['bhs','ilo','pocha'].includes(format)||!Number.isInteger(year)||year<2000||year>2100||!Array.isArray(rows)||!/^\d{4}-\d{2}$/.test(asOfMonth))throw Error('정산 양식·연도·기준월을 확인하세요.');
 const starts=rows.map((r,i)=>({i,month:/^(\d{1,2})월(?:\s*월말정산)?$/.exec(String(r?.[0]||'').trim())?.[1]})).filter(x=>x.month);const result=[];
 for(let k=0;k<starts.length;k++){
  const {i:start,month:monthNumber}=starts[k],end=starts[k+1]?.i??rows.length,month=`${year}-${String(monthNumber).padStart(2,'0')}`;
  if(+monthNumber<1||+monthNumber>12||result.some(r=>r.month===month))throw Error('월 제목이 잘못됐거나 중복됩니다.');
  const block=rows.slice(start,end),get=(r,c)=>block[r]?.[c],find=(label,column=0)=>block.findIndex(r=>norm(r?.[column])===norm(label));
  const source=(r,c)=>`${sheet}!${col(c)}${start+r+1}`,groups=[],issues=[],sections=[];let revenue=null,reportedExpenses=null,reportedBalance=null;
  function add(category,amount,r,c=0){if(numeric(amount)===null)return;if(amount<0){issues.push('음수 지출 항목이 있어 상세 분류를 확인해야 합니다.');return}if(amount)groups.push({category,amount,cell:source(r,c)})}
  function allocate(section,total,parts,r){sections.push({name:section,amount:total,cell:source(r,0)});if(total===null){issues.push(`${section} 합계가 비어 있습니다.`);return}const sum=parts.reduce((a,p)=>a+p.amount,0);if(sum>total+1){add(section,total,r);issues.push(`${section}: 세부 금액 합계가 원본 소계보다 커 상세 분류를 보류했습니다.`)}else {groups.push(...parts);if(total-sum>1){add(`${section} 분류 확인`,total-sum,r);issues.push(`${section}: 원본 소계와 세부 금액의 차이를 분류 확인 항목으로 남겼습니다.`)}}}
  const classifyFixed=label=>/노란|노랑|우산|공제/.test(label)?'공제·적립(정산 포함)':/월세|임대/.test(label)?'임차료':/보험/.test(label)?'매장보험':/세무/.test(label)?'세무·회계':'기타 고정비';
  const classifyVariable=label=>/연금|고용|산재|건강|보험/.test(label)?'4대보험':/세금|국세|등록/.test(label)?'세금·공과금':/전기|가스|수도|공과금|한전|예스코/.test(label)?'수도·전기·가스':/음쓰|음식물/.test(label)?'음식물 처리':/주류/.test(label)?'주류 매입':/야채|해산물|어묵|닭|계란|식재료|식자재/.test(label)?'식재료 매입':/쿠팡|네이버/.test(label)?'온라인 구매(품목 혼합)':'기타 변동비(분류 확인)';
  const partsAt=(headerRow,valueRow,startCol,endCol,classify)=>Array.from({length:endCol-startCol},(_,n)=>n+startCol).flatMap(c=>{const amount=numeric(get(valueRow,c));return amount>0?[{category:classify([get(headerRow,c),get(headerRow+1,c),get(headerRow-1,c)].filter(v=>typeof v==='string').join(' ')),amount,cell:source(valueRow,c)}]:[]});
  if(format==='bhs'){
   const summary=find('매출 합계');revenue=numeric(get(summary+1,0));const balanceCol=block[summary]?.findIndex(v=>norm(v)==='순이익');reportedBalance=balanceCol>=0?numeric(get(summary+1,balanceCol)):null;
   const fixed=find('고정지출'),variable=find('변동지출'),labor=find('인건비');const ft=numeric(get(fixed+2,0)),vt=numeric(get(variable+2,0)),lt=numeric(get(labor+2,0));
   allocate('고정비',ft,partsAt(fixed+1,fixed+2,1,9,classifyFixed),fixed+2);
   const utility=partsAt(variable,variable+1,1,13,classifyVariable),purchases=partsAt(variable+2,variable+4,1,12,c=>classifyVariable(c));
   allocate('변동비',vt,[...utility,...purchases],variable+2);sections.push({name:'인건비',amount:lt,cell:source(labor+2,0)});add('인건비',lt,labor+2);
   const wageParts=Array.from({length:12},(_,i)=>numeric(get(labor+1,i+1))||0).reduce((a,b)=>a+b,0);
   if(lt!==null&&Math.abs(lt-wageParts)>1)issues.push('인건비 원본 소계와 급여 행 합계가 다릅니다. 기타 지급·정산 포함 여부를 확인하세요.');
   reportedExpenses=[ft,vt,lt].every(v=>v!==null)?ft+vt+lt:null;
   if(summary<0||fixed<0||variable<0||labor<0)throw Error(`${month}: 밥한술 필수 항목을 찾지 못했습니다.`);
  }else if(format==='ilo'){
   const summary=find('실매출',2),totals=block.findIndex(r=>norm(r?.[2])==='고정지출비'&&norm(r?.[3])==='변동지출비'&&norm(r?.[4])==='인건비');
   if(summary<0||totals<0)throw Error(`${month}: 일오 필수 항목을 찾지 못했습니다.`);
   revenue=numeric(get(summary+1,2));reportedExpenses=numeric(get(summary+1,3));reportedBalance=numeric(get(summary+1,4));
   const fixed=block.findIndex(r=>norm(r?.[2])==='고정출비'),fixedParts=partsAt(fixed+1,fixed+3,2,9,classifyFixed);
   allocate('고정비',numeric(get(totals+1,2)),fixedParts,totals+1);
   const variable=find('변동지출비',2);allocate('변동비',numeric(get(totals+1,3)),partsAt(variable+1,variable+3,2,14,classifyVariable),totals+1);
   for(const [c,label]of [[4,'인건비'],[5,'식재료 매입'],[6,'주류 매입']]){sections.push({name:label,amount:numeric(get(totals+1,c)),cell:source(totals+1,c)});add(label,numeric(get(totals+1,c)),totals+1,c)}
  }else{
   const sales=block.findIndex(r=>norm(r?.[0])==='합계'&&norm(r?.[1])==='볶음류'),summary=find('총지출');if(sales<0||summary<0)throw Error(`${month}: 짝퉁포차 필수 항목을 찾지 못했습니다.`);
   revenue=numeric(get(sales+1,0));reportedExpenses=numeric(get(summary+1,0));reportedBalance=numeric(get(summary+1,1));
   const fixed=find('고정지출비');allocate('고정비',numeric(get(fixed+2,0)),partsAt(fixed,fixed+2,1,8,classifyFixed),fixed+2);
   const variable=find('변동지출비');allocate('변동비',numeric(get(variable+2,0)),partsAt(variable+1,variable+2,1,9,classifyVariable),variable+2);
   const labor=find('인건비');const wages=numeric(get(labor+2,0));sections.push({name:'인건비',amount:wages,cell:source(labor+2,0)});add('인건비',wages,labor+2);
   const other=find('기타지출비');const otherParts=partsAt(other,other+2,1,10,label=>/잔금|인테리어|누수|공사/.test(label)?'공사·수선(일회성 검토)':'기타 지출');allocate('기타 지출',numeric(get(other+2,0)),otherParts,other+2);
   const food=find('식자재'),foodParts=partsAt(food+2,food+3,1,9,label=>/주류/.test(label)?'주류 매입':/음료/.test(label)?'음료 매입':'식재료 매입');allocate('식자재·주류 매입',numeric(get(food+3,0)),foodParts,food+3);
  }
  const expenseTotal=groups.reduce((s,g)=>s+g.amount,0),difference=reportedExpenses===null?null:reportedExpenses-expenseTotal;
  if(difference!==null&&Math.abs(difference)>1)issues.push('지출 항목 합계와 원본 총지출이 다릅니다. 분석 제안을 확정하기 전 확인하세요.');
  const net=revenue===null||reportedExpenses===null?null:revenue-reportedExpenses;
  if(net!==null&&reportedBalance!==null&&Math.abs(net-reportedBalance)>1)issues.push('매출-지출 계산값과 원본 순수익 표시가 다릅니다.');
  const status=month>asOfMonth?'future':revenue===null?'missing_revenue':month===asOfMonth?'provisional':'available';
  if(status==='future'||status==='missing_revenue')issues.push('매출이 없거나 미래 월의 미리 입력된 비용입니다. 적자 월로 집계하지 않습니다.');
  if(status==='provisional')issues.push('진행 중인 월 자료입니다. 전월 전체와 비교한 절감 제안은 보류합니다.');
  const combined=new Map();for(const g of groups){if(!combined.has(g.category))combined.set(g.category,{category:g.category,amount:0,cells:[]});const c=combined.get(g.category);c.amount+=g.amount;c.cells.push(g.cell)}
  result.push({store,month,status,revenue,reportedExpenses,reportedBalance,balance:net,groups:[...combined.values()],issues,sections,reconciliationDifference:difference,sourceSheet:sheet,sourceStartRow:start+1});
 }
 return result.sort((a,b)=>a.month.localeCompare(b.month));
}
export function settlementView(month){
 const valid=['available','provisional'].includes(month.status)&&month.revenue>0;
 return {...month,expenseRatio:valid&&month.reportedExpenses!==null?month.reportedExpenses/month.revenue*100:null,balanceRatio:valid&&month.balance!==null?month.balance/month.revenue*100:null,groups:month.groups.map(g=>({...g,ratio:valid?g.amount/month.revenue*100:null}))};
}
export function settlementAdvice(current,months){
 if(current.status!=='available'||!(current.revenue>0)||Math.abs(current.reconciliationDifference||0)>1)return ['미결산·진행 중·합계 불일치 자료는 절감 제안을 보류합니다.'];
 if(current.issues?.length)return ['원본 확인 항목이 있어 항목별 절감·확대 판단을 보류합니다. 먼저 급여·일회성 지출·합계 수식의 포함 범위를 확인하세요.'];
 const [year,month]=current.month.split('-').map(Number),previousKey=`${month===1?year-1:year}-${String(month===1?12:month-1).padStart(2,'0')}`,previous=months.find(m=>m.store===current.store&&m.month===previousKey&&m.status==='available');const advice=[];
 if(previous&&previous.revenue>0){const salesChange=(current.revenue/previous.revenue-1)*100;advice.push(`전월 대비 매출 ${salesChange>=0?'+':''}${salesChange.toFixed(1)}%. 비용 증감과 함께 확인하세요.`);
  for(const g of current.groups){const p=previous.groups.find(x=>x.category===g.category),old=p?.amount||0,points=g.amount/current.revenue*100-old/previous.revenue*100;if(points>=1&&g.amount>old)advice.push(`${g.category}: 지출 +${Math.round(g.amount-old).toLocaleString('ko-KR')}원, 매출 대비 +${points.toFixed(1)}%p. 단가·수량·발생 사유를 점검하세요.`);else if(points>=2&&g.amount<=old)advice.push(`${g.category}: 지출은 늘지 않았지만 매출 감소로 비중이 +${points.toFixed(1)}%p 높아졌습니다. 비용 삭감 외에 매출 회복도 함께 검토하세요.`)}
 }else advice.push('직전 월의 비교 가능한 자료가 없습니다. 다른 월을 임의로 전월로 사용하지 않습니다.');
 if(current.groups.some(g=>g.category.includes('일회성')))advice.push('공사·수선 지출은 일회성 가능성이 있습니다. 매달 반복되는 적자로 일반화하기 전에 구분하세요.');
 if(current.groups.some(g=>g.category.includes('적립')))advice.push('공제·적립은 정산 지출에 포함해 보존했습니다. 소모성 운영비와 구분해 보세요.');
 advice.push('투자·인력 확대는 지출 비중만으로 권하지 않습니다. 추가 매출·고객 수·영업일수·재고 변화와 해당 지출의 성과를 확인한 뒤 판단하세요.');return advice;
}
export function readSettlementCSV(text){
 if(typeof text!=='string'||text.length>2000000)throw Error('CSV 파일은 2MB 이하로 선택하세요.');
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],value='',quoted=false;
 const push=()=>{const clean=value.trim(),numericText=clean.replace(/[₩,\s]/g,'');row.push(clean===''?null:/^[-+]?\d+(?:\.\d+)?%?$/.test(numericText)?Number(numericText.replace('%',''))/(numericText.endsWith('%')?100:1):value);value='';if(row.length>60)throw Error('CSV 열 수가 너무 많습니다.');};
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted)push();else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;push();rows.push(row);row=[];if(rows.length>1000)throw Error('CSV 행 수가 너무 많습니다.')}else value+=c}
 if(quoted)throw Error('CSV 따옴표가 닫히지 않았습니다.');if(value||row.length){push();rows.push(row)}return rows;
}
