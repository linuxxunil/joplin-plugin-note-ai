import joplin from 'api';
import { SettingItemType, ToastType, ToolbarButtonLocation } from 'api/types';
import { callLLM } from './llm';
import { createMagicWandDialog, runMagicWand, MagicWandDeps } from './magicWand';

const SETTING_SECTION = 'noteAi';
const SETTING_PROVIDER = 'aiProvider';
const SETTING_BASE_URL = 'aiBaseUrl';
const SETTING_API_KEY = 'aiApiKey';
const SETTING_GEMINI_API_KEY = 'aiGeminiApiKey';
const SETTING_DEEPSEEK_API_KEY = 'aiDeepseekApiKey';
const SETTING_OPENCODE_API_KEY = 'aiOpencodeApiKey';
const SETTING_MODEL = 'aiModel';
const SETTING_SYSTEM_PROMPT = 'aiSystemPrompt';
const SETTING_TEMPERATURE = 'aiTemperature';
const SETTING_TOP_P = 'aiTopP';
const COMMAND_CHAT = 'noteAiChat';
const COMMAND_AI_PROCESS_NOTE = 'noteAiProcessNote';
const COMMAND_MAGIC_WAND = 'noteAiMagicWand';

const PROVIDER_CUSTOM = 0;
const PROVIDER_GEMINI = 1;
const PROVIDER_DEEPSEEK = 2;
const PROVIDER_OPENCODE = 3;

const PROVIDER_OPTIONS: Record<number, string> = {
	[PROVIDER_CUSTOM]: '自訂（OpenAI 相容）',
	[PROVIDER_GEMINI]: 'Google Gemini',
	[PROVIDER_DEEPSEEK]: 'DeepSeek',
	[PROVIDER_OPENCODE]: 'OpenCode Zen',
};

interface ProviderPreset {
	baseUrl: string;
	defaultModel: string;
	keySetting: string;
	keyLabel: string;
}

const PROVIDER_PRESETS: Record<number, ProviderPreset | null> = {
	[PROVIDER_CUSTOM]: null,
	[PROVIDER_GEMINI]: {
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
		defaultModel: 'gemini-2.5-flash',
		keySetting: SETTING_GEMINI_API_KEY,
		keyLabel: 'Gemini',
	},
	[PROVIDER_DEEPSEEK]: {
		baseUrl: 'https://api.deepseek.com',
		defaultModel: 'deepseek-v4-flash',
		keySetting: SETTING_DEEPSEEK_API_KEY,
		keyLabel: 'DeepSeek',
	},
	[PROVIDER_OPENCODE]: {
		baseUrl: 'https://opencode.ai/zen/v1',
		defaultModel: 'glm-5.2',
		keySetting: SETTING_OPENCODE_API_KEY,
		keyLabel: 'OpenCode Zen',
	},
};

interface LLMConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	systemPrompt: string;
	temperature: number;
	topP: number;
}

function parseNumber(value: unknown, fallback: number): number {
	const parsed = parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : fallback;
}

async function readSettings(): Promise<Record<string, unknown>> {
	return joplin.settings.values([
		SETTING_PROVIDER,
		SETTING_BASE_URL,
		SETTING_API_KEY,
		SETTING_GEMINI_API_KEY,
		SETTING_DEEPSEEK_API_KEY,
		SETTING_OPENCODE_API_KEY,
		SETTING_MODEL,
		SETTING_SYSTEM_PROMPT,
		SETTING_TEMPERATURE,
		SETTING_TOP_P,
	]);
}

