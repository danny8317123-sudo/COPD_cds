/**
 * copd_engine.js — COPD 決策引擎（純函式，零網路依賴）
 *
 * 修正 2026-08-16 GOLD 2026 稽核發現的落差：
 *   D0  num() 缺值回傳 0 → CAT/mMRC 未填時靜默歸為 Group A     → 新增 UNASSESSED
 *   D1  生物製劑門檻過嚴且未區分 dupilumab / mepolizumab        → 依 cb 分流，門檻改 ≥1
 *   D2  eos<100 被寫成「不用 ICS」硬分支                        → 改為軟性，高惡化負擔時主動提示
 *   D3  單方→三合一用 300（初始門檻）而非 100（追蹤門檻）       → 改用 followup_ics_eos
 *   D4  ICS 撤除只實作 1/4 理由，且 eos≥300 警告只在惡化分支     → 獨立檢核，四理由全列，全分支警告
 *   D5  azithromycin 只在已戒菸者顯示                           → 一律顯示並標注優先順序
 *   C1  非藥物與疫苗完全缺席                                    → 新增缺口檢核
 *
 * 輸出契約（供 UI 使用）：
 *   { gold, pathway, class, title, sub, reasons[], advanced[], gaps[], dataGaps[],
 *     carbonAllowed, alerts[] }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./copd_rules.js'), require('./copd_products.js'));
  else root.COPD_ENGINE = factory(root.COPD_RULES, root.COPD_PRODUCTS);
}(typeof self !== 'undefined' ? self : this, function (RULES, PRODUCTS) {
'use strict';

if (!RULES || !PRODUCTS) throw new Error('規則包或產品包未載入');
const T = RULES.thresholds;

/** 數值取得。⚠ 缺值一律回傳 null，絕不以 0 代替 —— 這是 D0 的修正核心。 */
function n(v) {
  if (v === null || v === undefined || v === '') return null;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : null;
}
const has = v => v !== null && v !== undefined;

/* ══════════════════════════════════════════════════════════════
   ABE 分組
   ══════════════════════════════════════════════════════════════ */
function calcGold(s) {
  const mod = n(s.modEx), sev = n(s.sevEx), cat = n(s.cat), mmrc = n(s.mmrc);

  // 惡化次數已知且達門檻 → E（不需症狀分數）
  if (has(mod) && has(sev) && (mod + sev) >= T.groupE_exacerbations)
    return { group: 'E', basis: `過去12月 ${mod} 次中度 + ${sev} 次重度惡化（門檻 ≥${T.groupE_exacerbations}）` };

  // ⚠ D0：症狀資料全缺時不得歸類。回傳 UNASSESSED，由呼叫端停止建議。
  if (!has(cat) && !has(mmrc))
    return { group: 'UNASSESSED', basis: 'CAT 與 mMRC 皆未取得，無法判定症狀負擔' };

  if (!has(mod) || !has(sev))
    return { group: 'UNASSESSED', basis: '急性惡化次數未確認，無法判定分組' };

  const symptomatic = (has(cat) && cat >= T.groupB_cat) || (has(mmrc) && mmrc >= T.groupB_mmrc);
  return symptomatic
    ? { group: 'B', basis: `無中度／重度惡化；CAT ${cat ?? '—'} 或 mMRC ${mmrc ?? '—'} 達 Group B 症狀門檻` }
    : { group: 'A', basis: `無中度／重度惡化，且症狀負擔低於 Group B 門檻` };
}

/* ══════════════════════════════════════════════════════════════
   ICS 撤除檢核（D4）：四個合法理由，且 eos≥300 警告不分分支
   ══════════════════════════════════════════════════════════════ */
