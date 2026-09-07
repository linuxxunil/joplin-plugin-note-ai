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

interface WandMessage {
	event: string;
	userInput?: string;
	instruction?: string;
	result?: string;
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
	.note-ai-wand .action-bar { margin-top: 14px; }
	.note-ai-wand .action-bar button { margin-right: 8px; padding: 4px 12px; cursor: pointer; }
	.note-ai-wand .input-warning { color: #c85050; margin: 8px 0 0; }
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

function buildInputHtml(scopeLabel: string, prefill: string, instruction: string, currentValue: string): string {
	const textareaValue = currentValue || prefill;
	return `${DIALOG_STYLE}
<div class="note-ai-wand">
	<h3>Note AI</h3>
	<p class="scope">輸入框已預填：<b>${escapeHtml(scopeLabel)}</b>（可編輯、清空或自行輸入，點「生成」送出）</p>
	<label class="field-label" for="noteAiInstruction">AI 指令（選填）</label>
	<input type="text" id="noteAiInstruction" placeholder="例如：條列化、翻成英文、更口語…" value="${escapeHtml(instruction)}">
	<div class="toolbar">
		<button type="button" id="noteAiReloadSource">🔄 重新載入筆記內容</button>
		<button type="button" id="noteAiClearInput">✕ 清空</button>
		<button type="button" id="noteAiTogglePreview1">👁 預覽 Markdown</button>
	</div>
	<textarea id="noteAiInput" placeholder="在此輸入、貼上內容，或點「重新載入筆記內容」…">${escapeHtml(textareaValue)}</textarea>
	<div id="noteAiPreview1" class="md-preview md-compact"></div>
	<p id="noteAiInputWarning" class="input-warning" style="display:none"></p>
	<pre id="noteAiSource" style="display:none">${escapeHtml(prefill)}</pre>
	<div class="action-bar">
		<button type="button" id="noteAiGenerate">✨ 生成</button>
	</div>
</div>`;
}

function buildProcessingHtml(model: string): string {
	return `${DIALOG_STYLE}
<div class="note-ai-wand">
	<div class="processing">
		<div class="spinner"></div>
		<p><b>AI 獲取中，請稍候…</b></p>
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
	<div class="action-bar">
		<button type="button" id="noteAiRegenerate">🔄 重新生成</button>
		<button type="button" id="noteAiBack">✏️ 返回編輯</button>
	</div>
</div>`;
}

function buildResultHtml(scopeLabel: string, userInput: string, result: string): string {
	return `${DIALOG_STYLE}
<div class="note-ai-wand">
	<h3>Note AI</h3>
	<p class="scope">處理範圍：<b>${escapeHtml(scopeLabel)}</b> — 寫入時以「生成結果」內容為準；「重新生成」會以原輸入重跑 AI。</p>
	<label class="field-label">輸入內容（唯讀）</label>
	<textarea readonly class="source-box">${escapeHtml(userInput)}</textarea>
	<label class="field-label">生成結果（可直接編輯）</label>
	<div class="toolbar">
		<button type="button" id="noteAiTogglePreview2">👁 預覽 Markdown</button>
	</div>
	<textarea id="noteAiResult" class="result-box">${escapeHtml(result)}</textarea>
	<div id="noteAiPreview2" class="md-preview"></div>
	<div class="action-bar">
		<button type="button" id="noteAiRegenerate">🔄 重新生成</button>
		<button type="button" id="noteAiAppend">➕ 加入末尾</button>
		<button type="button" id="noteAiReplace">📄 覆蓋全文</button>
	</div>
</div>`;
}

interface WandState {
	noteId: string;
	scopeLabel: string;
	source: string;
	userInput: string;
	instruction: string;
	reply: string;
}

const state: WandState = {
	noteId: '',
	scopeLabel: '',
	source: '',
	userInput: '',
	instruction: '',
	reply: '',
};

let busy = false;
let sessionSeq = 0;
let handlingSeq = -1;

export async function createMagicWandDialog(): Promise<ViewHandle> {
	const handle = await joplin.views.dialogs.create('noteAiMagicWandDialog');
	await joplin.views.dialogs.addScript(handle, './lib/marked.min.js');
	await joplin.views.dialogs.addScript(handle, './lib/purify.min.js');
	await joplin.views.dialogs.addScript(handle, './dialog.js');
	await joplin.views.dialogs.addScript(handle, './wand.js');
	return handle;
}

async function setHtmlIfCurrent(handle: ViewHandle, seq: number, html: string): Promise<void> {
	if (seq !== sessionSeq) return;
	await joplin.views.dialogs.setHtml(handle, html);
}

async function showWandError(handle: ViewHandle, seq: number, message: string): Promise<void> {
	await setHtmlIfCurrent(handle, seq, buildErrorHtml(message));
}

async function showInputPage(handle: ViewHandle, seq: number): Promise<void> {
	await setHtmlIfCurrent(handle, seq, buildInputHtml(state.scopeLabel, state.source, state.instruction, state.userInput));
}

async function runGeneration(handle: ViewHandle, deps: MagicWandDeps, seq: number): Promise<void> {
	const dialogs = joplin.views.dialogs;
	let config: MagicWandConfig;
	try {
		config = await deps.resolveConfig();
	} catch (configError) {
		console.error('Note AI: config error', configError);
		await showWandError(handle, seq, configError instanceof Error ? configError.message : String(configError));
		return;
	}
	if (seq !== sessionSeq) return;
	await setHtmlIfCurrent(handle, seq, buildProcessingHtml(config.model));

	const messages: ChatMessage[] = [
		{ role: 'system', content: UNIFIED_SYSTEM_PROMPT },
		{
			role: 'user',
			content: state.instruction ? `指令：${state.instruction}\n\n---\n\n${state.userInput}` : state.userInput,
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
		await showWandError(handle, seq, llmError instanceof Error ? llmError.message : String(llmError));
		return;
	}
	if (seq !== sessionSeq) return;
	if (!reply) {
		await showWandError(handle, seq, 'AI 未回傳內容，請稍後再試或調整輸入內容');
		return;
	}
	state.reply = reply;
	await setHtmlIfCurrent(handle, seq, buildResultHtml(state.scopeLabel, state.userInput, reply));
}

async function writeResult(handle: ViewHandle, mode: 'replace' | 'append', editedResult: string): Promise<void> {
	const dialogs = joplin.views.dialogs;
	const finalResult = editedResult.trim() || state.reply;
	try {
		if (mode === 'replace') {
			await joplin.data.put(['notes', state.noteId], null, { body: finalResult });
			await dialogs.showToast({ message: 'Note AI: 已取代筆記全文', type: ToastType.Success });
		} else {
			const fresh = await joplin.data.get(['notes', state.noteId], { fields: ['body'] });
			const body = `${fresh.body}\n\n---\n**AI 生成內容：**\n\n${finalResult}`;
			await joplin.data.put(['notes', state.noteId], null, { body });
			await dialogs.showToast({ message: 'Note AI: 已加入筆記末尾', type: ToastType.Success });
		}
	} catch (error) {
		console.error('Note AI: write error', error);
		await dialogs.setHtml(handle, buildErrorHtml(error instanceof Error ? error.message : String(error)));
		return;
	}
	await joplin.views.panels.hide(handle);
}

async function handleMessage(handle: ViewHandle, deps: MagicWandDeps, message: WandMessage, seq: number): Promise<{ ok: boolean }> {
	switch (message.event) {
		case 'generate': {
			const userInput = String(message.userInput || '').trim();
			const instruction = String(message.instruction || '').trim();
			if (!userInput) return { ok: false };
			state.userInput = userInput;
			state.instruction = instruction;
			await runGeneration(handle, deps, seq);
			return { ok: true };
		}
		case 'regenerate': {
			if (!state.userInput) return { ok: false };
			await runGeneration(handle, deps, seq);
			return { ok: true };
		}
		case 'back': {
			await showInputPage(handle, seq);
			return { ok: true };
		}
		case 'replace':
		case 'append': {
			await writeResult(handle, message.event === 'replace' ? 'replace' : 'append', String(message.result || ''));
			return { ok: true };
		}
		default:
			return { ok: false };
	}
}

export function registerWandEvents(handle: ViewHandle, deps: MagicWandDeps): void {
	type WandMessageHandler = (message: WandMessage) => Promise<unknown>;
	type WandPanelsApi = { onMessage: (h: ViewHandle, cb: WandMessageHandler) => void };
	const panels = joplin.views.panels as unknown as WandPanelsApi;
	panels.onMessage(handle, async (message: WandMessage) => {
		const seq = sessionSeq;
		if (handlingSeq === seq) return { ok: false };
		handlingSeq = seq;
		try {
			return await handleMessage(handle, deps, message, seq);
		} catch (error) {
			console.error('Note AI: wand message error', error);
			await showWandError(handle, seq, error instanceof Error ? error.message : String(error));
			return { ok: false };
		} finally {
			if (handlingSeq === seq) handlingSeq = -1;
		}
	});
}

export async function runMagicWand(handle: ViewHandle, deps: MagicWandDeps): Promise<void> {
	if (busy) {
		await joplin.views.dialogs.showToast({ message: 'Note AI: 上一個任務仍在處理中，請稍候', type: ToastType.Info });
		return;
	}
	busy = true;
	sessionSeq++;
	try {
		const note = await joplin.workspace.selectedNote();
		if (!note) {
			await showNoticeBox('請先選擇一則筆記');
			return;
		}

		const selection = await deps.getSelectedText();
		state.noteId = note.id;
		state.scopeLabel = selection ? `選取段落（${selection.length} 字）` : '筆記全文';
		state.source = selection || note.body;
		state.userInput = '';
		state.instruction = '';
		state.reply = '';

		const dialogs = joplin.views.dialogs;
		await dialogs.setFitToContent(handle, false);
		await dialogs.setHtml(handle, buildInputHtml(state.scopeLabel, state.source, '', ''));
		await dialogs.setButtons(handle, [{ id: 'cancel', title: '關閉' }]);
		await dialogs.open(handle);
	} catch (error) {
		console.error('Note AI: error', error);
		await showErrorBox(error instanceof Error ? error.message : String(error));
	} finally {
		busy = false;
	}
}
