export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

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
}

const DEFAULT_TIMEOUT_MS = 120000;

export async function callLLM(options: CallLLMOptions): Promise<string> {
	const {
		baseUrl,
		apiKey,
		messages,
		model = 'gpt-4o-mini',
		temperature = 0.7,
		topP = 1.0,
		maxTokens = 4096,
		timeoutMs = DEFAULT_TIMEOUT_MS,
	} = options;

	const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages,
				temperature,
				top_p: topP,
				max_tokens: maxTokens,
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			const body = await response.text();
			const snippet = body.length > 500 ? `${body.slice(0, 500)}…` : body;
			throw new Error(`LLM API 錯誤 (${response.status}): ${snippet}`);
		}

		const data = await response.json();
		return data.choices?.[0]?.message?.content ?? '';
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(`AI 請求逾時（${Math.round(timeoutMs / 1000)} 秒），請檢查網路連線或 API 端點設定`);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
