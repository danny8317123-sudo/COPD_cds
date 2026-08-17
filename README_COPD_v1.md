# COPD Sustainable Rx Assist v1.0
# 台灣 SMART on FHIR 部署與操作 SOP

**日期** 2026-08-16　|　**臨床基準** GOLD 2026　|　**模式** advisory-only

---

# 第 0 章　這個版本改了什麼

依 2026-08-16 的 GOLD 2026 稽核，修正 6 個落差並重構架構。

| 代號 | 原問題 | 修正 |
|---|---|---|
| **D0** | `num()` 缺值回傳 0 → CAT/mMRC 未填時**靜默歸為 Group A** | 新增 `UNASSESSED`；缺值不分組、不給建議 |
| **D1** | 生物製劑門檻 `≥2次` 過嚴，且未區分兩種藥 | 改為 ≥1 次；依慢性支氣管炎分流 dupilumab / mepolizumab |
| **D2** | eos<100 被寫成「不用 ICS」硬分支 | 改為個別化措辭；惡化負擔高時**仍列出三合一候選** |
| **D3** | 單方→三合一用 300（初始門檻） | 改用 100（追蹤門檻），與 GOLD 追蹤演算法一致 |
| **D4** | ICS 撤除只實作 1/4 理由，eos≥300 警告只在惡化分支 | 四理由全列；警告在**所有分支**出現 |
| **D5** | azithromycin 只對已戒菸者顯示 | 一律顯示，標注優先順序 |
| **C1** | 非藥物與疫苗完全缺席 | 新增戒菸／肺復健／四種疫苗／身體活動缺口檢核 |
| — | 裝置未確認時仍顯示碳排名 | **未確認即隱藏碳排序**（避免錨定） |
| — | 碳足跡是產品屬性 | 改為**配方版本屬性**，未確認不顯示數值 |
| — | 帶內以小數排名 | 改為**分帶呈現，帶內不排序** |
| — | 規則與處方集混在一個檔 | 拆為 `copd_rules.js`（醫師維護）與 `copd_products.js`（藥劑部維護） |

---

# 第 1 章　檔案與角色

```
copd_launch.html      SMART 授權啟動頁（THAS Launch URL 指向這個）
copd_fhir.html        主畫面：FHIR 資料層 + UI。⚠ 不含任何臨床判定邏輯
copd_engine.js        決策引擎（純函式，單一來源）        ← 工程維護
copd_rules.js         GOLD 2026 臨床規則包（純資料）      ← 胸腔科醫師維護
copd_products.js      院內處方集與碳足跡（純資料）        ← 藥劑部 + 永續小組維護
copd_test.js          五層測試（Node 執行，不需部署）
copd-test-patient-bundle.json   測試病人
inject-copd-test-console.js     THAS 灌資料腳本
```

**五個檔案必須放在同一層。** 缺任一個，`copd_fhir.html` 會硬失敗並顯示「載入失敗」——
這是刻意的，決策引擎缺失時顯示任何臨床判定都不安全。

## 誰改哪個檔

| 你要改 | 改哪個檔 | 需不需要工程 |
|---|---|---|
| GOLD 閾值（eos 100/300、CAT 10、mMRC 2） | `copd_rules.js` → `thresholds` | ❌ 自己改 |
| 生物製劑的適應症說明 | `copd_rules.js` → `biologics` | ❌ |
| 疫苗與非藥物項目 | `copd_rules.js` → `nonpharm_checks` | ❌ |
| 新增／移除院內品項 | `copd_products.js` → `products` | ❌ |
| 碳足跡數值、推進劑版本 | `copd_products.js` → `formulations` | ❌ |
| 判定流程本身（新增分支、改演算法結構） | `copd_engine.js` | ✅ 需工程 |

**判斷方式**：只換數字或文字 → 自己改。想在資料檔裡寫「如果…就…」 → 找工程。
（`copd_test.js` 的 R1 檢查會擋下在規則包裡夾帶邏輯的行為。）

---

# 第 2 章　部署到 THAS（逐步）

## 2.1 上傳

把上列 5 個檔案（不含 `copd_test.js`）放到 GitHub Pages 或院內 Web Server 的**同一層**。
檔名全小寫，不要放子資料夾。

```
https://<你的帳號>.github.io/<repo>/copd_launch.html
https://<你的帳號>.github.io/<repo>/copd_fhir.html
https://<你的帳號>.github.io/<repo>/copd_engine.js
https://<你的帳號>.github.io/<repo>/copd_rules.js
https://<你的帳號>.github.io/<repo>/copd_products.js
```