async function resolveLLMConfig(): Promise<LLMConfig> {
	const s = await readSettings();
	const provider = Number(s[SETTING_PROVIDER]) || PROVIDER_CUSTOM;
	const preset = PROVIDER_PRESETS[provider];

	let baseUrl: string;
	let apiKey: string;
	let model: string;

	if (preset) {
		baseUrl = preset.baseUrl;
		model = preset.defaultModel;
		apiKey = String(s[preset.keySetting] || '').trim();
		if (!apiKey) {
			throw new Error(`請先在設定 → Note AI 中填入 ${preset.keyLabel} API Key（或將 Provider 切換為「自訂」）`);
		}
	} else {
		baseUrl = String(s[SETTING_BASE_URL] || '').trim() || 'https://api.openai.com/v1';
		apiKey = String(s[SETTING_API_KEY] || '').trim();
		model = String(s[SETTING_MODEL] || '').trim() || 'gpt-4o-mini';
		if (!apiKey) {
			throw new Error('請先在設定 → Note AI 中填入 API Key');
		}
	}

	return {
		baseUrl,
		apiKey,
		model,
		systemPrompt: String(s[SETTING_SYSTEM_PROMPT] || ''),
		temperature: parseNumber(s[SETTING_TEMPERATURE], 0.7),
		topP: parseNumber(s[SETTING_TOP_P], 1.0),
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

		const config = await resolveLLMConfig();
		console.info('Note AI: settings loaded', { baseUrl: config.baseUrl, model: config.model, temperature: config.temperature, topP: config.topP });

		const selectedText = await getSelectedText();
		const userContent = selectedText || note.body;
		const label = selectedText ? '選取段落' : '全文';
		console.info(`Note AI: sending ${label} to LLM, length =`, userContent.length);

		const reply = (await callLLM({
			baseUrl: config.baseUrl,
			apiKey: config.apiKey,
			model: config.model,
			temperature: config.temperature,
			topP: config.topP,
			messages: [
				{ role: 'system', content: config.systemPrompt },
				{ role: 'user', content: userContent },
			],
		})).trim();
		if (!reply) {
			alert('AI 未回傳內容，請稍後再試');
			return;
		}
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

		await joplin.views.dialogs.showToast({ message: 'Note AI: 回應已附加到筆記末尾', type: ToastType.Success });
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
			description: 'AI 設定 — 選擇 LLM 供應商，或自訂任何 OpenAI 相容端點',
		});

		await joplin.settings.registerSettings({
			[SETTING_PROVIDER]: {
				value: PROVIDER_CUSTOM,
				type: SettingItemType.Int,
				isEnum: true,
				options: PROVIDER_OPTIONS,
				section: SETTING_SECTION,
				public: true,
				label: 'LLM Provider',
				description: '選擇供應商即自動使用其 API 端點與預設模型；「自訂」才使用下方 Base URL / Model 欄位',
			},
			[SETTING_BASE_URL]: {
				value: 'https://api.openai.com/v1',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'API Base URL（自訂）',
				description: '僅在 Provider 為「自訂」時使用，例如 https://api.openai.com/v1',
			},
			[SETTING_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				secure: true,
				label: 'API Key（自訂 / OpenAI 相容）',
				description: '僅在 Provider 為「自訂」時使用；安全儲存於系統鑰匙圈',
			},
			[SETTING_GEMINI_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				secure: true,
				label: 'Gemini API Key',
				description: 'Provider 為「Google Gemini」時使用（取得：aistudio.google.com）；安全儲存於系統鑰匙圈',
			},
			[SETTING_DEEPSEEK_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				secure: true,
				label: 'DeepSeek API Key',
				description: 'Provider 為「DeepSeek」時使用（取得：platform.deepseek.com）；安全儲存於系統鑰匙圈',
			},
			[SETTING_OPENCODE_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				secure: true,
				label: 'OpenCode Zen API Key',
				description: 'Provider 為「OpenCode Zen」時使用（取得：opencode.ai/zen）；安全儲存於系統鑰匙圈',
			},
			[SETTING_MODEL]: {
				value: 'gpt-4o-mini',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'Model（自訂）',
				description: '僅在 Provider 為「自訂」時使用，例如 gpt-4o-mini、gemma-2-2b-it',
			},
			[SETTING_SYSTEM_PROMPT]: {
				value: '你是一個有用的助手。請用繁體中文回答。',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'System Prompt',
				description: '系統提示詞，設定 AI 的行為與角色（魔法棒使用內建專用提示詞）',
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
				try {
					const config = await resolveLLMConfig();
					const reply = await callLLM({
						baseUrl: config.baseUrl,
						apiKey: config.apiKey,
						model: config.model,
						temperature: config.temperature,
						topP: config.topP,
						messages: [
							{ role: 'system', content: config.systemPrompt },
							{ role: 'user', content: 'Hello! 請簡單介紹你自己。' },
						],
					});
					alert(`LLM 回應:\n\n${reply}`);
				} catch (error) {
					console.error('Note AI: chat error', error);
					alert(`Note AI 錯誤:\n${error instanceof Error ? error.message : String(error)}`);
				}
			},
		});

		await joplin.commands.register({
			name: COMMAND_AI_PROCESS_NOTE,
			label: 'Note AI: 用 AI 處理當前筆記（直接附加回應）',
			iconName: 'fas fa-bolt',
			execute: processNote,
		});

		const magicWandHandle = await createMagicWandDialog();
		const magicWandDeps: MagicWandDeps = {
			resolveConfig: resolveLLMConfig,
			getSelectedText,
		};

		await joplin.commands.register({
			name: COMMAND_MAGIC_WAND,
			label: 'Note AI: 整理筆記 / 優化內容',
			iconName: 'fas fa-magic',
			execute: async () => {
				await runMagicWand(magicWandHandle, magicWandDeps);
			},
		});

		await joplin.views.toolbarButtons.create(
			'noteAiMagicWand',
			COMMAND_MAGIC_WAND,
			ToolbarButtonLocation.EditorToolbar,
		);

		console.info('Note AI plugin started — toolbar button "noteAiMagicWand" (Note AI) created in EditorToolbar');
	},
});
