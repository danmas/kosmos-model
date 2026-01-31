const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
// Подключаем dotenv для загрузки переменных окружения из .env файла
require('dotenv').config();

// Подключаем логгер
const logger = require('./logger');

const axios = require('axios');
//const config = require('./config');
const { createConfig } = require('./config');
const langchainPgService = require('./rag');

// Добавляем GROQ и direct сервис
const GroqService = require('./groq-service');
const DirectService = require('./direct-service');
const GigaChatService = require('./gigachat-service');

// Добавляем библиотеку CORS
const cors = require('cors');


const MODELS_FILE = path.join(__dirname, 'data', 'available-models.json');
const PROMPTS_FILE = path.join(__dirname, 'data', 'prompts.json');
const RESPONSES_FILE = path.join(__dirname, 'data', 'responses.json');
const PROMPTS_DEFAULTS_FILE = path.join(__dirname, 'prompts.defaults.json');

// Создаем директорию data, если она не существует
const DATA_DIR = path.join(__dirname, 'data');
try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.info(`Создана директория для данных: ${DATA_DIR}`);
    }
} catch (err) {
    logger.error(`Ошибка при создании директории ${DATA_DIR}:`, err);
}
async function loadModels() {
  try {
    const data = await fsPromises.readFile(MODELS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    logger.error('Ошибка чтения available-models.json, создаём пустой');
    return [];
  }
}

// Сохранение моделей
async function saveModels(models) {
  await fsPromises.writeFile(MODELS_FILE, JSON.stringify(models, null, 2));
}

// Константа для директории сохранения файлов по умолчанию
const OUTPUT_DOCS_DIR = process.env.OUTPUT_DOCS_DIR || path.join(__dirname, 'output_docs');

// Создаем директорию, если она не существует
try {
    if (!fs.existsSync(OUTPUT_DOCS_DIR)) {
        fs.mkdirSync(OUTPUT_DOCS_DIR, { recursive: true });
        logger.info(`Создана директория для сохранения файлов: ${OUTPUT_DOCS_DIR}`);
    }
} catch (err) {
    logger.error(`Ошибка при создании директории ${OUTPUT_DOCS_DIR}:`, err);
}

const app = express();

// Настройка CORS - разрешаем запросы со всех источников
// app.use(cors());
app.use(cors({
  //origin: ['http://localhost:3005', 'app://obsidian.md'], // Конкретно ваш источник вместо '*'
  origin: '*', // Конкретно ваш источник вместо '*'
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
})); 


// Middleware
// Увеличиваем лимит размера тела запроса до 10MB для поддержки больших файлов
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root to /main
app.get('/', (req, res) => {
    res.redirect('/main');
});

// Route to serve the main page
app.get('/main', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

// API endpoint to list markdown files
app.get('/api/markdown_files', (req, res) => {
    fs.readdir(__dirname, (err, files) => {
        if (err) {
            logger.error('Error reading directory:', err);
            return res.status(500).json({ error: 'Could not list files' });
        }
        const mdFiles = files.filter(file => file.endsWith('.md'));
        res.json(mdFiles);
    });
});

// Route to serve the markdown viewer page
app.get('/show_md', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'show_md.html'));
});

// Route to get markdown file content
app.get('/get_md_content', (req, res) => {
    const filename = req.query.file;
    if (!filename) {
        return res.status(400).json({ error: 'Filename is required' });
    }

    // Security check: ensure filename is just a filename and does not contain path traversal characters.
    if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(__dirname, filename); // Assume markdown files are in the root directory

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            logger.error(`Error reading file: ${filename}`, err);
            return res.status(404).json({ error: 'File not found' });
        }
        res.json({ content: data });
    });
});


// Вывод загруженных переменных окружения для отладки
logger.info('Loaded environment variables:', {
    N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
    N8N_WEBHOOK_TEST_URL: process.env.N8N_WEBHOOK_TEST_URL,
    PORT: process.env.PORT,
    LOG_LEVEL: process.env.LOG_LEVEL,
    IS_TEST_MODE: process.env.IS_TEST_MODE,
    LANGCHAIN_PG_URL: process.env.LANGCHAIN_PG_URL,
    LANGCHAIN_PG_ENABLED: process.env.LANGCHAIN_PG_ENABLED
});

// Создаем конфигурацию с переменными окружения
const config = createConfig(process.env);

// Вывод настроек моделей по умолчанию при старте
logger.info('\n═══════════════════════════════════════════════════════');
logger.info('🤖 НАСТРОЙКИ МОДЕЛЕЙ ПО УМОЛЧАНИЮ:');
logger.info('═══════════════════════════════════════════════════════');
logger.info(`💰 CHEAP (дешёвая):
   Модель: ${config.defaultModels.cheap.model}
   Провайдер: ${config.defaultModels.cheap.provider}
   Описание: ${config.defaultModels.cheap.description}`);
logger.info(`⚡ FAST (быстрая):
   Модель: ${config.defaultModels.fast.model}
   Провайдер: ${config.defaultModels.fast.provider}
   Описание: ${config.defaultModels.fast.description}`);
logger.info(`💎 RICH (мощная):
   Модель: ${config.defaultModels.rich.model}
   Провайдер: ${config.defaultModels.rich.provider}
   Описание: ${config.defaultModels.rich.description}`);
logger.info('═══════════════════════════════════════════════════════\n');

// Инициализируем GROQ сервис если ключ доступен
let groqService = null;
if (config.groqKey) {
    try {
        groqService = new GroqService(config.groqKey);
        logger.info('✅ GROQ сервис инициализирован');
    } catch (error) {
        logger.warn('⚠️ GROQ сервис не инициализирован:', error.message);
    }
} else {
    logger.warn('⚠️ GROQ_API_KEY не настроен');
}

// Инициализируем GigaChat сервис если данные авторизации доступны
let gigachatService = null;
if (process.env.GIGACHAT_AUTH_DATA) {
    try {
        gigachatService = new GigaChatService(process.env.GIGACHAT_AUTH_DATA);
        logger.info('✅ GigaChat сервис инициализирован');
    } catch (error) {
        logger.warn('⚠️ GigaChat сервис не инициализирован:', error.message);
    }
} else {
    logger.warn('⚠️ GIGACHAT_AUTH_DATA не настроен');
}

// Добавим проверку загруженных переменных
logger.info('Loaded N8N_WEBHOOK_URL:', process.env.N8N_WEBHOOK_URL);
logger.info('Loaded config N8N_WEBHOOK_URL:', config.n8nWebhookUrl);
logger.info('Loaded PORT:', process.env.PORT);
logger.info('Loaded LOG_LEVEL:', process.env.LOG_LEVEL);
logger.info('openRouterKey:', config.openRouterKey ? '***' : null); // Маскируем ключ для безопасности

// После пересоздания конфигурации
logger.info('Final configuration:', {
    n8nWebhookUrl: config.n8nWebhookUrl,
    port: config.port,
    logging: config.logging,
    openRouterKey: config.openRouterKey ? '***' : null, // Маскируем ключ для безопасности
    groqKey: config.groqKey ? '***' : null // Маскируем ключ для безопасности
});

// Изменим endpoint для конфигурации в server.js
app.get('/api/config', (req, res) => {
  res.json({
      server: {
          port: config.port,
          nodeEnv: process.env.NODE_ENV || 'development',
          isTestMode: config.isTestMode
      },
      n8n: {
          webhookUrl: config.n8nWebhookUrl
      },
              apiKey: config.openRouterKey,
        groqKey: config.groqKey ? '***' : null, // Скрываем ключ для безопасности
        providers: {
            openroute: !!config.openRouterKey,
            groq: !!config.groqKey,
            gigachat: !!gigachatService
        }, 
      logging: {
          level: config.logging.level,
          filename: config.logging.filename,
          errorFilename: config.logging.errorFilename
      },
      langchainPg: config.langchainPg
  });
});



// Инициализация файла истории ответов, если он не существует
async function initializeResponsesFile() {
    try {
        await fsPromises.access(RESPONSES_FILE);
    } catch {
        await fsPromises.writeFile(RESPONSES_FILE, JSON.stringify({ responses: [] }));
    }
}

// Чтение истории ответов из файла
async function readResponses() {
    try {
        const data = await fsPromises.readFile(RESPONSES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error('Error reading responses:', error);
        return { responses: [] };
    }
}

// Запись истории ответов в файл
async function writeResponses(responses) {
    await fsPromises.writeFile(RESPONSES_FILE, JSON.stringify(responses, null, 2));
}

// Инициализация файла истории при запуске
initializeResponsesFile();

// --- Token utils (approximate) ---
function estimateTokensFromText(text) {
    if (!text) return 0;
    const chars = text.length;
    const words = (text.trim().match(/\S+/g) || []).length;
    const byChars = Math.round(chars / 4);
    const byWords = Math.round(words * 1.2);
    return Math.max(1, Math.max(byChars, byWords));
}

function extractTokensFromUsage(usage) {
    if (!usage) return null;
    const prompt = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.prompt;
    const completion = usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.completion;
    const total = usage.total_tokens ?? usage.total;
    if (prompt != null || completion != null || total != null) {
        return {
            input: prompt ?? (total != null && completion != null ? total - completion : undefined),
            output: completion ?? (total != null && prompt != null ? total - prompt : undefined),
            total: total ?? (prompt != null && completion != null ? prompt + completion : undefined),
            source: 'api'
        };
    }
    return null;
}

function buildTokensInfo({ usage, promptText, inputTextUsed, modelResponse }) {
    const apiTokens = extractTokensFromUsage(usage);
    if (apiTokens) {
        const estIn = estimateTokensFromText(`${promptText || ''}\n${inputTextUsed || ''}`);
        const estOut = estimateTokensFromText(modelResponse || '');
        return {
            input: apiTokens.input ?? estIn,
            output: apiTokens.output ?? estOut,
            total: apiTokens.total ?? ((apiTokens.input ?? estIn) + (apiTokens.output ?? estOut)),
            source: 'api'
        };
    }
    const inputEst = estimateTokensFromText(`${promptText || ''}\n${inputTextUsed || ''}`);
    const outputEst = estimateTokensFromText(modelResponse || '');
    return {
        input: inputEst,
        output: outputEst,
        total: inputEst + outputEst,
        source: 'estimated'
    };
}

// API для получения истории ответов с опциями сортировки и фильтрации
app.get('/api/responses', async (req, res) => {
    try {
        const data = await readResponses();
        
        // Получаем параметры фильтрации и сортировки из запроса
        const { sortBy, sortOrder, model, prompt, dateFrom, dateTo, limit, offset } = req.query;
        
        let responses = [...data.responses];
        
        // Применяем фильтры, если они указаны
        if (model) {
            responses = responses.filter(r => r.model && r.model.toLowerCase().includes(model.toLowerCase()));
        }
        
        if (prompt) {
            responses = responses.filter(r => 
                (r.promptName && r.promptName.toLowerCase().includes(prompt.toLowerCase())) ||
                (r.prompt && r.prompt.toLowerCase().includes(prompt.toLowerCase()))
            );
        }
        
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            responses = responses.filter(r => new Date(r.timestamp) >= fromDate);
        }
        
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999); // Устанавливаем конец дня
            responses = responses.filter(r => new Date(r.timestamp) <= toDate);
        }
        
        // Сортировка результатов
        if (sortBy) {
            const order = sortOrder === 'desc' ? -1 : 1;
            responses.sort((a, b) => {
                if (sortBy === 'date') {
                    return order * (new Date(b.timestamp) - new Date(a.timestamp));
                }
                if (sortBy === 'model') {
                    const aVal = a.model || '';
                    const bVal = b.model || '';
                    return order * aVal.localeCompare(bVal);
                }
                if (sortBy === 'promptName') {
                    const aVal = a.promptName || '';
                    const bVal = b.promptName || '';
                    return order * aVal.localeCompare(bVal);
                }
                return 0;
            });
        } else {
            // По умолчанию сортируем по дате (сначала новые)
            responses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
        
        // Сохраняем общее количество записей для пагинации
        const totalItems = responses.length;
        
        // Применяем пагинацию
        let offsetInt = 0;
        let limitInt = 50; // По умолчанию 50 записей на страницу
        
        if (offset) {
            offsetInt = parseInt(offset);
        }
        
        if (limit) {
            limitInt = parseInt(limit);
        }
        
        // Обрезаем результаты для пагинации
        responses = responses.slice(offsetInt, offsetInt + limitInt);
        
        // Возвращаем результат с метаданными для пагинации
        res.json({
            responses: responses,
            total: totalItems,
            offset: offsetInt,
            limit: limitInt,
            hasMore: offsetInt + limitInt < totalItems
        });
    } catch (error) {
        logger.error('Error reading responses:', error);
        res.status(500).json({ error: 'Failed to read responses' });
    }
});

// API для сохранения нового ответа
app.post('/api/responses', async (req, res) => {
    try {
        const { model, promptName, prompt, inputText, response } = req.body;
        
        if (!model || !prompt || !inputText || !response) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        const data = await readResponses();
        
        // Добавляем новую запись в историю
        const tokens = buildTokensInfo({
            usage: null,
            promptText: prompt,
            inputTextUsed: inputText,
            modelResponse: response
        });
        const newResponse = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            model,
            promptName,
            prompt,
            inputText,
            response,
            tokens
        };
        
        data.responses.push(newResponse);
        await writeResponses(data);
        
        res.json({ message: 'Response saved successfully', id: newResponse.id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save response' });
    }
});

// API для удаления записи из истории
app.delete('/api/responses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readResponses();
        
        const responseIndex = data.responses.findIndex(r => r.id === id);
        if (responseIndex === -1) {
            return res.status(404).json({ error: 'Response not found' });
        }
        
        data.responses.splice(responseIndex, 1);
        await writeResponses(data);
        
        res.json({ message: 'Response deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete response' });
    }
});

// Initialize prompts file if it doesn't exist
async function initializePromptsFile() {
    try {
        await fsPromises.access(PROMPTS_FILE);
    } catch {
        logger.info('Файл prompts.json не найден.');
        // Пытаемся скопировать из дефолтного файла
        try {
            await fsPromises.access(PROMPTS_DEFAULTS_FILE);
            logger.info('Создаем prompts.json из шаблона prompts.defaults.json');
            await fsPromises.copyFile(PROMPTS_DEFAULTS_FILE, PROMPTS_FILE);
        } catch (err) {
            logger.warn('Файл prompts.defaults.json не найден, создаем пустой список промптов.');
            await fsPromises.writeFile(PROMPTS_FILE, JSON.stringify({ prompts: [] }));
        }
    }
}

// Read prompts from file
async function readPrompts() {
    try {
        const data = await fsPromises.readFile(PROMPTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error('Error reading prompts:', error);
        return { prompts: [] };
    }
}

// Write prompts to file
async function writePrompts(prompts) {
    await fsPromises.writeFile(PROMPTS_FILE, JSON.stringify(prompts, null, 2));
}

// Initialize prompts file on startup
initializePromptsFile();

// Get all prompts
app.get('/api/prompts', async (req, res) => {
    try {
        const data = await readPrompts();
        res.json(data.prompts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read prompts' });
    }
});

// Add new prompt
app.post('/api/prompts', async (req, res) => {
    try {
        const { name, text } = req.body;
        if (!name || !text) {
            return res.status(400).json({ error: 'Name and text are required' });
        }

        const data = await readPrompts();
        const exists = data.prompts.some(p => p.name === name);
        if (exists) {
            return res.status(400).json({ error: 'Prompt with this name already exists' });
        }

        data.prompts.push({ name, text });
        await writePrompts(data);
        res.json({ message: 'Prompt added successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add prompt' });
    }
});

// Update prompt
app.put('/api/prompts/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const data = await readPrompts();
        const promptIndex = data.prompts.findIndex(p => p.name === name);
        if (promptIndex === -1) {
            return res.status(404).json({ error: 'Prompt not found' });
        }

        data.prompts[promptIndex].text = text;
        await writePrompts(data);
        res.json({ message: 'Prompt updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update prompt' });
    }
});

