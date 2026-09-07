export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export type ApiFormat = 'openai' | 'anthropic';

export interface LLMConfig {
	baseUrl: string;
	apiKey: string;
	model?: string;
}

export interface CallLLMOptions {
	baseUrl: string;
	apiKey: string;
	messages: ChatMessage[];
	model?: string;
	temperature?: number;
	topP?: number;
	maxTokens?: number;
	timeoutMs?: number;
	apiFormat?: ApiFormat;
}

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 120000;

interface BuiltRequest {
	url: string;
	headers: Record<string, string>;
	body: string;
}

function buildOpenAIRequest(options: CallLLMOptions, model: string, temperature: number, topP: number, maxTokens: number): BuiltRequest {
	const { baseUrl, apiKey, messages } = options;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (apiKey) {
		headers['Authorization'] = `Bearer ${apiKey}`;
	}
	return {
		url: `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
		headers,
		body: JSON.stringify({
			model,
			messages,
			temperature,
			top_p: topP,
			max_tokens: maxTokens,
		}),
	};
}

function buildAnthropicRequest(options: CallLLMOptions, model: string, temperature: number, topP: number, maxTokens: number): BuiltRequest {
	const { baseUrl, apiKey, messages } = options;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'anthropic-version': ANTHROPIC_VERSION,
	};
	if (apiKey) {
		headers['x-api-key'] = apiKey;
	}
	const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
	const chatMessages = messages
		.filter(m => m.role !== 'system')
		.map(m => ({ role: m.role, content: m.content }));

	return {
		url: `${baseUrl.replace(/\/+$/, '')}/messages`,
		headers,
		body: JSON.stringify({
			model,
			max_tokens: maxTokens,
			temperature,
			top_p: topP,
			...(systemParts.length ? { system: systemParts.join('\n\n') } : {}),
			messages: chatMessages,
		}),
	};
}

function parseOpenAIResponse(data: Record<string, unknown>): string {
	const choices = data?.choices as Array<{ message?: { content?: string } }> | undefined;
	return choices?.[0]?.message?.content ?? '';
}

function parseAnthropicResponse(data: Record<string, unknown>): string {
	const blocks = data?.content as Array<{ type?: string; text?: string }> | undefined;
	if (!Array.isArray(blocks)) return '';
	return blocks
		.filter(block => block?.type === 'text' && typeof block.text === 'string')
		.map(block => block.text)
		.join('');
}

export async function callLLM(options: CallLLMOptions): Promise<string> {
	const {
		apiKey,
		messages,
		model = 'gpt-5.5',
		temperature = 0.7,
		topP = 1.0,
		maxTokens = 4096,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		apiFormat = 'openai',
	} = options;

	const request = apiFormat === 'anthropic'
		? buildAnthropicRequest(options, model, temperature, topP, maxTokens)
		: buildOpenAIRequest(options, model, temperature, topP, maxTokens);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(request.url, {
			method: 'POST',
			headers: request.headers,
			body: request.body,
			signal: controller.signal,
		});

		if (!response.ok) {
			const body = await response.text();
			const snippet = body.length > 500 ? `${body.slice(0, 500)}…` : body;
			throw new Error(`LLM API 錯誤 (${response.status}): ${snippet}`);
		}

		const data = await response.json();
		return apiFormat === 'anthropic' ? parseAnthropicResponse(data) : parseOpenAIResponse(data);
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(`AI 請求逾時（${Math.round(timeoutMs / 1000)} 秒），請檢查網路連線或 API 端點設定`);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
