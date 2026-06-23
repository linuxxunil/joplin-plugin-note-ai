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
}

export async function callLLM(options: CallLLMOptions): Promise<string> {
	const {
		baseUrl,
		apiKey,
		messages,
		model = 'gpt-4o-mini',
		temperature = 0.7,
		topP = 1.0,
		maxTokens = 2048,
	} = options;

	const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

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
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`LLM API 錯誤 (${response.status}): ${body}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content ?? '';
}
