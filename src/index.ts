import joplin from 'api';
import { MenuItemLocation, SettingItem, SettingItemType, ToastType, ToolbarButtonLocation } from 'api/types';
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
const SETTING_URL_OPENAI = 'aiUrlOpenai';
const SETTING_URL_GEMINI = 'aiUrlGemini';
const SETTING_URL_CLAUDE = 'aiUrlClaude';
const SETTING_URL_DEEPSEEK = 'aiUrlDeepseek';
const SETTING_URL_OPENCODE = 'aiUrlOpencode';
const SETTING_URL_GROK = 'aiUrlGrok';
const SETTING_URL_KIMI = 'aiUrlKimi';
const SETTING_URL_QWEN = 'aiUrlQwen';
const SETTING_URL_OLLAMA = 'aiUrlOllama';
const SETTING_MODEL = 'aiModel';
const SETTING_SYSTEM_PROMPT = 'aiSystemPrompt';
const SETTING_TEMPERATURE = 'aiTemperature';
const SETTING_TOP_P = 'aiTopP';
const COMMAND_CHAT = 'noteAiChat';
const COMMAND_AI_PROCESS_NOTE = 'noteAiProcessNote';
const COMMAND_MAGIC_WAND = 'noteAiMagicWand';
const COMMAND_APPLY_ENDPOINT = 'noteAiApplyEndpoint';

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
	urlSetting: string;
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
		urlSetting: SETTING_URL_OPENAI,
		keyLabel: 'OpenAI',
	},
	[PROVIDER_GEMINI]: {
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
		defaultModel: 'gemini-3.8-flash',
		keySetting: SETTING_GEMINI_API_KEY,
		urlSetting: SETTING_URL_GEMINI,
		keyLabel: 'Google Gemini',
	},
	[PROVIDER_CLAUDE]: {
		baseUrl: 'https://api.anthropic.com/v1',
		defaultModel: 'claude-sonnet-5',
		keySetting: SETTING_CLAUDE_API_KEY,
		urlSetting: SETTING_URL_CLAUDE,
		keyLabel: 'Claude',
		apiFormat: 'anthropic',
	},
	[PROVIDER_DEEPSEEK]: {
		baseUrl: 'https://api.deepseek.com',
		defaultModel: 'deepseek-v4-flash',
		keySetting: SETTING_DEEPSEEK_API_KEY,
		urlSetting: SETTING_URL_DEEPSEEK,
		keyLabel: 'DeepSeek',
	},
	[PROVIDER_OPENCODE]: {
		baseUrl: 'https://opencode.ai/zen/go/v1',
		defaultModel: 'glm-5.1',
		keySetting: SETTING_OPENCODE_API_KEY,
		urlSetting: SETTING_URL_OPENCODE,
		keyLabel: 'OpenCode',
	},
	[PROVIDER_GROK]: {
		baseUrl: 'https://api.x.ai/v1',
		defaultModel: 'grok-4.6',
		keySetting: SETTING_GROK_API_KEY,
		urlSetting: SETTING_URL_GROK,
		keyLabel: 'xAI Grok',
	},
	[PROVIDER_KIMI]: {
		baseUrl: 'https://api.moonshot.ai/v1',
		defaultModel: 'kimi-k3',
		keySetting: SETTING_KIMI_API_KEY,
		urlSetting: SETTING_URL_KIMI,
		keyLabel: 'Kimi',
	},
	[PROVIDER_QWEN]: {
		baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
		defaultModel: 'qwen3.7-max',
		keySetting: SETTING_QWEN_API_KEY,
		urlSetting: SETTING_URL_QWEN,
		keyLabel: 'Qwen',
	},
	[PROVIDER_OLLAMA]: {
		baseUrl: 'http://localhost:11434/v1',
		defaultModel: '',
		keySetting: SETTING_OLLAMA_API_KEY,
		urlSetting: SETTING_URL_OLLAMA,
		keyLabel: 'Ollama',
		keyOptional: true,
	},
};

function slotKeyForProvider(provider: number): string {
	const preset = PROVIDER_PRESETS[provider];
	return preset ? preset.keySetting : SETTING_API_KEY;
}

function urlSlotForProvider(provider: number): string {
	const preset = PROVIDER_PRESETS[provider];
	return preset ? preset.urlSetting : SETTING_BASE_URL;
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
		SETTING_URL_OPENAI,
		SETTING_URL_GEMINI,
		SETTING_URL_CLAUDE,
		SETTING_URL_DEEPSEEK,
		SETTING_URL_OPENCODE,
		SETTING_URL_GROK,
		SETTING_URL_KIMI,
		SETTING_URL_QWEN,
		SETTING_URL_OLLAMA,
		SETTING_MODEL,
		SETTING_SYSTEM_PROMPT,
		SETTING_TEMPERATURE,
		SETTING_TOP_P,
	]);
}

