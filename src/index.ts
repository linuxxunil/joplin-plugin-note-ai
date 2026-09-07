import joplin from 'api';
import { SettingItemType, ToastType, ToolbarButtonLocation } from 'api/types';
import { callLLM, ApiFormat } from './llm';
import { createMagicWandDialog, runMagicWand, MagicWandDeps } from './magicWand';

const SETTING_SECTION = 'noteAi';
const SETTING_PROVIDER = 'aiProvider';
const SETTING_API_KEY_EDITOR = 'aiApiKeyEditor';
const SETTING_BASE_URL = 'aiBaseUrl';
const SETTING_API_KEY = 'aiApiKey';
const SETTING_GEMINI_API_KEY = 'aiGeminiApiKey';
const SETTING_DEEPSEEK_API_KEY = 'aiDeepseekApiKey';
const SETTING_OPENCODE_API_KEY = 'aiOpencodeApiKey';
const SETTING_OPENAI_API_KEY = 'aiOpenaiApiKey';
const SETTING_CLAUDE_API_KEY = 'aiClaudeApiKey';
const SETTING_GROK_API_KEY = 'aiGrokApiKey';
const SETTING_KIMI_API_KEY = 'aiKimiApiKey';
const SETTING_QWEN_API_KEY = 'aiQwenApiKey';
const SETTING_OLLAMA_API_KEY = 'aiOllamaApiKey';
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
const PROVIDER_OPENAI = 4;
const PROVIDER_CLAUDE = 5;
const PROVIDER_GROK = 6;
const PROVIDER_KIMI = 7;
const PROVIDER_QWEN = 8;
const PROVIDER_OLLAMA = 9;

const PROVIDER_OPTIONS: Record<number, string> = {
	[PROVIDER_CUSTOM]: '自訂（OpenAI 相容）',
	[PROVIDER_OPENAI]: 'OpenAI',
	[PROVIDER_GEMINI]: 'Google Gemini',
	[PROVIDER_CLAUDE]: 'Claude (Anthropic)',
	[PROVIDER_DEEPSEEK]: 'DeepSeek',
	[PROVIDER_OPENCODE]: 'OpenCode',
	[PROVIDER_GROK]: 'xAI Grok',
	[PROVIDER_KIMI]: 'Kimi (Moonshot)',
	[PROVIDER_QWEN]: 'Qwen (DashScope)',
	[PROVIDER_OLLAMA]: 'Ollama（本機）',
};

interface LLMConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	apiFormat: ApiFormat;
	systemPrompt: string;
	temperature: number;
	topP: number;
}

interface ProviderPreset {
	baseUrl: string;
	defaultModel: string;
	keySetting: string;
	keyLabel: string;
	apiFormat?: ApiFormat;
	keyOptional?: boolean;
}

const PROVIDER_PRESETS: Record<number, ProviderPreset | null> = {
	[PROVIDER_CUSTOM]: null,
	[PROVIDER_OPENAI]: {
		baseUrl: 'https://api.openai.com/v1',
		defaultModel: 'gpt-5.5',
		keySetting: SETTING_OPENAI_API_KEY,
		keyLabel: 'OpenAI',
	},
	[PROVIDER_GEMINI]: {
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
		defaultModel: 'gemini-3.8-flash',
		keySetting: SETTING_GEMINI_API_KEY,
		keyLabel: 'Google Gemini',
	},
	[PROVIDER_CLAUDE]: {
		baseUrl: 'https://api.anthropic.com/v1',
		defaultModel: 'claude-sonnet-5',
		keySetting: SETTING_CLAUDE_API_KEY,
		keyLabel: 'Claude',
		apiFormat: 'anthropic',
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
		keyLabel: 'OpenCode',
	},
	[PROVIDER_GROK]: {
		baseUrl: 'https://api.x.ai/v1',
		defaultModel: 'grok-4.6',
		keySetting: SETTING_GROK_API_KEY,
		keyLabel: 'xAI Grok',
	},
	[PROVIDER_KIMI]: {
		baseUrl: 'https://api.moonshot.ai/v1',
		defaultModel: 'kimi-k3',
		keySetting: SETTING_KIMI_API_KEY,
		keyLabel: 'Kimi',
	},
	[PROVIDER_QWEN]: {
		baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
		defaultModel: 'qwen3.7-max',
		keySetting: SETTING_QWEN_API_KEY,
		keyLabel: 'Qwen',
	},
	[PROVIDER_OLLAMA]: {
		baseUrl: 'http://localhost:11434/v1',
		defaultModel: '',
		keySetting: SETTING_OLLAMA_API_KEY,
		keyLabel: 'Ollama',
		keyOptional: true,
	},
};