**驗證部署成功**：直接開 `copd_launch.html`，應顯示「授權啟動失敗 · 本頁需由 EHR / SMART Launcher 啟動」。
**看到這個訊息代表部署正確**（缺 `iss` 與 `launch` 是預期行為）。

## 2.2 在 THAS 註冊

| 欄位 | 值 |
|---|---|
| Launch URL | `.../copd_launch.html` |
| Redirect URL | `.../copd_fhir.html` |
| Client ID | `copd_sustainable_rx_advisory` |
| App Type | Public client（純前端，無 secret） |

**Scope**（已寫在 `copd_launch.html`，註冊時需一致）：
```
launch openid fhirUser
patient/Patient.read patient/Observation.read patient/MedicationRequest.read
patient/Condition.read patient/Encounter.read patient/QuestionnaireResponse.read
```

FHIR Server base：`https://thas.mohw.gov.tw/v/r4/fhir`
⚠ **是 `/v/r4/fhir` 不是 `/v4/`** —— 這是踩過的坑。

## 2.3 灌測試資料

1. 開 `https://thas.mohw.gov.tw/v/r4/fhir/metadata`
2. 開 DevTools Console
3. 貼上 `inject-copd-test-console.js` 全文並執行
4. 看到 `HTTP 200` 與 `COPD test bundle uploaded` 即成功

## 2.4 直連測試（跳過 OAuth，先驗資料層）

```
copd_fhir.html?direct=1&patient=copd-test-001
copd_fhir.html?direct=1&patient=copd-test-001&iss=https://thas.mohw.gov.tw/v/r4/fhir
```

## 2.5 正式 SMART Launch

由 THAS / EHR Launcher 啟動 `copd_launch.html`，走完 OAuth 後自動導向 `copd_fhir.html`。

---

# 第 3 章　預期測試結果（v1.0 已改變）

測試病人 `copd-test-001`：COPD、post-BD FEV₁/FVC 0.58、CAT 18、mMRC 2、eos 320（0.32×10⁹/L）、
目前 Spiolto（LABA/LAMA）、過去一年 1 筆 J44.1 + 急診 Encounter。

| 檢查點 | 預期 |
|---|---|
| GOLD 分組 | **E**（≥1 次中度或重度惡化） |
| 路徑 | Follow-up · exacerbation prevention |
| 判定 | **Consider LABA/LAMA/ICS**（eos 320 ≥100 追蹤門檻） |
| 候選清單 | 僅 ICS/LABA/LAMA 類別 |
| 裝置適配 | 三項若未填 → **不顯示碳排序**，並提示先完成評估 |
| 裝置填 SMI=適合後 | Trelegy（低碳裝置）在前；Breztri 與 Trimbow 顯示**「配方未確認」**而非數值 |
| 非藥物缺口 | 列出肺復健、四種疫苗、身體活動 |
| 底部 | 紅字「規則包尚未經胸腔科醫師核對簽核」 |

**兩個新行為要特別確認**：

1. **把 CAT 與 mMRC 清空** → 應顯示「症狀評估未完成，無法判定 GOLD 分組」，**不給任何產品清單**
   （舊版會靜默歸為 Group A）
2. **把 eos 改成 60、惡化次數改成 3 次中度** → 應仍列出三合一候選，並顯示
   「惡化負擔較高，即使嗜酸性球偏低仍可能需要 ICS」（舊版會直接排除 ICS）

---

# 第 4 章　上線前必做

## 4.1 臨床（胸腔科醫師）

- [ ] **拿 GOLD 2026 報告 Fig 3.7–3.11 原圖，逐條核對 `copd_rules.js` 的 `thresholds`**
      特別確認：單方 → 三合一是否為合法路徑、roflumilast 是否另需「重度惡化史」條件
- [ ] 確認 `biologics` 兩者的適應症描述與台灣仿單一致
- [ ] 填入 `provenance.verified_by` / `verified_date` / `review_due`
- [ ] 指派 18 則警示的負責人（`copd_rules.js` → `alerts`）
- [ ] 建立**本院 COPD 惡化的正式定義**（目前 J44.1 + Encounter 僅為候選值）

## 4.2 藥劑部

- [ ] **逐項確認本院實際供應的 pMDI 配方版本**，填入 `local_supply_formulation`
      （Bevespi、Breztri、Trimbow 三支目前為 `null`，因此不顯示碳排數值）
