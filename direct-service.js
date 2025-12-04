const axios = require('axios');

class DirectService {
    constructor(apiKey, baseUrl) {
        if (!apiKey || !baseUrl) {
            throw new Error('Direct API: ключ и base_url обязательны');
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        console.log(`🚀 DirectService инициализирован для ${baseUrl}`);
    }

    async sendRequest({ model, messages, temperature = 0.7, maxTokens = 1024, stream = false }) {
        try {
            console.log(`📤 Direct: Отправляем запрос к модели ${model} на ${this.baseUrl}`);

            const startTime = Date.now();

            // Строим payload (OpenAI-совместимый + кастом для Z.AI)
            const payload = {
                model,
                messages,
                temperature,
                max_tokens: maxTokens
            };
            
            // Добавляем stream только если true (некоторые API не любят stream: false явно)
            if (stream) {
                payload.stream = true;
            }

            // Специфика Z.AI: добавляем "thinking" если нужно (опционально, включи по флагу)
            if (process.env.ZAI_THINKING_ENABLED === 'true') {
                payload.thinking = { type: "enabled" };
            }

            // Детальное логирование для отладки
            const requestUrl = `${this.baseUrl}/chat/completions`;
            const requestHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey.substring(0, 10)}...`
            };
            
            console.log('🔍 DEBUG DIRECT: Полный запрос к API:');
            console.log('  URL:', requestUrl);
            console.log('  Headers:', JSON.stringify(requestHeaders, null, 2));
            console.log('  Payload:', JSON.stringify(payload, null, 2));
            console.log('  Полный payload (для копирования):', JSON.stringify(payload));

            const response = await axios.post(
                requestUrl,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: 60000  // 60s timeout
                }
            );

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            if (stream) {
                return response.data;  // Для стриминга (если нужно)
            }

            const completion = response.data;
            const content = completion.choices?.[0]?.message?.content || '';

            // Детальное логирование ответа
            console.log('🔍 DEBUG DIRECT: Ответ от API:');
            console.log('  Status:', response.status);
            console.log('  Полный ответ:', JSON.stringify(completion, null, 2));
            console.log('  Извлеченный content:', content.substring(0, 200) + (content.length > 200 ? '...' : ''));

            const result = {
                content,
                model: completion.model || model,
                usage: completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                provider: 'direct',
                responseTime
            };

            console.log(`✅ Direct: Ответ за ${responseTime}ms`);
            console.log(`📊 Direct: Токены:`, completion.usage);

            return result;

        } catch (error) {
            console.error('❌ Direct API Error:');
            console.error('  Message:', error.message);
            console.error('  Status:', error.response?.status);
            console.error('  Status Text:', error.response?.statusText);
            console.error('  Response Data:', JSON.stringify(error.response?.data, null, 2));
            console.error('  Request URL:', error.config?.url);
            console.error('  Request Method:', error.config?.method);
            console.error('  Request Payload:', JSON.stringify(error.config?.data, null, 2));
            throw new Error(`Direct API Error: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    // Простой чат для теста
    async quickChat(prompt, model = "glm-4.6") {
        const messages = [{ role: "user", content: prompt }];
        return await this.sendRequest({ model, messages });
    }

    // Проверка доступности
    async checkAvailability() {
        try {
            await this.quickChat("test");
            return { available: true, provider: 'direct' };
        } catch (error) {
            return { available: false, error: error.message };
        }
    }
}

module.exports = DirectService;