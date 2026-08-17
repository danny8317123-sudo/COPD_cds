/**
 * copd_rules.js — COPD 臨床規則包（GOLD 2026）
 *
 * ⚠ 這是資料檔，不是程式檔。維護者為胸腔科醫師。
 *   本檔內不得出現 function / if / for / 三元運算子。
 *
 * ⚠ 上線前必須以 GOLD 2026 報告 Fig 3.7–3.11 原圖逐條核對後，
 *   填入 provenance.verified_by 與 verified_date。未填時系統顯示紅色警告。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.COPD_RULES = factory();
}(typeof self !== 'undefined' ? self : this, function () {
return {

  pack_id: 'copd_gold',
  pack_version: '1.0',
  clinical_basis: 'GOLD 2026',

  provenance: {
    sources: [
      { id: 'GOLD-2026', name: 'GOLD Report 2026（Fig 3.7–3.11）', version: '2026',
        url: 'https://goldcopd.org/' },
      { id: 'SPC-TW', name: '台灣現行仿單（食藥署許可證）', version: null,
        url: 'https://info.fda.gov.tw/MLMS/H0001.aspx' },
      { id: 'NHI', name: '健保藥品給付規定', version: null,
        url: 'https://www.nhi.gov.tw/ch/np-2505-1.html' }
    ],
    verified_by: null,          // ⚠ 胸腔科醫師姓名
    verified_date: null,        // ⚠ YYYY-MM-DD
    review_due: '2026-12-31',   // GOLD 每年 11 月改版，隔年 1 月前完成核對
    review_cadence_note: 'GOLD 每年 11 月發布新版；健保給付規定變動頻繁，建議每季核對'
  },

  intended_use: {
    purpose: '依 GOLD 2026 比對病人資料與初始／追蹤藥物治療演算法，並在臨床等價且裝置適用的候選中比較產品碳足跡，供醫療專業人員參考',
    intended_user: '醫師、藥師（僅限醫療專業人員）',
    patient_population: '成人已確診 COPD 病患',
    time_critical: false,
    not_intended_for: [
      '急性惡化之處置（本系統僅處理維持治療）',
      '非藥物治療與疫苗的完整規劃（僅做缺口提示）',
      '病人或照顧者自行使用',
      'COPD 診斷未確認者'
    ],
    algorithm_basis: '確定性規則查表，逐條比對 GOLD 2026 演算法與病人資料。不含任何統計模型或機器學習推論。',
    validation_basis: '軟體實作正確性以案例與不變式測試驗證；臨床有效性依據 GOLD 2026 之原始證據，本系統未進行獨立臨床試驗。',
    known_limitations: [
      'CAT/mMRC 多數醫院無結構化欄位，未評估時系統不進行分組',
      '急性惡化次數由 J44.1 + Encounter 推導，為候選值，須臨床確認',
      '裝置適配（PIF、協調能力）目前為人工欄位',
      '碳足跡比較不含緩解用藥（SABA），且推進劑轉換中',
      '不涵蓋非藥物治療與疫苗的完整建議，僅做缺口提示'
    ]
  },

  // ── 決策機制宣告（非補償性 vs 補償性）──
  mechanisms: {
    diagnosis_gate: { type: 'elimination', compensatory: false, runOrder: 1,
      note: 'COPD 診斷未確認時不產生任何維持治療建議' },
    abe_grouping:   { type: 'matrix', compensatory: false, runOrder: 2,
      note: '惡化次數 × 症狀分數的交叉分類；症狀資料缺失時回傳 UNASSESSED，不得猜測' },
    therapy_class:  { type: 'decisionTree', compensatory: false, runOrder: 3,
      note: '初始／追蹤兩條路徑，依目前治療分框；GOLD 2026 明確區分兩者' },
    device_fit:     { type: 'elimination', compensatory: false, runOrder: 4,
      note: '裝置不適用者直接排除，不得由碳足跡優勢抵銷' },
    carbon:         { type: 'tiebreak', compensatory: false, runOrder: 5,
      note: '⚠ 僅在臨床類別相同且裝置適配相同時作為決勝因子。永不跨臨床類別、永不覆蓋裝置適配' }
  },

  thresholds: {
    groupE_exacerbations: 1,      // GOLD 2026：≥1 次中度或重度
    groupB_cat: 10,
    groupB_mmrc: 2,
    initial_triple_eos: 300,      // 初始治療門檻
    followup_ics_eos: 100,        // 追蹤治療門檻（與初始不同，不可混用）
    biologic_eos: 300,
    biologic_min_exacerbations: 1,// GOLD 僅要求「仍持續惡化」
    ics_withdrawal_caution_eos: 300,
    roflumilast_fev1_pct: 50,
    low_eos_not_sole_reason: true // eos<100 不得作為排除 ICS 的唯一理由
  },

  // ── ICS 撤除的合法理由（GOLD 2026：非以下情形不應撤除）──
  ics_withdrawal_reasons: [
    { key: 'inappropriate_start', label: 'ICS 原本即無適當適應症' },
    { key: 'no_response',         label: '對 ICS 無臨床反應' },
    { key: 'major_side_effects',  label: '出現重大副作用' },
    { key: 'pneumonia',           label: '反覆或重度肺炎' }
  ],

  // ── 生物製劑：兩者不可互換 ──
  biologics: [
    { name: 'Dupilumab', requires_chronic_bronchitis: true,
      note: 'BOREAS/NOTUS：中重度惡化降低約 30% 並改善肺功能。適應症限合併慢性支氣管炎者' },
    { name: 'Mepolizumab', requires_chronic_bronchitis: false,
      note: 'METREX/METREO/MATINEE：惡化降幅約 18–21%，肺功能與症狀改善不一致。不論有無慢性支氣管炎皆可' }
  ],

  // ── 非藥物與預防缺口（GOLD 2026 強調；本系統僅做缺口提示）──
  nonpharm_checks: [
    { key: 'smoking_cessation', label: '戒菸介入',
      trigger_when_smoking: 'current',
      message: '現行吸菸：戒菸是唯一能改變 COPD 自然病程的介入，應優先安排戒菸門診或藥物治療。' },
    { key: 'pulmonary_rehab', label: '肺復健',
      message: '評估肺復健轉介；GOLD 2026 列為最能改善結果的非藥物介入之一。' },
    { key: 'vaccine_influenza', label: '流感疫苗', interval_months: 12 },
    { key: 'vaccine_rsv', label: 'RSV 疫苗', note: 'GOLD 2026 更新之建議' },
    { key: 'vaccine_pneumococcal', label: '肺炎鏈球菌疫苗' },
    { key: 'vaccine_covid', label: 'COVID-19 疫苗' },
    { key: 'physical_activity', label: '身體活動衛教' }
  ],

  // ── 警示登錄簿：每則都須有負責人、可量測成果、退場審查日 ──
  alerts: {
    'DX-UNCONFIRMED':   { owner: null, metric: 'COPD 診斷未確認即開立維持治療之比率 ↓', interruptive: false, review_due: '2027-08-31' },
    'DX-RATIO-CONFLICT':{ owner: null, metric: 'FEV₁/FVC ≥0.70 卻標記 COPD 之案例複核率 ↑', interruptive: false, review_due: '2027-08-31' },
    'GOLD-UNASSESSED':  { owner: null, metric: 'CAT/mMRC 結構化紀錄覆蓋率 ↑',            interruptive: false, review_due: '2027-02-28' },
    'ESC-INITIAL':      { owner: null, metric: '初始治療與 GOLD 分組一致率 ↑',           interruptive: false, review_due: '2027-02-28' },
    'ESC-DUAL':         { owner: null, metric: '單方治療且仍惡化者升階率 ↑',             interruptive: false, review_due: '2027-02-28' },
    'ESC-TRIPLE':       { owner: null, metric: 'eos ≥100 且仍惡化者三合一升階率 ↑',      interruptive: false, review_due: '2027-02-28' },
    'ICS-LOW-EOS':      { owner: null, metric: 'eos <100 但高惡化負擔者之 ICS 決策記錄率 ↑', interruptive: false, review_due: '2027-02-28' },
    'ICS-WITHDRAW':     { owner: null, metric: '無合法理由之 ICS 撤除件數 → 0',          interruptive: false, review_due: '2027-08-31' },
    'ICS-WITHDRAW-RISK':{ owner: null, metric: 'eos ≥300 者撤除 ICS 之件數 ↓',           interruptive: false, review_due: '2027-08-31' },
    'ADV-ROFLUMILAST':  { owner: null, metric: '符合條件者 roflumilast 評估率 ↑',        interruptive: false, review_due: '2027-08-31' },
    'ADV-AZITHRO':      { owner: null, metric: 'azithromycin 評估率與抗藥性監測',        interruptive: false, review_due: '2027-08-31' },
    'ADV-BIOLOGIC':     { owner: null, metric: '符合條件者生物製劑轉介率 ↑',             interruptive: false, review_due: '2027-02-28' },
    'ASTHMA-ICS':       { owner: null, metric: '合併氣喘者 ICS 保留率 → 100%',           interruptive: true,  review_due: '2027-08-31' },
    'GAP-NONPHARM':     { owner: null, metric: '戒菸／肺復健／疫苗缺口關閉率 ↑',         interruptive: false, review_due: '2027-08-31' },
    'DATA-INSUFFICIENT':{ owner: null, metric: '因資料不足無法判定之比率 ↓',             interruptive: false, review_due: '2027-08-31' },
    'DEVICE-UNCONFIRMED':{owner: null, metric: '裝置適配評估完成率 ↑',                   interruptive: false, review_due: '2027-02-28' },
    'CARBON-SUPPRESSED':{ owner: null, metric: '（狀態顯示，非警示）',                   interruptive: false, review_due: '2028-08-31' },
    'CARBON-FORMULATION-UNKNOWN': { owner: null, metric: '本院 pMDI 配方版本確認完成率 ↑', interruptive: false, review_due: '2026-11-30' }
  },

  governance: [
    'advisory only；不自動處方、不自動換藥、不擋單',
    '臨床適當性與裝置適用性一律優先於碳足跡',
    '碳足跡僅作為臨床等價選項間的決勝因子，永不跨臨床類別',
    '裝置適配未確認時不顯示碳排序',
    'FHIR 推導之惡化次數為候選值，須臨床確認',
    'CAT/mMRC 未取得時不進行 ABE 分組'
  ]
};
}));