// Delete prompt
app.delete('/api/prompts/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const data = await readPrompts();
        const promptIndex = data.prompts.findIndex(p => p.name === name);
        if (promptIndex === -1) {
            return res.status(404).json({ error: 'Prompt not found' });
        }

        data.prompts.splice(promptIndex, 1);
        await writePrompts(data);
        res.json({ message: 'Prompt deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete prompt' });
    }
});

// Добавляем глобальные переменные для хранения отладочной информации
let lastRagDebugInfo = {
  ragEnabled: false,
  finalInputText: "",
  ragInfo: null,
  timestamp: null
};

// Функция-хелпер для разрешения имени модели
// Поддерживает:
// - Базовые типы: CHEAP, FAST, RICH (из config.defaultModels)
// - Произвольные user_type: MY_FAST_EXPENSIVE и т.д. (из available-models.json)
// - Прямое имя модели
async function resolveModelName(modelInput, providerInput) {
  let resolvedModel = modelInput;
  let resolvedProvider = providerInput;
  
  // Если модель не указана, используем CHEAP по умолчанию
  if (!modelInput || modelInput.trim() === '') {
    logger.info('⚙️ Модель не указана, используется CHEAP по умолчанию');
    // Сначала ищем CHEAP в user_type
    try {
      const allModels = await loadModels();
      const cheapModel = allModels.find(m => m.user_type === 'CHEAP' && m.enabled);
      if (cheapModel) {
        return { model: cheapModel.name, provider: cheapModel.provider, wasResolved: true, resolvedType: 'cheap', modelData: cheapModel };
      }
    } catch (err) { /* fallback to config */ }
    // Fallback на config
    resolvedModel = config.defaultModels.cheap.model;
    resolvedProvider = providerInput || config.defaultModels.cheap.provider;
    return { model: resolvedModel, provider: resolvedProvider, wasResolved: true, resolvedType: 'cheap' };
  }
  
  const modelUpper = modelInput.trim().toUpperCase();
  
  // 1. ПРИОРИТЕТ: Ищем по user_type в базе моделей (включая CHEAP/FAST/RICH)
  try {
    const allModels = await loadModels();
    const modelByUserType = allModels.find(m => m.user_type && m.user_type.toUpperCase() === modelUpper && m.enabled);
    
    if (modelByUserType) {
      logger.info(`⚙️ user_type "${modelUpper}" найден → модель: ${modelByUserType.name} (${modelByUserType.provider})`);
      // user_type имеет АБСОЛЮТНЫЙ приоритет - игнорируем providerInput
      return { 
        model: modelByUserType.name, 
        provider: modelByUserType.provider,  // ВСЕГДА берём из модели
        wasResolved: true, 
        resolvedType: modelUpper,
        modelData: modelByUserType,
        userTypeMatch: true  // флаг что это match по user_type
      };
    }
  } catch (err) {
    logger.error('⚠️ Ошибка при поиске модели по user_type:', err.message);
  }
  
  // 2. FALLBACK: Базовые типы из config.defaultModels (если user_type не назначен в базе)
  if (['CHEAP', 'FAST', 'RICH'].includes(modelUpper)) {
    const modelType = modelUpper.toLowerCase();
    resolvedModel = config.defaultModels[modelType].model;
    resolvedProvider = providerInput || config.defaultModels[modelType].provider;
    logger.info(`⚙️ Базовый тип "${modelUpper}" (fallback config) → модель: ${resolvedModel} (${resolvedProvider})`);
    return { model: resolvedModel, provider: resolvedProvider, wasResolved: true, resolvedType: modelType };
  }
  
  // 3. Если это обычное имя модели, возвращаем как есть
  return { model: resolvedModel, provider: resolvedProvider, wasResolved: false };
}

// Функция для получения модели по имени из available-models.json
async function getModelByName(modelName) {
  try {
    const models = await loadModels();
    return models.find(m => m.name === modelName || m.id === modelName);
  } catch (error) {
    logger.error('Ошибка при поиске модели:', error);
    return null;
  }
}

// Функция для получения безопасного maxTokens с учётом context модели
// Если context известен — используем его минус запас (20%), но не меньше 1024
// Если неизвестен — fallback на DEFAULT_MAX_TOKENS
const DEFAULT_MAX_TOKENS = 4096;

function getSafeMaxTokens(requestedMaxTokens, modelContext) {
  // Если context модели известен, ограничиваем
  if (modelContext && modelContext > 0) {
    // Резервируем 20% на input токены, минимум 1024 output
    const safeLimit = Math.max(1024, Math.floor(modelContext * 0.8));
    
    if (requestedMaxTokens !== undefined) {
      // Пользователь запросил конкретное значение — ограничиваем до safeLimit
      return Math.min(requestedMaxTokens, safeLimit);
    }
    // Дефолт — либо safeLimit, либо DEFAULT_MAX_TOKENS (что меньше)
    return Math.min(DEFAULT_MAX_TOKENS, safeLimit);
  }
  
  // Context неизвестен — используем запрошенное или дефолт
  return requestedMaxTokens !== undefined ? requestedMaxTokens : DEFAULT_MAX_TOKENS;
}