function slotKeyForProvider(provider: number): string {
	const preset = PROVIDER_PRESETS[provider];
	return preset ? preset.keySetting : SETTING_API_KEY;
}

function parseNumber(value: unknown, fallback: number): number {
	const parsed = parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : fallback;
}

async function readSettings(): Promise<Record<string, unknown>> {
	return joplin.settings.values([
		SETTING_PROVIDER,
		SETTING_API_KEY_EDITOR,
		SETTING_BASE_URL,
		SETTING_API_KEY,
		SETTING_GEMINI_API_KEY,
		SETTING_DEEPSEEK_API_KEY,
		SETTING_OPENCODE_API_KEY,
		SETTING_OPENAI_API_KEY,
		SETTING_CLAUDE_API_KEY,
		SETTING_GROK_API_KEY,
		SETTING_KIMI_API_KEY,
		SETTING_QWEN_API_KEY,
		SETTING_OLLAMA_API_KEY,
		SETTING_MODEL,
		SETTING_SYSTEM_PROMPT,
		SETTING_TEMPERATURE,
		SETTING_TOP_P,
	]);
}

function providerFrom(s: Record<string, unknown>): number {
	return Number(s[SETTING_PROVIDER]) || PROVIDER_CUSTOM;
}

let syncingEditor = false;
let lastKnownProvider = PROVIDER_CUSTOM;

async function writeSetting(key: string, value: string): Promise<void> {
	syncingEditor = true;
	try {
		await joplin.settings.setValue(key, value);
	} finally {
		syncingEditor = false;
	}
}

async function loadApiKeyEditor(): Promise<void> {
	const s = await readSettings();
	const slotKey = slotKeyForProvider(providerFrom(s));
	await writeSetting(SETTING_API_KEY_EDITOR, String(s[slotKey] || ''));
}

