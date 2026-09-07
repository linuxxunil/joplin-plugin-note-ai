import joplin from 'api';
import { ToastType, ViewHandle } from 'api/types';
import { callLLM, ApiFormat } from './llm';
import { showErrorBox } from './notify';

export interface TestTarget {
	label: string;
	baseUrl: string;
	apiKey: string;
	model: string;
	apiFormat: ApiFormat;
	error: string | null;
}

export interface ConnectionTestDeps {
	resolve: () => Promise<TestTarget>;
}

interface TestResult {
	ok: boolean;
	message: string;
}

const TEST_PROMPT = '你是誰';
const TEST_MAX_TOKENS = 512;
const REPLY_DISPLAY_LIMIT = 2000;

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function maskKey(key: string): string {
	if (!key) return '未設定';
	if (key.length <= 12) return `已設定（●●●●●●，共 ${key.length} 字元）`;
	return `已設定（${key.slice(0, 4)}…${key.slice(-4)}，共 ${key.length} 字元）`;
}

const DIALOG_STYLE = `
<style>
	.note-ai-test { font-family: inherit; line-height: 1.6; }
	.note-ai-test table.cfg { border-collapse: collapse; margin: 10px 0; }
	.note-ai-test table.cfg th, .note-ai-test table.cfg td {
		border: 1px solid rgba(127,127,127,0.4); padding: 6px 10px; text-align: left;
	}
	.note-ai-test table.cfg th { background: rgba(127,127,127,0.12); white-space: nowrap; }
	.note-ai-test table.cfg td { word-break: break-word; }
	.note-ai-test .banner { border-radius: 6px; padding: 10px 12px; margin: 10px 0; }
	.note-ai-test .banner.ok { background: rgba(80,160,80,0.12); border: 1px solid rgba(80,160,80,0.45); }
	.note-ai-test .banner.err { background: rgba(200,80,80,0.10); border: 1px solid rgba(200,80,80,0.45); }
	.note-ai-test .banner p { margin: 6px 0 0; white-space: pre-wrap; word-break: break-word; max-height: 30vh; overflow: auto; }
	.note-ai-test .hint { color: #888; margin-top: 12px; }
	.note-ai-test .processing { text-align: center; padding: 80px 0; }
	.note-ai-test .spinner {
		width: 36px; height: 36px; margin: 0 auto 18px;
		border: 4px solid rgba(127,127,127,0.25);
		border-top-color: #888; border-radius: 50%;
		animation: note-ai-test-spin 1s linear infinite;
	}
	@keyframes note-ai-test-spin { to { transform: rotate(360deg); } }
	.note-ai-test .processing .model { color: #888; margin-top: 8px; }
</style>`;

function bannerHtml(result: TestResult): string {
	if (result.ok) {
		return `<div class="banner ok"><b>✅ 連線成功</b><p>${escapeHtml(result.message)}</p></div>`;
	}
	return `<div class="banner err"><b>❌ 連線失敗</b><p>${escapeHtml(result.message)}</p></div>`;
}

function buildSummaryHtml(target: TestTarget, result: TestResult | null): string {
	return `${DIALOG_STYLE}
<div class="note-ai-test">
	<h3>Note AI — 連線測試</h3>
	<table class="cfg">
		<tr><th>Provider</th><td>${escapeHtml(target.label)}</td></tr>
		<tr><th>端點</th><td>${escapeHtml(target.baseUrl || '未設定')}</td></tr>
		<tr><th>模型</th><td>${escapeHtml(target.model || '未設定')}</td></tr>
		<tr><th>API Key</th><td>${escapeHtml(maskKey(target.apiKey))}</td></tr>
		<tr><th>請求格式</th><td>${escapeHtml(target.apiFormat)}</td></tr>
	</table>
	${result ? bannerHtml(result) : ''}
	<p class="hint">點「測試連線」以目前設定送出「你是誰」測試請求（不會寫入筆記），成功時顯示 AI 完整回覆。修改設定後重開此視窗即可測試新設定。</p>
</div>`;
}

function buildProcessingHtml(model: string): string {
	return `${DIALOG_STYLE}
<div class="note-ai-test">
	<div class="processing">
		<div class="spinner"></div>
		<p><b>連線測試中，請稍候…</b></p>
		<p class="model">模型：${escapeHtml(model)}</p>
	</div>
</div>`;
}

export async function createTestDialog(): Promise<ViewHandle> {
	return joplin.views.dialogs.create('noteAiTestConnectionDialog');
}

let busy = false;

export async function runConnectionTest(handle: ViewHandle, deps: ConnectionTestDeps): Promise<void> {
	if (busy) {
		await joplin.views.dialogs.showToast({ message: 'Note AI: 連線測試進行中，請稍候', type: ToastType.Info });
		return;
	}
	busy = true;
	try {
		const dialogs = joplin.views.dialogs;
		await dialogs.setFitToContent(handle, false);

		let result: TestResult | null = null;

		for (;;) {
			const target = await deps.resolve();
			await dialogs.setHtml(handle, buildSummaryHtml(target, result));
			await dialogs.setButtons(handle, [
				{ id: 'test', title: '🧪 測試連線' },
				{ id: 'cancel', title: '關閉' },
			]);
			const action = await dialogs.open(handle);
			if (!action || action.id !== 'test') return;

			// 連線測試中畫面 — 視窗保持開啟（與魔法棒相同模式）
			await dialogs.setHtml(handle, buildProcessingHtml(target.model));
			await dialogs.setButtons(handle, [{ id: 'cancel', title: '關閉' }]);
			void dialogs.open(handle);

			const startedAt = Date.now();
			if (target.error) {
				result = { ok: false, message: target.error };
			} else {
				try {
					const reply = await callLLM({
						baseUrl: target.baseUrl,
						apiKey: target.apiKey,
						model: target.model,
						apiFormat: target.apiFormat,
						messages: [{ role: 'user', content: TEST_PROMPT }],
						maxTokens: TEST_MAX_TOKENS,
					});
					const latency = Date.now() - startedAt;
					const snippet = reply.trim();
					let replyText = snippet;
					if (replyText.length > REPLY_DISPLAY_LIMIT) {
						replyText = `${replyText.slice(0, REPLY_DISPLAY_LIMIT)}…（已截斷）`;
					}
					result = {
						ok: true,
						message: snippet
							? `延遲 ${latency} ms\nAI 回覆：\n${replyText}`
							: `延遲 ${latency} ms（連線正常，回應為空）`,
					};
				} catch (llmError) {
					console.error('Note AI: connection test failed', llmError);
					const message = llmError instanceof Error ? llmError.message : String(llmError);
					result = {
						ok: false,
						message: `${message}\n\n請檢查：API Key、端點 URL、模型名稱與網路連線`,
					};
				}
			}
		}
	} catch (error) {
		console.error('Note AI: connection test error', error);
		await showErrorBox(error instanceof Error ? error.message : String(error));
	} finally {
		busy = false;
	}
}
