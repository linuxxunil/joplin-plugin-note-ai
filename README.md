# Note AI

用 AI 處理筆記內容 — 支援任何 OpenAI-compatible API（DeepSeek、OpenAI、Ollama、LM Studio 等）。

## 功能

### ✨ 整理筆記 / 優化內容（魔法棒）

點擊編輯器工具列的魔棒圖示，開啟單頁對話框：

- 輸入框自動預填**選取段落**（無選取則預填筆記全文），可編輯、清空或自行輸入
- **AI 指令（選填）**：例如「條列化」「翻成英文」「更口語」，與輸入內容一併送出（在指令欄按 Enter 即送出）
- 工具列：🔄 重新載入筆記內容、✕ 清空、👁 預覽 Markdown
- 點「生成」後視窗**保持開啟**，原地顯示「AI 獲取中」
- 生成結果可直接編輯（含 Markdown 預覽），並可：
  - 🔄 **重新生成** — 以「當前輸入內容 + 當前指令」重跑 AI
  - ➕ **加入末尾** — 將結果附加到筆記末尾
  - 📄 **覆蓋全文** — 以結果取代筆記全文
- 發生錯誤時顯示頁內錯誤訊息，可「重新生成」或繼續編輯

### 用 AI 處理當前筆記

從指令面板執行 `Note AI: 用 AI 處理當前筆記（直接附加回應）`：將筆記內容（或編輯器中選取的段落）送給 LLM，回覆附加到筆記末尾。

### 與 LLM 對話

從指令面板執行 `Note AI: 與 LLM 對話`，快速測試對話能力。

### 🧪 測試 LLM 連線

Tools 選單 → `Note AI: 測試 LLM 連線`：以目前設定送出測試請求，顯示 Provider、端點、模型、API Key 遮罩、延遲與 AI 完整回覆（不會寫入筆記）。修改設定後重開視窗即可測試新設定。

## Provider 支援

設定 → Note AI → 「LLM Provider」下拉選單切換；**各供應商分別記憶** API Key 與 API Base URL，切換時自動載入：

| Provider | 預設端點 | 備註 |
|---|---|---|
| 自訂（OpenAI 相容） | `https://api.openai.com/v1` | 任何 OpenAI 相容服務 |
| OpenAI | `https://api.openai.com/v1` | |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | |
| Claude (Anthropic) | `https://api.anthropic.com/v1` | Anthropic 格式 |
| DeepSeek | `https://api.deepseek.com` | |
| OpenCode | `https://opencode.ai/zen/go/v1` | 支援 OpenCode Go，自動附 `x-opencode-session` |
| xAI Grok | `https://api.x.ai/v1` | |
| Kimi (Moonshot) | `https://api.moonshot.ai/v1` | |
| Qwen (DashScope) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | |
| Ollama（本機） | `http://localhost:11434/v1` | Key 可留空；模型名稱必填 |

- API Key 安全儲存於系統鑰匙圈
- 「Model（覆寫，選填）」優先於供應商內建預設模型；本機服務（Ollama、LM Studio）需填入已安裝的模型名稱
- LM Studio 等本機服務：Provider 選「自訂」，Base URL 填 `http://localhost:1234/v1`

## 安裝

**方式一（Joplin 內搜尋）**

1. Joplin → 設定 → 外掛程式 → 搜尋「Note AI」→ 安裝

**方式二（手動安裝 .jpl）**

1. 下載 `publish/vip.bestsvip.note-ai.jpl`
2. Joplin → 設定 → 外掛程式 → 安裝外掛程式檔案 → 選取 `.jpl`
3. 到 設定 → Note AI 選擇 Provider 並填入 API Key

## 開發

```bash
npm install
npm run dist        # 建置，產出 publish/vip.bestsvip.note-ai.jpl
npm run publish     # 發佈到 npm（自動重新建置；Joplin 官方外掛倉庫會自動收錄）
```

詳細建置說明請見 [GENERATOR_DOC.md](./GENERATOR_DOC.md)。

發佈步驟詳見 [publish.md](./publish.md)。

## License

MIT
