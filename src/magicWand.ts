import joplin from 'api';
import { ToastType, ViewHandle } from 'api/types';
import { callLLM, ChatMessage } from './llm';

const ORGANIZE_SYSTEM_PROMPT = [
	'你是專業的筆記整理助手。',
	'請將使用者提供的內容重新組織成結構清楚的 Markdown：',
	'- 使用適當的標題層級、條列與段落',
	'- 去除冗詞、重複與口語贅字',
	'- 完整保留所有事實、數字、名詞與連結，不得新增原文沒有的資訊',
	'- 若內容過短或無法整理，直接潤飾輸出',
	'僅輸出整理後的 Markdown 內容，不要任何說明、前言或前後綴。',
].join('\n');

const OPTIMIZE_SYSTEM_PROMPT = [
	'你是內容優化助手。',
	'請依使用者給予的指令優化提供的內容；若未給予指令，預設進行潤飾：修正錯字、改善語句流暢度與可讀性，保持原意。',
	'以 Markdown 格式輸出優化後的完整內容，僅輸出內容本身，不要任何說明、前言或前後綴。',
].join('\n');

export type WandMode = 'organize' | 'optimize';

export interface MagicWandConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	temperature: number;
	topP: number;
}

export interface MagicWandDeps {
	resolveConfig: () => Promise<MagicWandConfig>;
	getSelectedText: () => Promise<string | null>;
}

export async function createMagicWandDialog(): Promise<ViewHandle> {
	return joplin.views.dialogs.create('noteAiMagicWandDialog');
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
	.note-ai-wand .mode { display: block; margin: 6px 0; }
	.note-ai-wand .field-label { display: block; margin: 14px 0 4px; font-weight: bold; }
	.note-ai-wand textarea { width: 100%; box-sizing: border-box; min-height: 150px; }
	.note-ai-wand textarea.source-box { min-height: 90px; max-height: 22vh; }
	.note-ai-wand textarea.result-box { min-height: 240px; }
	.note-ai-wand input[type="text"] { width: 100%; box-sizing: border-box; margin-top: 8px; }
</style>`;

function buildInputHtml(scopeLabel: string): string {
	return `${DIALOG_STYLE}
<div class="note-ai-wand">
	<h3>Note AI</h3>
	<p class="scope">處理範圍：<b>${escapeHtml(scopeLabel)}</b>（選取文字時優先處理選取段落）</p>
	<label class="mode"><input type="radio" name="mode" value="organize" checked> 整理筆記內容</label>
	<label class="mode"><input type="radio" name="mode" value="optimize"> 優化我輸入的內容</label>
	<textarea name="userInput" placeholder="選擇「優化我輸入的內容」時，在此輸入或貼上要優化的文字…"></textarea>
	<input type="text" name="instruction" placeholder="AI 指令（選填），例如：條列化、翻成英文、更口語…">
</div>`;
}

function buildPreviewHtml(mode: WandMode, scopeLabel: string, source: string, result: string): string {
	return `${DIALOG_STYLE}
<div class="note-ai-wand">
	<h3>Note AI</h3>
	<p class="scope">${mode === 'organize' ? '整理' : '優化'}結果 — 處理範圍：<b>${escapeHtml(scopeLabel)}</b>。確認內容後按「寫入」存入筆記，或按「取消」放棄。</p>
	<label class="field-label">輸入內容</label>
	<textarea readonly class="source-box">${escapeHtml(source)}</textarea>
	<label class="field-label">生成結果（可直接編輯）</label>
	<textarea name="result" class="result-box">${escapeHtml(result)}</textarea>
</div>`;
}

let busy = false;

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
			alert('請先選擇一則筆記');
			return;
		}

		const selection = await deps.getSelectedText();
		const scopeLabel = selection ? `選取段落（${selection.length} 字）` : '筆記全文';

		// Phase 1: 選擇模式與輸入內容，按「生成」送出
		await dialogs.setFitToContent(handle, false);
		await dialogs.setHtml(handle, buildInputHtml(scopeLabel));
		await dialogs.setButtons(handle, [
			{ id: 'cancel', title: '取消' },
			{ id: 'ok', title: '生成' },
		]);
		const input = await dialogs.open(handle);
		if (input.id !== 'ok' || !input.formData) return;

		const mode: WandMode = input.formData.mode === 'optimize' ? 'optimize' : 'organize';
		const instruction = String(input.formData.instruction || '').trim();
		const userInput = String(input.formData.userInput || '').trim();

		const source = mode === 'organize' ? (selection || note.body) : userInput;
		if (!source.trim()) {
			alert(mode === 'organize' ? '筆記內容為空，無法整理' : '請輸入要優化的內容');
			return;
		}

		const config = await deps.resolveConfig();

		await dialogs.showToast({ message: 'Note AI: AI 處理中，請稍候…', type: ToastType.Info });
		const messages: ChatMessage[] = [
			{ role: 'system', content: mode === 'organize' ? ORGANIZE_SYSTEM_PROMPT : OPTIMIZE_SYSTEM_PROMPT },
			{
				role: 'user',
				content: instruction ? `指令：${instruction}\n\n---\n\n${source}` : source,
			},
		];

		const reply = (await callLLM({
			baseUrl: config.baseUrl,
			apiKey: config.apiKey,
			model: config.model,
			temperature: config.temperature,
			topP: config.topP,
			messages,
		})).trim();
		if (!reply) {
			alert('AI 未回傳內容，請稍後再試');
			return;
		}

		// Phase 2: 生成結果輸出至另一個 Text，按「寫入」存入筆記或「取消」放棄
		await dialogs.setHtml(handle, buildPreviewHtml(mode, scopeLabel, source, reply));
		await dialogs.setButtons(handle, [
			{ id: 'cancel', title: '取消' },
			{ id: 'ok', title: '寫入' },
		]);
		const decision = await dialogs.open(handle);
		if (decision.id !== 'ok' || !decision.formData) return;

		const finalResult = String(decision.formData.result || '').trim() || reply;
		const modeLabel = mode === 'organize' ? '整理' : '優化';
		const fresh = await joplin.data.get(['notes', note.id], { fields: ['body'] });
		const body = `${fresh.body}\n\n---\n**AI ${modeLabel}結果：**\n\n${finalResult}`;
		await joplin.data.put(['notes', note.id], null, { body });
		await dialogs.showToast({ message: `Note AI: 已寫入筆記末尾（${modeLabel}）`, type: ToastType.Success });
	} catch (error) {
		console.error('Note AI: error', error);
		alert(`Note AI 錯誤:\n${error instanceof Error ? error.message : String(error)}`);
	} finally {
		busy = false;
	}
}
