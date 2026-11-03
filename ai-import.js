/* Money Plan Lab - ChatGPT plan import, v1 */
'use strict';
(function(){
const FORMAT='money-plan-lab-ai-v1';
const MAX_ITEMS=60;
const FIELDS=['income','savingTarget','livingBudget','cardBudget','debtPayment','cashLiving','extraIncome','extraExpense'];
const SETTING_FIELDS=['salary','salaryDay','scholarship','scholarshipDay','debtPay','debtDay','cashLiving','livingBudget','saving','startMonth'];
const LABELS={income:'給与・通常収入',savingTarget:'貯金目標',livingBudget:'生活費予算',cardBudget:'新規カード利用予算',debtPayment:'借入返済',cashLiving:'カード外の予定支出',extraIncome:'臨時収入',extraExpense:'臨時支出',salary:'毎月の給与',salaryDay:'給与日',scholarship:'奨学金',scholarshipDay:'奨学金引落日',debtPay:'通常の借入返済額',debtDay:'借入返済日',saving:'月間貯金目標',startMonth:'試算開始月'};
const PROMPT=[
'あなたは家計管理アシスタントです。この会話で確定した資金計画・目標を、Money Plan Labの「AI計画」機能に取り込むためのJSONにしてください。',
'JSON以外の文章・コードフェンスは出力しないでください。',
'トップレベルは {"format":"money-plan-lab-ai-v1","goals":[],"monthlyPlans":[],"settings":{}} です。',
'goals: 各要素に id（英数字とハイフン）、title（名称）、type（savings/debt/spending/custom）、targetAmount（円、整数）、deadline（YYYY-MM-DD。未確認なら省略）、currentAmount（確実な額だけ。未確認なら省略）、memo（任意）を入れてください。',
'monthlyPlans: 各要素は month（YYYY-MM）を必須にし、確定した値だけ income（通常収入）、savingTarget（貯金目標）、livingBudget（生活費予算）、cardBudget（新規カード利用の上限）、debtPayment（借入返済額）、cashLiving（カード以外の予定支出）、extraIncome（臨時収入）、extraExpense（臨時支出）、memo（説明）を入れてください。',
'settings: 必要な変更が明確に確定している場合のみ、salary、salaryDay、scholarship、scholarshipDay、debtPay、debtDay、cashLiving、livingBudget、saving、startMonth を指定してください。既存の設定を維持したいなら {} のままにしてください。',
'金額は数値の整数（例 125000）にし、全て円に統一してください。予想や未確定は断定・補完しないでください。',
'重要：口座残高、借入金残高、確定済みカード請求、Zaimの過去の取引明細は含めないでください。',
'カード請求の実際の引落と新規カード利用予算は別です。月別の cardBudget は予算目標で、資金繰りから差し引く請求額ではありません。',
'同じ目標id・同じ月を再度取り込むと更新されます。消したい計画はアプリ側で削除します。'
].join('\n');
const TEMPLATE={
 format:FORMAT,
 goals:[{id:'example-goal',title:'旅行積立（例）',type:'savings',targetAmount:120000,deadline:'2028-12-31',memo:'入力形式を示す架空の例です'}],
 monthlyPlans:[{month:'2028-06',savingTarget:10000,livingBudget:45000,memo:'架空の例。実際の目標で変更してください'}],
 settings:{}
};
let pending=null;
function isObj(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function str(x,label,max){if(typeof x!=='string'||!x.trim()||x.trim().length>max)throw Error(label+'は1〜'+max+'文字の文字列にしてください');return x.trim()}
function money(x,label){if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0||x>1000000000)throw Error(label+'は0〜10億円の整数で指定してください');return x}
function month(x,label){if(typeof x!=='string'||!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(x))throw Error(label+'はYYYY-MM形式にしてください');return x}
function date(x,label){if(typeof x!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(x)||asDate(x)!==x)throw Error(label+'は有効なYYYY-MM-DD形式にしてください');return x}
function parseDocument(raw){
 if(typeof raw!=='string'||raw.length>300000)throw Error('JSONが長すぎます（上限300KB）');
 let txt=raw.trim();const tick=String.fromCharCode(96);const fence=tick+tick+tick;
 if(txt.startsWith(fence)){txt=txt.replace(/^.{3}(?:json)?\s*\n?/i,'').replace(/\s*.{3}\s*$/,'')}
 let d;try{d=JSON.parse(txt)}catch(e){throw Error('JSONとして読めません。ChatGPTに「JSONのみ出力」と依頼してください')}
 if(!isObj(d)||d.format!==FORMAT)throw Error('formatがmoney-plan-lab-ai-v1ではありません');
 const goals=d.goals===undefined?[]:d.goals, plans=d.monthlyPlans===undefined?[]:d.monthlyPlans, settings=d.settings===undefined?{}:d.settings;
 if(!Array.isArray(goals)||!Array.isArray(plans)||!isObj(settings))throw Error('goals / monthlyPlans / settingsの型が正しくありません');
 if(goals.length>MAX_ITEMS||plans.length>MAX_ITEMS)throw Error('1回につき各60件まで取り込めます');
 const g=goals.map((x,i)=>{
  if(!isObj(x))throw Error('goals['+i+']がオブジェクトではありません');
  const title=str(x.title,'目標名',80);
  const type=str(x.type,'目標種別',20);
  if(!['savings','debt','spending','custom'].includes(type))throw Error('目標種別はsavings/debt/spending/customから選択してください');
  const id=x.id===undefined?type+'-'+title:str(x.id,'目標id',120);
  const out={id,title,type,targetAmount:money(x.targetAmount,'目標金額')};
  if(x.deadline!==undefined&&x.deadline!==null&&x.deadline!=='')out.deadline=date(x.deadline,'達成期限');
  if(x.currentAmount!==undefined&&x.currentAmount!==null)out.currentAmount=money(x.currentAmount,'現在額');
  if(x.memo!==undefined)out.memo=String(x.memo??'').slice(0,400);
  return out;
 });
 const p=plans.map((x,i)=>{
  if(!isObj(x))throw Error('monthlyPlans['+i+']がオブジェクトではありません');
  const out={month:month(x.month,'計画月')};
  for(const field of FIELDS)if(Object.prototype.hasOwnProperty.call(x,field))out[field]=money(x[field],out.month+' '+LABELS[field]);
  if(x.memo!==undefined)out.memo=String(x.memo??'').slice(0,400);
  return out;
 });
 const s={};for(const key of SETTING_FIELDS)if(Object.prototype.hasOwnProperty.call(settings,key)){if(key==='startMonth')s[key]=month(settings[key],LABELS[key]);else if(/Day$/.test(key)){const v=money(settings[key],LABELS[key]);if(v<1||v>31)throw Error(LABELS[key]+'は1〜31日で指定してください');s[key]=v}else s[key]=money(settings[key],LABELS[key])}
 if(!g.length&&!p.length&&!Object.keys(s).length)throw Error('取り込み対象がありません。goalsかmonthlyPlansを追加してください');
 if(new Set(g.map(x=>x.id)).size!==g.length)throw Error('同じidの目標が複数あります');
 if(new Set(p.map(x=>x.month)).size!==p.length)throw Error('同じ月の計画が複数あります');
 return{goals:g,plans:p,settings:s};
}
function summaryText(p){
 const lines=[];
 if(p.goals.length)lines.push('目標：'+p.goals.length+'件（'+p.goals.slice(0,3).map(x=>x.title).join('、')+(p.goals.length>3?' ほか':'')+'）');
 if(p.plans.length)lines.push('月別計画：'+p.plans.length+'か月（'+p.plans.slice(0,4).map(x=>x.month).join('、')+(p.plans.length>4?' ほか':'')+'）');
 if(Object.keys(p.settings).length)lines.push('基本設定：'+Object.keys(p.settings).map(x=>LABELS[x]).join('、'));
 return lines;
}
function preview(){
 pending=null;const host=$('#aiImportPreview');
 try{
  const parsed=parseDocument($('#aiJson').value);pending=parsed;
  const lines=summaryText(parsed).map(x=>'<li>'+esc(x)+'</li>').join('');
  const settingHtml=Object.keys(parsed.settings).length?'<p class="ai-mini">基本設定の変更：'+Object.entries(parsed.settings).map(([key,v])=>esc(LABELS[key]+': '+(key==='startMonth'?v:String(v)))).join(' / ')+'</p>':'';
  host.innerHTML='<div class="ai-preview"><strong>取り込み内容を確認してください</strong><ul>'+lines+'</ul>'+settingHtml+
  '<p class="ai-mini">目標はid、月別計画は月をキーに追加・更新します。既存の確定カード請求、Zaim明細、口座残高、借入残高は変更しません。給与・返済・カード外支出の月別計画は資金繰り予測に反映します。</p>'+
  '<div class="form-actions"><button type="button" class="btn teal" id="aiCommit">確認して反映する</button><button type="button" class="btn alt" id="aiCancel">キャンセル</button></div></div>';
  $('#aiCommit').addEventListener('click',commit);
  $('#aiCancel').addEventListener('click',()=>{pending=null;host.innerHTML=''});
 }catch(err){host.innerHTML='<div class="alert bad">JSON確認エラー：'+esc(err.message)+'</div>'}
}
function commit(){
 if(!pending)return;
 const message=summaryText(pending).join('\n');
 if(!confirm('以下の計画を反映しますか？\n\n'+message+'\n\nZaim明細・カード請求・口座残高は維持されます。'))return;
 const current=clone(state),g=current.goals||[],p=current.monthlyPlans||[];
 for(const item of pending.goals){
  const index=g.findIndex(x=>x.id===item.id);
  if(index>=0)g[index]={...g[index],...item};
  else g.push(item);
 }
 for(const item of pending.plans){
  const index=p.findIndex(x=>x.month===item.month);
  if(index>=0)p[index]={...p[index],...item};
  else p.push(item);
 }
 current.goals=g;current.monthlyPlans=p;current.settings={...current.settings,...pending.settings};current.v=3;current.lastAiImport=new Date().toISOString();
 state=current;save();renderAll();notice('ChatGPTの計画を反映しました');
 pending=null;$('#aiImportPreview').innerHTML='';
}
function progress(goal){
 const existing=state.settings||{};
 const current=goal.currentAmount!==undefined?goal.currentAmount:goal.type==='savings'?(Number(existing.savingsBalance)||0):0;
 const pct=goal.targetAmount>0?Math.min(100,Math.max(0,current/goal.targetAmount*100)):0;
 return{current,pct};
}
function renderAi(){
 const goals=Array.isArray(state.goals)?state.goals:[];
 const plans=Array.isArray(state.monthlyPlans)?state.monthlyPlans:[];
 $('#aiGoalCount').textContent=goals.length+'件';
 $('#aiMonthCount').textContent=plans.length+'か月';
 $('#aiGoalList').innerHTML=goals.length?goals.map((g,i)=>{
  const pr=progress(g);
  return '<div class="list-row"><div class="ai-split"><div class="list-main"><strong>'+esc(g.title)+'</strong><small>'+esc(g.deadline||'期限未指定')+' · 目標 '+yen(g.targetAmount)+'</small></div><button class="btn danger" type="button" data-ai-del-goal="'+i+'">削除</button></div>'+
  '<div class="ai-progress"><span style="width:'+pr.pct.toFixed(1)+'%"></span></div><div class="ai-mini">'+yen(pr.current)+' / '+yen(g.targetAmount)+' ('+pr.pct.toFixed(1)+'%)'+(g.memo?' · '+esc(g.memo):'')+'</div></div>';
 }).join(''):'<p class="empty">ChatGPTで作った目標はまだありません。</p>';
 $('#aiMonthList').innerHTML=plans.length?[...plans].sort((a,b)=>a.month.localeCompare(b.month)).map((p)=>{
  const tags=FIELDS.filter(k=>p[k]!==undefined).map(k=>'<span>'+esc(LABELS[k])+'：'+yen(p[k])+'</span>').join('');
  return '<div class="list-row"><div class="ai-split"><div class="list-main"><span class="ai-month-name">'+esc(monthLabel(p.month))+'</span><div class="ai-mini">'+(p.memo?esc(p.memo):'')+'</div></div><button class="btn danger" type="button" data-ai-del-month="'+esc(p.month)+'">削除</button></div><div class="ai-tags">'+tags+'</div></div>';
 }).join(''):'<p class="empty">月別計画はまだありません。</p>';
 const n=goals.length+plans.length;
 $('#aiPlanSummary').innerHTML=n?'<div class="info-grid"><div class="info-item"><span>目標</span><strong>'+goals.length+'件</strong></div><div class="info-item"><span>月別プラン</span><strong>'+plans.length+'か月</strong></div></div><p class="hint">ChatGPT用JSONの再取込で月別の目標・予算を更新できます。口座残高や確定カード請求は変更しません。</p>':'<p class="empty">AI計画はまだ登録されていません。［AI計画］タブからChatGPTのJSONを読み込めます。</p>';
 $$('[data-ai-del-goal]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.aiDelGoal);if(!confirm('この目標を削除しますか？'))return;state.goals.splice(idx,1);save();renderAll()}));
 $$('[data-ai-del-month]').forEach(b=>b.addEventListener('click',()=>{const m=b.dataset.aiDelMonth;if(!confirm(m+' の月別計画を削除しますか？'))return;state.monthlyPlans=state.monthlyPlans.filter(x=>x.month!==m);save();renderAll()}));
}
$('#aiPreviewButton').addEventListener('click',preview);
$('#aiJson').addEventListener('input',()=>{pending=null;$('#aiImportPreview').innerHTML=''});
$('#aiJsonFile').addEventListener('change',async e=>{
 const file=e.target.files&&e.target.files[0];if(!file)return;
 try{if(file.size>300000)throw Error('ファイルが大きすぎます');$('#aiJson').value=await file.text();preview()}catch(err){$('#aiImportPreview').innerHTML='<div class="alert bad">'+esc(err.message)+'</div>'}finally{e.target.value=''}
});
$('#downloadAiTemplate').addEventListener('click',()=>download('money-plan-lab-ai-example.json','application/json;charset=utf-8',JSON.stringify(TEMPLATE,null,2)));
$('#copyAiPrompt').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(PROMPT);notice('ChatGPT用プロンプトをコピーしました')}
 catch(err){const t=$('#aiJson');t.value=PROMPT;t.focus();t.select();notice('コピーできませんでした。テキスト欄から手動でコピーしてください')}
});
const originalRenderAll=renderAll;
renderAll=function(){originalRenderAll();renderAi()};
renderAi();
})();