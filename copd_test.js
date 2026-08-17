/** copd_test.js — 五層測試：案例 + 不變式 + 單一來源 + 規則治理 + 法規符合性 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const E = require('./copd_engine'), R = require('./copd_rules'), P = require('./copd_products');

let pass = 0, fail = 0; const fails = [];
function t(name, fn) {
  try { const r = fn(); if (r === true) { pass++; console.log('  ✅ ' + name); }
        else { fail++; fails.push(name + ' → ' + r); console.log('  ❌ ' + name + '\n       ' + r); } }
  catch (e) { fail++; fails.push(name + ' 例外 ' + e.message); console.log('  ❌ ' + name + ' 例外 ' + e.message); }
}
const base = o => Object.assign({ copdConfirmed:'yes', asthma:'no', smoking:'former',
  fitDPI:'yes', fitSMI:'yes', fitPMDI:'yes' }, o);
const ids = r => r.advanced.map(a => a.id).concat(r.alerts);

console.log('\n╔══ 第一層：案例驗證（對照 GOLD 2026 稽核 D0–D5、C1）══╗');

t('D0 CAT/mMRC 皆缺 → UNASSESSED，不得歸為 A', () => {
  const r = E.evaluate(base({ reviewReason:'initial', currentTherapy:'none', modEx:0, sevEx:0 }));
  return r.gold === 'UNASSESSED' && r.class === null ? true : `gold=${r.gold} class=${r.class}`;
});
t('D0 惡化次數缺 → UNASSESSED', () => {
  const r = E.evaluate(base({ reviewReason:'initial', currentTherapy:'none', cat:18 }));
  return r.gold === 'UNASSESSED' ? true : `gold=${r.gold}`;
});
t('D0 資料齊全時仍正確分組 B', () => {
  const r = E.evaluate(base({ reviewReason:'initial', currentTherapy:'none', modEx:0, sevEx:0, cat:18, mmrc:2 }));
  return r.gold === 'B' && r.class === 'LABA/LAMA' ? true : `${r.gold}/${r.class}`;
});
t('A1 GOLD 2026：1 次中度惡化即 Group E', () => {
  const r = E.evaluate(base({ reviewReason:'initial', currentTherapy:'none', modEx:1, sevEx:0, cat:5, mmrc:0 }));
  return r.gold === 'E' ? true : `gold=${r.gold}`;
});
t('A3 初始 Group E + eos≥300 → 三合一', () => {
  const r = E.evaluate(base({ reviewReason:'initial', currentTherapy:'none', modEx:1, sevEx:0, cat:18, eos:320 }));
  return r.class === 'ICS/LABA/LAMA' ? true : r.class;
});
t('A3 初始 Group E + eos<300 → 雙支氣管擴張（不因 100 誤升）', () => {
  const r = E.evaluate(base({ reviewReason:'initial', currentTherapy:'none', modEx:1, sevEx:0, cat:18, eos:150 }));
  return r.class === 'LABA/LAMA' ? true : r.class;
});
t('D3 追蹤：單方+惡化+eos 150 → 三合一（門檻 100 非 300）', () => {
  const r = E.evaluate(base({ reviewReason:'exacerbation', currentTherapy:'LAMA', modEx:1, sevEx:0, eos:150 }));
  return r.class === 'ICS/LABA/LAMA' ? true : r.class;
});
t('A5 追蹤：LABA/LAMA + eos≥100 → 三合一', () => {
  const r = E.evaluate(base({ reviewReason:'exacerbation', currentTherapy:'LABA/LAMA', modEx:1, sevEx:0, eos:120 }));
  return r.class === 'ICS/LABA/LAMA' ? true : r.class;
});
t('D2 eos<100 且惡化負擔低 → 不強推 ICS 但措辭為個別化', () => {
  const r = E.evaluate(base({ reviewReason:'exacerbation', currentTherapy:'LABA/LAMA', modEx:1, sevEx:0, eos:60 }));
  const soft = r.reasons.some(x => x.includes('不得作為排除 ICS 的唯一理由'));
  return (r.class === null && soft && ids(r).includes('ICS-LOW-EOS')) ? true : `class=${r.class} soft=${soft}`;
});
t('D2 eos<100 但惡化負擔高 → 仍列出三合一候選', () => {
  const r = E.evaluate(base({ reviewReason:'exacerbation', currentTherapy:'LABA/LAMA', modEx:3, sevEx:1, eos:60 }));
  return r.class === 'ICS/LABA/LAMA' ? true : `class=${r.class}`;
});
t('D2 eos 未取得 → 要求檢驗，不猜測', () => {
  const r = E.evaluate(base({ reviewReason:'exacerbation', currentTherapy:'LABA/LAMA', modEx:1, sevEx:0 }));
  return (r.class === null && ids(r).includes('DATA-INSUFFICIENT')) ? true : `class=${r.class}`;
});
t('D1 生物製劑：1 次惡化即觸發（非 ≥2）', () => {
  const r = E.evaluate(base({ reviewReason:'exacerbation', currentTherapy:'ICS/LABA/LAMA', modEx:1, sevEx:0, eos:350 }));
  return ids(r).includes('ADV-BIOLOGIC') ? true : '未觸發';
});
t('D1 生物製劑：有慢性支氣管炎 → 兩種皆列', () => {
  const r = E.evaluate(base({ reviewReason:'exacerbation', currentTherapy:'ICS/LABA/LAMA', modEx:1, eos:350, chronicBronchitis:'yes' }));
  const x = r.advanced.find(a => a.id === 'ADV-BIOLOGIC').text;
  return (x.includes('Dupilumab') && x.includes('Mepolizumab')) ? true : x.slice(0,80);
});
t('D1 生物製劑：無慢性支氣管炎 → 僅 mepolizumab，並說明排除理由', () => {
  const r = E.evaluate(base({ reviewReason:'exacerbation', currentTherapy:'ICS/LABA/LAMA', modEx:1, eos:350, chronicBronchitis:'no' }));
  const x = r.advanced.find(a => a.id === 'ADV-BIOLOGIC').text;
  return (x.includes('Mepolizumab') && x.includes('限合併慢性支氣管炎')) ? true : x.slice(0,90);
});
t('D4 ICS 撤除：eos≥300 警告在穩定分支也出現', () => {
  const r = E.evaluate(base({ reviewReason:'stable', currentTherapy:'ICS/LABA/LAMA', eos:350, considerIcsWithdrawal:'yes' }));
  return ids(r).includes('ICS-WITHDRAW-RISK') ? true : '未出現';
});
t('D4 ICS 撤除：四理由皆未勾選 → 提示不應撤除', () => {
  const r = E.evaluate(base({ reviewReason:'stable', currentTherapy:'ICS/LABA/LAMA', eos:150, considerIcsWithdrawal:'yes' }));
  const x = r.advanced.find(a => a.id === 'ICS-WITHDRAW');
  return (x && x.text.includes('不應自三合一撤除')) ? true : '未提示';
});
t('D5 azithromycin：現行吸菸者也顯示，但標注優先順序', () => {
  const r = E.evaluate(base({ reviewReason:'exacerbation', currentTherapy:'ICS/LABA/LAMA', modEx:1, smoking:'current' }));
  const x = r.advanced.find(a => a.id === 'ADV-AZITHRO');
  return (x && x.text.includes('優先用於已戒菸者')) ? true : '未顯示或措辭不符';
});
t('C1 現行吸菸 → 戒菸缺口為 high', () => {
  const r = E.evaluate(base({ reviewReason:'stable', currentTherapy:'LABA/LAMA', smoking:'current' }));
  const g = r.gaps.find(x => x.key === 'smoking_cessation');
  return (g && g.level === 'high') ? true : '未觸發';
});
t('C1 疫苗缺口會被列出', () => {
  const r = E.evaluate(base({ reviewReason:'stable', currentTherapy:'LABA/LAMA' }));
  return r.gaps.some(g => g.key === 'vaccine_rsv') ? true : '未列出';
});
t('合併 asthma → ICS 必須保留提示', () => {
  const r = E.evaluate(base({ reviewReason:'initial', currentTherapy:'none', modEx:0, sevEx:0, cat:18, asthma:'yes' }));
  return ids(r).includes('ASTHMA-ICS') ? true : '未提示';
});
t('診斷未確認 → 不產生任何建議', () => {
  const r = E.evaluate({ copdConfirmed:'no', reviewReason:'initial' });
  return (r.class === null && r.carbonAllowed === false) ? true : `class=${r.class}`;
});

console.log('\n╔══ 第二層：不變式（與實作無關的性質）══╗');
const SAMPLES = [];
for (const rr of ['initial','stable','dyspnea','exacerbation'])
for (const cur of ['none','LABA','LAMA','LABA/LAMA','ICS/LABA','ICS/LABA/LAMA'])
for (const eos of [null,50,120,320])
for (const mod of [0,1,3]) SAMPLES.push(base({ reviewReason:rr, currentTherapy:cur, eos, modEx:mod, sevEx:0, cat:18, mmrc:2 }));

t(`S1 決定性（${SAMPLES.length} 樣本）`, () =>
  SAMPLES.every(s => JSON.stringify(E.evaluate(s)) === JSON.stringify(E.evaluate(s))) || '不一致');
t('S2 畸形輸入不崩潰', () => {
  const weird = [{}, {copdConfirmed:'yes'}, {copdConfirmed:'yes',eos:'abc',modEx:-1},
                 {copdConfirmed:'yes',currentTherapy:'???',reviewReason:'???'}, {copdConfirmed:'yes',cat:'x',mmrc:null}];
  return weird.every(w => { const r = E.evaluate(w); return r && Array.isArray(r.reasons); }) || '崩潰';
});
t('S3 缺值不猜測：症狀全缺時 class 必為 null', () =>
  SAMPLES.filter(s => s.reviewReason==='initial' && s.currentTherapy==='none')
    .every(s => { const c={...s}; delete c.cat; delete c.mmrc; delete c.modEx; delete c.sevEx;
      return E.evaluate(c).class === null; }) || '仍給建議');
t('S4 碳排永不跨臨床類別', () =>
  SAMPLES.every(s => { const r = E.evaluate(s);
    return !r.class || E.candidates(r.class, s).every(p => p.cls === r.class); }) || '跨類別');
t('S5 裝置不適合者永遠排在適合者之後', () =>
  SAMPLES.every(s => {
    const st = {...s, fitDPI:'no', fitSMI:'yes', fitPMDI:'unknown'};
    const r = E.evaluate(st); if (!r.class) return true;
    const list = E.candidates(r.class, st);
    return list.every((p,i) => i===0 || list[i-1].fit.rank <= p.fit.rank);
  }) || '排序錯誤');
t('S6 裝置全未確認 → carbonAllowed 為 false', () =>
  SAMPLES.every(s => { const st={...s,fitDPI:'unknown',fitSMI:'unknown',fitPMDI:'unknown'};
    return E.evaluate(st).carbonAllowed === false; }) || '仍允許');
t('S7 配方未確認的產品不得回報碳排數值', () =>
  P.products.filter(p => !p.local_supply_formulation)
    .every(p => E.carbonOf(p).known === false) || '洩漏數值');
t('S8 引擎為純函式，不改動輸入', () =>
  SAMPLES.every(s => { const before = JSON.stringify(s); E.evaluate(s); return JSON.stringify(s) === before; }) || '輸入被改');
t('S9 追蹤路徑的 ICS 門檻恆為 100，初始恆為 300', () => {
  const f = E.evaluate(base({reviewReason:'exacerbation',currentTherapy:'LABA/LAMA',modEx:1,eos:120}));
  const i = E.evaluate(base({reviewReason:'initial',currentTherapy:'none',modEx:1,sevEx:0,cat:18,eos:120}));
  return (f.class==='ICS/LABA/LAMA' && i.class==='LABA/LAMA') ? true : `follow=${f.class} initial=${i.class}`;
});

console.log('\n╔══ 第三／四／五層：治理與法規 ══╗');
const PACK_TEXT = fs.readFileSync(path.join(__dirname,'copd_rules.js'),'utf8');
const BODY = PACK_TEXT.slice(PACK_TEXT.indexOf('return {'));
t('R1 規則包為純資料（未夾帶邏輯）', () => {
  const bad = [/\bfunction\b/,/=>/,/\bif\s*\(/,/\bfor\s*\(/].filter(re=>re.test(BODY)).map(r=>r.source);
  return bad.length===0 ? true : bad.join('、'); });
t('R2 每個規則群都標註出處', () => R.provenance.sources.every(s=>s.url) || '缺 url');
t('R4 規則包未逾期', () => new Date(R.provenance.review_due) > new Date() ? true : '已逾期');
t('A1 每則警示都已登錄', () => {
  const used = new Set(); for (const s of SAMPLES) E.evaluate(s).alerts.forEach(a=>used.add(a));
  const missing=[...used].filter(a=>!R.alerts[a]); return missing.length===0?true:missing.join('、'); });
t('A2 每則警示都有可量測成果', () =>
  Object.entries(R.alerts).every(([,v])=>v.metric) || '缺 metric');
t('A5 可中斷式警示極少', () => {
  const n = Object.values(R.alerts).filter(v=>v.interruptive).length;
  return n <= Object.keys(R.alerts).length*0.25 ? true : `${n} 則過多`; });
t('C2 已聲明非時間急迫用途', () => R.intended_use.time_critical === false || '未聲明');
t('C3 已限定醫療專業人員', () =>
  /醫療專業人員/.test(R.intended_use.intended_user) &&
  R.intended_use.not_intended_for.some(x=>/病人|照顧者/.test(x)) || '未限定');
t('C5 已揭露至少 3 項限制', () => R.intended_use.known_limitations.length>=3 || '不足');
t('C7 引擎未攝取連續或序列訊號', () => {
  const src = fs.readFileSync(path.join(__dirname,'copd_engine.js'),'utf8');
  const bad = ['waveform','spirogram','flowVolume','trendSlope','continuousSpO2'].filter(k=>src.includes(k));
  return bad.length===0 ? true : bad.join('、'); });
t('碳方法學：功能單位已載明', () => P.provenance.carbon_method.functional_unit ? true : '未載明');
t('碳方法學：已聲明不含緩解用藥', () => /緩解用藥/.test(P.provenance.carbon_method.caveat) ? true : '未聲明');

const warn = [];
if (!R.provenance.verified_by) warn.push('R3 規則包尚未經胸腔科醫師簽核');
if (!P.provenance.verified_by) warn.push('P3 產品包尚未經藥劑部簽核');
const unk = P.products.filter(p=>!p.local_supply_formulation).map(p=>p.name);
if (unk.length) warn.push(`配方版本待確認：${unk.join('、')}`);

console.log('\n' + '═'.repeat(58));
console.log(`  通過 ${pass} / ${pass+fail}`);
console.log('═'.repeat(58));
warn.forEach(w => console.log('  ⚠  ' + w));
console.log('');
process.exit(fail ? 1 : 0);
