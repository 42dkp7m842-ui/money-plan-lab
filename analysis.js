/* Money Plan Lab v1.7 - local-only spending and goal analysis, no network access */
"use strict";
(function(){
const yenA=v=>yen(Math.round(Number(v)||0));
const safeNum=v=>Number.isFinite(Number(v))?Number(v):0;
const formatSigned=v=>(v<0?'−':'+')+yenA(Math.abs(v));
const MONTHS=12;
const dateMonth=()=>new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');
const aState=()=>{if(!state.analysis||typeof state.analysis!=='object'||Array.isArray(state.analysis))state.analysis={};if(!state.analysis.categoryBudgets||typeof state.analysis.categoryBudgets!=='object')state.analysis.categoryBudgets={};return state.analysis};
function actualExpense(t){return t.type==='expense'&&t.countable!==false&&!(t.moveKind||cashMovement(t))}
function hasCountable(t){return t.countable!==false}
function monthsData(){
 const months=new Map();
 for(const t of (state.transactions||[])){
  if(!t||!t.date||!t.date.match(/^\d{4}-\d\d-\d\d/))continue;
  const key=t.date.slice(0,7);
  if(!months.has(key))months.set(key,{month:key,income:0,expense:0,zaimExpense:0,excluded:0,transfers:0,movements:0,categories:{},count:0,days:[]});
  const m=months.get(key);m.count++;m.days.push(Number(t.date.slice(8)));
  if(t.type==='transfer'){m.transfers+=Math.abs(safeNum(t.amount));continue}
  if(!hasCountable(t)){m.excluded+=safeNum(t.amount);continue}
  if(t.type==='income'){m.income+=safeNum(t.amount);continue}
  if(t.type==='expense'){
   m.zaimExpense+=safeNum(t.amount);
   if(actualExpense(t)){m.expense+=safeNum(t.amount);const cat=t.category||'未分類';m.categories[cat]=(m.categories[cat]||0)+safeNum(t.amount)}
   else m.movements+=safeNum(t.amount);
  }
 }
 return [...months.values()].sort((x,y)=>x.month.localeCompare(y.month)).map(m=>({...m,net:m.income-m.expense,partial:Math.min(...m.days)>1}));
}
function monthGoal(month){
 const p=(state.monthlyPlans||[]).find(p=>p.month===month);
 return Number.isFinite(Number(p?.savingTarget))&&p?.savingTarget!==undefined?safeNum(p.savingTarget):safeNum(state.settings?.saving);
}
function livingBudget(month){
 const p=(state.monthlyPlans||[]).find(p=>p.month===month);
 return p?.livingBudget!==undefined?safeNum(p.livingBudget):safeNum(state.settings?.livingBudget);
}
function fmtShort(n){return Math.round(n/10000*10)/10+'万'}
function metric(label,value,note){return '<div class="analysis-metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><em>'+esc(note)+'</em></div>'}
function renderMetrics(m,rows){
 const month=m?.month||'';
 const budget=month?livingBudget(month):safeNum(state.settings?.livingBudget);
 const goal=month?monthGoal(month):safeNum(state.settings?.saving);
 const html=m?
   metric('対象月の収入',yenA(m.income),monthLabel(month))+
   metric('生活支出（目安）',yenA(m.expense),'Zaim明細・引出/チャージ除く')+
   metric('参考収支差額',formatSigned(m.net),'貯金額ではありません')+
   metric('生活費予算との差',budget>0?formatSigned(budget-m.expense):'未設定',budget>0?'予算残の参考値':'カテゴリ別予算も設定可能'):
   metric('Zaim明細','未登録','Zaim取込からCSVを登録')+
   metric('カード請求',state.cards.length+'件','カードタブの確定情報')+
   metric('貯金目標',goal>0?yenA(goal):'未設定','AI計画または設定')+
   metric('生活費予算',budget>0?yenA(budget):'未設定','AI計画または設定');
 $('#analysisMetrics').innerHTML=html;
}
function monthsRemaining(deadline){
 if(!deadline)return null;
 const d=new Date(deadline+'T23:59:59');if(Number.isNaN(d.getTime()))return null;
 const now=new Date();if(d<now)return 0;
 const a=(d.getFullYear()-now.getFullYear())*12+d.getMonth()-now.getMonth()+1;
 return Math.max(1,a);
}
function savingsCurrent(g){
 if(g.currentAmount!==undefined&&g.currentAmount!==null)return safeNum(g.currentAmount);
 return safeNum(state.settings.savingsBalance);
}
function percent(x,limit=100){return Math.max(0,Math.min(limit,Number.isFinite(x)?x:0))}
function renderGoalPosition(rows){
 const goals=(state.goals||[]).filter(g=>g&&typeof g==='object');
 const settings=state.settings||{};
 let html='';
 const goalRows=goals.filter(g=>['savings','debt','spending','custom'].includes(g.type));
 for(const g of goalRows){
  const target=safeNum(g.targetAmount);
  const cur=g.type==='debt'?Math.max(0,target-safeNum(settings.debt)):savingsCurrent(g);
  const rem=Math.max(0,target-cur),p=target>0?percent(cur/target*100):100;
  const remaining=monthsRemaining(g.deadline);
  const need=remaining===null?'期限未設定':remaining>0?yenA(Math.ceil(rem/remaining))+'/月':'期限を超過';
  const type=g.type==='debt'?'借入返済（元本）':g.type==='savings'?'貯金目標':'計画目標';
  html+='<div class="analysis-goal"><div class="analysis-goal-title">'+esc(g.title||type)+'</div>'+
    '<div class="analysis-goal-num">'+yenA(cur)+' <span class="analysis-small">/ '+yenA(target)+'（'+p.toFixed(1)+'%）</span></div>'+
    '<div class="analysis-gauge"><span style="width:'+p.toFixed(1)+'%"></span></div>'+
    '<div><span class="analysis-tag">残り '+yenA(rem)+'</span><span class="analysis-tag">'+esc(need)+'</span>'+(g.deadline?'<span class="analysis-tag">期限 '+esc(g.deadline)+'</span>':'')+'</div>'+
    '<p class="analysis-note">'+(g.type==='debt'?'借入残高は設定値、元本差額を進捗の目安として表示。利息や返済手数料は別です。':'現在額はAI計画の値または設定の貯金残高を使用。入金実績とは連動していません。')+'</p></div>';
 }
 if(!goalRows.length)html='<p class="empty">目標がまだ登録されていません。「AI計画」で目標額と期限を取り込むと達成率を表示できます。</p>';
 const latest=rows.at(-1),targetMonth=latest?.month||dateMonth();
 const saving=monthGoal(targetMonth);
 if(latest&&saving>0){
  const gap=latest.net-saving;
  html+='<div class="analysis-advice '+(gap<0?'warn':'good')+'"><strong>'+esc(monthLabel(latest.month))+'の参考収支差額と積立目標</strong><p>目標 '+yenA(saving)+' ／ 参考差額 '+yenSigned(latest.net)+' ／ '+(gap<0?'不足の目安 '+yenA(-gap):'目標との差 +'+yenA(gap))+'。カード引落時期・現金利用・借入等で実際の貯金額とは異なります。</p></div>';
 }
 $('#analysisGoals').innerHTML=html;
}
function monthChart(rows){
 if(!rows.length)return '<p class="empty">Zaimデータを取り込むと収入・支出グラフを表示します。</p>';
 const show=rows.slice(-MONTHS),W=690,H=260,left=50,right=16,top=20,bottom=45,ww=W-left-right,hh=H-top-bottom;
 const max=Math.max(10000,...show.flatMap(x=>[x.income,x.expense]))*1.1;
 const bottomY=top+hh;const bw=Math.min(27,ww/show.length*.28);
 let svg='<svg class="analysis-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="月別Zaim収入と生活支出の棒グラフ"><title>月別収入・生活支出（円）</title>';
 for(let i=0;i<=4;i++){const v=max*i/4,y=bottomY-(v/max)*hh;svg+='<line x1="'+left+'" y1="'+y+'" x2="'+(W-right)+'" y2="'+y+'" stroke="#e5edf1"/><text x="'+(left-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="10" fill="#748595">'+esc(fmtShort(v))+'</text>'}
 const gain=show.length===1?ww/2:ww/show.length;
 show.forEach((r,i)=>{
  const x=left+(i+.5)*ww/show.length,incH=Math.max(0,r.income/max*hh),expH=Math.max(0,r.expense/max*hh);
  svg+='<rect x="'+(x-bw-2)+'" y="'+(bottomY-incH)+'" width="'+bw+'" height="'+incH+'" rx="3" fill="#1b8f87"><title>'+esc(r.month)+' 収入 '+yenA(r.income)+'</title></rect>';
  svg+='<rect x="'+(x+2)+'" y="'+(bottomY-expH)+'" width="'+bw+'" height="'+expH+'" rx="3" fill="#c88a42"><title>'+esc(r.month)+' 生活支出 '+yenA(r.expense)+'</title></rect>';
  svg+='<text x="'+x+'" y="'+(bottomY+18)+'" text-anchor="middle" font-size="11" fill="#617184">'+esc(r.month.slice(2).replace('-','/'))+'</text>';
  if(r.partial)svg+='<text x="'+x+'" y="'+(bottomY+31)+'" text-anchor="middle" font-size="9" fill="#b17222">途中から</text>';
 });
 svg+='</svg>';
 const table='<div style="overflow-x:auto"><table class="analysis-table"><thead><tr><th>月</th><th>収入</th><th>生活支出</th><th>参考差額</th></tr></thead><tbody>'+show.map(m=>'<tr><td>'+esc(m.month.slice(2).replace('-','/'))+(m.partial?'*':'')+'</td><td>'+yenA(m.income)+'</td><td>'+yenA(m.expense)+'</td><td>'+yenSigned(m.net)+'</td></tr>').join('')+'</tbody></table></div>';
 return svg+'<div class="analysis-chart-legend"><span><i class="analysis-dot" style="background:#1b8f87"></i>収入</span><span><i class="analysis-dot" style="background:#c88a42"></i>生活支出（概算）</span></div>'+table;
}
let monthSelection='';
function renderCategories(rows){
 const options=$('#analysisMonth');
 const prev=monthSelection||options.value;
 const available=rows.map(m=>m.month);
 const month=available.includes(prev)?prev:(available.at(-1)||'');
 monthSelection=month;
 options.innerHTML=available.slice().reverse().map(m=>'<option value="'+esc(m)+'">'+esc(monthLabel(m))+'</option>').join('')||'<option value="">データなし</option>';
 options.value=month;
 const curr=rows.find(m=>m.month===month);const idx=rows.findIndex(m=>m.month===month),before=idx>0?rows[idx-1]:null;
 const categories=Object.entries(curr?.categories||{}).filter(x=>x[1]!==0).sort((a,b)=>b[1]-a[1]);
 const budgets=aState().categoryBudgets||{};
 const max=Math.max(1,...categories.map(x=>x[1]));
 $('#analysisCategories').innerHTML=categories.length?categories.map(([category,value])=>{
   const prevValue=before?.categories[category]||0;
   const delta=before?value-prevValue:null;
   const budget=budgets[category];const hasBudget=Number.isFinite(Number(budget))&&budget!==undefined&&budget!==null;
   const over=hasBudget&&Number(value)>Number(budget);
   const pct=hasBudget&&budget>0?Math.round(value/budget*100):null;
   return '<div class="analysis-cat"><div class="analysis-cat-line"><span><strong>'+esc(category)+'</strong>'+(over?' <span class="analysis-tag bad">予算超過</span>':'')+'</span><strong>'+yenA(value)+'</strong></div>'+
    '<div class="analysis-track '+(over?'over':'')+'"><span style="width:'+percent(value/max*100).toFixed(1)+'%"></span></div>'+
    '<div class="analysis-small">前月比 '+(delta===null?'比較なし':formatSigned(delta))+(hasBudget?' ／ 予算 '+yenA(budget)+'（'+(pct===null?'—':pct+'%')+'）':' ／ 予算未設定')+'</div></div>';
  }).join(''):'<p class="empty">この月の生活支出明細はありません。</p>';
}
function budgetEditor(rows){
 const a=aState(),cats=[...new Set([...Object.keys(a.categoryBudgets),...rows.flatMap(m=>Object.keys(m.categories||{}))])].sort();
 if(!cats.length){$('#analysisBudgetEditor').innerHTML='<p class="analysis-note">カテゴリがありません。まずZaim CSVを取り込んでください。</p>';return}
 const container=$('#analysisBudgetEditor');
 container.innerHTML='<div class="analysis-budget-form"><strong>カテゴリ別の月予算（円）</strong><p class="analysis-note">空欄は予算なし。入力した予算はこの端末内だけに保存されます。Zaimの履歴自体は変更しません。</p>'+
 cats.map((name,i)=>'<label class="analysis-budget-row"><span>'+esc(name)+'</span><input data-budget-index="'+i+'" type="number" min="0" max="1000000000" step="1000" placeholder="未設定" value="'+(a.categoryBudgets[name]??'')+'"></label>').join('')+
 '<div class="form-actions"><button class="btn teal" type="button" id="analysisSaveBudgets">予算を保存</button><button class="btn alt" type="button" id="analysisCancelBudgets">閉じる</button></div></div>';
 $('#analysisSaveBudgets').addEventListener('click',()=>{
  const budgets={...a.categoryBudgets};
  for(const el of $$('[data-budget-index]')){
   const name=cats[Number(el.dataset.budgetIndex)],str=el.value.trim();
   if(!str){delete budgets[name];continue}
   const val=Number(str);if(!Number.isSafeInteger(val)||val<0||val>1000000000){notice('予算は0以上の整数で入力してください');return}
   budgets[name]=val;
  }
  a.categoryBudgets=budgets;save();container.hidden=true;renderAnalysis();notice('カテゴリ予算を保存しました');
 });
 $('#analysisCancelBudgets').addEventListener('click',()=>container.hidden=true);
}
function renderProjection(rows){
 const goal=(state.goals||[]).find(g=>g.type==='savings'&&Number(g.targetAmount)>0);
 const base=goal?savingsCurrent(goal):safeNum(state.settings?.savingsBalance);
 const target=goal?safeNum(goal.targetAmount):0;
 const a=aState();const monthly=a.scenarioAmount!==undefined?safeNum(a.scenarioAmount):(monthGoal(dateMonth())||0);
 const horizon=12;
 let html='<div class="analysis-whatif"><button data-scenario-change="30000" type="button">月3万円</button><button data-scenario-change="50000" type="button">月5万円</button><button data-scenario-change="75000" type="button">月7.5万円</button><button data-scenario-change="125000" type="button">月12.5万円</button></div>';
 html+='<div class="analysis-metrics">'+metric('現在の貯金（登録値）',yenA(base),'口座残高と別管理')+
 metric('3か月後',yenA(base+monthly*3),'月'+yenA(monthly)+'の積立を仮定')+
 metric('6か月後',yenA(base+monthly*6),'同じ条件の試算')+
 metric('12か月後',yenA(base+monthly*12),'同じ条件の試算')+'</div>';
 if(target>0){
  const need=Math.max(0,target-base);
  const months=monthly>0?Math.ceil(need/monthly):(need===0?0:Infinity);
  const until=monthsRemaining(goal.deadline);
  const required=until===null?null:until>0?Math.ceil(need/until):need;
  html+='<div class="analysis-advice '+(until!==null&&required!==null&&monthly<required?'warn':'good')+'"><strong>目標まで残り '+yenA(need)+'</strong><p>'+(months===Infinity?'この積立額では目標に届きません。':months===0?'目標額に到達しています。':'一定額を毎月積み立てれば約'+months+'か月で到達する試算です。')+(required!==null?' ／ 期限に間に合わせる必要額 '+yenA(required)+'/月':'')+'</p></div>';
 }
 html+='<p class="analysis-note">このシミュレーションは毎月積立だけを仮定し、利息・運用益・突発支出・借入返済・未登録カード利用を含みません。入力済みの貯金額を実残高に更新してください。</p>';
 $('#analysisProjection').innerHTML=html;
 $('#analysisScenarioAmount').value=Math.round(monthly);
 $$('[data-scenario-change]').forEach(b=>b.addEventListener('click',()=>{a.scenarioAmount=Number(b.dataset.scenarioChange);save();renderAnalysis()}));
}
function spendingMix(rows){
 const m=rows.find(x=>x.month===monthSelection)||rows.at(-1);
 const contract=(state.fixed||[]).reduce((v,x)=>v+safeNum(x.amount)/(x.cycle==='year'?12:1),0);
 const high=m?(state.transactions||[]).filter(t=>t.date?.startsWith(m.month)&&actualExpense(t)&&safeNum(t.amount)>=15000).reduce((v,t)=>v+safeNum(t.amount),0):0;
 const rest=m?m.expense-high:0;
 const ratio=m&&m.expense>0?percent(high/m.expense*100):0;
 const html='<div class="analysis-metrics">'+
 metric('契約固定費（月換算）',yenA(contract),'固定費タブの登録分')+
 metric('高額明細（合計）',yenA(high),'集計対象・1件15,000円以上')+
 metric('高額以外の生活支出',yenA(rest),'高額明細以外の記録')+
 metric('高額明細の構成比',ratio.toFixed(1)+'%','生活支出のうち')+'</div>'+
 (m&&m.expense>0?'<div class="analysis-gauge" style="margin-top:14px"><span style="width:'+ratio.toFixed(1)+'%;background:#c88a42"></span></div><p class="analysis-note">高額明細（オレンジ）は生活支出の内数です。固定費台帳と足し算していません。</p>':'');
 $('#analysisSpendingMix').innerHTML=html;
}
function bigExpenses(rows){
 const transactions=(state.transactions||[]).filter(actualExpense).filter(t=>safeNum(t.amount)>=15000).sort((a,b)=>b.date.localeCompare(a.date)||b.amount-a.amount).slice(0,12);
 const m=rows.at(-1);
 $('#analysisBigItems').innerHTML=transactions.length?transactions.map(t=>'<div class="list-row row"><div class="list-main"><strong>'+esc(t.name||'明細')+'</strong><small>'+esc(t.date)+' · '+esc(t.category||'未分類')+'</small></div><div class="list-right"><strong>'+yenA(t.amount)+'</strong></div></div>').join(''):'<p class="empty">集計対象の高額明細（15,000円以上）はありません。</p>';
}
function adviceCard(title,body,severity='warn'){return '<div class="analysis-advice '+severity+'"><strong>'+esc(title)+'</strong><p>'+esc(body)+'</p></div>'}
function renderAdvice(rows){
 const adv=[],last=rows.at(-1),f=forecast(),bad=f.find(x=>x.minCash<0);
 if(bad)adv.push(adviceCard('引落日までの資金不足に注意',bad.minDate+' 時点の予想最低残高 '+yenSigned(bad.minCash)+'。実際のカード請求額と口座残高を確認してください。未登録利用は未反映です。','bad'));
 else if(f.length&&state.cards.length)adv.push(adviceCard('登録済みの引落ではマイナスを予測していません','カードの未確定利用・臨時支出は入っていないため、予備費を確保してください。','good'));
 if(last){
  const target=monthGoal(last.month);
  if(target>0&&last.net<target)adv.push(adviceCard('参考収支差額が積立目標を下回っています',monthLabel(last.month)+'の参考差額 '+yenSigned(last.net)+'、積立目標 '+yenA(target)+'。差は '+yenA(target-last.net)+'。実際の貯金とは一致しないため口座残高でも確認してください。'));
  const other=safeNum(last.categories['その他'])+safeNum(last.categories['未分類']);
  if(last.expense>0&&other/last.expense>=.2)adv.push(adviceCard('「その他・未分類」の明細を見直す','対象月 '+yenA(other)+'（生活支出の'+Math.round(other/last.expense*100)+'%）。Zaimのカテゴリ分類を見直し、CSVを再取り込みすると削減候補が明確になります。'));
  const budgets=aState().categoryBudgets;
  const over=Object.entries(last.categories||{}).filter(([name,v])=>budgets[name]!==undefined&&v>budgets[name]).sort((a,b)=>(b[1]-budgets[b[0]])-(a[1]-budgets[a[0]]));
  if(over.length)adv.push(adviceCard('カテゴリの予算超過',over.slice(0,3).map(([name,v])=>name+' +'+yenA(v-budgets[name])).join('、')+'。まず必要経費と任意支出を区別してください。','bad'));
  if(last.movements>10000)adv.push(adviceCard('現金引出・チャージの用途確認',monthLabel(last.month)+'に '+yenA(last.movements)+'。引出後の利用履歴が記録されていなければ、実際の消費額が小さく表示される可能性があります。'));
 }
 if(rows.length<3)adv.push(adviceCard('収支トレンドの判定は暫定です','Zaimの集計済み月が'+rows.length+'か月分です。最低3か月、できれば6か月のCSVを取り込み、臨時支出と通常支出を分けて分析しましょう。'));
 if(rows.some(m=>m.partial))adv.push(adviceCard('途中開始の月があります','最初の取込日が月初でない月には「途中から」と表示します。月平均の比較や支出減少判定には注意してください。'));
 if(!(state.goals||[]).length)adv.push(adviceCard('目標金額と期限を追加する','「AI計画」タブから目標金額・期限を入れると、達成率と必要月額が計算できます。'));
 if(!(state.accounts||[]).length)adv.push(adviceCard('口座残高を定期的に照合する','実際の口座残高が登録されていないため、資金繰り・貯金進捗の精度が下がります。'));
 if(!adv.length)adv.push(adviceCard('まず予定と残高を更新する','分析対象月のZaimデータ、カード請求、貯金残高を更新すると、達成状況の判定精度が上がります。','good'));
 $('#analysisAdvice').innerHTML=adv.slice(0,8).join('');
}
function renderQuality(rows){
 const last=rows.at(-1);
 let html='<p class="analysis-note">分析の出所はZaimの取込明細、Money Plan Labに登録したカード請求・口座・目標です。収入−生活支出は参考差額であり、預金残高の増加額とは異なります。</p>';
 if(last){
  html+='<div class="info-grid"><div class="info-item"><span>対象期間</span><strong>'+esc(rows[0].month)+' 〜 '+esc(last.month)+'</strong></div>'+
  '<div class="info-item"><span>最新月の集計対象外</span><strong>'+yenA(last.excluded)+'</strong></div>'+
  '<div class="info-item"><span>最新月の引出・チャージ等</span><strong>'+yenA(last.movements)+'</strong></div>'+
  '<div class="info-item"><span>カード請求の登録件数</span><strong>'+state.cards.length+'件</strong></div></div>';
 }
 const monthlyFixedAmount=(state.fixed||[]).reduce((sum,item)=>sum+(safeNum(item.amount)/(item.cycle==='year'?12:1)),0);
 html+='<p class="analysis-note">固定費契約は月換算 '+yenA(monthlyFixedAmount)+'。すでにZaimの支出やカード請求に含まれるものがあり、生活支出と足し合わせていません。高額明細は「見直し候補」で、不要だと断定していません。</p>';
 html+='<p class="analysis-note">未登録のカード利用、現金払い、税金、利息、年会費、目標の初期残高は自動的に補完されません。口座の実残高と実際のカード引落を定期的に確認してください。</p>';
 $('#analysisQuality').innerHTML=html;
}
function renderAnalysis(){
 aState();
 const rows=monthsData(),m=rows.find(x=>x.month===monthSelection)||rows.at(-1);
 renderMetrics(m,rows);
 renderGoalPosition(rows);
 $('#analysisTrend').innerHTML=monthChart(rows);
 renderCategories(rows);
 renderProjection(rows);
 spendingMix(rows);
 renderAdvice(rows);
 bigExpenses(rows);
 renderQuality(rows);
}
$('#analysisMonth').addEventListener('change',e=>{monthSelection=e.target.value;renderAnalysis()});
$('#analysisEditBudgets').addEventListener('click',()=>{const c=$('#analysisBudgetEditor');c.hidden=!c.hidden;if(!c.hidden)budgetEditor(monthsData())});
$('#analysisScenarioAmount').addEventListener('change',e=>{const v=Number(e.target.value);if(!Number.isSafeInteger(v)||v<0||v>100000000){notice('月積立は0〜1億円の整数で入力してください');return}aState().scenarioAmount=v;save();renderAnalysis();notice('試算用の積立額を更新しました')});
$('#analysisExportReport').addEventListener('click',async()=>{
 const rows=monthsData(),last=rows.find(x=>x.month===monthSelection)||rows.at(-1);
 if(!last){notice('Zaim明細がありません');return}
 const budgets=aState().categoryBudgets;
 const report=['Money Plan Lab 収支分析（参考）','対象月：'+last.month,
 '収入：'+yenA(last.income),'生活支出（引出・チャージ除く概算）：'+yenA(last.expense),
 '参考収支差額：'+yenSigned(last.net),'集計対象外：'+yenA(last.excluded),'現金引出・チャージ等：'+yenA(last.movements),
 '毎月の積立目標：'+yenA(monthGoal(last.month)),
 'カテゴリ：',...Object.entries(last.categories).sort((a,b)=>b[1]-a[1]).map(([cat,value])=>'・'+cat+'：'+yenA(value)+(budgets[cat]!==undefined?'（予算 '+yenA(budgets[cat])+'）':'')),
 '注意：参考収支差額は実際の貯金増減ではありません。カードの引落・現金管理は別途照合してください。'].join('\n');
 try{await navigator.clipboard.writeText(report);notice('分析レポートをコピーしました')}
 catch(err){download('money-plan-lab-analysis-'+last.month+'.txt','text/plain;charset=utf-8',report);notice('分析レポートをテキストで保存しました')}
});
// Existing AI import wraps renderAll; wrap the current version so imports, backups and deletions refresh analytics as well.
const previousRenderAll=renderAll;
renderAll=function(){previousRenderAll();renderAnalysis()};
renderAnalysis();
})();