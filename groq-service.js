const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class GroqService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('GROQ API ключ не настроен');
        }
        this.client = new Groq({ apiKey });
        logger.info('🚀 GroqService инициализирован');
    }

    // Доступные модели GROQ
    static getAvailableModels() {
        try {
            const modelsPath = path.join(__dirname, 'groq-models.json');
            const modelsData = fs.readFileSync(modelsPath, 'utf8');
            const modelsJson = JSON.parse(modelsData);
            return modelsJson.models || [];
        } catch (error) {
            logger.error('❌ Ошибка при загрузке моделей GROQ из файла:', error);
            return []; // Возвращаем пустой массив в случае ошибки
        }
    }

    // Основной метод для отправки запросов
    async sendRequest({ model, messages, temperature = 0.7, maxTokens = 1024, stream = false }) {
        try {
            logger.info(`📤 GROQ: Отправляем запрос к модели ${model}`);
            
            const startTime = Date.now();
            
            const completion = await this.client.chat.completions.create({
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
                stream,
                stop: null
            });

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            if (stream) {
                return completion; // Возвращаем стрим для обработки
            }

            const response = {
                content: completion.choices[0]?.message?.content || '',
                model: completion.model,
                usage: completion.usage,
                provider: 'groq',
                responseTime: responseTime
            };

            logger.info(`✅ GROQ: Ответ получен за ${responseTime}ms`);
            logger.info(`📊 GROQ: Использование токенов:`, completion.usage);

            return response;

        } catch (error) {
            logger.error('❌ GROQ API Error:', error);
            throw new Error(`GROQ API Error: ${error.message}`);
        }
    }

    // Потоковый ответ (для будущего использования)
    async sendStreamRequest({ model, messages, temperature = 0.7, maxTokens = 1024 }) {
        const completion = await this.sendRequest({
            model, 
            messages, 
            temperature, 
            maxTokens, 
            stream: true
        });

        return completion;
    }

    // Простой метод для быстрых запросов
    async quickChat(prompt, model = "llama-3.3-70b-versatile") {
        const messages = [
            { role: "user", content: prompt }
        ];

        return await this.sendRequest({ model, messages });
    }

    // Проверка доступности сервиса
    async checkAvailability() {
        try {
            const response = await this.quickChat("test", "llama3-8b-8192");
            return { available: true, provider: 'groq' };
        } catch (error) {
            logger.error('🔴 GROQ не доступен:', error.message);
            return { available: false, error: error.message };
        }
    }
}

module.exports = GroqService;