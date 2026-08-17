/**
 * copd_products.js — 院內處方集與碳足跡（配方版本層級）
 *
 * ⚠ 資料檔。維護者為藥劑部 + 永續小組。
 *
 * ⚠ 重要設計變更：碳足跡是「配方版本」的屬性，不是「產品」的屬性。
 *   pMDI 推進劑正由 HFA-134a 轉換至 HFA-152a / HFO-1234ze，
 *   轉換後碳足跡約降 90%，而產品名稱與健保碼可能不變。
 *   因此每個產品必須註明 local_supply_formulation，未確認前不得顯示碳排數值。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.COPD_PRODUCTS = factory();
}(typeof self !== 'undefined' ? self : this, function () {

// 碳足跡分帶：只主張站得住腳的差異。
// pMDI(HFA-134a) 與 DPI/SMI 差 20–40 倍是穩健的；帶內 2 倍差異落在 LCA 方法學雜訊內。
const BANDS = [
  { id: 'low',  max: 1,        label: '低碳裝置',        cls: 'ok',      note: '不含高 GWP 推進劑' },
  { id: 'mid',  max: 10,       label: '中等',            cls: 'unknown', note: '' },
  { id: 'high', max: Infinity, label: '含高 GWP 推進劑', cls: 'warn',    note: '推進劑為主要碳排來源' }
];

return {
  pack_id: 'copd_products',
  pack_version: '1.0',

  provenance: {
    verified_by: null,          // ⚠ 藥劑部負責人
    verified_date: null,
    review_due: '2026-11-30',   // 推進劑轉換進行中，需高頻複核
    carbon_method: {
      functional_unit: '每年、依標示用法、單一維持治療吸入器（不含緩解用藥）',
      boundary: '⚠ 待補：各引用 LCA 之系統邊界（cradle-to-grave？是否含棄置？）',
      caveat: '本比較不含緩解用藥。若換藥後 SABA 使用量增加，總碳排可能抵銷此差異。',
      precision_note: '同一分帶內不排序 —— 帶內差異落在 LCA 方法學雜訊範圍內'
    },
    propellant_transition_note:
      'pMDI 推進劑轉換進行中（HFA-152a / HFO-1234ze，廠商聲稱降幅約 90–99.9%）。' +
      '本院實際供應之配方版本必須逐項確認；未確認者碳排標示為「配方未確認」。'
  },

  bands: BANDS,

  products: [
    // ── LAMA 單方 ──
    { code:'1EQT04', nhi:'BC25033161', name:'Spiriva Respimat', cls:'LAMA', device:'SMI',
      regimen:'2 inhalations once daily', actuations_per_device:60, actuations_per_day:2,
      copd_candidate:true, local_supply_formulation:'std',
      formulations:[{ id:'std', propellant:'—（SMI 無推進劑）', carbon_low:0.775, carbon_mid:0.775, carbon_high:0.78,
        status:'current', evidence:'A', source:'⚠ 待補引用' }] },

    // ── LABA/LAMA ──
    { code:'1EQA01', nhi:'BC26315143', name:'Anoro Ellipta', cls:'LABA/LAMA', device:'DPI',
      regimen:'1 inhalation once daily', actuations_per_device:30, actuations_per_day:1,
      copd_candidate:true, local_supply_formulation:'std',
      formulations:[{ id:'std', propellant:'—（DPI 無推進劑）', carbon_low:0.4, carbon_mid:0.765, carbon_high:0.8,
        status:'current', evidence:'B', source:'⚠ 待補引用；Ellipta 裝置家族代理值' }] },

    { code:'1EQS08', nhi:'BC26735443', name:'Spiolto Respimat', cls:'LABA/LAMA', device:'SMI',
      regimen:'2 inhalations once daily', actuations_per_device:60, actuations_per_day:2,
      copd_candidate:true, local_supply_formulation:'std',
      formulations:[{ id:'std', propellant:'—（SMI 無推進劑）', carbon_low:0.775, carbon_mid:0.775, carbon_high:0.784,
        status:'current', evidence:'B', source:'⚠ 待補引用；Respimat 裝置家族代理值' }] },

    { code:'1EQU01', nhi:'BC26301443', name:'Ultibro Breezhaler', cls:'LABA/LAMA', device:'DPI',
      regimen:'1 capsule inhaled once daily', actuations_per_device:30, actuations_per_day:1,
      copd_candidate:true, local_supply_formulation:'std', note:'限交付調劑',
      formulations:[{ id:'std', propellant:'—（DPI 無推進劑）', carbon_low:0.184, carbon_mid:0.359, carbon_high:0.481,
        status:'current', evidence:'B', source:'⚠ 待補引用' }] },

    { code:'1EQB02', nhi:'BC27524457', name:'Bevespi Aerosphere', cls:'LABA/LAMA', device:'pMDI',
      regimen:'2 inhalations twice daily', actuations_per_device:120, actuations_per_day:4,
      copd_candidate:true, local_supply_formulation:null,   // ⚠ 待藥劑部確認
      formulations:[
        { id:'hfa134a', propellant:'HFA-134a', carbon_low:17.8, carbon_mid:17.8, carbon_high:25.3,
          status:'current', evidence:'B', source:'⚠ 待補引用' },
        { id:'hfo1234ze', propellant:'HFO-1234ze', carbon_low:null, carbon_mid:null, carbon_high:null,
          status:'in_transition', evidence:null,
          source:'AstraZeneca 產品線轉換中（廠商聲稱 GWP 影響低 99.9%，非獨立 LCA）' }
      ] },

    // ── ICS/LABA/LAMA 三合一 ──
    { code:'1EQT05', nhi:'BC27395443', name:'Trelegy Ellipta 92/55/22', cls:'ICS/LABA/LAMA', device:'DPI',
      regimen:'1 inhalation once daily', actuations_per_device:30, actuations_per_day:1,
      copd_candidate:true, local_supply_formulation:'std',
      formulations:[{ id:'std', propellant:'—（DPI 無推進劑）', carbon_low:0.4, carbon_mid:0.79, carbon_high:0.85,
        status:'current', evidence:'B', source:'⚠ 待補引用；Ellipta 裝置家族代理值' }] },

    { code:'1EQB04', nhi:'BC28183457', name:'Breztri Aerosphere', cls:'ICS/LABA/LAMA', device:'pMDI',
      regimen:'2 inhalations twice daily', actuations_per_device:120, actuations_per_day:4,
      copd_candidate:true, local_supply_formulation:null,   // ⚠ 待藥劑部確認
      formulations:[
        { id:'hfa134a', propellant:'HFA-134a', carbon_low:17.8, carbon_mid:17.8, carbon_high:17.8,
          status:'current', evidence:'B', source:'⚠ 待補引用' },
        { id:'hfo1234ze', propellant:'HFO-1234ze', carbon_low:null, carbon_mid:null, carbon_high:null,
          status:'in_transition', evidence:null,
          source:'AstraZeneca 已完成支持轉換之臨床試驗計畫（2024）；本院供應狀態待確認' }
      ] },

    { code:'1EQT06', nhi:'BC27672457', name:'Trimbow 100/6/12.5', cls:'ICS/LABA/LAMA', device:'pMDI',
      regimen:'2 inhalations twice daily', actuations_per_device:120, actuations_per_day:4,
      copd_candidate:true, local_supply_formulation:null,   // ⚠ 待藥劑部確認
      formulations:[
        { id:'hfa134a', propellant:'HFA-134a', carbon_low:14.28, carbon_mid:14.5, carbon_high:14.5,
          status:'current', evidence:'A', source:'直接產品 LCA ⚠ 待補完整引用' },
        { id:'hfa152a', propellant:'HFA-152a', carbon_low:null, carbon_mid:null, carbon_high:null,
          status:'in_transition', evidence:null,
          source:'AAPS PharmSciTech 2025：與 HFA-134a 版本效能可比性已發表；本院供應狀態待確認' }
      ] },

    // ── 非 COPD 候選 ──
    { code:'1EQE01', nhi:'BC28049443', name:'Enerzair Breezhaler', cls:'ICS/LABA/LAMA', device:'DPI',
      regimen:'—', actuations_per_device:30, actuations_per_day:1,
      copd_candidate:false, note:'不列為 COPD 候選；需依本院/TFDA 適應症覆核',
      local_supply_formulation:'std',
      formulations:[{ id:'std', propellant:'—', carbon_low:0.359, carbon_mid:0.359, carbon_high:0.481,
        status:'current', evidence:'A', source:'⚠ 待補引用' }] },

    { code:'1EQT07', nhi:'BC28240443', name:'Trelegy Ellipta 184/55/22', cls:'ICS/LABA/LAMA', device:'DPI',
      regimen:'—', actuations_per_device:30, actuations_per_day:1,
      copd_candidate:false, note:'不列為 COPD 候選；需依本院/TFDA 適應症覆核',
      local_supply_formulation:'std',
      formulations:[{ id:'std', propellant:'—', carbon_low:0.4, carbon_mid:0.79, carbon_high:0.85,
        status:'current', evidence:'B', source:'⚠ 待補引用' }] }
  ],

  // 藥物辨識：ATC 不足時以本院碼／健保碼／關鍵字三層備援
  medication_detection: [
    { local:'1EQT04', nhi:'BC25033161', name:'Spiriva Respimat',   cls:'LAMA',          keywords:['spiriva','tiotropium'] },
    { local:'1EQA01', nhi:'BC26315143', name:'Anoro Ellipta',      cls:'LABA/LAMA',     keywords:['anoro','umeclidinium'] },
    { local:'1EQB02', nhi:'BC27524457', name:'Bevespi Aerosphere', cls:'LABA/LAMA',     keywords:['bevespi','glycopyrrolate/formoterol'] },
    { local:'1EQS08', nhi:'BC26735443', name:'Spiolto Respimat',   cls:'LABA/LAMA',     keywords:['spiolto','olodaterol'] },
    { local:'1EQU01', nhi:'BC26301443', name:'Ultibro Breezhaler', cls:'LABA/LAMA',     keywords:['ultibro','indacaterol/glycopyrronium'] },
    { local:'1EQB04', nhi:'BC28183457', name:'Breztri Aerosphere', cls:'ICS/LABA/LAMA', keywords:['breztri'] },
    { local:'1EQT05', nhi:'BC27395443', name:'Trelegy Ellipta',    cls:'ICS/LABA/LAMA', keywords:['trelegy'] },
    { local:'1EQT06', nhi:'BC27672457', name:'Trimbow',            cls:'ICS/LABA/LAMA', keywords:['trimbow'] },
    { local:'1EQF06', nhi:'BC250921FL', name:'Foster MDI',         cls:'ICS/LABA',      keywords:['foster'] },
    { local:'1EQF08', nhi:'BC268161FL', name:'Foster NEXThaler',   cls:'ICS/LABA',      keywords:['foster nexthaler'] },
    { local:'1EQR01', nhi:'BC26318143', name:'Relvar Ellipta',     cls:'ICS/LABA',      keywords:['relvar'] },
    { local:'1EQS03', nhi:'BC232651E7', name:'Symbicort Turbuhaler',cls:'ICS/LABA',     keywords:['symbicort turbuhaler'] },
    { local:'1EQS07', nhi:'BC266571E7', name:'Symbicort Rapihaler', cls:'ICS/LABA',     keywords:['symbicort rapihaler'] },
    { local:'1EQS02', nhi:'BC23202127', name:'Seretide Accuhaler', cls:'ICS/LABA',      keywords:['seretide','accuhaler'] },
    { local:'1EQS04', nhi:'BC23482137', name:'Seretide Evohaler',  cls:'ICS/LABA',      keywords:['seretide','evohaler'] }
  ]
};
}));
