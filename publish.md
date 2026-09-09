# 發佈說明（npm）

1. 更新版號：`package.json` 與 `src/manifest.json`（兩者需一致；npm 不允許覆蓋同版本）
2. 到 npmjs.com 建立發佈用 token：
   頭像 → Access Tokens → Generate New Token → 類型 **Automation**（免 2FA OTP）
3. 執行發佈：

   ```bash
   npm publish --//registry.npmjs.org/:_authToken=npm_你的token
   ```

   npm 會自動執行 prepare → 重新 `npm run dist` 打包 `publish/`（.jpl + .json）再上傳
4. 到 https://www.npmjs.com/package/joplin-plugin-note-ai 確認新版本
5. Joplin 官方外掛倉庫會自動收錄（掃描有延遲）：https://joplinapp.org/plugins/

> 注意：token 等同密碼，不要 commit 到 repo 或寫進專案 `.npmrc`；外洩請立即到 npm 網站 Revoke。

> ⚠️ **manifest `repository_url` 不可變更**：官方 bot 檢查新版本 `repository_url` 必須與首次收錄時一致，變更會導致更新被靜默拒絕（官方外掛倉庫停留在舊版）。詳見 `AGENTS.md` 的「發佈規範」章節。