function icsWithdrawal(s, out) {
  const onICS = (s.currentTherapy || '').includes('ICS');
  if (!onICS) return;

  const reasons = RULES.ics_withdrawal_reasons.filter(r => s[r.key] === 'yes' || s[r.key] === true);
  const eos = n(s.eos);

  if (reasons.length) {
    out.advanced.push({
      id: 'ICS-WITHDRAW',
      text: `符合 GOLD 2026 可考慮撤除 ICS 之情形：${reasons.map(r => r.label).join('、')}。` +
            `其餘情形不應自三合一撤除 ICS。`
    });
  } else if (s.considerIcsWithdrawal === 'yes') {
    out.advanced.push({
      id: 'ICS-WITHDRAW',
      text: 'GOLD 2026：除「ICS 原本即無適當適應症」「對 ICS 無臨床反應」「重大副作用」' +
            '「反覆或重度肺炎」之外，不應自三合一撤除 ICS。目前未勾選任一項。'
    });
  }

  // ⚠ D4 修正：此警告原本只在惡化分支出現，現在任何分支都給
  if (has(eos) && eos >= T.ics_withdrawal_caution_eos && (reasons.length || s.considerIcsWithdrawal === 'yes')) {
    out.advanced.push({
      id: 'ICS-WITHDRAW-RISK',
      text: `⚠ 嗜酸性球 ${eos} ≥${T.ics_withdrawal_caution_eos} cells/μL：GOLD 2026 指出此族群撤除 ICS 後惡化風險上升，應特別謹慎。`
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   進階選項：roflumilast / azithromycin / 生物製劑
   ══════════════════════════════════════════════════════════════ */
function advancedOptions(s, out) {
  const eos = n(s.eos), fev1 = n(s.fev1);
  const mod = n(s.modEx) || 0, sev = n(s.sevEx) || 0;
  const cb = s.chronicBronchitis === 'yes';

  if (has(fev1) && fev1 < T.roflumilast_fev1_pct && cb) {
    out.advanced.push({ id: 'ADV-ROFLUMILAST',
      text: `FEV₁ ${fev1}% <${T.roflumilast_fev1_pct}% 且有慢性支氣管炎：可評估 roflumilast。` +
            `（部分 GOLD 版本另列「有重度惡化史」條件，請以 Fig 3.10 原圖核對）` });
  }

  // ⚠ D5 修正：一律顯示，只調整優先順序措辭
  out.advanced.push({ id: 'ADV-AZITHRO',
    text: s.smoking === 'former'
      ? '已戒菸：azithromycin 為優先考慮對象（需權衡抗藥性與 QT）。'
      : 'azithromycin：GOLD 優先用於已戒菸者，現行吸菸者效益證據較弱；如考慮使用應先安排戒菸。' });

  // ⚠ D1 修正：門檻由 (mod≥2||sev≥1) 改為 ≥1；並依慢性支氣管炎分流兩種生物製劑
  if (has(eos) && eos >= T.biologic_eos && (mod + sev) >= T.biologic_min_exacerbations) {
    const fit = RULES.biologics.filter(b => !b.requires_chronic_bronchitis || cb);
    const excluded = RULES.biologics.filter(b => b.requires_chronic_bronchitis && !cb);
    out.advanced.push({ id: 'ADV-BIOLOGIC',
      text: `三合一治療下仍有惡化且嗜酸性球 ${eos} ≥${T.biologic_eos} cells/μL：` +
            `可考慮 ${fit.map(b => b.name).join(' 或 ')}。` +
            fit.map(b => `${b.name}：${b.note}`).join('；') +
            (excluded.length ? `。${excluded.map(b => b.name).join('、')} 之適應症限合併慢性支氣管炎者，本例未標記慢性支氣管炎。` : '') });
  }
}

/* ══════════════════════════════════════════════════════════════
   非藥物與疫苗缺口（C1）
   ══════════════════════════════════════════════════════════════ */
function nonPharmGaps(s) {
  const gaps = [];
  for (const c of RULES.nonpharm_checks) {
    if (c.key === 'smoking_cessation') {
      if (s.smoking === 'current') gaps.push({ key: c.key, label: c.label, level: 'high', text: c.message });
      continue;
    }
    if (c.key === 'pulmonary_rehab') {
      if (s.pulmonaryRehab !== 'yes') gaps.push({ key: c.key, label: c.label, level: 'mid', text: c.message });
      continue;
    }
    if (c.key.indexOf('vaccine_') === 0) {
      if (s[c.key] !== 'yes') gaps.push({ key: c.key, label: c.label, level: 'mid',
        text: `${c.label}未記錄或未完成${c.note ? '（' + c.note + '）' : ''}。` });
      continue;
    }
    if (s[c.key] !== 'yes') gaps.push({ key: c.key, label: c.label, level: 'low', text: `${c.label}未記錄。` });
  }
  return gaps;
}

/* ══════════════════════════════════════════════════════════════
   主決策
   ══════════════════════════════════════════════════════════════ */
function evaluate(s) {
  const out = { class: null, title: '', sub: '', reasons: [], advanced: [], gaps: [], dataGaps: [], alerts: [] };
  const push = (id, text) => out.advanced.push({ id, text });

  const eos = n(s.eos);
  const asthma = s.asthma === 'yes';
  const current = s.currentTherapy || 'none';
  const mod = n(s.modEx), sev = n(s.sevEx);
  const g = calcGold(s);
  out.gold = g.group;
  out.goldBasis = g.basis;

  // ── 閘門 1：診斷 ──
  if (s.copdConfirmed !== 'yes') {
    out.title = '暫不產生 COPD 維持治療建議';
    out.sub = '先確認 COPD 診斷與肺功能資料';
    out.reasons.push('COPD 診斷尚未確認。');
    out.alerts.push('DX-UNCONFIRMED');
    out.carbonAllowed = false;
    return out;
  }
  const ratio = n(s.fevRatio);
  if (has(ratio) && ratio >= 0.7) {
    out.dataGaps.push('post-BD FEV₁/FVC ≥0.70，與固定比值診斷門檻不一致，請確認肺功能與診斷。');
    out.alerts.push('DX-RATIO-CONFLICT');
  }

  // ── 閘門 2：資料充足性（D0 修正）──
  const initial = s.reviewReason === 'initial' || current === 'none';
  if (initial && g.group === 'UNASSESSED') {
    out.title = '症狀評估未完成，無法判定 GOLD 分組';
    out.sub = 'Initial treatment · 資料不足';
    out.reasons.push(g.basis);
    out.reasons.push('系統不以缺失值推估分組；請補齊 CAT 或 mMRC 後重新評估。');
    out.alerts.push('GOLD-UNASSESSED', 'DATA-INSUFFICIENT');
    out.gaps = nonPharmGaps(s);
    out.carbonAllowed = false;
    return out;
  }

  if (asthma) push('ASTHMA-ICS', '合併 asthma：GOLD 2026 指出應以氣喘方式治療，ICS 為必要成分，不得撤除；後續須同時依 asthma guideline。');

  // ── 初始治療 ──
  if (initial) {
    out.sub = `Initial treatment · GOLD ${g.group}`;
    if (g.group === 'A') {
      out.title = 'Bronchodilator';
      out.reasons.push(g.basis);
      push('ESC-INITIAL', 'Group A：GOLD 2026 建議支氣管擴張劑；本系統不自動選定短效或長效品項。');
    } else if (g.group === 'B') {
      out.class = 'LABA/LAMA'; out.title = 'LABA/LAMA';
      out.reasons.push(g.basis);
      out.alerts.push('ESC-INITIAL');
    } else {
      out.reasons.push(g.basis);
      if (asthma || (has(eos) && eos >= T.initial_triple_eos)) {
        out.class = 'ICS/LABA/LAMA'; out.title = 'Consider LABA/LAMA/ICS';
        if (has(eos) && eos >= T.initial_triple_eos)
          out.reasons.push(`嗜酸性球 ${eos} ≥${T.initial_triple_eos} cells/μL：支持考慮初始三合一治療。`);
        if (asthma) out.reasons.push('合併 asthma：ICS 必須保留。');
      } else {
        out.class = 'LABA/LAMA'; out.title = 'LABA/LAMA';
        out.reasons.push(has(eos)
          ? `嗜酸性球 ${eos} cells/μL，未達初始三合一之 ≥${T.initial_triple_eos} 門檻；GOLD 2026 初始治療仍以雙支氣管擴張為首選。`
          : `嗜酸性球未取得；初始治療以雙支氣管擴張為首選，取得後再評估是否加 ICS。`);
        if (!has(eos)) out.dataGaps.push('嗜酸性球未取得，無法評估初始三合一適應症。');
      }
      out.alerts.push('ESC-INITIAL');
    }

  // ── 追蹤：穩定 ──
  } else if (s.reviewReason === 'stable') {
    out.title = 'Continue current treatment';
    out.sub = 'Follow-up · response adequate';
    out.reasons.push('目前以穩定續方為主要目的，未觸發呼吸困難或惡化調整路徑。');
    push('CARBON-SUPPRESSED', '如需更換裝置或分子，可使用「比較臨床等價選項」；本系統不因碳排要求換藥。');

  // ── 追蹤：呼吸困難路徑 ──
  } else if (s.reviewReason === 'dyspnea') {
    out.sub = 'Follow-up · persistent dyspnea';
    if (current === 'LABA' || current === 'LAMA') {
      out.class = 'LABA/LAMA'; out.title = 'LABA/LAMA';
      out.reasons.push(`目前為 ${current} 單一長效支氣管擴張劑。`);
      out.reasons.push('GOLD 2026 呼吸困難路徑：持續呼吸困難可升級為雙支氣管擴張。');
      out.alerts.push('ESC-DUAL');
    } else if (current === 'LABA/LAMA') {
      out.title = 'Review device / molecule before adding therapy';
      out.reasons.push('目前已為 LABA/LAMA。');
      out.reasons.push('先確認吸入技術、依從性、裝置適配與其他呼吸困難原因。');
      push('ESC-DUAL', 'GOLD 2026：可考慮更換吸入裝置或分子、加入 ensifentrine、強化非藥物治療，並評估其他呼吸困難原因。');
    } else if (current === 'ICS/LABA') {
      out.class = asthma ? 'ICS/LABA/LAMA' : 'LABA/LAMA';
      out.title = asthma ? 'Consider LABA/LAMA/ICS' : 'Consider LABA/LAMA';
      out.reasons.push('目前為 ICS/LABA；COPD 呼吸困難路徑的主要目標是最佳化支氣管擴張。');
      if (asthma) out.reasons.push('合併 asthma，ICS 不得撤除。');
    } else if (current === 'ICS/LABA/LAMA') {
      out.title = 'Review device, adherence and other causes';
      out.reasons.push('目前已為三合一治療；持續呼吸困難不應只以再增加吸入藥物處理。');
      push('ESC-DUAL', '考慮裝置／分子更換、ensifentrine、肺復健、其他心肺共病與非藥物治療。');
    } else {
      out.title = 'Clinical review required';
      out.reasons.push('目前維持治療無法對應標準 GOLD follow-up 方框。');
    }

  // ── 追蹤：惡化路徑 ──
  } else {
    out.sub = 'Follow-up · exacerbation prevention';
    const exBurdenHigh = (has(mod) && mod >= 2) || (has(sev) && sev >= 1);

    if (current === 'LABA' || current === 'LAMA') {
      // ⚠ D3 修正：追蹤路徑一律用 followup_ics_eos（100），不用初始門檻（300）
      if (asthma || (has(eos) && eos >= T.followup_ics_eos)) {
        out.class = 'ICS/LABA/LAMA'; out.title = 'Consider LABA/LAMA/ICS';
        out.reasons.push(`目前 ${current} 仍發生中度／重度惡化。`);
        if (has(eos) && eos >= T.followup_ics_eos)
          out.reasons.push(`嗜酸性球 ${eos} ≥${T.followup_ics_eos} cells/μL（追蹤治療門檻），支持加入 ICS。`);
        if (asthma) out.reasons.push('合併 asthma：ICS 必須保留。');
        out.alerts.push('ESC-TRIPLE');
      } else {
        out.class = 'LABA/LAMA'; out.title = 'LABA/LAMA';
        out.reasons.push(`目前 ${current} 仍發生中度／重度惡化，先升級為雙支氣管擴張。`);
        out.alerts.push('ESC-DUAL');
      }

    } else if (current === 'LABA/LAMA') {
      if (asthma || (has(eos) && eos >= T.followup_ics_eos)) {
        out.class = 'ICS/LABA/LAMA'; out.title = 'Consider LABA/LAMA/ICS';
        out.reasons.push('目前 LABA/LAMA 仍有中度／重度惡化。');
        if (has(eos) && eos >= T.followup_ics_eos)
          out.reasons.push(`嗜酸性球 ${eos} ≥${T.followup_ics_eos} cells/μL，支持 ICS 升階。`);
        if (asthma) out.reasons.push('合併 asthma：ICS 必須保留。');
        out.alerts.push('ESC-TRIPLE');
      } else if (!has(eos)) {
        out.title = 'Blood eosinophil count required';
        out.reasons.push('目前 LABA/LAMA 仍有惡化，但嗜酸性球未取得，無法判定是否應加 ICS。');
        out.dataGaps.push('請先取得血中嗜酸性球絕對值（LOINC 711-2）。');
        out.alerts.push('DATA-INSUFFICIENT');
      } else {
        // ⚠ D2 修正：eos<100 不再是「不用 ICS」的硬分支
        out.title = 'Individualise ICS decision';
        out.reasons.push(`目前 LABA/LAMA 仍有惡化，嗜酸性球 ${eos} <${T.followup_ics_eos} cells/μL，ICS 的平均效益較低。`);
        out.reasons.push('⚠ GOLD 2026：嗜酸性球低於 100 cells/μL **不得作為排除 ICS 的唯一理由**。' +
                         'ICS 決策應整合惡化史、疾病嚴重度與整體臨床情境。');
        out.alerts.push('ICS-LOW-EOS');
        if (exBurdenHigh) {
          out.class = 'ICS/LABA/LAMA';
          push('ICS-LOW-EOS', `⚠ 本例惡化負擔較高（${mod ?? 0} 次中度 / ${sev ?? 0} 次重度）：` +
               `GOLD 2026 指出惡化頻繁或嚴重者即使嗜酸性球偏低仍可能需要 ICS，已列出三合一候選供評估。`);
        } else {
          push('ICS-LOW-EOS', '惡化負擔不高：可先評估非 ICS 選項（見下方進階建議），並記錄 ICS 決策理由。');
        }
      }

    } else if (current === 'ICS/LABA') {
      out.class = 'ICS/LABA/LAMA'; out.title = 'Consider LABA/LAMA/ICS';
      out.reasons.push('目前 ICS/LABA 仍發生惡化；有 ICS 適應症時 GOLD 偏好三合一而非 LABA+ICS。');
      out.alerts.push('ESC-TRIPLE');

    } else if (current === 'ICS/LABA/LAMA') {
      out.title = 'Advanced exacerbation review';
      out.reasons.push('目前已為三合一治療且仍有惡化。');

    } else {
      out.title = 'Clinical review required';
      out.reasons.push('目前維持治療無法直接對應 GOLD follow-up 方框。');
    }

    advancedOptions(s, out);
  }

  icsWithdrawal(s, out);
  out.gaps = nonPharmGaps(s);
  if (out.gaps.length) out.alerts.push('GAP-NONPHARM');

  // ── 裝置適配閘門：未確認時不顯示碳排（非補償性原則）──
  const fits = [s.fitDPI, s.fitSMI, s.fitPMDI];
  const anyConfirmed = fits.some(f => f && f !== 'unknown');
  out.carbonAllowed = !!(out.class && anyConfirmed);
  if (out.class && !anyConfirmed) {
    out.dataGaps.push('裝置適配尚未評估（DPI／SMI／pMDI 三項皆為未確認）：' +
                      '已隱藏碳足跡排序，避免在臨床條件未確立前產生錨定。');
    out.alerts.push('DEVICE-UNCONFIRMED');
  }

  out.pathway = initial ? 'Initial' : 'Follow-up';
  return out;
}

/* ══════════════════════════════════════════════════════════════
   產品：裝置適配 → 碳足跡分帶（永不跨臨床類別）
   ══════════════════════════════════════════════════════════════ */
function deviceFit(device, s) {
  const st = ({ DPI: s.fitDPI, SMI: s.fitSMI, pMDI: s.fitPMDI })[device] || 'unknown';
  if (st === 'yes')    return { rank: 0, label: '適合',     cls: 'ok' };
  if (st === 'spacer') return { rank: 1, label: '需 spacer', cls: 'unknown' };
  if (st === 'unknown')return { rank: 2, label: '未確認',   cls: 'unknown' };
  return { rank: 4, label: '不適合', cls: 'no' };
}

/** 取得本院實際供應配方的碳足跡。配方未確認時回傳 null，不猜測。 */
function carbonOf(p) {
  if (!p.local_supply_formulation)
    return { known: false, note: '配方版本未確認（推進劑轉換中）', band: null };
  const f = (p.formulations || []).find(x => x.id === p.local_supply_formulation);
  if (!f || f.carbon_mid === null)
    return { known: false, note: '本配方尚無碳足跡資料', band: null, propellant: f && f.propellant };
  const perYear = f.carbon_mid * (365 / (p.actuations_per_device / p.actuations_per_day));
  const band = PRODUCTS.bands.find(b => f.carbon_mid < b.max);
  return { known: true, perDeviceLow: f.carbon_low, perDeviceMid: f.carbon_mid, perDeviceHigh: f.carbon_high,
           perYear, band, propellant: f.propellant, evidence: f.evidence, source: f.source };
}

/**
 * 候選產品清單。
 * 排序：裝置適配（非補償性）→ 碳足跡分帶 → 名稱。⚠ 帶內不依小數排序。
 */
function candidates(cls, s) {
  if (!cls) return [];
  return PRODUCTS.products
    .filter(p => p.copd_candidate && p.cls === cls)
    .map(p => ({ ...p, fit: deviceFit(p.device, s), carbon: carbonOf(p) }))
    .sort((a, b) => {
      if (a.fit.rank !== b.fit.rank) return a.fit.rank - b.fit.rank;   // ① 裝置優先
      const ai = a.carbon.band ? PRODUCTS.bands.indexOf(a.carbon.band) : 99;
      const bi = b.carbon.band ? PRODUCTS.bands.indexOf(b.carbon.band) : 99;
      if (ai !== bi) return ai - bi;                                    // ② 碳分帶
      return a.name.localeCompare(b.name);                              // ③ 帶內不排名
    });
}

return { evaluate, calcGold, candidates, deviceFit, carbonOf, RULES, PRODUCTS };

}));
