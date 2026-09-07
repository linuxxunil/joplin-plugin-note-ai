import joplin from 'api';
import { ToastType, ViewHandle } from 'api/types';

export interface SettingsDialogData {
	options: Array<{ id: number; label: string; defaultUrl: string }>;
	slots: Record<string, { key: string; url: string }>;
	current: {
		provider: number;
		model: string;
		baseUrl: string;
	};
}

export interface SettingsDialogDeps {
	buildData: () => Promise<SettingsDialogData>;
	save: (selection: { provider: number; apiKey: string; baseUrl: string; model: string }) => Promise<void>;
}

export async function createSettingsDialog(): Promise<ViewHandle> {
	return joplin.views.dialogs.create('noteAiSettingsDialog');
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
	.note-ai-wand .field-label { display: block; margin: 14px 0 4px; font-weight: bold; }
	.note-ai-wand select { width: 100%; box-sizing: border-box; padding: 4px; }
	.note-ai-wand input[type="text"] { width: 100%; box-sizing: border-box; margin-top: 4px; }
</style>`;

function buildHtml(data: SettingsDialogData): string {
	const options = data.options
		.map(option => `<option value="${option.id}"${option.id === data.current.provider ? ' selected' : ''}>${escapeHtml(option.label)}</option>`)
		.join('\n');
	const currentSlot = data.slots[String(data.current.provider)] || { key: '', url: '' };
	const currentOption = data.options.find(option => option.id === data.current.provider);
	const initialUrl = currentSlot.url || (currentOption ? currentOption.defaultUrl : data.current.baseUrl);
	const configJson = escapeHtml(JSON.stringify({
		slots: data.slots,
		defaults: data.options.reduce((acc, option) => {
			acc[String(option.id)] = option.defaultUrl;
			return acc;
		}, {} as Record<string, string>),
	}));

	return `${DIALOG_STYLE}
<div class="note-ai-wand">
	<h3>Note AI 連線設定</h3>
	<p class="scope">切換 Provider 時自動帶出該供應商的金鑰與端點；修改後按「儲存」寫入，按「取消」放棄變更。</p>
	<label class="field-label">LLM Provider</label>
	<select name="provider" id="noteAiSettingsProvider">
${options}
	</select>
	<label class="field-label">API Key</label>
	<input type="text" name="apiKey" id="noteAiSettingsKey" value="${escapeHtml(currentSlot.key)}" placeholder="供應商 API 金鑰（Ollama 本機服務可留空）">
	<label class="field-label">API Base URL</label>
	<input type="text" name="baseUrl" id="noteAiSettingsUrl" value="${escapeHtml(initialUrl)}" placeholder="API 端點（自動填入，可自行修改）">
	<label class="field-label">Model（覆寫，選填）</label>
	<input type="text" name="model" id="noteAiSettingsModel" value="${escapeHtml(data.current.model)}" placeholder="留空使用內建預設；本機服務需填寫，例如 llama3.2">
	<pre id="noteAiConfigData" style="display:none">${configJson}</pre>
</div>`;
}

let busy = false;

export async function runSettingsDialog(handle: ViewHandle, deps: SettingsDialogDeps): Promise<void> {
	if (busy) {
		await joplin.views.dialogs.showToast({ message: 'Note AI: 設定視窗處理中，請稍候', type: ToastType.Info });
		return;
	}
	busy = true;
	try {
		const dialogs = joplin.views.dialogs;
		const data = await deps.buildData();
		await dialogs.setFitToContent(handle, false);
		await dialogs.setHtml(handle, buildHtml(data));
		await dialogs.setButtons(handle, [
			{ id: 'cancel', title: '取消' },
			{ id: 'ok', title: '儲存' },
		]);
		const result = await dialogs.open(handle);
		if (result.id !== 'ok' || !result.formData) return;

		const provider = Number(result.formData.provider) || 0;
		const apiKey = String(result.formData.apiKey || '');
		const baseUrl = String(result.formData.baseUrl || '').trim();
		const model = String(result.formData.model || '').trim();

		await deps.save({ provider, apiKey, baseUrl, model });
		await dialogs.showToast({ message: 'Note AI: 連線設定已儲存', type: ToastType.Success });
	} catch (error) {
		console.error('Note AI: settings dialog error', error);
		alert(`Note AI 錯誤:\n${error instanceof Error ? error.message : String(error)}`);
	} finally {
		busy = false;
	}
}
