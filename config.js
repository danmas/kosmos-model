// config.js
const fs = require('fs');
const path = require('path');

function loadModelsFromFile(filePath) {
    try {
        const fullPath = path.join(__dirname, filePath);
        const modelsData = fs.readFileSync(fullPath, 'utf8');
        const modelsJson = JSON.parse(modelsData);
        return modelsJson.models || [];
    } catch (error) {
        console.error(`❌ Ошибка при загрузке моделей из файла ${filePath}:`, error);
        return [];
    }
}

function createConfig(env) {
    const isTestMode = env.IS_TEST_MODE === 'true';
    
    // Загружаем модели GROQ и OpenRouter из файлов
    const groqModels = loadModelsFromFile('groq-models.json');
    const openRouterModels = loadModelsFromFile('openrouter-models.json');
    
    return {
        // URL для вебхука n8n
        n8nWebhookUrl: isTestMode ? env.N8N_WEBHOOK_TEST_URL : env.N8N_WEBHOOK_URL,
        isTestMode: isTestMode,
        openRouterKey: env.OPENROUTER_API_KEY,
        groqKey: env.GROQ_API_KEY,        
        // Порт сервера
        port: env.PORT,
        
        // Модели по умолчанию
        defaultModels: {
            cheap: {
                model: env.DEFAULT_MODEL_CHEAP || 'google/gemini-2.0-flash-exp:free',
                provider: env.DEFAULT_MODEL_CHEAP_PROVIDER || 'openroute',
                description: 'Бесплатная модель для простых запросов'
            },
            fast: {
                model: env.DEFAULT_MODEL_FAST || 'llama3-70b-8192',
                provider: env.DEFAULT_MODEL_FAST_PROVIDER || 'groq',
                description: 'Быстрая модель для оперативных ответов'
            },
            rich: {
                model: env.DEFAULT_MODEL_RICH || 'google/gemini-2.5-pro-exp-03-25',
                provider: env.DEFAULT_MODEL_RICH_PROVIDER || 'openroute',
                description: 'Мощная модель для сложных задач'
            }
        },
        
        // Доступные модели (OpenRoute + GROQ)
        availableModels: [
            // GROQ модели - быстрые и эффективные
            ...groqModels.map(model => ({
                ...model,
                showInApi: true,
                use_in_ui: true,
                visible_name: `🚀 GROQ: ${model.visible_name}` // Префикс для отличия
            })),
            
            // OpenRouter модели из файла
            ...openRouterModels
        ],
        
        // Настройки логирования
        logging: {
            level: env.LOG_LEVEL,
            filename: env.LOG_FILE || 'combined.log',
            errorFilename: env.ERROR_LOG_FILE || 'error.log'
        },
        // Настройки для langchain-pg
        langchainPg: {
            baseUrl: env.LANGCHAIN_PG_URL || 'http://localhost:3005',
            enabled: env.LANGCHAIN_PG_ENABLED === 'true'
        }
    };
}

module.exports = {
    createConfig,
    ...createConfig(process.env)
};