// Простая обертка для OpenRouter (для совместимости с кодом пользователя)
const openRouterService = {
  async sendRequest({ model, messages, temperature = 0.7, maxTokens = 1024 }) {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens
    }, {
      headers: {
        'Authorization': `Bearer ${config.openRouterKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      data: {
        choices: response.data.choices,
        model: response.data.model,
        usage: response.data.usage
      }
    };
  }
};

// Маршрут для прямой обработки запросов к AI моделям с поддержкой GROQ
app.post('/api/send-request', async (req, res) => {
    logger.info('[SERVER] ========================================');
    logger.info('[SERVER] /api/send-request запрос получен');
    logger.info('[SERVER] Timestamp:', new Date().toISOString());
    logger.info('[SERVER] Request headers:', {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']?.substring(0, 50) + '...'
    });
    
    try {
      let { model, prompt, inputText, useRag, contextCode, saveResponse = false, provider, temperature, maxTokens } = req.body;
      
      logger.info('[SERVER] Request body получен');
      logger.info('[SERVER] DEBUG SERVER: Received request with parameters:');
      logger.info('[SERVER] DEBUG SERVER: model =', model);
      logger.info('[SERVER] DEBUG SERVER: provider =', provider);
      logger.info('[SERVER] DEBUG SERVER: useRag =', useRag);
      logger.info('[SERVER] DEBUG SERVER: contextCode =', contextCode);
      logger.info('[SERVER] DEBUG SERVER: prompt length =', prompt?.length || 0);
      logger.info('[SERVER] DEBUG SERVER: inputText length =', inputText?.length || 0);
      
      if (!prompt || !inputText) {
        logger.error('[SERVER] Ошибка валидации: prompt или inputText отсутствуют');
        return res.status(400).json({ error: 'Поля prompt и inputText обязательны' });
      }
      
      // Разрешаем имя модели (может быть CHEAP/FAST/RICH, произвольный user_type или пусто)
      const resolved = await resolveModelName(model, provider);
      model = resolved.model;
      let selectedProvider = resolved.provider;
      
      // Получаем данные модели для определения провайдера и параметров
      // Используем modelData из resolveModelName, если он есть (для моделей найденных по user_type)
      const modelData = resolved.modelData || await getModelByName(model);
      
      // Определяем провайдера автоматически по модели, если не был указан
      if (!selectedProvider) {
        selectedProvider = modelData?.provider || 'openroute';
      }
      
      logger.info(`📡 Используем провайдера: ${selectedProvider} для модели: ${model}`);
      
      // Проверяем доступность провайдера
      if (selectedProvider === 'groq' && !groqService) {
        return res.status(500).json({ error: 'GROQ сервис не настроен' });
      }
      
      if (selectedProvider === 'openroute' && !config.openRouterKey) {
        return res.status(500).json({ error: 'OpenRoute API ключ не настроен' });
      }
      
      if (selectedProvider === 'direct' && !modelData) {
        return res.status(500).json({ error: 'Модель не найдена в available-models.json' });
      }
      
      if (selectedProvider === 'gigachat' && !gigachatService) {
        return res.status(500).json({ error: 'GigaChat сервис не настроен. Добавьте GIGACHAT_AUTH_DATA в .env' });
      }
      
      let finalInputText = inputText;
      let ragInfo = null;
      
      // Если включен RAG и сервис доступен, обогащаем запрос контекстом из RAG
      if (useRag && config.langchainPg.enabled) {
        try {
          logger.info(`Using RAG with context code: ${contextCode || 'all'}`);
          const ragResponse = await langchainPgService.askQuestion(inputText, contextCode, true);
          
          // Если есть документы, добавляем их контекст к запросу
          if (ragResponse.documents && ragResponse.documents.length > 0) {
            const context = ragResponse.documents.map(doc => doc.pageContent).join('\n\n');
            finalInputText = `Контекст из базы знаний:\n${context}\n\nВопрос пользователя: ${inputText}`;
            
            // Сохраняем информацию о RAG для ответа
            ragInfo = {
              used: true,
              contextCode: ragResponse.contextCode,
              documentsCount: ragResponse.documents.length,
              sources: ragResponse.documents.map(doc => ({
                filename: doc.metadata.filename,
                source: doc.metadata.source,
                contextCode: doc.metadata.contextCode
              }))
            };
          }
          else {
            logger.info('!!! No documents found in RAG response');
          }
    
        } catch (ragError) {
          logger.error('Error using RAG:', ragError);
          // Продолжаем без RAG в случае ошибки
        }
      }
      else {
        logger.info('!!! Without RAGs');
      }

      // Сохраняем отладочную информацию
      lastRagDebugInfo = {
        ragEnabled: useRag && config.langchainPg.enabled,
        finalInputText: finalInputText,
        ragInfo: ragInfo,
        timestamp: new Date().toISOString()
      };

      // Формируем messages для всех провайдеров
      const messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: finalInputText }
      ];
      
      // Устанавливаем значения по умолчанию для temperature и maxTokens
      const finalTemperature = temperature !== undefined ? temperature : 0.7;
      // Получаем context модели для безопасного ограничения maxTokens
      const modelContext = modelData?.context || null;
      const finalMaxTokens = getSafeMaxTokens(maxTokens, modelContext);
      
      // Детальное логирование для отладки (особенно для direct провайдера)
      if (selectedProvider === 'direct') {
        logger.info('🔍 DEBUG DIRECT: Исходные данные запроса:');
        logger.info('  model:', model);
        logger.info('  prompt:', prompt);
        logger.info('  inputText:', inputText);
        logger.info('  provider:', selectedProvider);
        logger.info('  temperature:', temperature, '->', finalTemperature);
        logger.info('  maxTokens:', maxTokens, '->', finalMaxTokens);
        logger.info('  finalInputText (после RAG):', finalInputText);
      }
      
      let response;
      
      logger.info('[SERVER] Готовимся отправить запрос к провайдеру:', selectedProvider);
      logger.info('[SERVER] Messages подготовлены, количество:', messages.length);
      
      // Отправляем запрос в зависимости от провайдера
      if (selectedProvider === 'groq') {
        logger.info('[SERVER] Отправка запроса в GROQ...');
        const groqResponse = await groqService.sendRequest({ 
          model, 
          messages, 
          temperature: finalTemperature, 
          maxTokens: finalMaxTokens 
        });
        
        logger.info('[SERVER] Ответ от GROQ получен');
        
        response = {
          data: {
            choices: [{
              message: { content: groqResponse.content }
            }],
            model: groqResponse.model,
            usage: groqResponse.usage
          }
        };
        
      } else if (selectedProvider === 'openroute') {
        logger.info('[SERVER] Отправка запроса в OpenRouter...');
        response = await openRouterService.sendRequest({ 
          model, 
          messages, 
          temperature: finalTemperature, 
          maxTokens: finalMaxTokens 
        });
        logger.info('[SERVER] Ответ от OpenRouter получен');
        
      } else if (selectedProvider === 'direct') {
        logger.info('[SERVER] Отправка запроса через Direct провайдер...');
        // Получаем API ключ из env или из модели
        let apiKey = modelData.api_key;
        let envVar = null;
        
        if (typeof apiKey === 'string' && apiKey.startsWith('env:')) {
          envVar = apiKey.slice(4);
          apiKey = process.env[envVar];
          if (!apiKey) {
            const errorMsg = `Переменная окружения "${envVar}" не найдена для провайдера 'direct'. Проверьте .env файл.`;
            logger.error(`❌ ${errorMsg}`);
            // Логируем в файл, если есть логгер, иначе просто в консоль
            // fs.appendFileSync('error.log', `${new Date().toISOString()} - ${errorMsg}\n`); // Раскомментируй, если нужно в файл
            throw new Error(errorMsg);
          }
        } else {
          apiKey = process.env[`${selectedProvider.toUpperCase()}_API_KEY`] || apiKey;
          if (!apiKey) {
            const errorMsg = `API ключ не найден: ни в модели, ни в env как "${selectedProvider.toUpperCase()}_API_KEY".`;
            logger.error(`❌ ${errorMsg}`);
            throw new Error(errorMsg);
          }
        }
        
        const baseUrl = modelData.base_url;
        
        logger.info('🔍 DEBUG DIRECT: Данные модели из available-models.json:', {
          model: model,
          modelData: modelData,
          apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'не найден',
          baseUrl: baseUrl
        });
        
        if (!baseUrl) {
          const errorMsg = `Base URL не найден для провайдера 'direct' в модели.`;
          logger.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        logger.info('🔍 DEBUG DIRECT: Формируем messages:', JSON.stringify(messages, null, 2));
        logger.info('🔍 DEBUG DIRECT: Параметры запроса:', {
          model: model,
          temperature: finalTemperature,
          maxTokens: finalMaxTokens
        });
        
        const directService = new DirectService(apiKey, baseUrl);
        const directResponse = await directService.sendRequest({ 
          model, 
          messages, 
          temperature: finalTemperature, 
          maxTokens: finalMaxTokens 
        });
        
        logger.info('[SERVER] Ответ от Direct провайдера получен');
        
        response = {
          data: {
            choices: [{
              message: { content: directResponse.content }
            }],
            model: directResponse.model,
            usage: directResponse.usage
          }
        };
        
      } else if (selectedProvider === 'gigachat') {
        logger.info('[SERVER] Отправка запроса в GigaChat...');
        const gigachatResponse = await gigachatService.sendRequest({
          model,
          messages,
          temperature: finalTemperature,
          maxTokens: finalMaxTokens
        });
        
        logger.info('[SERVER] Ответ от GigaChat получен');
        
        response = {
          data: {
            choices: [{
              message: { content: gigachatResponse.content }
            }],
            model: gigachatResponse.model,
            usage: gigachatResponse.usage
          }
        };
        
      } else {
        logger.error('[SERVER] Неизвестный провайдер:', selectedProvider);
        throw new Error(`Неизвестный провайдер: ${selectedProvider}`);
      }
      
      // Обработка ответа (унифицированная)
      logger.info('[SERVER] Ответ от провайдера получен');
      logger.info('[SERVER] Проверка структуры ответа...');
      
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const modelResponse = response.data.choices[0].message.content;
        
        logger.info('[SERVER] ✅ Ответ валиден, содержимое получено');
        logger.info(`[SERVER] ${selectedProvider.toUpperCase()}: Получен ответ:`, modelResponse.substring(0, 200) + '...');
        logger.info(`[SERVER] 📊 ${selectedProvider.toUpperCase()}: Usage:`, response.data.usage);
        logger.info(`[SERVER] 🤖 ${selectedProvider.toUpperCase()}: Model:`, response.data.model);
        logger.info(`[SERVER] Длина ответа: ${modelResponse.length} символов`);
        
        // Всегда сохраняем ответ в историю
        try {
            logger.info('[SERVER] Попытка сохранить ответ в историю...');
            const responseData = await readResponses();
            const tokens = buildTokensInfo({
                usage: response.data.usage,
                promptText: prompt,
                inputTextUsed: finalInputText,
                modelResponse: modelResponse
            });
            const newResponse = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                model,
                provider: selectedProvider,
                prompt,
                inputText,
                response: modelResponse,
                tokens,
                autoSaved: !saveResponse // Помечаем автоматически сохраненные
            };
            responseData.responses.push(newResponse);
            await writeResponses(responseData);
            logger.info(`[SERVER] 💾 Ответ автоматически сохранен в историю: ${newResponse.id}`);
        } catch (error) {
            logger.error('[SERVER] ❌ Ошибка сохранения в историю:', error);
        }

        logger.info('[SERVER] Отправка успешного ответа клиенту...');
        const responseToClient = {
          success: true, 
          content: modelResponse,
          model: response.data.model,
          usage: response.data.usage,
          provider: selectedProvider,
          rag: ragInfo
        };
        logger.info('[SERVER] Response to client keys:', Object.keys(responseToClient));
        logger.info('[SERVER] ========================================');
        
        return res.json(responseToClient);
      } else {
        logger.error('[SERVER] ❌ Невалидный ответ от провайдера - нет choices');
        logger.error('[SERVER] Response structure:', JSON.stringify(response, null, 2).substring(0, 500));
        
        // Сохраняем ошибку невалидного ответа в историю
        try {
          const responseData = await readResponses();
          const newResponse = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            model: req.body.model || 'unknown',
            provider: selectedProvider,
            prompt: req.body.prompt || '--',
            inputText: req.body.inputText || '',
            response: `ERROR: Invalid response from AI model - no choices in response`,
            tokens: {
              input: 0,
              output: 0,
              total: 0,
              source: 'error'
            },
            autoSaved: true,
            errorDetails: response.data
          };
          
          responseData.responses.push(newResponse);
          await writeResponses(responseData);
          logger.info(`[SERVER] 💾 Ошибка невалидного ответа сохранена в историю: ${newResponse.id}`);
        } catch (saveError) {
          logger.error('[SERVER] ❌ Ошибка сохранения ошибки в историю:', saveError);
        }
        
        logger.error('[SERVER] Отправка ответа с ошибкой клиенту');
        logger.error('[SERVER] ========================================');
        
        return res.status(500).json({ 
          error: 'Invalid response from AI model',
          provider: selectedProvider,
          data: response.data 
        });
      }
    } catch (error) {
      logger.error('[SERVER] ========================================');
      logger.error('[SERVER] ❌ ОШИБКА в /api/send-request');
      logger.error('[SERVER] Error name:', error.name);
      logger.error('[SERVER] Error message:', error.message);
      logger.error(`[SERVER] Error with provider:`, error);
      
      if (error.stack) {
        logger.error('[SERVER] Error stack:', error.stack.substring(0, 500));
      }
      
      let errorMessage = 'Failed to process request';
      let errorDetails = null;
      
      if (error.response) {
        logger.error('[SERVER] Ошибка API ответа');
        logger.error('[SERVER] Response status:', error.response.status);
        logger.error('[SERVER] Response data:', JSON.stringify(error.response.data, null, 2).substring(0, 500));
        
        // Улучшенная обработка ошибок API
        let apiError = error.response.data.error;
        let detailedMessage = '';

        if (apiError && typeof apiError === 'object' && apiError.message) {
            detailedMessage = apiError.message; // OpenRouter/Groq style error
        } else if (typeof apiError === 'string') {
            detailedMessage = apiError; // Simple string error
        } else {
            detailedMessage = error.response.statusText; // Fallback
        }

        // Кастомное сообщение для неподдерживаемых моделей
        if (error.response.status === 404 && detailedMessage.includes('No endpoints found')) {
            const { model, provider } = req.body;
            let finalProvider = provider;
            if (!finalProvider) {
                const modelConfig = config.availableModels.find(m => m.name === model);
                finalProvider = modelConfig?.provider || 'openroute';
            }
            errorMessage = `Модель '${model}' не найдена или не поддерживается провайдером '${finalProvider}'. Проверьте имя модели или выберите другую.`;
        } else {
            errorMessage = `API Error: ${error.response.status} - ${detailedMessage}`;
        }
        
        errorDetails = error.response.data;
      } else if (error.request) {
        logger.error('[SERVER] Ошибка сети - запрос не доставлен');
        errorMessage = 'Network error. Could not connect to AI service.';
        errorDetails = { request: error.request };
      } else {
        logger.error('[SERVER] Другая ошибка:', error.message);
        errorMessage = error.message;
        errorDetails = { stack: error.stack };
      }
      
      // Сохраняем ошибку в историю
      try {
        logger.info('[SERVER] Попытка сохранить ошибку в историю...');
        const responseData = await readResponses();
        const newResponse = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          model: req.body.model || 'unknown',
          provider: req.body.provider || 'unknown',
          prompt: req.body.prompt || '--',
          inputText: req.body.inputText || '',
          response: `ERROR: ${errorMessage}`,
          tokens: {
            input: 0,
            output: 0,
            total: 0,
            source: 'error'
          },
          autoSaved: true,
          errorDetails: errorDetails
        };
        
        responseData.responses.push(newResponse);
        await writeResponses(responseData);
        logger.info(`[SERVER] 💾 Ошибка сохранена в историю: ${newResponse.id}`);
      } catch (saveError) {
        logger.error('[SERVER] ❌ Ошибка сохранения ошибки в историю:', saveError);
      }
      
      logger.error('[SERVER] Отправка ответа с ошибкой клиенту');
      logger.error('[SERVER] ========================================');
      
      return res.status(500).json({ 
        error: errorMessage,
        details: errorDetails
      });
    }
  });
  
// Добавьте этот маршрут в server.js после маршрута /api/send-request

// Маршрут для обработки запросов к AI моделям с выбором промпта по имени
app.post('/api/send-request-sys', async (req, res) => {
    try {
      let { model, prompt_name, inputText, saveResponse = true, provider } = req.body;
      
      if (!prompt_name || !inputText) {
        return res.status(400).json({ error: 'Поля prompt_name и inputText обязательны' });
      }
      
      // Разрешаем имя модели (может быть CHEAP/FAST/RICH, произвольный user_type или пусто)
      const resolved = await resolveModelName(model, provider);
      model = resolved.model;
      const selectedProvider = resolved.provider;
      
      // Проверяем API ключ для соответствующего провайдера
      if (selectedProvider === 'groq' && !config.groqKey) {
        return res.status(500).json({ error: 'GROQ API ключ не настроен' });
      }
      
      if (selectedProvider === 'openroute' && !config.openRouterKey) {
        return res.status(500).json({ error: 'OpenRouter API ключ не настроен' });
      }
      
      // Загружаем все промпты
      const promptsData = await readPrompts();
      
      // Ищем запрошенный промпт по имени
      const promptObj = promptsData.prompts.find(p => p.name === prompt_name);
      if (!promptObj) {
        return res.status(404).json({ error: `Prompt with name "${prompt_name}" not found` });
      }
      
      // Логируем информацию о запросе
      logger.info(`📤 Отправка запроса с промптом "${prompt_name}" к модели: ${model} (${selectedProvider})`);
      
      let response;
      
      // Отправляем запрос в зависимости от провайдера
      if (selectedProvider === 'groq') {
        // Используем GROQ
        const messages = [
          { role: 'system', content: promptObj.text },
          { role: 'user', content: inputText }
        ];
        
        const groqResponse = await groqService.sendRequest({
          model,
          messages,
          temperature: 0.7,
          maxTokens: 1024
        });
        
        response = {
          data: {
            choices: [{
              message: { content: groqResponse.content }
            }],
            model: groqResponse.model,
            usage: groqResponse.usage
          }
        };
        
      } else {
        // Используем OpenRoute
        response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: model,
          messages: [
            { role: 'system', content: promptObj.text },
            { role: 'user', content: inputText }
          ]
        }, {
          headers: {
            'Authorization': `Bearer ${config.openRouterKey}`,
            'Content-Type': 'application/json'
          }
        });
      }
      
      // Проверяем и возвращаем результат
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const modelResponse = response.data.choices[0].message.content;
        logger.info('DEBUG SERVER: Model response via /api/send-request-sys:', modelResponse.substring(0, 500) + (modelResponse.length > 500 ? '...' : ''));
        logger.info('DEBUG SERVER: Usage via /api/send-request-sys:', response.data.usage);
        logger.info('DEBUG SERVER: Model used via /api/send-request-sys:', response.data.model);
        logger.info('DEBUG SERVER: Prompt used:', prompt_name);

        // Всегда сохраняем ответ в историю
        try {
          // Создаем новую запись в истории
          const responseData = await readResponses();
          const tokens = buildTokensInfo({
            usage: response.data.usage,
            promptText: promptObj.text,
            inputTextUsed: inputText,
            modelResponse: modelResponse
          });
          
          const newResponse = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            model: model,
            promptName: prompt_name,
            prompt: promptObj.text,
            inputText: inputText,
            response: modelResponse,
            tokens,
            autoSaved: !saveResponse // Помечаем автоматически сохраненные
          };
          
          responseData.responses.push(newResponse);
          await writeResponses(responseData);
          
          logger.info(`Response automatically saved to history with ID: ${newResponse.id}`);
        } catch (error) {
          logger.error('Error saving response to history:', error);
          // Продолжаем выполнение даже при ошибке сохранения в историю
        }
        
        return res.json({ 
          success: true, 
          content: modelResponse,
          model: response.data.model,
          usage: response.data.usage,
          prompt_used: {
            name: prompt_name,
            text: promptObj.text
          }
        });
      } else {
        logger.info('DEBUG SERVER: Invalid response structure from AI model via /api/send-request-sys:', response.data);
        
        // Сохраняем ошибку невалидного ответа в историю
        try {
          const responseData = await readResponses();
          
          // Получаем промпт для сохранения
          let promptText = '--';
          let promptName = req.body.prompt_name || '--';
          try {
            const promptsData = await readPrompts();
            const promptObj = promptsData.prompts.find(p => p.name === promptName);
            if (promptObj) {
              promptText = promptObj.text;
            }
          } catch (e) {
            logger.error('Error reading prompt for error save:', e);
          }
          
          const newResponse = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            model: req.body.model || 'unknown',
            provider: req.body.provider || 'unknown',
            promptName: promptName,
            prompt: promptText,
            inputText: req.body.inputText || '',
            response: `ERROR: Invalid response from AI model - no choices in response`,
            tokens: {
              input: 0,
              output: 0,
              total: 0,
              source: 'error'
            },
            autoSaved: true,
            errorDetails: response.data
          };
          
          responseData.responses.push(newResponse);
          await writeResponses(responseData);
          logger.info(`💾 Ошибка невалидного ответа сохранена в историю: ${newResponse.id}`);
        } catch (saveError) {
          logger.error('❌ Ошибка сохранения ошибки в историю:', saveError);
        }
        
        return res.status(500).json({ 
          error: 'Invalid response from AI model',
          data: response.data 
        });
      }
    } catch (error) {
      logger.error('Error sending request to AI model:', error);
      
      // Форматируем ошибку для клиента и логируем детали
      let errorMessage = 'Failed to process request';
      let errorDetails = null;
      
      if (error.response) {
        // Ошибка от OpenRouter API
        // Улучшенная обработка ошибок API
        let apiError = error.response.data.error;
        let detailedMessage = '';

        if (apiError && typeof apiError === 'object' && apiError.message) {
            detailedMessage = apiError.message;
        } else if (typeof apiError === 'string') {
            detailedMessage = apiError;
        } else {
            detailedMessage = error.response.statusText;
        }
        
      errorMessage = `API Error: ${error.response.status} - ${detailedMessage}`;
      errorDetails = error.response.data;
      logger.info('DEBUG SERVER: API error details via /api/send-request-sys:', {
          status: error.response.status,
          data: error.response.data
        });
      } else if (error.request) {
        // Ошибка сети
        errorMessage = 'Network error. Could not connect to AI service.';
        errorDetails = { request: error.request };
        logger.info('DEBUG SERVER: Network error via /api/send-request-sys - no response received');
      } else {
        errorMessage = error.message;
        errorDetails = { stack: error.stack };
        logger.info('DEBUG SERVER: General error via /api/send-request-sys:', error.message, error.stack);
      }
      
      // Сохраняем ошибку в историю
      try {
        const responseData = await readResponses();
        
        // Получаем промпт для сохранения
        let promptText = '--';
        let promptName = req.body.prompt_name || '--';
        try {
          const promptsData = await readPrompts();
          const promptObj = promptsData.prompts.find(p => p.name === promptName);
          if (promptObj) {
            promptText = promptObj.text;
          }
        } catch (e) {
          logger.error('Error reading prompt for error save:', e);
        }
        
        const newResponse = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          model: req.body.model || 'unknown',
          provider: req.body.provider || 'unknown',
          promptName: promptName,
          prompt: promptText,
          inputText: req.body.inputText || '',
          response: `ERROR: ${errorMessage}`,
          tokens: {
            input: 0,
            output: 0,
            total: 0,
            source: 'error'
          },
          autoSaved: true,
          errorDetails: errorDetails
        };
        
        responseData.responses.push(newResponse);
        await writeResponses(responseData);
        logger.info(`💾 Ошибка сохранена в историю: ${newResponse.id}`);
      } catch (saveError) {
        logger.error('❌ Ошибка сохранения ошибки в историю:', saveError);
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        details: errorDetails
      });
    }
  });
  
  // Добавим вспомогательный маршрут для получения доступных системных промптов
  app.get('/api/available-prompts', async (req, res) => {
    try {
      const promptsData = await readPrompts();
      // Возвращаем полные промпты вместо только имен
      res.json(promptsData.prompts);
    } catch (error) {
      logger.error('Error fetching available prompts:', error);
      res.status(500).json({ error: 'Failed to fetch available prompts' });
    }
  });
  
  
  // Добавим маршрут для проверки доступности API-ключа
  app.get('/api/check-api-key', (req, res) => {
    const isKeyAvailable = !!config.openRouterKey;
    res.json({ 
      isAvailable: isKeyAvailable,
      serviceProvider: 'OpenRouter'
    });
  });

// Добавляем API эндпоинты для работы с langchain-pg

// Получение списка контекстных кодов
app.get('/api/rag/context-codes', async (req, res) => {
  try {
    if (!config.langchainPg.enabled) {
      return res.status(503).json({ error: 'Сервис langchain-pg отключен' });
    }
    
    const contextCodes = await langchainPgService.getContextCodes();
    res.json(contextCodes);
  } catch (error) {
    logger.error('Ошибка при получении контекстных кодов:', error);
    res.status(500).json({ error: 'Не удалось получить контекстные коды' });
  }
});

// Получение списка документов
app.get('/api/rag/documents', async (req, res) => {
  try {
    if (!config.langchainPg.enabled) {
      return res.status(503).json({ error: 'Сервис langchain-pg отключен' });
    }
    
    const documents = await langchainPgService.getDocuments();
    res.json(documents);
  } catch (error) {
    logger.error('Ошибка при получении списка документов:', error);
    res.status(500).json({ error: 'Не удалось получить список документов' });
  }
});

// Запрос к RAG с использованием контекстного кода
app.post('/api/rag/ask', async (req, res) => {
  try {
    if (!config.langchainPg.enabled) {
      return res.status(503).json({ error: 'Сервис langchain-pg отключен' });
    }
    
    const { question, contextCode, showDetails } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Вопрос не указан' });
    }
    
    const response = await langchainPgService.askQuestion(question, contextCode, showDetails);
    res.json(response);
  } catch (error) {
    logger.error('Ошибка при запросе к RAG:', error);
    res.status(500).json({ error: 'Не удалось получить ответ от RAG' });
  }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Маршрут для страницы моделей
app.get('/models.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'models.html'));
});

// Добавляем эндпоинт для получения информации о сервере
app.get('/server-info', (req, res) => {
  const os = require('os');
  
  // Получаем информацию о сервере
  const serverInfo = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    uptime: os.uptime(),
    baseUrl: `http://${req.headers.host}`,
    port: process.env.PORT || '3002',
    appName: 'AI Analytics Interface',
    timestamp: new Date().toISOString()
  };
  
  res.json(serverInfo);
});

