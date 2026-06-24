import joplin from 'api';
import { SettingItemType, ToolbarButtonLocation } from 'api/types';
import { callLLM } from './llm';

const SETTING_SECTION = 'noteAi';
const SETTING_BASE_URL = 'aiBaseUrl';
const SETTING_API_KEY = 'aiApiKey';
const SETTING_MODEL = 'aiModel';
const SETTING_SYSTEM_PROMPT = 'aiSystemPrompt';
const SETTING_TEMPERATURE = 'aiTemperature';
const SETTING_TOP_P = 'aiTopP';
const COMMAND_CHAT = 'noteAiChat';
const COMMAND_AI_PROCESS_NOTE = 'noteAiProcessNote';

async function readSettings() {
	const settings = await joplin.settings.values([
		SETTING_BASE_URL,
		SETTING_API_KEY,
		SETTING_MODEL,
		SETTING_SYSTEM_PROMPT,
		SETTING_TEMPERATURE,
		SETTING_TOP_P,
	]);
	return {
		baseUrl: settings[SETTING_BASE_URL] as string,
		apiKey: settings[SETTING_API_KEY] as string,
		model: settings[SETTING_MODEL] as string,
		systemPrompt: settings[SETTING_SYSTEM_PROMPT] as string,
		temperature: parseFloat(settings[SETTING_TEMPERATURE] as string),
		topP: parseFloat(settings[SETTING_TOP_P] as string),
	};
}

async function getSelectedText(): Promise<string | null> {
	try {
		const text = await joplin.commands.execute('selectedText') as string;
		return text?.trim() || null;
	} catch {
		return null;
	}
}

async function processNote() {
	console.info('Note AI: processNote called');
	try {
		const note = await joplin.workspace.selectedNote();
		console.info('Note AI: selectedNote =', note ? `${note.id} / ${note.title}` : 'null');
		if (!note) {
			alert('請先選擇一則筆記');
			return;
		}

		const { baseUrl, apiKey, model, systemPrompt, temperature, topP } = await readSettings();
		console.info('Note AI: settings loaded', { baseUrl, model, temperature, topP, apiKey: apiKey ? '***' : '(empty)' });
		if (!apiKey) {
			alert('請先在設定 → Note AI 中填入 API Key');
			return;
		}

		const selectedText = await getSelectedText();
		const userContent = selectedText || note.body;
		const label = selectedText ? '選取段落' : '全文';
		console.info(`Note AI: sending ${label} to LLM, length =`, userContent.length);

		const reply = await callLLM({
			baseUrl,
			apiKey,
			model,
			temperature,
			topP,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userContent },
			],
		});
		console.info('Note AI: LLM reply length =', reply.length);

		if (selectedText) {
			const newBody = `${note.body}\n\n---\n**AI 回應 (${label}):**\n> ${selectedText}\n\n${reply}`;
			console.info('Note AI: saving note with selection-based reply');
			await joplin.data.put(['notes', note.id], null, { body: newBody });
		} else {
			const newBody = `${note.body}\n\n---\n**AI 回應:**\n\n${reply}`;
			console.info('Note AI: saving note with full-note reply');
			await joplin.data.put(['notes', note.id], null, { body: newBody });
		}
		console.info('Note AI: done');
	} catch (error) {
		console.error('Note AI: error', error);
		alert(`Note AI 錯誤:\n${error instanceof Error ? error.message : String(error)}`);
	}
}

joplin.plugins.register({
	onStart: async function() {
		await joplin.settings.registerSection(SETTING_SECTION, {
			label: 'Note AI',
			description: 'AI 設定 — 自訂 LLM API 端點與金鑰',
		});

		await joplin.settings.registerSettings({
			[SETTING_BASE_URL]: {
				value: 'https://api.openai.com/v1',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'API Base URL',
				description: 'OpenAI-compatible API 端點網址，例如 https://api.openai.com/v1',
			},
			[SETTING_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				secure: true,
				label: 'API Key',
				description: '你的 API 金鑰（將安全儲存在系統鑰匙圈）',
			},
			[SETTING_MODEL]: {
				value: 'gpt-4o-mini',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'Model',
				description: '模型名稱，例如 gpt-4o-mini、claude-3-haiku、gemma-2-2b-it',
			},
			[SETTING_SYSTEM_PROMPT]: {
				value: '你是一個有用的助手。請用繁體中文回答。',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'System Prompt',
				description: '系統提示詞，設定 AI 的行為與角色',
			},
			[SETTING_TEMPERATURE]: {
				value: 0.7,
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'Temperature',
				description: '取樣溫度 (0.0 ~ 1.0)，越高越有創意',
			},
			[SETTING_TOP_P]: {
				value: 1.0,
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'Top-P',
				description: '核取樣機率閾值 (0.0 ~ 1.0)',
			},
		});

		await joplin.commands.register({
			name: COMMAND_CHAT,
			label: 'Note AI: 與 LLM 對話',
			iconName: 'fas fa-robot',
			execute: async () => {
				const { baseUrl, apiKey, model, systemPrompt, temperature, topP } = await readSettings();
				if (!apiKey) {
					alert('請先在設定 → Note AI 中填入 API Key');
					return;
				}

				const reply = await callLLM({
					baseUrl,
					apiKey,
					model,
					temperature,
					topP,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: 'Hello! 請簡單介紹你自己。' },
					],
				});

				alert(`LLM 回應:\n\n${reply}`);
			},
		});

		await joplin.commands.register({
			name: COMMAND_AI_PROCESS_NOTE,
			label: 'Note AI: 用 AI 處理當前筆記',
			iconName: 'fas fa-magic',
			execute: processNote,
		});

		await joplin.views.toolbarButtons.create(
			'noteAiProcessNote',
			COMMAND_AI_PROCESS_NOTE,
			ToolbarButtonLocation.EditorToolbar,
		);

		console.info('Note AI plugin started — toolbar button "noteAiProcessNote" created in EditorToolbar');
	},
});
