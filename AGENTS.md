# 開發規範

本專案為 Joplin 外掛（TypeScript + webpack），串接任何 OpenAI 相容 LLM API（OpenAI、Gemini、DeepSeek、OpenCode Zen、Ollama、LM Studio 等）。所有參與開發的 agent 與開發者**必須**遵守以下規範。

## 專案概要

- 語言：TypeScript（NodeJS）
- 建置：webpack — `npm run dist`（含 TypeScript 編譯，通過即為驗證基準）
- 原始碼：`src/`；Joplin API 型別：`api/`（由 generator 產生，**不得手動修改**）
- 版號管理：`package.json` 與 `src/manifest.json` **同步**維護（semver：`X.Y.Z`）

## 開發流程（硬性規定）

任何開發任務完成後，主 agent **必須依序**執行以下步驟，缺一不可：

1. **開發**：實作需求。
2. **安全審查**：審查本次變更，重點包括：XSS / HTML 注入（webview/dialog 內容必須 escape）、secrets 外洩（API key 不得寫入 log 或 commit）、注入、路徑遍歷、依賴風險。
   - 判定 FAIL（存在 critical/high 問題）→ 修復問題後**重新審查**，直到 PASS。
3. **驗證**：`npm run dist` 必須通過（含 TypeScript 編譯）；若有可獨立測試的純邏輯，補自動化測試並執行。
   - 判定 FAIL → 修復問題後**重新驗證**，直到 PASS。
4. **遞增版號**：安全審查與驗證皆 PASS 後，將 `package.json` 與 `src/manifest.json` 的 patch 號 **+1**（兩者必須一致）。
5. **git commit**：一併提交程式碼變更、測試檔（如有）、驗證記錄與版號變更。

也可使用現成指令：`/security`、`/test`、`/ship`（完整流程）。

**禁止事項**：

- 不得在安全審查或驗證未通過的情況下宣告任務完成。
- 不得為了讓審查或驗證通過而繞過流程（如自行修改判定結果、刪除測試）。

## 版號規範

- 格式：semver `X.Y.Z`，同步修改 `package.json` 與 `src/manifest.json`，無其他版號來源。
- **遞增粒度：每個開發任務（一輪完整流程通過）遞增一次 patch 號**，不因單次檔案編輯遞增。每次修改的細節由 git 歷史追蹤。
- major/minor 由開發者手動調整；agent 僅自動遞增 patch 號。
- 版號遞增必須與對應變更在同一個 commit 中提交。

## 驗證記錄規範

- 每版一份：`tests/records/v<版號>.md`。
- 內容必須包含：需求描述、變更摘要、驗證項目清單（建置 / 安全檢查 / 功能檢核）與結果、日期、版號。
- **不得覆蓋或刪除歷史記錄**；同版號重測時於原檔追加「重測記錄」章節。

## Git 規範

- 版號遞增時必須 commit，訊息格式：

  ```
  <本次變更摘要>

  Bump version to v<X.Y.Z>
  ```

- 不得 commit secrets（`.env`、金鑰等）。
- 不得自動 push，push 由開發者決定。