// Добавляем новый эндпоинт для получения отладочной информации RAG
app.get('/api/rag/debug-info', (req, res) => {
  res.json(lastRagDebugInfo);
});

// Добавляем API эндпоинт для сохранения файла markdown
app.post('/api/save-markdown', async (req, res) => {
  try {
    const { content, filename, directory } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Содержимое файла не указано' });
    }
    
    // Генерируем имя файла, если оно не указано
    const safeFilename = filename || `response_${new Date().toISOString().replace(/:/g, '-')}.md`;
    
    // Определяем директорию для сохранения
    const saveDir = directory || OUTPUT_DOCS_DIR;
    
    // Создаем директорию, если она не существует
    if (!fs.existsSync(saveDir)) {
      await fsPromises.mkdir(saveDir, { recursive: true });
    }
    
    // Полный путь к файлу
    const filePath = path.join(saveDir, safeFilename);
    
    // Записываем файл
    await fsPromises.writeFile(filePath, content);
    
    res.json({ 
      success: true, 
      filePath, 
      message: `Файл успешно сохранен: ${filePath}` 
    });
  } catch (error) {
    logger.error('Ошибка при сохранении файла:', error);
    res.status(500).json({ 
      error: 'Не удалось сохранить файл', 
      details: error.message 
    });
  }
});

// Добавляем эндпоинт для получения структуры директории OUTPUT_DOCS_DIR
app.get('/api/output-dir-info', (req, res) => {
  try {
    // Базовая информация о настройках
    const dirInfo = {
      outputDir: OUTPUT_DOCS_DIR,
      exists: fs.existsSync(OUTPUT_DOCS_DIR)
    };
    
    // Если директория существует, получаем список файлов
    if (dirInfo.exists) {
      dirInfo.files = fs.readdirSync(OUTPUT_DOCS_DIR)
        .filter(file => file.endsWith('.md'))
        .map(file => ({
          name: file,
          path: path.join(OUTPUT_DOCS_DIR, file),
          size: fs.statSync(path.join(OUTPUT_DOCS_DIR, file)).size
        }));
    }
    
    res.json(dirInfo);
  } catch (error) {
    logger.error('Ошибка при получении информации о директории:', error);
    res.status(500).json({ 
      error: 'Не удалось получить информацию о директории', 
      details: error.message 
    });
  }
});