- [ ] 核對院內品項碼與健保碼
- [ ] 填入 `copd_products.js` 的 `provenance.verified_by` / `verified_date`

## 4.3 永續小組

- [ ] 補上每個碳足跡數值的 **LCA 引用來源與系統邊界**（目前多為「⚠ 待補引用」）
- [ ] 確認 `carbon_method.functional_unit` 的假設（每支裝置在標示用法下恰好用 30 天）逐項成立
- [ ] 廠商自述數據（90%／99.9% 降幅）在對外文件中須標示為 manufacturer-reported

## 4.4 資訊

- [ ] 把院內 LOINC／local lab code 加入 `copd_fhir.html` 的 `observation_codes`
      **CAT/mMRC 若院內已有結構化欄位，務必加入** —— 這是 D0 最常觸發的原因
- [ ] MedicationRequest 藥碼對映
- [ ] Production 建議自架 `fhir-client.js` 與字型，不依賴外部 CDN，並加 CSP
- [ ] `node copd_test.js` 接進 CI

---

# 第 5 章　日常維運

## 5.1 指令

```bash
node copd_test.js        # 五層測試，任一失敗即 exit 1
```

預期輸出：`通過 42 / 42`，加上三則預期警告（兩個簽核 + 配方待確認）。

## 5.2 GOLD 改版時（每年 11 月）

```
1. 醫師   逐條比對新版 Fig 3.7–3.11，列出哪些數值變了
2. 醫師   修改 copd_rules.js 的 thresholds
3. 工程   node copd_test.js → 看哪些測試案例的行為改變
4. 醫師   審查：每一項改變都是新版要的嗎？
5. 醫師   更新 verified_by / verified_date / review_due
6. 工程   補測試案例、提 PR
```

## 5.3 推進劑轉換時（不定期，需高頻追蹤）

```
1. 藥劑部  確認某支 pMDI 已改為 HFA-152a / HFO-1234ze
2. 藥劑部  在 copd_products.js 的該產品 formulations 填入新配方碳排
3. 藥劑部  把 local_supply_formulation 改指向新配方 id
4. 工程    node copd_test.js
5. 兩者    確認該產品的碳分帶是否由「含高 GWP 推進劑」變為「低碳裝置」
```

⚠ **這一步會改變產品排序，必須有紀錄。** 建議每次變更都留下變更前後的候選清單截圖。

## 5.4 到期提醒

| 檔案 | review_due | 理由 |
|---|---|---|
| `copd_rules.js` | 2026-12-31 | GOLD 每年 11 月改版 |
| `copd_products.js` | **2026-11-30** | 推進劑轉換進行中，需高頻複核 |

測試會在逾期時失敗（R4 檢查）。

---

# 第 6 章　治理原則（寫在程式裡，不只寫在文件裡）

| 原則 | 如何被強制 |
|---|---|
| 臨床適當性優先於碳 | 候選清單只在 GOLD 判定出的 class 內產生（不變式 S4） |
| 裝置適用性優先於碳 | 排序主鍵為 `fit.rank`，碳為次鍵（不變式 S5） |
| 裝置未確認不顯示碳 | `carbonAllowed = false`（不變式 S6） |
| 配方未確認不顯示碳排數值 | `carbonOf()` 回傳 `known:false`（不變式 S7） |
| 資料不足時說「不知道」 | `UNASSESSED` + `dataGaps`（不變式 S3） |
| 規則包不得夾帶邏輯 | R1 檢查（正則掃描 function/if/for） |
| 未簽核不得用於臨床 | 畫面持續顯示紅字，直到 `verified_date` 填入 |

**不自動處方、不自動換藥、不擋單。**
任何低碳產品若病人不適用，必須排除，不可因碳足跡優先推薦。

---

# 附錄：快速自我檢查

部署後開 `copd_fhir.html?direct=1&patient=copd-test-001`，確認四件事：

1. 畫面底部有紅字「規則包尚未經胸腔科醫師核對簽核」 → ✅ 正常
2. 清空 CAT 與 mMRC → 顯示「無法判定 GOLD 分組」且無產品清單 → ✅ 正常
3. 裝置適配三項全設為「未確認」→ 碳排序隱藏 → ✅ 正常
4. Breztri 與 Trimbow 顯示「配方未確認」而非數字 → ✅ 正常

**四項都對，代表安全機制全部生效。**
