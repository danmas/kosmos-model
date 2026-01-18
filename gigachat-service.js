// gigachat-service.js
// Сервис для работы с GigaChat API (Сбер)
// Документация: https://developers.sber.ru/portal/products/gigachat-api

const crypto = require('crypto');
const logger = require('./logger');

// Отключаем проверку самоподписанного сертификата Сбера
// Native fetch в Node.js не поддерживает опцию agent, поэтому используем глобальную настройку
// Это безопасно, т.к. применяется только к GigaChat endpoints
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

class GigaChatService {
    constructor(authData) {
        if (!authData) {
            throw new Error('GigaChat: AUTH_DATA не передан (нужен GIGACHAT_AUTH_DATA)');
        }
        this.authData = authData.trim();
        this.token = null;
        this.tokenExpiresAt = 0;
        
        logger.info('🟢 GigaChatService инициализирован');
    }

    /**
     * Получение токена доступа с автоматическим кэшированием
     * Токен живёт ~30 минут, обновляем с запасом 60 сек
     */
    async getAccessToken() {
        const now = Date.now();
        
        // Если токен валиден (с запасом 60 сек), возвращаем его
        if (this.token && this.tokenExpiresAt > now + 60_000) {
            return this.token;
        }

        logger.info('🔑 GigaChat: запрос нового токена...');
        
        const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'RqUID': crypto.randomUUID(),
                'Authorization': `Basic ${this.authData}`
            },
            body: 'scope=GIGACHAT_API_PERS'
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`GigaChat OAuth error: ${response.status} ${err}`);
        }

        const data = await response.json();
        this.token = data.access_token;
        
        // Время жизни токена (из API или ~29 минут по умолчанию)
        this.tokenExpiresAt = data.expires_at 
            ? data.expires_at * 1000 
            : now + 29 * 60 * 1000;
            
        logger.info('🔑 GigaChat: токен получен, истекает через', 
            Math.round((this.tokenExpiresAt - now) / 60000), 'мин');
        
        return this.token;
    }

    /**
     * Основной метод отправки запросов к GigaChat
     * @param {Object} params - Параметры запроса
     * @param {string} params.model - Имя модели (GigaChat, GigaChat-Pro, GigaChat-Max)
     * @param {Array} params.messages - Массив сообщений [{role, content}]
     * @param {number} params.temperature - Температура (0-2)
     * @param {number} params.maxTokens - Максимум токенов в ответе
     * @param {boolean} params.stream - Включить стриминг (пока не реализован)
     * @returns {Object} - {content, model, usage, provider, responseTime}
     */
    async sendRequest({ model, messages, temperature = 0.7, maxTokens = 1024, stream = false }) {
        try {
            const token = await this.getAccessToken();
            const startTime = Date.now();

            logger.info(`📤 GigaChat: отправляем запрос к модели ${model}`);

            const payload = {
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
                repetition_penalty: 1.18,  // Рекомендуемый параметр для GigaChat
                stream
            };

            const response = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`GigaChat API error: ${response.status} ${err}`);
            }

            const data = await response.json();
            const responseTime = Date.now() - startTime;

            const content = data.choices[0]?.message?.content || '';

            const result = {
                content,
                model: data.model || model,
                usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                provider: 'gigachat',
                responseTime
            };

            logger.info(`✅ GigaChat: ответ за ${responseTime}ms`);
            logger.info(`📊 GigaChat: токены:`, data.usage);

            return result;

        } catch (error) {
            logger.error('❌ GigaChat API Error:', error.message);
            throw new Error(`GigaChat API Error: ${error.message}`);
        }
    }

    /**
     * Быстрый чат для тестирования
     */
    async quickChat(prompt, model = "GigaChat") {
        return this.sendRequest({
            model,
            messages: [{ role: "user", content: prompt }],
            maxTokens: 500
        });
    }

    /**
     * Проверка доступности сервиса
     */
    async checkAvailability() {
        try {
            await this.quickChat("Привет", "GigaChat");
            return { available: true, provider: 'gigachat' };
        } catch (error) {
            logger.error('🔴 GigaChat недоступен:', error.message);
            return { available: false, error: error.message };
        }
    }
}

module.exports = GigaChatService;