// Добавляем маршрут /analyze для совместимости с другими клиентами
app.post('/analyze', async (req, res) => {
  try {
    let { model, prompt, inputText, useRag, contextCode, provider } = req.body;
    
    logger.info('DEBUG: Received request to /analyze endpoint with params:', {
      model,
      promptLength: prompt ? prompt.length : 0,
      inputTextLength: inputText ? inputText.length : 0,
      useRag,
      contextCode
    });
    
    if (!prompt || !inputText) {
      return res.status(400).json({ error: 'Поля prompt и inputText обязательны' });
    }
    
    // Разрешаем имя модели (может быть CHEAP/FAST/RICH, произвольный user_type или пусто)
    const resolved = await resolveModelName(model, provider);
    model = resolved.model;
    const selectedProvider = resolved.provider;
    
    // Проверяем API ключ для соответствующего провайдера
    if (selectedProvider === 'groq' && !config.groqKey) {
      return res.status(500).json({ error: 'GROQ API ключ не настроен' });
    }
    
    if (selectedProvider === 'openroute' && !config.openRouterKey) {
      return res.status(500).json({ error: 'OpenRouter API ключ не настроен' });
    }
    
    // Логируем информацию о запросе
    logger.info(`Sending request to model via /analyze: ${model}`);
    
    let finalInputText = inputText;
    let ragInfo = null;
    
    // Если включен RAG и сервис доступен, обогащаем запрос контекстом из RAG
    if (useRag && config.langchainPg.enabled) {
      try {
        logger.info(`Using RAG with context code: ${contextCode || 'all'}`);
        const ragResponse = await langchainPgService.askQuestion(inputText, contextCode, true);
        
        // Если есть документы, добавляем их контекст к запросу
        if (ragResponse.documents && ragResponse.documents.length > 0) {
          const context = ragResponse.documents.map(doc => doc.pageContent).join('\n\n');
          finalInputText = `Контекст из базы знаний:\n${context}\n\nВопрос пользователя: ${inputText}`;
          
          // Сохраняем информацию о RAG для ответа
          ragInfo = {
            used: true,
            contextCode: ragResponse.contextCode,
            documentsCount: ragResponse.documents.length,
            sources: ragResponse.documents.map(doc => ({
              filename: doc.metadata.filename,
              source: doc.metadata.source,
              contextCode: doc.metadata.contextCode
            }))
          };
        }
        else {
          logger.info('!!! No documents found in RAG response');
        }
  
      } catch (ragError) {
        logger.error('Error using RAG:', ragError);
        // Продолжаем без RAG в случае ошибки
      }
    }
    else {
      logger.info('!!! Without RAGs');
    }

    // Сохраняем отладочную информацию
    lastRagDebugInfo = {
      ragEnabled: useRag && config.langchainPg.enabled,
      finalInputText: finalInputText,
      ragInfo: ragInfo,
      timestamp: new Date().toISOString()
    };

    let response;
    
    // Отправляем запрос в зависимости от провайдера
    if (selectedProvider === 'groq') {
      // Используем GROQ
      const messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: finalInputText }
      ];
      
      const groqResponse = await groqService.sendRequest({
        model,
        messages,
        temperature: 0.7,
        maxTokens: 1024
      });
      
      response = {
        data: {
          choices: [{
            message: { content: groqResponse.content }
          }],
          model: groqResponse.model,
          usage: groqResponse.usage
        }
      };
      
    } else {
      // Используем OpenRoute
      response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: finalInputText }
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${config.openRouterKey}`,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Проверяем и возвращаем результат
    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const modelResponse = response.data.choices[0].message.content;
      logger.info('DEBUG SERVER: Model response via /analyze:', modelResponse.substring(0, 500) + (modelResponse.length > 500 ? '...' : ''));
      logger.info('DEBUG SERVER: Usage via /analyze:', response.data.usage);
      logger.info('DEBUG SERVER: Model used via /analyze:', response.data.model);
      
      return res.json({ 
        success: true, 
        content: modelResponse,
        model: response.data.model,
        usage: response.data.usage,
        rag: ragInfo
      });
    } else {
      logger.info('DEBUG SERVER: Invalid response structure from AI model via /analyze:', response.data);
      return res.status(500).json({ 
        error: 'Invalid response from AI model',
        data: response.data 
      });
    }
  } catch (error) {
    logger.error('Error sending request to AI model via /analyze:', error);
    
    // Форматируем ошибку для клиента и логируем детали
    let errorMessage = 'Failed to process request';
    let errorDetails = null;
    
    if (error.response) {
      // Ошибка от OpenRouter API
      // Улучшенная обработка ошибок API
        let apiError = error.response.data.error;
        let detailedMessage = '';

        if (apiError && typeof apiError === 'object' && apiError.message) {
            detailedMessage = apiError.message;
        } else if (typeof apiError === 'string') {
            detailedMessage = apiError;
        } else {
            detailedMessage = error.response.statusText;
        }
        
      errorMessage = `API Error: ${error.response.status} - ${detailedMessage}`;
      errorDetails = error.response.data;
      logger.info('DEBUG SERVER: API error details via /analyze:', {
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.request) {
      // Ошибка сети
      errorMessage = 'Network error. Could not connect to AI service.';
      errorDetails = { request: error.request };
      logger.info('DEBUG SERVER: Network error via /analyze - no response received');
    } else {
      errorMessage = error.message;
      errorDetails = { stack: error.stack };
      logger.info('DEBUG SERVER: General error via /analyze:', error.message, error.stack);
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      details: errorDetails
    });
  }
});

// Добавьте этот маршрут в server.js
app.get('/api/available-models', (req, res) => {
    const models = config.availableModels
        .filter(m => m.showInApi)
        .map(m => m.name);
    res.json(models);
});

// === НОВЫЙ УМНЫЙ СПИСОК МОДЕЛЕЙ ===
app.get('/api/all-models', async (req, res) => {
  try {
    const models = await loadModels();
    res.json(models.filter(m => m.enabled));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Failed to load models' });
  }
});

// === ТЕСТ МОДЕЛИ В ОДИН КЛИК (улучшенная версия) ===
// === ВНУТРЕННЯЯ ФУНКЦИЯ ТЕСТИРОВАНИЯ МОДЕЛИ ===
// Используется как в /api/test-model, так и при валидации user_type моделей при старте
async function testModelInternal(model) {
  const startTime = Date.now();
  let result = {
    success: false,
    response_time_ms: 0,
    sample_response: null,
    error_message: 'Неизвестная ошибка'
  };

  try {
    let apiRes;

    if (model.provider === 'groq') {
      apiRes = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: model.name,
          messages: [{ role: "user", content: "Кто ты? Ответь в одном предложении на русском." }],
          max_tokens: 120,
          temperature: 0
        },
        {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          timeout: 18000
        }
      );
    } else if (model.provider === 'openroute') {
      apiRes = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: model.name,
          messages: [{ role: "user", content: "Кто ты? Ответь в одном предложении на русском." }]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "AI Models Tester"
          },
          timeout: 25000
        }
      );
    } else if (model.provider === 'direct') {
      // Используем DirectService для унификации с /v1/chat/completions
      let apiKey = model.api_key;
      if (typeof apiKey === 'string' && apiKey.startsWith('env:')) {
        const envVar = apiKey.slice(4);
        apiKey = process.env[envVar];
        if (!apiKey) {
          throw new Error(`Переменная окружения ${envVar} не найдена для теста модели`);
        }
      } else {
        apiKey = process.env['ZAI_API_KEY'] || apiKey;
      }
      
      if (!apiKey) {
        throw new Error('Не удалось найти API ключ для теста модели direct');
      }

      const baseUrl = model.base_url || "https://api.z.ai/api/paas/v4";
      const directService = new DirectService(apiKey, baseUrl);
      
      // Унифицированный вызов через DirectService (как в /v1/chat/completions)
      const directResponse = await directService.sendRequest({
        model: model.name,
        messages: [{ role: "user", content: "Кто ты? Ответь в одном предложении на русском." }],
        temperature: 0.7,  // дефолтный
        maxTokens: 120
      });
      
      apiRes = {
        data: {
          choices: [{ message: { content: directResponse.content } }]
        }
      };
    } else if (model.provider === 'gigachat') {
      if (!gigachatService) {
        throw new Error('GigaChat сервис не инициализирован. Добавьте GIGACHAT_AUTH_DATA в .env');
      }
      
      const gcResponse = await gigachatService.sendRequest({
        model: model.name,
        messages: [{ role: "user", content: "Кто ты? Ответь в одном предложении на русском." }],
        temperature: 0,
        maxTokens: 120
      });
      
      apiRes = {
        data: {
          choices: [{ message: { content: gcResponse.content } }]
        }
      };
    } else {
      throw new Error(`Unsupported provider: ${model.provider}`);
    }

    const content = apiRes.data.choices?.[0]?.message?.content?.trim();
    if (content) {
      result.success = true;
      result.sample_response = content;
    } else {
      result.error_message = "Пустой ответ от модели";
    }
  } catch (err) {
    // === Максимально информативная ошибка ===
    if (err.code === 'ECONNABORTED') {
      result.error_message = 'Таймаут — модель не ответила вовремя';
    } else if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      if (status === 429) result.error_message = '429 Too Many Requests — лимит';
      else if (status === 403 || status === 401) result.error_message = '403/401 — нет доступа (ключи/баланс)';
      else if (data?.error?.message) result.error_message = data.error.message;
      else result.error_message = `HTTP ${status}: ${JSON.stringify(data)}`;
    } else {
      result.error_message = err.message || 'Ошибка сети';
    }
  }

  result.response_time_ms = Date.now() - startTime;
  result.timestamp = new Date().toISOString();

  return result;
}

// === ГЛОБАЛЬНОЕ ХРАНИЛИЩЕ РЕЗУЛЬТАТОВ ВАЛИДАЦИИ user_type ===
let lastUserTypeValidation = {
  timestamp: null,
  total: 0,
  passed: [],
  failed: [],
  inProgress: false
};

// === ВАЛИДАЦИЯ МОДЕЛЕЙ С user_type ПРИ СТАРТЕ СЕРВЕРА ===
async function validateUserTypeModelsOnStartup() {
  logger.info('🔍 Проверка моделей с user_type...');
  
  lastUserTypeValidation = {
    timestamp: new Date().toISOString(),
    total: 0,
    passed: [],
    failed: [],
    inProgress: true
  };
  
  try {
    const models = await loadModels();
    const userTypeModels = models.filter(m => m.user_type && m.enabled);
    
    if (userTypeModels.length === 0) {
      logger.warn('⚠️ Нет активных моделей с user_type для проверки');
      lastUserTypeValidation.inProgress = false;
      return;
    }
    
    lastUserTypeValidation.total = userTypeModels.length;
    logger.info(`📋 Найдено ${userTypeModels.length} модел(ей) с user_type: ${userTypeModels.map(m => m.user_type).join(', ')}`);
    
    for (const model of userTypeModels) {
      try {
        logger.info(`🧪 Тестирование [${model.user_type}] → ${model.name} (${model.provider})...`);
        const result = await testModelInternal(model);
        
        const modelInfo = {
          id: model.id,
          user_type: model.user_type,
          name: model.name,
          visible_name: model.visible_name,
          provider: model.provider,
          response_time_ms: result.response_time_ms,
          error_message: result.error_message,
          timestamp: result.timestamp
        };
        
        if (result.success) {
          lastUserTypeValidation.passed.push(modelInfo);
          logger.info(`✅ [${model.user_type}] OK (${result.response_time_ms}ms)`);
        } else {
          lastUserTypeValidation.failed.push(modelInfo);
          logger.error(`❌ [${model.user_type}] ОШИБКА: ${result.error_message}`);
          logger.error(`   Модель: ${model.name}, Провайдер: ${model.provider}, ID: ${model.id}`);
        }
        
        // Сохраняем результат теста в модель
        const allModels = await loadModels();
        const idx = allModels.findIndex(m => m.id === model.id);
        if (idx !== -1) {
          allModels[idx].last_test = result;
          await saveModels(allModels);
        }
      } catch (err) {
        lastUserTypeValidation.failed.push({
          id: model.id,
          user_type: model.user_type,
          name: model.name,
          visible_name: model.visible_name,
          provider: model.provider,
          error_message: `КРИТИЧЕСКАЯ ОШИБКА: ${err.message}`,
          timestamp: new Date().toISOString()
        });
        logger.error(`❌ [${model.user_type}] КРИТИЧЕСКАЯ ОШИБКА: ${err.message}`);
      }
    }
    
    lastUserTypeValidation.inProgress = false;
    
    // Вывод итогового списка
    const passedCount = lastUserTypeValidation.passed.length;
    const failedCount = lastUserTypeValidation.failed.length;
    
    logger.info(`📊 Результаты проверки user_type моделей: ${passedCount} успешно, ${failedCount} с ошибками`);
    
    if (passedCount > 0) {
      logger.info(`✅ ПРОШЛИ ПРОВЕРКУ (${passedCount}):`);
      lastUserTypeValidation.passed.forEach(m => {
        logger.info(`   • [${m.user_type}] ${m.name} (${m.provider}) — ${m.response_time_ms}ms`);
      });
    }
    
    if (failedCount > 0) {
      logger.warn(`❌ НЕ ПРОШЛИ ПРОВЕРКУ (${failedCount}):`);
      lastUserTypeValidation.failed.forEach(m => {
        logger.error(`   • [${m.user_type}] ${m.name} (${m.provider}) — ${m.error_message}`);
      });
      logger.warn(`⚠️ ВНИМАНИЕ: Запросы с этими user_type могут завершаться ошибкой!`);
    }
  } catch (err) {
    lastUserTypeValidation.inProgress = false;
    logger.error(`❌ Ошибка при валидации user_type моделей: ${err.message}`);
  }
}

// === ЭНДПОИНТ ДЛЯ ПОЛУЧЕНИЯ РЕЗУЛЬТАТОВ ВАЛИДАЦИИ user_type ===
app.get('/api/user-type-validation', (req, res) => {
  res.json(lastUserTypeValidation);
});

// === ЭНДПОИНТ ДЛЯ ПОВТОРНОЙ ВАЛИДАЦИИ user_type (вручную) ===
app.post('/api/user-type-validation/rerun', async (req, res) => {
  if (lastUserTypeValidation.inProgress) {
    return res.status(409).json({ error: 'Валидация уже выполняется' });
  }
  
  // Запускаем асинхронно, не блокируя ответ
  validateUserTypeModelsOnStartup();
  
  res.json({ message: 'Валидация запущена', status: 'started' });
});

app.post('/api/test-model', async (req, res) => {
  const { modelId } = req.body;
  if (!modelId) return res.status(400).json({ error: 'modelId required' });

  let models = await loadModels();
  const model = models.find(m => m.id === modelId);
  if (!model) return res.status(404).json({ error: 'Model not found' });

  const result = await testModelInternal(model);

  // Сохраняем
  const idx = models.findIndex(m => m.id === modelId);
  models[idx].last_test = result;
  await saveModels(models);

  res.json({ success: true, result });
});

// === ABOUT МОДЕЛИ — ПОДРОБНАЯ ИНФОРМАЦИЯ О МОДЕЛИ ===
const ABOUT_MODEL_PROMPT = "Привет! Что ты за модель? В чем твоя особенность? В чем твоё преимущество перед другими моделями?";

app.post('/api/about-model', async (req, res) => {
  const { modelId } = req.body;
  if (!modelId) return res.status(400).json({ error: 'modelId required' });

  let models = await loadModels();
  const model = models.find(m => m.id === modelId);
  if (!model) return res.status(404).json({ error: 'Model not found' });

  const startTime = Date.now();
  let result = {
    success: false,
    response_time_ms: 0,
    sample_response: null,
    error_message: 'Неизвестная ошибка'
  };

  try {
    let apiRes;

    if (model.provider === 'groq') {
      apiRes = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: model.name,
          messages: [{ role: "user", content: ABOUT_MODEL_PROMPT }],
          max_tokens: 512,
          temperature: 0.7
        },
        {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          timeout: 30000
        }
      );
    } else if (model.provider === 'openroute') {
      apiRes = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: model.name,
          messages: [{ role: "user", content: ABOUT_MODEL_PROMPT }],
          max_tokens: 512
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "AI Models About"
          },
          timeout: 40000
        }
      );
    } else if (model.provider === 'direct') {
      let apiKey = model.api_key;
      if (typeof apiKey === 'string' && apiKey.startsWith('env:')) {
        const envVar = apiKey.slice(4);
        apiKey = process.env[envVar];
        if (!apiKey) {
          throw new Error(`Переменная окружения ${envVar} не найдена`);
        }
      } else {
        apiKey = process.env['ZAI_API_KEY'] || apiKey;
      }
      
      if (!apiKey) {
        throw new Error('Не удалось найти API ключ для модели direct');
      }

      const baseUrl = model.base_url || "https://api.z.ai/api/paas/v4";
      const modelName = model.name;
      
      apiRes = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: modelName,
          messages: [{ role: "user", content: ABOUT_MODEL_PROMPT }],
          max_tokens: 512
        },
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 90000 }
      );
    } else if (model.provider === 'gigachat') {
      if (!gigachatService) {
        throw new Error('GigaChat сервис не инициализирован. Добавьте GIGACHAT_AUTH_DATA в .env');
      }
      
      const gcResponse = await gigachatService.sendRequest({
        model: model.name,
        messages: [{ role: "user", content: ABOUT_MODEL_PROMPT }],
        temperature: 0.7,
        maxTokens: 512
      });
      
      apiRes = {
        data: {
          choices: [{ message: { content: gcResponse.content } }]
        }
      };
    } else {
      throw new Error(`Unsupported provider: ${model.provider}`);
    }

    const content = apiRes.data.choices?.[0]?.message?.content?.trim();
    if (content) {
      result.success = true;
      result.sample_response = content;
    } else {
      result.error_message = "Пустой ответ от модели";
    }
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      result.error_message = 'Таймаут — модель не ответила вовремя';
    } else if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      if (status === 429) result.error_message = '429 Too Many Requests — лимит';
      else if (status === 403 || status === 401) result.error_message = '403/401 — нет доступа (ключи/баланс)';
      else if (data?.error?.message) result.error_message = data.error.message;
      else result.error_message = `HTTP ${status}: ${JSON.stringify(data)}`;
    } else {
      result.error_message = err.message || 'Ошибка сети';
    }
  }

  result.response_time_ms = Date.now() - startTime;
  result.timestamp = new Date().toISOString();

  // Сохраняем в last_about
  const idx = models.findIndex(m => m.id === modelId);
  models[idx].last_about = result;
  await saveModels(models);

  res.json({ success: true, result });
});

// === НОВЫЙ ЭНДПОИНТ ДЛЯ ОБНОВЛЕНИЯ МОДЕЛИ ===
app.post('/api/models/update/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!id || !updates) {
    return res.status(400).json({ error: 'ID модели и данные для обновления обязательны' });
  }

  try {
    let models = await loadModels();
    const modelIndex = models.findIndex(m => m.id === id);

    if (modelIndex === -1) {
      return res.status(404).json({ error: 'Модель не найдена' });
    }

    // === ОБРАБОТКА user_type (автоматический перенос) ===
    if (updates.user_type !== undefined) {
      const newUserType = updates.user_type ? updates.user_type.trim().toUpperCase() : null;
      
      if (newUserType) {
        // Если этот user_type занят другой моделью - сбрасываем у неё
        const existingModelIndex = models.findIndex(m => 
          m.user_type && 
          m.user_type.toUpperCase() === newUserType && 
          m.id !== id
        );
        
        if (existingModelIndex !== -1) {
          const oldModel = models[existingModelIndex];
          logger.info(`🔄 user_type "${newUserType}" переназначен: ${oldModel.name} → ${models[modelIndex].name}`);
          models[existingModelIndex].user_type = null;
        }
        
        // Нормализуем user_type к верхнему регистру
        updates.user_type = newUserType;
      } else {
        // Если передали пустую строку или null - очищаем user_type
        updates.user_type = null;
      }
    }

    // Обновляем модель, сохраняя существующие поля
    models[modelIndex] = { ...models[modelIndex], ...updates };

    await saveModels(models);
    
    logger.info(`✅ Модель ${id} обновлена:`, updates);

    res.json({ success: true, model: models[modelIndex] });
  } catch (error) {
    logger.error('Ошибка при обновлении модели:', error);
    res.status(500).json({ error: 'Не удалось обновить модель' });
  }
});

// === НОВЫЙ ЭНДПОИНТ ДЛЯ ДОБАВЛЕНИЯ МОДЕЛИ ===
app.post('/api/models/add', async (req, res) => {
  const newModel = req.body;

  if (!newModel || !newModel.id || !newModel.name || !newModel.provider) {
    return res.status(400).json({ error: 'ID, имя и провайдер обязательны для новой модели' });
  }

  try {
    let models = await loadModels();

    const exists = models.some(m => m.id === newModel.id);
    if (exists) {
      return res.status(409).json({ error: 'Модель с таким ID уже существует' });
    }

    // Добавляем поля по умолчанию
    const modelToAdd = {
      enabled: true,
      user_type: null,
      added_at: new Date().toISOString(),
      ...newModel
    };

    models.push(modelToAdd);
    await saveModels(models);

    res.status(201).json({ success: true, model: modelToAdd });
  } catch (error) {
    logger.error('Ошибка при добавлении модели:', error);
    res.status(500).json({ error: 'Не удалось добавить модель' });
  }
});

// === ЭНДПОИНТ ДЛЯ ПОЛУЧЕНИЯ ВСЕХ УНИКАЛЬНЫХ user_type ===
// Возвращает список всех меток user_type, используемых в системе
// Внешние системы могут использовать эти метки для обращения к моделям
app.get('/api/user-types', async (req, res) => {
  try {
    const models = await loadModels();
    // Собираем уникальные user_type, исключая null/undefined
    const types = [...new Set(models.map(m => m.user_type).filter(Boolean))];
    
    // Возвращаем с информацией о связанных моделях
    const typesWithModels = types.map(type => {
      const model = models.find(m => m.user_type === type);
      return {
        user_type: type,
        model_id: model?.id,
        model_name: model?.name,
        visible_name: model?.visible_name,
        provider: model?.provider,
        enabled: model?.enabled
      };
    });
    
    res.json({
      success: true,
      count: types.length,
      types: types,
      details: typesWithModels
    });
  } catch (err) {
    logger.error('Ошибка получения user_types:', err);
    res.status(500).json({ error: 'Failed to load user types' });
  }
});

async function refreshGroqModels() {
  if (!groqService) {
    logger.warn('⚠️ GROQ сервис не настроен, обновление моделей пропущено.');
    return;
  }
  try {
    logger.info('Обновляем список GROQ моделей...');
    const { data } = await axios.get('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }
    });

    let localModels = await loadModels();
    
    const activeRemoteMap = new Map();
    for (const remote of data.data) {
      const internalId = `groq-${remote.id}`;
      activeRemoteMap.set(internalId, remote);
    }

    let addedCount = 0;
    let disabledCount = 0;

    localModels = localModels.map(model => {
      if (model.provider === 'groq') {
        if (!activeRemoteMap.has(model.id)) {
          if (model.enabled) {
            disabledCount++;
            return { ...model, enabled: false };
          }
        }
        return model;
      }
      return model;
    });

    for (const [id, remote] of activeRemoteMap) {
      const exists = localModels.some(m => m.id === id);
      if (!exists) {
        const contextMatch = remote.id.match(/-(\d+)k/i) || remote.id.match(/-(\d{4,5})/);
        const context = contextMatch ? parseInt(contextMatch[1], 10) * (contextMatch[0].toLowerCase().includes('k') ? 1024 : 1) : 8192;

        const newModel = {
          id: id,
          provider: "groq",
          name: remote.id,
          visible_name: `GROQ → ${remote.id}`,
          context: context,
          fast: true,
          user_type: null,
          enabled: true,
          added_at: new Date().toISOString(),
          provider_info: remote // Сохраняем полную информацию от провайдера
        };
        localModels.push(newModel);
        addedCount++;
      }
    }

    await saveModels(localModels);
    logger.info(`GROQ синхронизирован: ${addedCount} новых добавлено, ${disabledCount} устаревших отключено.`);
  } catch (err) {
    logger.error('Ошибка автообновления GROQ:', err.message);
  }
}

async function refreshOpenRouterModels() {
  try {
    logger.info('Обновляем список OpenRouter...');
    const { data } = await axios.get('https://openrouter.ai/api/v1/models');

    let localModels = await loadModels();

    // 1. Собираем Map актуальных бесплатных моделей из API
    // Ключ - наш внутренний ID, Значение - данные API
    const activeRemoteMap = new Map();

    for (const remote of data.data) {
      // Критерий "бесплатности"
      if (remote.id.includes(':free') || remote.id.includes('-free') || remote.id.endsWith(':free')) {
        // Генерируем ID так же, как это делалось раньше для совместимости
        const internalId = `or-${remote.id.replace(/:/g, '-')}`;
        activeRemoteMap.set(internalId, remote);
      }
    }

    let addedCount = 0;
    let disabledCount = 0;

    // 2. Обновляем существующие локальные модели
    localModels = localModels.map(model => {
      // Нас интересуют только модели OpenRouter
      if (model.provider === 'openroute') {
        // Если модели нет в актуальном бесплатном списке
        if (!activeRemoteMap.has(model.id)) {
          // Если она была включена - выключаем
          if (model.enabled) {
            disabledCount++;
            return { ...model, enabled: false };
          }
        }
        // Если модель есть в списке - НЕ ТРОГАЕМ ЕЁ (сохраняем ручные настройки)
        return model;
      }
      // Модели других провайдеров не трогаем
      return model;
    });

    // 3. Добавляем новые модели, которых еще нет локально
    for (const [id, remote] of activeRemoteMap) {
      const exists = localModels.some(m => m.id === id);
      if (!exists) {
        const newModel = {
          id: id,
          provider: "openroute",
          name: remote.id,
          visible_name: `OpenRouter → ${remote.name || remote.id}`,
          context: remote.context_length || 32768,
          user_type: null,
          enabled: true,
          free: true,
          added_at: new Date().toISOString(),
          provider_info: remote // Сохраняем полную информацию от провайдера
        };
        localModels.push(newModel);
        addedCount++;
      }
    }

    await saveModels(localModels);
    logger.info(`OpenRouter синхронизирован: ${addedCount} новых добавлено, ${disabledCount} устаревших отключено.`);
  } catch (err) {
    logger.error('Ошибка автообновления OpenRouter:', err.message);
  }
}

async function refreshDirectModels() {
  try {
    logger.info('Обновляем список Direct моделей...');
    
    let localModels = await loadModels();
    
    // 1. Находим все модели с provider: "direct"
    const directModels = localModels.filter(m => m.provider === 'direct' && m.base_url);
    
    if (directModels.length === 0) {
      logger.info('Direct модели не найдены, пропускаем синхронизацию.');
      return;
    }
    
    // 2. Группируем по base_url
    const baseUrlGroups = new Map();
    for (const model of directModels) {
      const baseUrl = model.base_url;
      if (!baseUrlGroups.has(baseUrl)) {
        baseUrlGroups.set(baseUrl, []);
      }
      baseUrlGroups.get(baseUrl).push(model);
    }
    
    let totalAdded = 0;
    let totalDisabled = 0;
    let skippedUrls = 0;
    
    // 3. Для каждого base_url пытаемся получить список моделей
    for (const [baseUrl, modelsForUrl] of baseUrlGroups) {
      try {
        // Получаем API ключ из первой модели с этим base_url
        const sampleModel = modelsForUrl[0];
        let apiKey = sampleModel.api_key;
        
        if (typeof apiKey === 'string' && apiKey.startsWith('env:')) {
          const envVar = apiKey.slice(4);
          apiKey = process.env[envVar];
          if (!apiKey) {
            logger.info(`  ⚠️ Пропускаем ${baseUrl}: переменная окружения ${envVar} не найдена`);
            skippedUrls++;
            continue;
          }
        } else if (!apiKey) {
          // Пробуем найти ключ по стандартному паттерну
          try {
            const urlHost = new URL(baseUrl).hostname.replace(/\./g, '_').toUpperCase();
            apiKey = process.env[`${urlHost}_API_KEY`] || process.env['DIRECT_API_KEY'];
          } catch (urlErr) {
            // Если не удалось распарсить URL, пропускаем
            logger.info(`  ⚠️ Пропускаем ${baseUrl}: некорректный URL`);
            skippedUrls++;
            continue;
          }
        }
        
        // Формируем URL для запроса списка моделей
        const modelsUrl = baseUrl.endsWith('/v1') || baseUrl.endsWith('/v1/') 
          ? `${baseUrl}/models`
          : `${baseUrl}/v1/models`;
        
        logger.info(`  Проверяем ${baseUrl}...`);
        
        // Запрашиваем список моделей
        const headers = {};
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        const { data } = await axios.get(modelsUrl, {
          headers,
          timeout: 10000 // 10 секунд таймаут
        });
        
        // Универсальная обработка разных форматов /v1/models
        let remoteModels = [];
        
        // Вариант 1: OpenAI-совместимый формат (Groq, Ollama, Fireworks и т.д.)
        if (data && data.data && Array.isArray(data.data)) {
          remoteModels = data.data;
        // Вариант 2: Together AI — возвращает сразу массив моделей
        } else if (Array.isArray(data)) {
          remoteModels = data;
        // Вариант 3: На всякий случай — если вдруг в data.models или другом поле
        } else if (data && data.models && Array.isArray(data.models)) {
          remoteModels = data.models;
        } else {
          logger.info(`  ⚠️ ${baseUrl}: неподдерживаемый формат /v1/models`);
          logger.info(`  📋 Ответ от API:`, JSON.stringify(data, null, 2).slice(0, 500) + (JSON.stringify(data).length > 500 ? '...' : ''));
          skippedUrls++;
          continue;
        }
        
        if (remoteModels.length === 0) {
          logger.info(`  ⚠️ ${baseUrl}: пустой список моделей`);
          skippedUrls++;
          continue;
        }
        
        // 4. Создаем Map активных моделей для этого base_url
        const activeRemoteMap = new Map();
        
        // Генерируем slug из base_url для уникальности ID
        let urlSlug;
        try {
          urlSlug = new URL(baseUrl).hostname.replace(/\./g, '-').replace(/^www-/, '');
        } catch (urlErr) {
          // Если не удалось распарсить, используем упрощенный вариант
          urlSlug = baseUrl.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        }
        
        for (const remote of remoteModels) {
          // Генерируем внутренний ID: {urlSlug}-{model_id}
          // Заменяем недопустимые символы в model.id
          const modelIdSlug = remote.id.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
          const internalId = `direct-${urlSlug}-${modelIdSlug}`;
          activeRemoteMap.set(internalId, remote);
        }
        
        let addedCount = 0;
        let disabledCount = 0;
        
        // 5. Обновляем существующие модели для этого base_url
        localModels = localModels.map(model => {
          if (model.provider === 'direct' && model.base_url === baseUrl) {
            if (!activeRemoteMap.has(model.id)) {
              if (model.enabled) {
                disabledCount++;
                return { ...model, enabled: false };
              }
            }
            // Сохраняем все настройки существующей модели
            return model;
          }
          return model;
        });
        
        // 6. Добавляем новые модели для этого base_url
        for (const [id, remote] of activeRemoteMap) {
          const exists = localModels.some(m => m.id === id);
          if (!exists) {
            // Определяем context из данных модели или по умолчанию
            let context = 8192; // По умолчанию
            if (remote.context_length) {
              context = remote.context_length;
            } else if (remote.context_window) {
              context = remote.context_window;
            } else {
              // Fallback на парсинг из ID (для других провайдеров)
              const contextMatch = remote.id.match(/-(\d+)k/i) || remote.id.match(/-(\d{4,5})/);
              if (contextMatch) {
                context = parseInt(contextMatch[1], 10) * (contextMatch[0].toLowerCase().includes('k') ? 1024 : 1);
              }
            }
            
            // Формируем visible_name
            const modelName = remote.name || remote.id;
            const providerName = baseUrl.includes('together.xyz') ? 'Together' : 
                               baseUrl.includes('ollama') ? 'Ollama' :
                               baseUrl.includes('fireworks') ? 'Fireworks' : 'Direct';
            const visibleName = `${providerName} → ${modelName}`;
            
            const newModel = {
              id: id,
              provider: "direct",
              name: remote.id,
              visible_name: visibleName,
              base_url: baseUrl,
              api_key: sampleModel.api_key, // Используем тот же формат API ключа
              context: context,
              user_type: null,
              enabled: true,
              added_at: new Date().toISOString(),
              provider_info: remote // Сохраняем полную информацию от провайдера
            };
            
            localModels.push(newModel);
            addedCount++;
          }
        }
        
        totalAdded += addedCount;
        totalDisabled += disabledCount;
        
        if (addedCount > 0 || disabledCount > 0) {
          logger.info(`  ✅ ${baseUrl}: ${addedCount} новых, ${disabledCount} отключено`);
        } else {
          logger.info(`  ✓ ${baseUrl}: актуально`);
        }
        
      } catch (err) {
        // Тихая обработка ошибок - просто пропускаем этот base_url
        if (err.response && err.response.status === 404) {
          logger.info(`  ⚠️ ${baseUrl}: /v1/models не поддерживается, пропускаем`);
        } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
          logger.info(`  ⚠️ ${baseUrl}: таймаут при запросе, пропускаем`);
        } else if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          logger.info(`  ⚠️ ${baseUrl}: ошибка авторизации, пропускаем`);
        } else {
          // Только для неожиданных ошибок выводим сообщение
          logger.info(`  ⚠️ ${baseUrl}: ошибка (${err.message}), пропускаем`);
        }
        skippedUrls++;
      }
    }
    
    // 7. Сохраняем обновленные модели
    await saveModels(localModels);
    
    if (totalAdded > 0 || totalDisabled > 0) {
      logger.info(`Direct синхронизирован: ${totalAdded} новых добавлено, ${totalDisabled} устаревших отключено.`);
    } else if (skippedUrls === 0) {
      logger.info(`Direct синхронизирован: все модели актуальны.`);
    } else {
      logger.info(`Direct синхронизирован: ${skippedUrls} URL пропущено (не поддерживают /v1/models или ошибки).`);
    }
    
  } catch (err) {
    logger.error('Ошибка автообновления Direct:', err.message);
  }
}

// API эндпоинты для ручного обновления моделей провайдеров
app.post('/api/refresh-groq-models', async (req, res) => {
  try {
    await refreshGroqModels();
    res.json({ success: true, message: 'GROQ модели обновлены' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/refresh-openrouter-models', async (req, res) => {
  try {
    await refreshOpenRouterModels();
    res.json({ success: true, message: 'OpenRouter модели обновлены' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/refresh-direct-models', async (req, res) => {
  try {
    await refreshDirectModels();
    res.json({ success: true, message: 'Direct модели обновлены' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// При старте и каждые 8 часов
refreshGroqModels();
refreshOpenRouterModels();
refreshDirectModels();
setInterval(refreshGroqModels, 8 * 60 * 60 * 1000);
setInterval(refreshOpenRouterModels, 8 * 60 * 60 * 1000);
setInterval(refreshDirectModels, 8 * 60 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════════
// OpenAI-совместимый API (/v1/chat/completions, /v1/models)
// ═══════════════════════════════════════════════════════════════════════════════

// Middleware для Bearer Token аутентификации (только для /v1/* путей)
function openaiAuthMiddleware(req, res, next) {
  const apiKey = process.env.KOSMOS_API_KEY;
  
  // Если ключ не задан — пропускаем без проверки (обратная совместимость)
  if (!apiKey) {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        message: 'Missing or invalid Authorization header. Expected: Bearer <token>',
        type: 'invalid_request_error',
        code: 'invalid_api_key'
      }
    });
  }
  
  const token = authHeader.slice(7); // Убираем "Bearer "
  if (token !== apiKey) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key provided',
        type: 'invalid_request_error',
        code: 'invalid_api_key'
      }
    });
  }
  
  next();
}

// Генерация уникального ID для ответа в стиле OpenAI
function generateChatCompletionId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'chatcmpl-';
  for (let i = 0; i < 29; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Функция для создания SSE чанка в формате OpenAI
function createStreamChunk(id, model, delta, finishReason = null) {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta,
      finish_reason: finishReason
    }]
  };
}

// Отправка SSE чанка клиенту
function sendSSEChunk(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Завершение SSE стрима
function endSSEStream(res) {
  res.write('data: [DONE]\n\n');
  res.end();
}

// POST /v1/chat/completions - OpenAI-совместимый эндпоинт
app.post('/v1/chat/completions', openaiAuthMiddleware, async (req, res) => {
  logger.info('[SERVER] ========================================');
  logger.info('[SERVER] /v1/chat/completions запрос получен');
  logger.info('[SERVER] Timestamp:', new Date().toISOString());
  logger.info('[SERVER] Request headers:', {
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent']?.substring(0, 50) + '...'
  });
  
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;
    
    logger.info('[SERVER] Request body получен:');
    logger.info('[SERVER] model:', model);
    logger.info('[SERVER] messages count:', messages?.length || 0);
    logger.info('[SERVER] temperature:', temperature);
    logger.info('[SERVER] max_tokens:', max_tokens);
    logger.info('[SERVER] stream:', stream);
    
    // Проверка обязательных полей
    if (!model) {
      logger.error('[SERVER] Ошибка: model отсутствует');
      return res.status(400).json({
        error: {
          message: 'Missing required parameter: model',
          type: 'invalid_request_error',
          param: 'model',
          code: 'missing_required_parameter'
        }
      });
    }
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      logger.error('[SERVER] Ошибка: messages отсутствуют или пусты');
      return res.status(400).json({
        error: {
          message: 'Missing required parameter: messages',
          type: 'invalid_request_error',
          param: 'messages',
          code: 'missing_required_parameter'
        }
      });
    }
    
    // Извлекаем system prompt и формируем inputText из истории
    // ВАЖНО: не добавляем дефолтный system prompt - некоторые модели его не поддерживают
    let systemPrompt = null;  // null = не был передан
    let hasExplicitSystemPrompt = false;
    let conversationHistory = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
        hasExplicitSystemPrompt = true;
      } else if (msg.role === 'user' || msg.role === 'assistant') {
        conversationHistory.push(msg);
      }
    }
    
    logger.info('[SERVER] System prompt length:', systemPrompt?.length || 0, hasExplicitSystemPrompt ? '(explicit)' : '(none)');
    logger.info('[SERVER] Conversation history length:', conversationHistory.length);
    
    // Формируем inputText: склеиваем историю, последний user message - основной вопрос
    let inputText = '';
    if (conversationHistory.length === 0) {
      logger.error('[SERVER] Ошибка: нет user сообщений');
      return res.status(400).json({
        error: {
          message: 'At least one user message is required',
          type: 'invalid_request_error',
          param: 'messages',
          code: 'invalid_request_error'
        }
      });
    }
    
    // Если есть история диалога (больше одного сообщения), склеиваем
    if (conversationHistory.length > 1) {
      const historyParts = conversationHistory.slice(0, -1).map(msg => 
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      );
      const lastUserMsg = conversationHistory[conversationHistory.length - 1];
      inputText = `Previous conversation:\n${historyParts.join('\n')}\n\nCurrent message: ${lastUserMsg.content}`;
    } else {
      inputText = conversationHistory[0].content;
    }
    
    logger.info('[SERVER] Input text length:', inputText.length);
    logger.info(`[SERVER] 🔗 OpenAI-compat: Запрос к модели ${model}`);
    
    // Разрешаем имя модели через существующую логику
    const resolved = await resolveModelName(model, null);
    const resolvedModel = resolved.model;
    let selectedProvider = resolved.provider;
    
    logger.info('[SERVER] Resolved model:', resolvedModel);
    logger.info('[SERVER] Resolved provider:', selectedProvider);
    
    // Получаем данные модели для определения провайдера
    // Используем modelData из resolveModelName, если он есть (для моделей найденных по user_type)
    const modelData = resolved.modelData || await getModelByName(resolvedModel);
    if (!selectedProvider) {
      selectedProvider = modelData?.provider || 'openroute';
    }
    
    logger.info(`[SERVER] 🔗 OpenAI-compat: Провайдер ${selectedProvider}, модель ${resolvedModel}`);
    
    // Проверяем доступность провайдера
    if (selectedProvider === 'groq' && !groqService) {
      logger.error('[SERVER] GROQ сервис не настроен');
      return res.status(503).json({
        error: {
          message: 'GROQ service is not configured',
          type: 'server_error',
          code: 'service_unavailable'
        }
      });
    }
    
    if (selectedProvider === 'openroute' && !config.openRouterKey) {
      logger.error('[SERVER] OpenRouter API ключ не настроен');
      return res.status(503).json({
        error: {
          message: 'OpenRouter API key is not configured',
          type: 'server_error',
          code: 'service_unavailable'
        }
      });
    }
    
    if (selectedProvider === 'gigachat' && !gigachatService) {
      logger.error('[SERVER] GigaChat сервис не настроен');
      return res.status(503).json({
        error: {
          message: 'GigaChat service is not configured',
          type: 'server_error',
          code: 'service_unavailable'
        }
      });
    }
    
    // Формируем messages для провайдеров
    // Добавляем system только если был явно передан (некоторые модели не поддерживают system role)
    const providerMessages = [];
    if (hasExplicitSystemPrompt && systemPrompt) {
      providerMessages.push({ role: 'system', content: systemPrompt });
    }
    providerMessages.push({ role: 'user', content: inputText });
    
    const finalTemperature = temperature !== undefined ? temperature : 0.7;
    // Получаем context модели для безопасного ограничения maxTokens
    const modelContext = modelData?.context || null;
    const finalMaxTokens = getSafeMaxTokens(max_tokens, modelContext);
    
    logger.info('[SERVER] Final parameters:', {
      temperature: finalTemperature,
      maxTokens: finalMaxTokens
    });
    
    // ═══════════════════════════════════════════════════════════════════
    // STREAMING MODE
    // ═══════════════════════════════════════════════════════════════════
    if (stream === true) {
      logger.info('[SERVER] Режим: STREAMING');
      const streamId = generateChatCompletionId();
      const streamCreated = Math.floor(Date.now() / 1000);
      
      // Устанавливаем SSE заголовки
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Отключаем буферизацию nginx
      
      logger.info(`[SERVER] 🔗 OpenAI-compat STREAM: Начинаем стриминг от ${selectedProvider}`);
      
      // Переменная для накопления контента из стрима
      let streamedContent = '';
      let streamUsage = null;
      
      try {
        // Отправляем первый чанк с ролью
        logger.info('[SERVER] Отправка первого чанка с ролью assistant');
        sendSSEChunk(res, createStreamChunk(streamId, resolvedModel, { role: 'assistant' }, null));
        
        if (selectedProvider === 'groq') {
          logger.info('[SERVER] Отправка запроса в GROQ (streaming)...');
          // GROQ SDK поддерживает streaming нативно
          let streamResponse;
          try {
            streamResponse = await groqService.sendRequest({
              model: resolvedModel,
              messages: providerMessages,
              temperature: finalTemperature,
              maxTokens: finalMaxTokens,
              stream: true
            });
            logger.info('[SERVER] GROQ stream получен, начинаем обработку чанков...');
          } catch (groqInitError) {
            // Ошибка при создании стрима (например, 403)
            logger.error('[SERVER] ❌ Ошибка при создании GROQ stream:', groqInitError);
            
            let errorMessage = 'GROQ API Error: ' + (groqInitError.message || groqInitError.toString());
            let errorDetails = null;
            
            if (groqInitError.response) {
              errorMessage = `GROQ API Error: ${groqInitError.response.status} ${JSON.stringify(groqInitError.response.data)}`;
              errorDetails = groqInitError.response.data;
            } else if (groqInitError.message) {
              errorMessage = `GROQ API Error: ${groqInitError.message}`;
              errorDetails = { message: groqInitError.message, stack: groqInitError.stack };
            }
            
            // Сохраняем ошибку в историю
            try {
              logger.info('[SERVER] Попытка сохранить ошибку GROQ (при создании стрима) в историю...');
              const responseData = await readResponses();
              const newResponse = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                model: resolvedModel,
                provider: selectedProvider,
                prompt: systemPrompt,
                inputText: inputText,
                response: `ERROR: ${errorMessage}`,
                tokens: {
                  input: 0,
                  output: 0,
                  total: 0,
                  source: 'error'
                },
                autoSaved: true,
                errorDetails: errorDetails
              };
              responseData.responses.push(newResponse);
              await writeResponses(responseData);
              logger.info(`[SERVER] 💾 Ошибка GROQ (при создании стрима) сохранена в историю: ${newResponse.id}`);
            } catch (saveError) {
              logger.error('[SERVER] ❌ Ошибка сохранения ошибки GROQ (при создании стрима) в историю:', saveError);
            }
            
            // Отправляем ошибку клиенту
            sendSSEChunk(res, { error: { message: errorMessage } });
            endSSEStream(res);
            return;
          }
          
          let chunkIndex = 0;
          
          try {
            // Итерируем по async iterable от GROQ SDK
            for await (const chunk of streamResponse) {
              chunkIndex++;
              
              // Проверяем наличие ошибки в чанке
              if (chunk.error) {
                logger.error('[SERVER] ❌ Ошибка в GROQ chunk:', chunk.error);
                const errorMessage = typeof chunk.error === 'string' ? chunk.error : 
                                    (chunk.error.message || JSON.stringify(chunk.error));
                
                // Сохраняем ошибку в историю
                try {
                  const responseData = await readResponses();
                  const newResponse = {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    model: resolvedModel,
                    provider: selectedProvider,
                    prompt: systemPrompt,
                    inputText: inputText,
                    response: `ERROR: GROQ API Error: ${errorMessage}`,
                    tokens: {
                      input: 0,
                      output: 0,
                      total: 0,
                      source: 'error'
                    },
                    autoSaved: true,
                    errorDetails: chunk.error
                  };
                  responseData.responses.push(newResponse);
                  await writeResponses(responseData);
                  logger.info(`[SERVER] 💾 Ошибка GROQ сохранена в историю: ${newResponse.id}`);
                } catch (saveError) {
                  logger.error('[SERVER] ❌ Ошибка сохранения ошибки GROQ в историю:', saveError);
                }
                
                // Отправляем ошибку клиенту
                sendSSEChunk(res, { error: { message: `GROQ API Error: ${errorMessage}` } });
                endSSEStream(res);
                return;
              }
              
              const content = chunk.choices?.[0]?.delta?.content;
              const finishReason = chunk.choices?.[0]?.finish_reason;
              
              if (content) {
                streamedContent += content;
                sendSSEChunk(res, createStreamChunk(streamId, resolvedModel, { content }, null));
                
                if (chunkIndex <= 3 || chunkIndex % 20 === 0) {
                  logger.info(`[SERVER] GROQ chunk #${chunkIndex}, content length: ${content.length}, total: ${streamedContent.length}`);
                }
              }
              
              // Сохраняем usage из последнего чанка, если есть
              if (chunk.usage) {
                streamUsage = chunk.usage;
              }
              
              if (finishReason) {
                logger.info('[SERVER] GROQ finish reason:', finishReason);
                sendSSEChunk(res, createStreamChunk(streamId, resolvedModel, {}, finishReason));
              }
            }
            
            logger.info(`[SERVER] GROQ streaming завершен. Всего чанков: ${chunkIndex}, итоговый контент: ${streamedContent.length} символов`);
          } catch (groqError) {
            // Обработка ошибки от GROQ (например, 403)
            logger.error('[SERVER] ❌ Ошибка при обработке GROQ stream:', groqError);
            logger.error('[SERVER] GROQ error type:', typeof groqError);
            logger.error('[SERVER] GROQ error message:', groqError.message);
            logger.error('[SERVER] GROQ error response:', groqError.response);
            
            let errorMessage = 'GROQ API Error: ' + (groqError.message || groqError.toString());
            let errorDetails = null;
            
            if (groqError.response) {
              logger.error('[SERVER] GROQ error response status:', groqError.response.status);
              logger.error('[SERVER] GROQ error response data:', JSON.stringify(groqError.response.data, null, 2));
              errorMessage = `GROQ API Error: ${groqError.response.status} ${JSON.stringify(groqError.response.data)}`;
              errorDetails = groqError.response.data;
            } else {
              errorDetails = { 
                message: groqError.message, 
                stack: groqError.stack,
                name: groqError.name,
                toString: groqError.toString()
              };
            }
            
            // Сохраняем ошибку в историю
            try {
              logger.info('[SERVER] Попытка сохранить ошибку GROQ (при обработке стрима) в историю...');
              logger.info('[SERVER] resolvedModel:', resolvedModel);
              logger.info('[SERVER] selectedProvider:', selectedProvider);
              logger.info('[SERVER] systemPrompt length:', systemPrompt?.length || 0);
              logger.info('[SERVER] inputText length:', inputText?.length || 0);
              
              const responseData = await readResponses();
              const newResponse = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                model: resolvedModel,
                provider: selectedProvider,
                prompt: systemPrompt,
                inputText: inputText,
                response: `ERROR: ${errorMessage}`,
                tokens: {
                  input: 0,
                  output: 0,
                  total: 0,
                  source: 'error'
                },
                autoSaved: true,
                errorDetails: errorDetails
              };
              
              logger.info('[SERVER] Новый response для сохранения:', JSON.stringify(newResponse, null, 2).substring(0, 500));
              
              responseData.responses.push(newResponse);
              await writeResponses(responseData);
              logger.info(`[SERVER] 💾 Ошибка GROQ (при обработке стрима) сохранена в историю: ${newResponse.id}`);
              logger.info('[SERVER] Всего responses в истории:', responseData.responses.length);
            } catch (saveError) {
              logger.error('[SERVER] ❌ Ошибка сохранения ошибки GROQ в историю:', saveError);
              logger.error('[SERVER] Save error stack:', saveError.stack);
            }
            
            // Отправляем ошибку клиенту
            sendSSEChunk(res, { error: { message: errorMessage } });
            endSSEStream(res);
            return;
          }
          
        } else if (selectedProvider === 'openroute') {
          logger.info('[SERVER] Отправка запроса в OpenRouter (streaming)...');
          // OpenRouter streaming через axios
          const streamResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: resolvedModel,
            messages: providerMessages,
            temperature: finalTemperature,
            max_tokens: finalMaxTokens,
            stream: true
          }, {
            headers: {
              'Authorization': `Bearer ${config.openRouterKey}`,
              'Content-Type': 'application/json'
            },
            responseType: 'stream'
          });
          
          // Обрабатываем SSE от OpenRouter
          let buffer = '';
          let chunkIndex = 0;
          
          streamResponse.data.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Сохраняем неполную строку
            
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6);
                if (data === '[DONE]') {
                  logger.info('[SERVER] OpenRouter получил [DONE]');
                  continue; // Пропускаем, отправим свой [DONE]
                }
                try {
                  const parsed = JSON.parse(data);
                  
                  // Проверяем наличие ошибки в чанке
                  if (parsed.error) {
                    logger.error('[SERVER] ❌ Ошибка в OpenRouter chunk:', parsed.error);
                    const errorMessage = parsed.error.message || JSON.stringify(parsed.error);
                    
                    // Сохраняем ошибку в историю
                    (async () => {
                      try {
                        const responseData = await readResponses();
                        const newResponse = {
                          id: Date.now().toString(),
                          timestamp: new Date().toISOString(),
                          model: resolvedModel,
                          provider: selectedProvider,
                          prompt: systemPrompt,
                          inputText: inputText,
                          response: `ERROR: OpenRouter API Error: ${errorMessage}`,
                          tokens: {
                            input: 0,
                            output: 0,
                            total: 0,
                            source: 'error'
                          },
                          autoSaved: true,
                          errorDetails: parsed.error
                        };
                        responseData.responses.push(newResponse);
                        await writeResponses(responseData);
                        logger.info(`[SERVER] 💾 Ошибка OpenRouter сохранена в историю: ${newResponse.id}`);
                      } catch (saveError) {
                        logger.error('[SERVER] ❌ Ошибка сохранения ошибки OpenRouter в историю:', saveError);
                      }
                    })();
                    
                    // Отправляем ошибку клиенту
                    sendSSEChunk(res, { error: { message: `OpenRouter API Error: ${errorMessage}` } });
                    endSSEStream(res);
                    return;
                  }
                  
                  const content = parsed.choices?.[0]?.delta?.content;
                  const finishReason = parsed.choices?.[0]?.finish_reason;
                  
                  if (content) {
                    chunkIndex++;
                    streamedContent += content;
                    sendSSEChunk(res, createStreamChunk(streamId, resolvedModel, { content }, null));
                    
                    if (chunkIndex <= 3 || chunkIndex % 20 === 0) {
                      logger.info(`[SERVER] OpenRouter chunk #${chunkIndex}, content length: ${content.length}, total: ${streamedContent.length}`);
                    }
                  }
                  
                  // Сохраняем usage из последнего чанка, если есть
                  if (parsed.usage) {
                    streamUsage = parsed.usage;
                  }
                  
                  if (finishReason) {
                    logger.info('[SERVER] OpenRouter finish reason:', finishReason);
                    sendSSEChunk(res, createStreamChunk(streamId, resolvedModel, {}, finishReason));
                  }
                } catch (e) {
                  logger.warn('[SERVER] Ошибка парсинга OpenRouter chunk:', e.message);
                }
              }
            }
          });
          
          await new Promise((resolve, reject) => {
            streamResponse.data.on('end', () => {
              logger.info(`[SERVER] OpenRouter streaming завершен. Всего чанков: ${chunkIndex}, итоговый контент: ${streamedContent.length} символов`);
              resolve();
            });
            streamResponse.data.on('error', async (error) => {
              logger.error('[SERVER] OpenRouter stream error:', error);
              
              // Сохраняем ошибку в историю
              try {
                const responseData = await readResponses();
                const newResponse = {
                  id: Date.now().toString(),
                  timestamp: new Date().toISOString(),
                  model: resolvedModel,
                  provider: selectedProvider,
                  prompt: systemPrompt,
                  inputText: inputText,
                  response: `ERROR: OpenRouter stream error: ${error.message || error.toString()}`,
                  tokens: {
                    input: 0,
                    output: 0,
                    total: 0,
                    source: 'error'
                  },
                  autoSaved: true,
                  errorDetails: { message: error.message, stack: error.stack }
                };
                responseData.responses.push(newResponse);
                await writeResponses(responseData);
                logger.info(`[SERVER] 💾 Ошибка OpenRouter stream сохранена в историю: ${newResponse.id}`);
              } catch (saveError) {
                logger.error('[SERVER] ❌ Ошибка сохранения ошибки OpenRouter stream в историю:', saveError);
              }
              
              // Отправляем ошибку клиенту
              sendSSEChunk(res, { error: { message: `OpenRouter stream error: ${error.message || error.toString()}` } });
              endSSEStream(res);
              
              reject(error);
            });
          }).catch(async (error) => {
            // Дополнительная обработка ошибок от Promise
            if (error.response) {
              const errorMessage = `OpenRouter API Error: ${error.response.status} ${JSON.stringify(error.response.data)}`;
              
              // Сохраняем ошибку в историю
              try {
                const responseData = await readResponses();
                const newResponse = {
                  id: Date.now().toString(),
                  timestamp: new Date().toISOString(),
                  model: resolvedModel,
                  provider: selectedProvider,
                  prompt: systemPrompt,
                  inputText: inputText,
                  response: `ERROR: ${errorMessage}`,
                  tokens: {
                    input: 0,
                    output: 0,
                    total: 0,
                    source: 'error'
                  },
                  autoSaved: true,
                  errorDetails: error.response.data
                };
                responseData.responses.push(newResponse);
                await writeResponses(responseData);
                logger.info(`[SERVER] 💾 Ошибка OpenRouter сохранена в историю: ${newResponse.id}`);
              } catch (saveError) {
                logger.error('[SERVER] ❌ Ошибка сохранения ошибки OpenRouter в историю:', saveError);
              }
              
              sendSSEChunk(res, { error: { message: errorMessage } });
              endSSEStream(res);
            }
            throw error;
          });
          
        } else {
          // Для провайдеров без поддержки streaming - эмулируем через обычный запрос
          logger.info(`[SERVER] ⚠️ OpenAI-compat: Провайдер ${selectedProvider} не поддерживает streaming, эмулируем`);
          
          let fullContent = '';
          let fullUsage = null;
          
          if (selectedProvider === 'direct') {
            if (!modelData) {
              throw new Error(`Model ${model} not found`);
            }
            let apiKey = modelData.api_key;
            if (typeof apiKey === 'string' && apiKey.startsWith('env:')) {
              const envVar = apiKey.slice(4);
              apiKey = process.env[envVar];
              if (!apiKey) {
                throw new Error(`Environment variable ${envVar} not found for direct provider`);
              }
            }
            
            const baseUrl = modelData.base_url;
            if (!baseUrl) {
              throw new Error('Base URL not configured for direct provider');
            }
            
            const directService = new DirectService(apiKey, baseUrl);
            const directResponse = await directService.sendRequest({
              model: resolvedModel,
              messages: providerMessages,
              temperature: finalTemperature,
              maxTokens: finalMaxTokens
            });
            fullContent = directResponse.content;
            fullUsage = directResponse.usage;
            
          } else if (selectedProvider === 'gigachat') {
            const gcResponse = await gigachatService.sendRequest({
              model: resolvedModel,
              messages: providerMessages,
              temperature: finalTemperature,
              maxTokens: finalMaxTokens
            });
            fullContent = gcResponse.content;
            fullUsage = gcResponse.usage;
          }
          
          streamedContent = fullContent;
          streamUsage = fullUsage;
          
          // Эмулируем streaming - отправляем контент чанками по ~20 символов
          const chunkSize = 20;
          for (let i = 0; i < fullContent.length; i += chunkSize) {
            const contentChunk = fullContent.slice(i, i + chunkSize);
            sendSSEChunk(res, createStreamChunk(streamId, resolvedModel, { content: contentChunk }, null));
            // Небольшая задержка для эмуляции стриминга
            await new Promise(r => setTimeout(r, 10));
          }
          
          // Финальный чанк
          sendSSEChunk(res, createStreamChunk(streamId, resolvedModel, {}, 'stop'));
        }
        
        // Сохраняем ответ в историю перед завершением стрима
        logger.info('[SERVER] Итоговый streamedContent length:', streamedContent.length);
        try {
          logger.info('[SERVER] Попытка сохранить streaming ответ в историю...');
          const responseData = await readResponses();
          const tokens = buildTokensInfo({
            usage: streamUsage,
            promptText: systemPrompt,
            inputTextUsed: inputText,
            modelResponse: streamedContent
          });
          const newResponse = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            model: resolvedModel,
            provider: selectedProvider,
            prompt: systemPrompt,
            inputText: inputText,
            response: streamedContent,
            tokens,
            autoSaved: true
          };
          responseData.responses.push(newResponse);
          await writeResponses(responseData);
          logger.info(`[SERVER] 💾 OpenAI-compat STREAM: Ответ автоматически сохранен в историю: ${newResponse.id}`);
        } catch (error) {
          logger.error('[SERVER] ❌ OpenAI-compat STREAM: Ошибка сохранения в историю:', error);
        }
        
        // Завершаем стрим
        logger.info('[SERVER] Завершение SSE стрима...');
        endSSEStream(res);
        logger.info(`[SERVER] ✅ OpenAI-compat STREAM: Стриминг завершён`);
        logger.info('[SERVER] ========================================');
        return;
        
      } catch (streamError) {
        logger.error('[SERVER] ========================================');
        logger.error('[SERVER] ❌ ОШИБКА в OpenAI-compat STREAM');
        logger.error('[SERVER] Error name:', streamError.name);
        logger.error('[SERVER] Error message:', streamError.message);
        logger.error('[SERVER] ❌ OpenAI-compat STREAM error:', streamError);
        
        if (streamError.stack) {
          logger.error('[SERVER] Error stack:', streamError.stack.substring(0, 500));
        }
        
        let streamErrorMessage = 'Stream error';
        let streamErrorDetails = null;
        
        if (streamError.response) {
          logger.error('[SERVER] Ошибка API ответа в streaming');
          logger.error('[SERVER] Response status:', streamError.response.status);
          logger.error('[SERVER] Response data:', JSON.stringify(streamError.response.data, null, 2).substring(0, 500));
          
          const apiError = streamError.response.data?.error;
          if (apiError && typeof apiError === 'object' && apiError.message) {
            streamErrorMessage = apiError.message;
          } else if (typeof apiError === 'string') {
            streamErrorMessage = apiError;
          } else {
            streamErrorMessage = `API Error: ${streamError.response.status}`;
          }
          streamErrorDetails = streamError.response.data;
        } else if (streamError.request) {
          logger.error('[SERVER] Ошибка сети в streaming - запрос не доставлен');
          streamErrorMessage = 'Network error - could not connect to AI service';
          streamErrorDetails = { request: streamError.request };
        } else {
          logger.error('[SERVER] Другая ошибка в streaming:', streamError.message);
          streamErrorMessage = streamError.message;
          streamErrorDetails = { stack: streamError.stack };
        }
        
        // Сохраняем ошибку в историю
        try {
          logger.info('[SERVER] Попытка сохранить ошибку (внешний catch) в историю...');
          logger.info('[SERVER] resolvedModel:', typeof resolvedModel !== 'undefined' ? resolvedModel : 'undefined');
          logger.info('[SERVER] selectedProvider:', typeof selectedProvider !== 'undefined' ? selectedProvider : 'undefined');
          logger.info('[SERVER] systemPrompt:', systemPrompt ? systemPrompt.substring(0, 100) : 'null/undefined');
          logger.info('[SERVER] inputText:', typeof inputText !== 'undefined' ? inputText.substring(0, 100) : 'undefined');
          logger.info('[SERVER] streamErrorMessage:', streamErrorMessage);
          
          const responseData = await readResponses();
          const newResponse = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            model: typeof resolvedModel !== 'undefined' ? resolvedModel : 'unknown',
            provider: typeof selectedProvider !== 'undefined' ? selectedProvider : 'unknown',
            prompt: typeof systemPrompt !== 'undefined' ? systemPrompt : 'You are a helpful assistant.',
            inputText: typeof inputText !== 'undefined' ? inputText : '',
            response: `ERROR: ${streamErrorMessage}`,
            tokens: {
              input: 0,
              output: 0,
              total: 0,
              source: 'error'
            },
            autoSaved: true,
            errorDetails: streamErrorDetails
          };
          
          logger.info('[SERVER] Новый response для сохранения (внешний catch):', JSON.stringify(newResponse, null, 2).substring(0, 500));
          
          responseData.responses.push(newResponse);
          await writeResponses(responseData);
          logger.info(`[SERVER] 💾 OpenAI-compat STREAM: Ошибка сохранена в историю: ${newResponse.id}`);
          logger.info('[SERVER] Всего responses в истории (внешний catch):', responseData.responses.length);
        } catch (saveError) {
          logger.error('[SERVER] ❌ OpenAI-compat STREAM: Ошибка сохранения ошибки в историю:', saveError);
          logger.error('[SERVER] Save error stack:', saveError.stack);
        }
        
        // Если стрим уже начался, отправляем ошибку в SSE формате
        if (res.headersSent) {
          logger.error('[SERVER] Стрим уже начат, отправляем ошибку в SSE формате');
          res.write(`data: ${JSON.stringify({ error: { message: streamErrorMessage } })}\n\n`);
          endSSEStream(res);
        } else {
          logger.error('[SERVER] Стрим не начат, отправляем JSON ошибку');
          return res.status(500).json({
            error: {
              message: streamErrorMessage,
              type: 'server_error',
              code: 'stream_error'
            }
          });
        }
        logger.error('[SERVER] ========================================');
        return;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // NON-STREAMING MODE (обычный режим)
    // ═══════════════════════════════════════════════════════════════════
    logger.info('[SERVER] Режим: NON-STREAMING');
    let response;
    
    // Отправляем запрос в зависимости от провайдера
    if (selectedProvider === 'groq') {
      logger.info('[SERVER] Отправка запроса в GROQ (non-streaming)...');
      const groqResponse = await groqService.sendRequest({
        model: resolvedModel,
        messages: providerMessages,
        temperature: finalTemperature,
        maxTokens: finalMaxTokens
      });
      
      logger.info('[SERVER] Ответ от GROQ получен, длина контента:', groqResponse.content?.length || 0);
      
      response = {
        content: groqResponse.content,
        model: groqResponse.model,
        usage: groqResponse.usage
      };
      
    } else if (selectedProvider === 'openroute') {
      logger.info('[SERVER] Отправка запроса в OpenRouter (non-streaming)...');
      const orResponse = await openRouterService.sendRequest({
        model: resolvedModel,
        messages: providerMessages,
        temperature: finalTemperature,
        maxTokens: finalMaxTokens
      });
      
      logger.info('[SERVER] Ответ от OpenRouter получен, длина контента:', orResponse.data.choices[0].message.content?.length || 0);
      
      response = {
        content: orResponse.data.choices[0].message.content,
        model: orResponse.data.model,
        usage: orResponse.data.usage
      };
      
    } else if (selectedProvider === 'direct') {
      logger.info('[SERVER] Отправка запроса через Direct провайдер (non-streaming)...');
      if (!modelData) {
        return res.status(404).json({
          error: {
            message: `Model ${model} not found in available-models.json`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }
      
      let apiKey = modelData.api_key;
      if (typeof apiKey === 'string' && apiKey.startsWith('env:')) {
        const envVar = apiKey.slice(4);
        apiKey = process.env[envVar];
        if (!apiKey) {
          return res.status(503).json({
            error: {
              message: `Environment variable ${envVar} not found for direct provider`,
              type: 'server_error',
              code: 'configuration_error'
            }
          });
        }
      }
      
      const baseUrl = modelData.base_url;
      if (!baseUrl) {
        return res.status(503).json({
          error: {
            message: 'Base URL not configured for direct provider',
            type: 'server_error',
            code: 'configuration_error'
          }
        });
      }
      
      const directService = new DirectService(apiKey, baseUrl);
      const directResponse = await directService.sendRequest({
        model: resolvedModel,
        messages: providerMessages,
        temperature: finalTemperature,
        maxTokens: finalMaxTokens
      });
      
      logger.info('[SERVER] Ответ от Direct провайдера получен, длина контента:', directResponse.content?.length || 0);
      
      response = {
        content: directResponse.content,
        model: directResponse.model,
        usage: directResponse.usage
      };
      
    } else if (selectedProvider === 'gigachat') {
      logger.info('[SERVER] Отправка запроса в GigaChat (non-streaming)...');
      const gcResponse = await gigachatService.sendRequest({
        model: resolvedModel,
        messages: providerMessages,
        temperature: finalTemperature,
        maxTokens: finalMaxTokens
      });
      
      logger.info('[SERVER] Ответ от GigaChat получен, длина контента:', gcResponse.content?.length || 0);
      
      response = {
        content: gcResponse.content,
        model: gcResponse.model,
        usage: gcResponse.usage
      };
      
    } else {
      logger.error('[SERVER] Неизвестный провайдер:', selectedProvider);
      return res.status(400).json({
        error: {
          message: `Unknown provider: ${selectedProvider}`,
          type: 'invalid_request_error',
          code: 'unknown_provider'
        }
      });
    }
    
    logger.info('[SERVER] Формируем OpenAI-совместимый ответ...');
    logger.info('[SERVER] Response content length:', response.content?.length || 0);
    
    // Формируем OpenAI-совместимый ответ
    const openaiResponse = {
      id: generateChatCompletionId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model || resolvedModel,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.content
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || response.usage?.input_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || response.usage?.output_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0
      }
    };
    
      logger.info(`[SERVER] ✅ OpenAI-compat: Ответ сформирован, ${openaiResponse.usage.total_tokens} токенов`);
      
      // Всегда сохраняем ответ в историю
      try {
        logger.info('[SERVER] Попытка сохранить non-streaming ответ в историю...');
        const responseData = await readResponses();
        const tokens = buildTokensInfo({
          usage: response.usage,
          promptText: systemPrompt,
          inputTextUsed: inputText,
          modelResponse: response.content
        });
        const newResponse = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          model: resolvedModel,
          provider: selectedProvider,
          prompt: systemPrompt,
          inputText: inputText,
          response: response.content,
          tokens,
          autoSaved: true
        };
        responseData.responses.push(newResponse);
        await writeResponses(responseData);
        logger.info(`[SERVER] 💾 OpenAI-compat: Ответ автоматически сохранен в историю: ${newResponse.id}`);
      } catch (error) {
        logger.error('[SERVER] ❌ OpenAI-compat: Ошибка сохранения в историю:', error);
      }
      
      logger.info('[SERVER] Отправка non-streaming ответа клиенту...');
      logger.info('[SERVER] Response keys:', Object.keys(openaiResponse));
      logger.info('[SERVER] ========================================');
      
      return res.json(openaiResponse);
      
    } catch (error) {
      logger.error('[SERVER] ========================================');
      logger.error('[SERVER] ❌ ОШИБКА в /v1/chat/completions (общий catch)');
      logger.error('[SERVER] Error name:', error.name);
      logger.error('[SERVER] Error message:', error.message);
      logger.error('[SERVER] ❌ OpenAI-compat error:', error);
    
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    let errorType = 'server_error';
    let errorDetails = null;
    
    if (error.response) {
      logger.error('[SERVER] Ошибка API ответа');
      logger.error('[SERVER] Response status:', error.response.status);
      logger.error('[SERVER] Response data:', JSON.stringify(error.response.data, null, 2).substring(0, 500));
      
      statusCode = error.response.status || 500;
      const apiError = error.response.data?.error;
      if (apiError && typeof apiError === 'object' && apiError.message) {
        errorMessage = apiError.message;
      } else if (typeof apiError === 'string') {
        errorMessage = apiError;
      } else {
        errorMessage = `API Error: ${error.response.status}`;
      }
      errorDetails = error.response.data;
    } else if (error.request) {
      logger.error('[SERVER] Ошибка сети - запрос не доставлен');
      errorMessage = 'Network error - could not connect to AI service';
      errorType = 'network_error';
      errorDetails = { request: error.request };
    } else {
      logger.error('[SERVER] Другая ошибка:', error.message);
      if (error.stack) {
        logger.error('[SERVER] Error stack:', error.stack.substring(0, 500));
      }
      errorMessage = error.message;
      errorDetails = { stack: error.stack };
    }
    
    // Сохраняем ошибку в историю
    try {
      logger.info('[SERVER] Попытка сохранить ошибку в историю...');
      const responseData = await readResponses();
      // Пытаемся получить model и provider из контекста, если они были определены
      let errorModel = 'unknown';
      let errorProvider = 'unknown';
      let errorSystemPrompt = 'You are a helpful assistant.';
      let errorInputText = '';
      
      // Если переменные были определены до ошибки, используем их
      if (typeof resolvedModel !== 'undefined') {
        errorModel = resolvedModel;
      }
      if (typeof selectedProvider !== 'undefined') {
        errorProvider = selectedProvider;
      }
      if (typeof systemPrompt !== 'undefined') {
        errorSystemPrompt = systemPrompt;
      }
      if (typeof inputText !== 'undefined') {
        errorInputText = inputText;
      }
      
      const newResponse = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        model: errorModel,
        provider: errorProvider,
        prompt: errorSystemPrompt,
        inputText: errorInputText,
        response: `ERROR: ${errorMessage}`,
        tokens: {
          input: 0,
          output: 0,
          total: 0,
          source: 'error'
        },
        autoSaved: true,
        errorDetails: errorDetails
      };
      
      responseData.responses.push(newResponse);
      await writeResponses(responseData);
      logger.info(`[SERVER] 💾 OpenAI-compat: Ошибка сохранена в историю: ${newResponse.id}`);
    } catch (saveError) {
      logger.error('[SERVER] ❌ OpenAI-compat: Ошибка сохранения ошибки в историю:', saveError);
    }
    
    logger.error('[SERVER] Отправка ответа с ошибкой клиенту');
    logger.error('[SERVER] Status code:', statusCode);
    logger.error('[SERVER] ========================================');
    
    return res.status(statusCode).json({
      error: {
        message: errorMessage,
        type: errorType,
        code: 'api_error'
      }
    });
  }
});

