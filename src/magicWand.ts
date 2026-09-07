import joplin from 'api';
import { ToastType, ViewHandle } from 'api/types';
import { callLLM, ApiFormat, ChatMessage } from './llm';
import { showErrorBox, showNoticeBox } from './notify';

const UNIFIED_SYSTEM_PROMPT = [
	'你是專業的筆記整理與優化助手。',
	'請將使用者提供的內容整理成結構清楚的 Markdown：',
	'- 使用適當的標題層級、條列與段落',
	'- 去除冗詞、重複與口語贅字，修正錯字，提升可讀性',
	'- 完整保留原意與所有事實、數字、名詞與連結，不得新增原文沒有的資訊',
	'- 若使用者另有指令，依指令處理',
	'僅輸出處理後的 Markdown 內容，不要任何說明、前言或前後綴。',
].join('\n');

export interface MagicWandConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	apiFormat: ApiFormat;
	temperature: number;
	topP: number;
}

export interface MagicWandDeps {
	resolveConfig: () => Promise<MagicWandConfig>;
	getSelectedText: () => Promise<string | null>;
}

export async function createMagicWandDialog(): Promise<ViewHandle> {
	const handle = await joplin.views.dialogs.create('noteAiMagicWandDialog');
	await joplin.views.dialogs.addScript(handle, './lib/marked.min.js');
	await joplin.views.dialogs.addScript(handle, './lib/purify.min.js');
	await joplin.views.dialogs.addScript(handle, './dialog.js');
	return handle;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const DIALOG_STYLE = `
<style>
	.note-ai-wand { font-family: inherit; line-height: 1.5; }
	.note-ai-wand .scope { color: #888; }
	.note-ai-wand .toolbar { margin: 10px 0 4px; }
	.note-ai-wand .toolbar button { margin-right: 8px; padding: 4px 12px; cursor: pointer; }
	.note-ai-wand .field-label { display: block; margin: 14px 0 4px; font-weight: bold; }
	.note-ai-wand textarea { width: 100%; box-sizing: border-box; min-height: 220px; }
	.note-ai-wand textarea.source-box { min-height: 90px; max-height: 22vh; }
	.note-ai-wand textarea.result-box { min-height: 240px; }
	.note-ai-wand input[type="text"] { width: 100%; box-sizing: border-box; margin-top: 8px; }
	.note-ai-wand .processing { text-align: center; padding: 80px 0; }
	.note-ai-wand .spinner {
		width: 36px; height: 36px; margin: 0 auto 18px;
		border: 4px solid rgba(127,127,127,0.25);
		border-top-color: #888; border-radius: 50%;
		animation: note-ai-spin 1s linear infinite;
	}
	@keyframes note-ai-spin { to { transform: rotate(360deg); } }
	.note-ai-wand .processing .model { color: #888; margin-top: 8px; }
	.note-ai-wand .md-preview {
		display: none; box-sizing: border-box; min-height: 220px; max-height: 45vh;
		overflow: auto; background: rgba(127,127,127,0.08);
		border: 1px solid rgba(127,127,127,0.3); border-radius: 6px; padding: 12px;
	}
	.note-ai-wand .md-preview.md-compact { min-height: 90px; max-height: 22vh; }
	.note-ai-wand .md-preview pre { white-space: pre-wrap; word-break: break-word; }
	.note-ai-wand .md-preview code { background: rgba(127,127,127,0.15); border-radius: 3px; padding: 1px 4px; }
	.note-ai-wand .md-preview pre code { background: transparent; padding: 0; }
	.note-ai-wand .md-preview a { color: #4a86e8; }
	.note-ai-wand .md-preview table { border-collapse: collapse; margin: 8px 0; }
	.note-ai-wand .md-preview th, .note-ai-wand .md-preview td { border: 1px solid rgba(127,127,127,0.5); padding: 6px 10px; text-align: left; }
	.note-ai-wand .md-preview th { background: rgba(127,127,127,0.12); font-weight: bold; }
	.note-ai-wand .md-preview img { max-width: 100%; }
	.note-ai-wand .error-box {
		white-space: pre-wrap; word-break: break-word;
		background: rgba(200,80,80,0.10);
		border: 1px solid rgba(200,80,80,0.4);
		border-radius: 6px; padding: 12px; margin-top: 12px;
		max-height: 45vh; overflow: auto;
	}
</style>`;

function buildInputHtml(scopeLabel: string, source: string): string {
	return `${DIALOG_STYLE}
<div class="note-ai-wand">
	<h3>Note AI</h3>
	<p class="scope">輸入框已預填：<b>${escapeHtml(scopeLabel)}</b>（可直接編輯、清空或自行輸入內容，點「生成」送出）</p>
	<div class="toolbar">
		<button type="button" id="noteAiReloadSource">🔄 重新載入筆記內容</button>
		<button type="button" id="noteAiClearInput">✕ 清空</button>
		<button type="button" id="noteAiTogglePreview1">👁 預覽 Markdown</button>
	</div>
	<textarea name="userInput" id="noteAiInput" placeholder="在此輸入、貼上內容，或點「重新載入筆記內容」…">${escapeHtml(source)}</textarea>
	<div id="noteAiPreview1" class="md-preview md-compact"></div>
	<input type="text" name="instruction" placeholder="AI 指令（選填），例如：條列化、翻成英文、更口語…">
	<pre id="noteAiSource" style="display:none">${escapeHtml(source)}</pre>
</div>`;
}

function buildProcessingHtml(model: string): string {
	return `${DIALOG_STYLE}
<div class="note-ai-wand">
	<div class="processing">
		<div class="spinner"></div>
		<p><b>AI 處理中，請稍候…</b></p>
		<p class="model">模型：${escapeHtml(model)}</p>
	</div>
</div>`;
}

function buildErrorHtml(message: string): string {
	return `${DIALOG_STYLE}
<div class="note-ai-wand">
	<h3>Note AI</h3>
	<p><b>⚠️ 發生錯誤</b></p>
	<pre class="error-box">${escapeHtml(message)}</pre>
</div>`;
}

function buildPreviewHtml(scopeLabel: string, source: string, result: string): string {
	return `${DIALOG_STYLE}
<div class="note-ai-wand">
	<h3>Note AI</h3>
	<p class="scope">處理範圍：<b>${escapeHtml(scopeLabel)}</b> — 請確認生成結果，選擇「覆蓋全文」或「加入末尾」寫入筆記，或按「取消」放棄。</p>
	<label class="field-label">輸入內容</label>
	<textarea readonly class="source-box">${escapeHtml(source)}</textarea>
	<label class="field-label">生成結果（可直接編輯）</label>
	<div class="toolbar">
		<button type="button" id="noteAiTogglePreview2">👁 預覽 Markdown</button>
	</div>
	<textarea name="result" id="noteAiResult" class="result-box">${escapeHtml(result)}</textarea>
	<div id="noteAiPreview2" class="md-preview"></div>
</div>`;
}

let busy = false;

async function showProcessingError(handle: ViewHandle, message: string): Promise<void> {
	const dialogs = joplin.views.dialogs;
	await dialogs.setHtml(handle, buildErrorHtml(message));
	await dialogs.setButtons(handle, [{ id: 'ok', title: '關閉' }]);
	await dialogs.open(handle);
}

export async function runMagicWand(handle: ViewHandle, deps: MagicWandDeps): Promise<void> {
	if (busy) {
		await joplin.views.dialogs.showToast({ message: 'Note AI: 上一個任務仍在處理中，請稍候', type: ToastType.Info });
		return;
	}
	busy = true;
	try {
		const dialogs = joplin.views.dialogs;
		const note = await joplin.workspace.selectedNote();
		if (!note) {
			await showNoticeBox('請先選擇一則筆記');
			return;
		}

		const selection = await deps.getSelectedText();
		const scopeLabel = selection ? `選取段落（${selection.length} 字）` : '筆記全文';
		const source = selection || note.body;

		// Phase 1: 單一輸入框（已預填當前內容，可編輯/清空/自行輸入）
		await dialogs.setFitToContent(handle, false);
		await dialogs.setHtml(handle, buildInputHtml(scopeLabel, source));
		await dialogs.setButtons(handle, [
			{ id: 'cancel', title: '取消' },
			{ id: 'ok', title: '生成' },
		]);
		const input = await dialogs.open(handle);
		if (input.id !== 'ok') return;
		if (!input.formData) {
			await showNoticeBox('無法讀取輸入內容（表單資料缺失），請關閉後重新開啟再試一次');
			return;
		}

		const instruction = String(input.formData.instruction || '').trim();
		const userInput = String(input.formData.userInput || '').trim();
		if (!userInput) {
			await showNoticeBox('輸入內容為空，請輸入內容或點「重新載入筆記內容」');
			return;
		}

		let config: MagicWandConfig;
		try {
			config = await deps.resolveConfig();
		} catch (configError) {
			console.error('Note AI: config error', configError);
			await showProcessingError(handle, configError instanceof Error ? configError.message : String(configError));
			return;
		}

		// Phase 1.5: 處理中畫面 — 重新開啟視窗並保持開啟（LLM 執行期間不再關窗）
		await dialogs.setHtml(handle, buildProcessingHtml(config.model));
		await dialogs.setButtons(handle, [{ id: 'cancel', title: '取消' }]);
		void dialogs.open(handle);

		const messages: ChatMessage[] = [
			{ role: 'system', content: UNIFIED_SYSTEM_PROMPT },
			{
				role: 'user',
				content: instruction ? `指令：${instruction}\n\n---\n\n${userInput}` : userInput,
			},
		];

		let reply = '';
		try {
			reply = (await callLLM({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				model: config.model,
				apiFormat: config.apiFormat,
				temperature: config.temperature,
				topP: config.topP,
				messages,
			})).trim();
		} catch (llmError) {
			console.error('Note AI: LLM error', llmError);
			await showProcessingError(handle, llmError instanceof Error ? llmError.message : String(llmError));
			return;
		}
		if (!reply) {
			await showProcessingError(handle, 'AI 未回傳內容，請稍後再試或調整輸入內容');
			return;
		}

		// Phase 2: 原地換頁為結果預覽（視窗保持開啟）
		await dialogs.setHtml(handle, buildPreviewHtml(scopeLabel, userInput, reply));
		await dialogs.setButtons(handle, [
			{ id: 'cancel', title: '取消' },
			{ id: 'append', title: '加入末尾' },
			{ id: 'replace', title: '覆蓋全文' },
		]);
		const decision = await dialogs.open(handle);

		if (decision.id === 'replace') {
			const finalResult = decision.formData ? String(decision.formData.result || '').trim() || reply : reply;
			await joplin.data.put(['notes', note.id], null, { body: finalResult });
			await dialogs.showToast({ message: 'Note AI: 已取代筆記全文', type: ToastType.Success });
		} else if (decision.id === 'append') {
			const finalResult = decision.formData ? String(decision.formData.result || '').trim() || reply : reply;
			const fresh = await joplin.data.get(['notes', note.id], { fields: ['body'] });
			const body = `${fresh.body}\n\n---\n**AI 生成內容：**\n\n${finalResult}`;
			await joplin.data.put(['notes', note.id], null, { body });
			await dialogs.showToast({ message: 'Note AI: 已加入筆記末尾', type: ToastType.Success });
		}
	} catch (error) {
		console.error('Note AI: error', error);
		await showErrorBox(error instanceof Error ? error.message : String(error));
	} finally {
		busy = false;
	}
}