function providerFrom(s: Record<string, unknown>): number {
	return Number(s[SETTING_PROVIDER]) || PROVIDER_CUSTOM;
}

let syncingFields = false;
let lastKnownProvider = PROVIDER_CUSTOM;

async function writeSetting(key: string, value: string): Promise<void> {
	syncingFields = true;
	try {
		await joplin.settings.setValue(key, value);
	} finally {
		syncingFields = false;
	}
}

async function loadApiKeyEditor(): Promise<void> {
	const s = await readSettings();
	const slotKey = slotKeyForProvider(providerFrom(s));
	await writeSetting(SETTING_API_KEY_EDITOR, String(s[slotKey] || ''));
}

async function loadBaseUrlField(): Promise<void> {
	const provider = providerFrom((await readSettings()));
	const preset = PROVIDER_PRESETS[provider];
	if (!preset) return;
	const s = await readSettings();
	const savedUrl = String(s[preset.urlSetting] || '').trim();
	await writeSetting(SETTING_BASE_URL, savedUrl || preset.baseUrl);
}

async function resolveLLMConfig(): Promise<LLMConfig> {
	const s = await readSettings();
	const provider = providerFrom(s);
	const preset = PROVIDER_PRESETS[provider];
	const modelOverride = String(s[SETTING_MODEL] || '').trim();
	const fieldUrl = String(s[SETTING_BASE_URL] || '').trim();

	let baseUrl: string;
	let apiKey: string;
	let model: string;
	let apiFormat: ApiFormat = 'openai';

	if (preset) {
		baseUrl = fieldUrl || preset.baseUrl;
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
		baseUrl = fieldUrl || 'https://api.openai.com/v1';
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

async function applyEndpoint(): Promise<void> {
	try {
		const s = await readSettings();
		const provider = providerFrom(s);
		const preset = PROVIDER_PRESETS[provider];
		const label = preset ? preset.keyLabel : '自訂';
		const url = preset
			? (String(s[preset.urlSetting] || '').trim() || preset.baseUrl)
			: String(s[SETTING_BASE_URL] || '').trim();
		if (!url) {
			alert('目前 Provider 無可套用的端點，請在 API Base URL 欄位自行填寫');
			return;
		}
		await joplin.settings.setValue(SETTING_BASE_URL, url);
		await joplin.views.dialogs.showToast({ message: `Note AI: 已套用「${label}」端點：${url}`, type: ToastType.Info });
		console.info('Note AI: applied endpoint for', label);
	} catch (error) {
		console.error('Note AI: apply endpoint error', error);
		alert(`Note AI 錯誤:\n${error instanceof Error ? error.message : String(error)}`);
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
			description: 'AI 設定 — 以 Provider 下拉選單切換供應商；API Key 與 API Base URL 欄位內容會跟著切換並自動保存',
		});

		const slotItem = (keyLabel: string, label: string): SettingItem => ({
			value: '',
			type: SettingItemType.String,
			section: SETTING_SECTION,
			public: false,
			secure: true,
			label,
			description: `內部儲存：Provider「${keyLabel}」的金鑰`,
		});

		const urlSlotItem = (keyLabel: string, label: string): SettingItem => ({
			value: '',
			type: SettingItemType.String,
			section: SETTING_SECTION,
			public: false,
			label,
			description: `內部儲存：Provider「${keyLabel}」的 API 端點（選擇該 Provider 時自動填入欄位）`,
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
				description: '切換供應商；下方 API Key 與 API Base URL 欄位會自動載入所選供應商的設定（可自行修改，各供應商分別記憶）',
			},
			[SETTING_API_KEY_EDITOR]: {
				value: '',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				secure: true,
				label: 'API Key',
				description: '目前所選 Provider 的金鑰（切換 Provider 時自動載入、編輯後自動保存；Ollama 本機服務可留空）',
			},
			[SETTING_BASE_URL]: {
				value: 'https://api.openai.com/v1',
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'API Base URL',
				description: '選擇 Provider 時自動套用該供應商的 API 端點（以通知顯示）；可自行修改（各供應商分別記憶）。欄位顯示不會即時重繪（Joplin 限制）— 重開設定畫面即可見；或於 Tools 選單／指令面板執行「套用端點」立即套用並顯示於通知',
			},
			[SETTING_API_KEY]: slotItem('自訂', 'API Key - 自訂'),
			[SETTING_OPENAI_API_KEY]: slotItem('OpenAI', 'API Key - OpenAI'),
			[SETTING_GEMINI_API_KEY]: slotItem('Google Gemini', 'API Key - Google Gemini'),
			[SETTING_CLAUDE_API_KEY]: slotItem('Claude', 'API Key - Claude'),
			[SETTING_DEEPSEEK_API_KEY]: slotItem('DeepSeek', 'API Key - DeepSeek'),
			[SETTING_OPENCODE_API_KEY]: slotItem('OpenCode', 'API Key - OpenCode'),
			[SETTING_GROK_API_KEY]: slotItem('xAI Grok', 'API Key - xAI Grok'),
			[SETTING_KIMI_API_KEY]: slotItem('Kimi', 'API Key - Kimi'),
			[SETTING_QWEN_API_KEY]: slotItem('Qwen', 'API Key - Qwen'),
			[SETTING_OLLAMA_API_KEY]: slotItem('Ollama', 'API Key - Ollama'),
			[SETTING_URL_OPENAI]: urlSlotItem('OpenAI', 'API URL - OpenAI'),
			[SETTING_URL_GEMINI]: urlSlotItem('Google Gemini', 'API URL - Google Gemini'),
			[SETTING_URL_CLAUDE]: urlSlotItem('Claude', 'API URL - Claude'),
			[SETTING_URL_DEEPSEEK]: urlSlotItem('DeepSeek', 'API URL - DeepSeek'),
			[SETTING_URL_OPENCODE]: urlSlotItem('OpenCode', 'API URL - OpenCode'),
			[SETTING_URL_GROK]: urlSlotItem('xAI Grok', 'API URL - xAI Grok'),
			[SETTING_URL_KIMI]: urlSlotItem('Kimi', 'API URL - Kimi'),
			[SETTING_URL_QWEN]: urlSlotItem('Qwen', 'API URL - Qwen'),
			[SETTING_URL_OLLAMA]: urlSlotItem('Ollama', 'API URL - Ollama'),
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
		await loadBaseUrlField();

		await joplin.settings.onChange(async (event) => {
			try {
				const keys: string[] = event.keys || [];
				const hasProvider = keys.includes(SETTING_PROVIDER);
				const hasKeyEditor = keys.includes(SETTING_API_KEY_EDITOR);
				const hasUrlEditor = keys.includes(SETTING_BASE_URL);
				if (!hasProvider && !hasKeyEditor && !hasUrlEditor) return;
				if (syncingFields) return;

				const s = await readSettings();
				const currentProvider = providerFrom(s);

				if (hasProvider) {
					const previousKeySlot = slotKeyForProvider(lastKnownProvider);
					const previousUrlSlot = urlSlotForProvider(lastKnownProvider);
					if (hasKeyEditor) {
						const editorValue = String(s[SETTING_API_KEY_EDITOR] || '');
						if (String(s[previousKeySlot] || '') !== editorValue) {
							await writeSetting(previousKeySlot, editorValue);
						}
					}
					if (hasUrlEditor) {
						const urlValue = String(s[SETTING_BASE_URL] || '').trim();
						if (String(s[previousUrlSlot] || '') !== urlValue) {
							await writeSetting(previousUrlSlot, urlValue);
						}
					}
					lastKnownProvider = currentProvider;
					await loadApiKeyEditor();
					await loadBaseUrlField();
					const preset = PROVIDER_PRESETS[currentProvider];
					if (preset) {
						const appliedUrl = String(s[preset.urlSetting] || '').trim() || preset.baseUrl;
						await joplin.views.dialogs.showToast({ message: `Note AI: 已載入「${preset.keyLabel}」設定 — 端點：${appliedUrl}`, type: ToastType.Info });
					}
					return;
				}

				const currentKeySlot = slotKeyForProvider(currentProvider);
				const currentUrlSlot = urlSlotForProvider(currentProvider);
				if (hasKeyEditor) {
					const editorValue = String(s[SETTING_API_KEY_EDITOR] || '');
					if (String(s[currentKeySlot] || '') !== editorValue) {
						await writeSetting(currentKeySlot, editorValue);
					}
				}
				if (hasUrlEditor) {
					const urlValue = String(s[SETTING_BASE_URL] || '').trim();
					if (String(s[currentUrlSlot] || '') !== urlValue) {
						await writeSetting(currentUrlSlot, urlValue);
					}
				}
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

		await joplin.commands.register({
			name: COMMAND_APPLY_ENDPOINT,
			label: 'Note AI: 套用所選 Provider 的 API 端點',
			iconName: 'fas fa-sync-alt',
			execute: applyEndpoint,
		});
		await joplin.views.menuItems.create(
			'noteAiApplyEndpointTools',
			COMMAND_APPLY_ENDPOINT,
			MenuItemLocation.Tools,
		);

		console.info('Note AI plugin started — toolbar button "noteAiMagicWand" (Note AI) created in EditorToolbar');
	},
});