// GET /v1/models - список моделей в формате OpenAI
app.get('/v1/models', openaiAuthMiddleware, async (req, res) => {
  try {
    const models = await loadModels();
    const enabledModels = models.filter(m => m.enabled);
    
    const openaiModels = enabledModels.map(m => ({
      id: m.name,
      object: 'model',
      created: m.added_at ? Math.floor(new Date(m.added_at).getTime() / 1000) : Math.floor(Date.now() / 1000),
      owned_by: m.provider || 'unknown'
    }));
    
    return res.json({
      object: 'list',
      data: openaiModels
    });
    
  } catch (error) {
    logger.error('❌ OpenAI-compat /v1/models error:', error);
    return res.status(500).json({
      error: {
        message: 'Failed to load models',
        type: 'server_error',
        code: 'internal_error'
      }
    });
  }
});

// Логируем статус OpenAI-совместимого API
if (process.env.KOSMOS_API_KEY) {
  logger.info('🔐 OpenAI-совместимый API: аутентификация ВКЛЮЧЕНА');
} else {
  logger.info('🔓 OpenAI-совместимый API: аутентификация ОТКЛЮЧЕНА (KOSMOS_API_KEY не задан)');
}
logger.info('📡 OpenAI-совместимые эндпоинты: /v1/chat/completions, /v1/models');

// ═══════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || config.port;

const server = app.listen(PORT, async () => {
  logger.info(`Сервер запущен на порту ${PORT}`);
  logger.info(`Откройте http://localhost:${PORT} в вашем браузере`);
  
  // Валидация моделей с user_type при старте
  await validateUserTypeModelsOnStartup();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`❌ Порт ${PORT} уже занят другим процессом!`);
    logger.error(`   Освободите порт или измените PORT в .env`);
    logger.error(`   Чтобы найти процесс: netstat -ano | findstr :${PORT}`);
    process.exit(1);
  } else {
    logger.error(`Ошибка запуска сервера:`, err);
    process.exit(1);
  }
});