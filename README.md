# Note AI

一個 Joplin 插件，讓你可以直接從筆記工具列呼叫 LLM（支援任何 OpenAI-compatible API）。

## 功能

- **用 AI 處理當前筆記**：點擊編輯器工具列的魔棒圖示，將筆記內容發送給 LLM，並將回覆附加到筆記末尾
- **自訂設定**：在 Joplin 設定 → Note AI 中可設定：
  - API Base URL（例如 `https://api.deepseek.com` 或 `https://api.openai.com/v1`）
  - API Key（安全儲存在系統鑰匙圈）
  - Model 名稱
  - System Prompt
  - Temperature / Top-P
- **指令面板**：也支援從指令面板觸發（`Note AI: 與 LLM 對話`、`Note AI: 用 AI 處理當前筆記`）

## 支援的 API

只要是 OpenAI-compatible 格式皆可使用：

| 服務 | Base URL |
|---|---|
| DeepSeek | `https://api.deepseek.com` |
| OpenAI | `https://api.openai.com/v1` |
| Ollama（本機） | `http://localhost:11434/v1` |
| LM Studio（本機） | `http://localhost:1234/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |

## 安裝

1. 下載 `publish/vip.bestsvip.note-ai.jpl`
2. 在 Joplin 中開啟 **設定 → 外掛程式 → 安裝外掛程式檔案**
3. 選取 `.jpl` 檔案完成安裝
4. 到 **設定 → Note AI** 填入 API 資訊

## 開發

```bash
npm install
npm run dist
```

建置產出在 `publish/vip.bestsvip.note-ai.jpl`。

詳細建置說明請見 [GENERATOR_DOC.md](./GENERATOR_DOC.md)。