async function resolveLLMConfig(): Promise<LLMConfig> {
	const s = await readSettings();
	const provider = providerFrom(s);
	const preset = PROVIDER_PRESETS[provider];
	const modelOverride = String(s[SETTING_MODEL] || '').trim();

	let baseUrl: string;
	let apiKey: string;
	let model: string;
	let apiFormat: ApiFormat = 'openai';

	if (preset) {
		baseUrl = preset.baseUrl;
		apiFormat = preset.apiFormat ?? 'openai';
		model = modelOverride || preset.defaultModel;
		apiKey = String(s[preset.keySetting] || '').trim();
		if (!apiKey && !preset.keyOptional) {
			throw new Error(`請先在設定 → Note AI 中，於 Provider「${preset.keyLabel}」狀態下的 API Key 欄位填入金鑰`);
		}
		if (!model) {
			throw new Error(`請在設定 → Note AI 的「Model（覆寫，選填）」欄位填入模型名稱（Provider「${preset.keyLabel}」未內建預設模型，本機服務請填入已安裝的模型）`);
		}
	} else {
		baseUrl = String(s[SETTING_BASE_URL] || '').trim() || 'https://api.openai.com/v1';
		apiKey = String(s[SETTING_API_KEY] || '').trim();
		model = modelOverride || 'gpt-5.5';
		if (!apiKey) {
			throw new Error('請先在設定 → Note AI 中，於 Provider「自訂」狀態下的 API Key 欄位填入金鑰');
		}
	}

	return {
		baseUrl,
		apiKey,
		model,
		apiFormat,
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
		console.info('Note AI: settings loaded', { baseUrl: config.baseUrl, model: config.model, apiFormat: config.apiFormat, temperature: config.temperature, topP: config.topP });

		const selectedText = await getSelectedText();
		const userContent = selectedText || note.body;
		const label = selectedText ? '選取段落' : '全文';
		console.info(`Note AI: sending ${label} to LLM, length =`, userContent.length);

		const reply = (await callLLM({
			baseUrl: config.baseUrl,
			apiKey: config.apiKey,
			model: config.model,
			apiFormat: config.apiFormat,
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
			description: 'AI 設定 — 以 Provider 下拉選單切換供應商；API Key 欄位內容會跟著切換並自動保存',
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
				description: '切換供應商；下方 API Key 欄位會自動載入所選供應商的金鑰，「自訂」才需填寫 Base URL',
			},
			[SETTING_API_KEY_EDITOR]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				secure: true,
				label: 'API Key',
				description: '目前所選 Provider 的金鑰（切換 Provider 時自動載入、編輯後自動保存；Ollama 本機服務可留空）。官方端點：OpenAI https://api.openai.com/v1、Gemini https://generativelanguage.googleapis.com/v1beta/openai、Claude https://api.anthropic.com/v1、DeepSeek https://api.deepseek.com、OpenCode https://opencode.ai/zen/v1、Grok https://api.x.ai/v1、Kimi https://api.moonshot.ai/v1、Qwen https://dashscope-intl.aliyuncs.com/compatible-mode/v1、Ollama http://localhost:11434/v1',
			},
			[SETTING_BASE_URL]: {
				value: 'https://api.openai.com/v1',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'API Base URL（自訂）',
				description: '僅在 Provider 為「自訂」時使用，例如 https://api.openai.com/v1 或本機服務 http://localhost:1234/v1',
			},
			[SETTING_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: false,
				secure: true,
				label: 'API Key - 自訂',
				description: '內部儲存：Provider「自訂」的金鑰',
			},
			[SETTING_OPENAI_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: false,
				secure: true,
				label: 'API Key - OpenAI',
				description: '內部儲存：Provider「OpenAI」的金鑰（端點：https://api.openai.com/v1）',
			},
			[SETTING_GEMINI_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: false,
				secure: true,
				label: 'API Key - Google Gemini',
				description: '內部儲存：Provider「Google Gemini」的金鑰（端點：https://generativelanguage.googleapis.com/v1beta/openai）',
			},
			[SETTING_CLAUDE_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: false,
				secure: true,
				label: 'API Key - Claude',
				description: '內部儲存：Provider「Claude」的金鑰（端點：https://api.anthropic.com/v1）',
			},
			[SETTING_DEEPSEEK_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: false,
				secure: true,
				label: 'API Key - DeepSeek',
				description: '內部儲存：Provider「DeepSeek」的金鑰（端點：https://api.deepseek.com）',
			},
			[SETTING_OPENCODE_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: false,
				secure: true,
				label: 'API Key - OpenCode',
				description: '內部儲存：Provider「OpenCode」的金鑰（端點：https://opencode.ai/zen/v1）',
			},
			[SETTING_GROK_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: false,
				secure: true,
				label: 'API Key - xAI Grok',
				description: '內部儲存：Provider「xAI Grok」的金鑰（端點：https://api.x.ai/v1）',
			},
			[SETTING_KIMI_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: false,
				secure: true,
				label: 'API Key - Kimi',
				description: '內部儲存：Provider「Kimi」的金鑰（端點：https://api.moonshot.ai/v1）',
			},
			[SETTING_QWEN_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: false,
				secure: true,
				label: 'API Key - Qwen',
				description: '內部儲存：Provider「Qwen」的金鑰（端點：https://dashscope-intl.aliyuncs.com/compatible-mode/v1）',
			},
			[SETTING_OLLAMA_API_KEY]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: false,
				secure: true,
				label: 'API Key - Ollama',
				description: '內部儲存：Provider「Ollama」的金鑰（本機服務通常免金鑰，可留空；端點：http://localhost:11434/v1）',
			},
			[SETTING_MODEL]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'Model（覆寫，選填）',
				description: '留空使用所選 Provider 的內建預設模型；填入後優先使用（所有 Provider 適用；本機服務需於此欄填寫模型名稱，例如 llama3.2）',
			},
			[SETTING_SYSTEM_PROMPT]: {
				value: '你是一個有用的助手。請用繁體中文回答。',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'System Prompt',
				description: '系統提示詞，設定 AI 的行為與角色（整理/優化功能使用內建專用提示詞）',
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

		const initial = await readSettings();
		if (String(initial[SETTING_MODEL] || '').trim() === 'gpt-4o-mini') {
			await joplin.settings.setValue(SETTING_MODEL, '');
		}
		lastKnownProvider = providerFrom(initial);
		await loadApiKeyEditor();

		await joplin.settings.onChange(async (event) => {
			try {
				const keys: string[] = event.keys || [];
				const hasProvider = keys.includes(SETTING_PROVIDER);
				const hasEditor = keys.includes(SETTING_API_KEY_EDITOR);
				if (!hasProvider && !hasEditor) return;

				const s = await readSettings();
				const currentProvider = providerFrom(s);

				if (hasProvider) {
					if (hasEditor && !syncingEditor) {
						const editorValue = String(s[SETTING_API_KEY_EDITOR] || '');
						const previousSlot = slotKeyForProvider(lastKnownProvider);
						if (String(s[previousSlot] || '') !== editorValue) {
							await writeSetting(previousSlot, editorValue);
						}
					}
					lastKnownProvider = currentProvider;
					await loadApiKeyEditor();
					return;
				}

				if (syncingEditor) return;
				const editorValue = String(s[SETTING_API_KEY_EDITOR] || '');
				const slotKey = slotKeyForProvider(currentProvider);
				if (String(s[slotKey] || '') === editorValue) return;
				await writeSetting(slotKey, editorValue);
			} catch (error) {
				console.error('Note AI: settings sync error', error);
			}
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
						apiFormat: config.apiFormat,
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
