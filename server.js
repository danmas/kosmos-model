const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
// Подключаем dotenv для загрузки переменных окружения из .env файла
require('dotenv').config();

const axios = require('axios');
//const config = require('./config');
const { createConfig } = require('./config');
const langchainPgService = require('./rag');

// Добавляем GROQ и direct сервис
const GroqService = require('./groq-service');
const DirectService = require('./direct-service');

// Добавляем библиотеку CORS
const cors = require('cors');


const MODELS_FILE = path.join(__dirname, 'available-models.json');

// Загрузка моделей
async function loadModels() {
  try {
    const data = await fsPromises.readFile(MODELS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Ошибка чтения available-models.json, создаём пустой');
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
        console.log(`Создана директория для сохранения файлов: ${OUTPUT_DOCS_DIR}`);
    }
} catch (err) {
    console.error(`Ошибка при создании директории ${OUTPUT_DOCS_DIR}:`, err);
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
            console.error('Error reading directory:', err);
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
            console.error(`Error reading file: ${filename}`, err);
            return res.status(404).json({ error: 'File not found' });
        }
        res.json({ content: data });
    });
});


// Вывод загруженных переменных окружения для отладки
console.log('Loaded environment variables:', {
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
console.log('\n═══════════════════════════════════════════════════════');
console.log('🤖 НАСТРОЙКИ МОДЕЛЕЙ ПО УМОЛЧАНИЮ:');
console.log('═══════════════════════════════════════════════════════');
console.log(`💰 CHEAP (дешёвая):
   Модель: ${config.defaultModels.cheap.model}
   Провайдер: ${config.defaultModels.cheap.provider}
   Описание: ${config.defaultModels.cheap.description}`);
console.log(`⚡ FAST (быстрая):
   Модель: ${config.defaultModels.fast.model}
   Провайдер: ${config.defaultModels.fast.provider}
   Описание: ${config.defaultModels.fast.description}`);
console.log(`💎 RICH (мощная):
   Модель: ${config.defaultModels.rich.model}
   Провайдер: ${config.defaultModels.rich.provider}
   Описание: ${config.defaultModels.rich.description}`);
console.log('═══════════════════════════════════════════════════════\n');

// Инициализируем GROQ сервис если ключ доступен
let groqService = null;
if (config.groqKey) {
    try {
        groqService = new GroqService(config.groqKey);
        console.log('✅ GROQ сервис инициализирован');
    } catch (error) {
        console.warn('⚠️ GROQ сервис не инициализирован:', error.message);
    }
} else {
    console.warn('⚠️ GROQ_API_KEY не настроен');
}

// Добавим проверку загруженных переменных
console.log('Loaded N8N_WEBHOOK_URL:', process.env.N8N_WEBHOOK_URL);
console.log('Loaded config N8N_WEBHOOK_URL:', config.n8nWebhookUrl);
console.log('Loaded PORT:', process.env.PORT);
console.log('Loaded LOG_LEVEL:', process.env.LOG_LEVEL);
console.log('openRouterKey:', config.openRouterKey ? '***' : null); // Маскируем ключ для безопасности

// После пересоздания конфигурации
console.log('Final configuration:', {
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
            groq: !!config.groqKey
        }, 
      logging: {
          level: config.logging.level,
          filename: config.logging.filename,
          errorFilename: config.logging.errorFilename
      },
      langchainPg: config.langchainPg
  });
});


//const PROMPTS_FILE = path.join(__dirname, '../../MYDATA/ai-analytics/prompts.json');
const PROMPTS_FILE = path.join(__dirname, './prompts.json');
// Добавьте эти строки после объявления PROMPTS_FILE
//const RESPONSES_FILE = path.join(__dirname, '../../MYDATA/ai-analytics/responses.json');
const RESPONSES_FILE = path.join(__dirname, './responses.json');

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
        console.error('Error reading responses:', error);
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
        console.error('Error reading responses:', error);
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
        await fsPromises.writeFile(PROMPTS_FILE, JSON.stringify({ prompts: [] }));
    }
}

// Read prompts from file
async function readPrompts() {
    try {
        const data = await fsPromises.readFile(PROMPTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading prompts:', error);
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
function resolveModelName(modelInput, providerInput) {
  let resolvedModel = modelInput;
  let resolvedProvider = providerInput;
  
  // Если модель не указана, используем CHEAP по умолчанию
  if (!modelInput || modelInput.trim() === '') {
    console.log('⚙️ Модель не указана, используется CHEAP по умолчанию');
    resolvedModel = config.defaultModels.cheap.model;
    resolvedProvider = providerInput || config.defaultModels.cheap.provider;
    return { model: resolvedModel, provider: resolvedProvider, wasResolved: true, resolvedType: 'cheap' };
  }
  
  // Проверяем, не является ли это ключевым словом (CHEAP, FAST, RICH)
  const modelUpper = modelInput.trim().toUpperCase();
  if (['CHEAP', 'FAST', 'RICH'].includes(modelUpper)) {
    const modelType = modelUpper.toLowerCase();
    resolvedModel = config.defaultModels[modelType].model;
    resolvedProvider = providerInput || config.defaultModels[modelType].provider;
    console.log(`⚙️ Ключевое слово "${modelUpper}" преобразовано в модель: ${resolvedModel} (${resolvedProvider})`);
    return { model: resolvedModel, provider: resolvedProvider, wasResolved: true, resolvedType: modelType };
  }
  
  // Если это обычное имя модели, возвращаем как есть
  return { model: resolvedModel, provider: resolvedProvider, wasResolved: false };
}

// Функция для получения модели по имени из available-models.json
async function getModelByName(modelName) {
  try {
    const models = await loadModels();
    return models.find(m => m.name === modelName || m.id === modelName);
  } catch (error) {
    console.error('Ошибка при поиске модели:', error);
    return null;
  }
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
    try {
      let { model, prompt, inputText, useRag, contextCode, saveResponse = false, provider, temperature, maxTokens } = req.body;
      
      console.log('DEBUG SERVER: Received request with parameters:');
      console.log('DEBUG SERVER: model =', model);
      console.log('DEBUG SERVER: provider =', provider);
      console.log('DEBUG SERVER: useRag =', useRag);
      console.log('DEBUG SERVER: contextCode =', contextCode);
      
      if (!prompt || !inputText) {
        return res.status(400).json({ error: 'Поля prompt и inputText обязательны' });
      }
      
      // Разрешаем имя модели (может быть CHEAP/FAST/RICH или пусто)
      const resolved = resolveModelName(model, provider);
      model = resolved.model;
      let selectedProvider = resolved.provider;
      
      // Получаем данные модели для определения провайдера и параметров
      const modelData = await getModelByName(model);
      
      // Определяем провайдера автоматически по модели, если не был указан
      if (!selectedProvider) {
        selectedProvider = modelData?.provider || 'openroute';
      }
      
      console.log(`📡 Используем провайдера: ${selectedProvider} для модели: ${model}`);
      
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
      
      let finalInputText = inputText;
      let ragInfo = null;
      
      // Если включен RAG и сервис доступен, обогащаем запрос контекстом из RAG
      if (useRag && config.langchainPg.enabled) {
        try {
          console.log(`Using RAG with context code: ${contextCode || 'all'}`);
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
            console.log('!!! No documents found in RAG response');
          }
    
        } catch (ragError) {
          console.error('Error using RAG:', ragError);
          // Продолжаем без RAG в случае ошибки
        }
      }
      else {
        console.log('!!! Without RAGs');
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
      const finalMaxTokens = maxTokens !== undefined ? maxTokens : 1024;
      
      // Детальное логирование для отладки (особенно для direct провайдера)
      if (selectedProvider === 'direct') {
        console.log('🔍 DEBUG DIRECT: Исходные данные запроса:');
        console.log('  model:', model);
        console.log('  prompt:', prompt);
        console.log('  inputText:', inputText);
        console.log('  provider:', selectedProvider);
        console.log('  temperature:', temperature, '->', finalTemperature);
        console.log('  maxTokens:', maxTokens, '->', finalMaxTokens);
        console.log('  finalInputText (после RAG):', finalInputText);
      }
      
      let response;
      
      // Отправляем запрос в зависимости от провайдера
      if (selectedProvider === 'groq') {
        const groqResponse = await groqService.sendRequest({ 
          model, 
          messages, 
          temperature: finalTemperature, 
          maxTokens: finalMaxTokens 
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
        
      } else if (selectedProvider === 'openroute') {
        response = await openRouterService.sendRequest({ 
          model, 
          messages, 
          temperature: finalTemperature, 
          maxTokens: finalMaxTokens 
        });
        
      } else if (selectedProvider === 'direct') {
        // Получаем API ключ из env или из модели
        const apiKey = process.env[`${selectedProvider.toUpperCase()}_API_KEY`] || modelData.api_key;
        const baseUrl = modelData.base_url;
        
        console.log('🔍 DEBUG DIRECT: Данные модели из available-models.json:', {
          model: model,
          modelData: modelData,
          apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'не найден',
          baseUrl: baseUrl
        });
        
        if (!apiKey || !baseUrl) {
          throw new Error(`Для провайдера 'direct' требуется api_key и base_url в модели или ${selectedProvider.toUpperCase()}_API_KEY в env`);
        }
        
        console.log('🔍 DEBUG DIRECT: Формируем messages:', JSON.stringify(messages, null, 2));
        console.log('🔍 DEBUG DIRECT: Параметры запроса:', {
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
        
        response = {
          data: {
            choices: [{
              message: { content: directResponse.content }
            }],
            model: directResponse.model,
            usage: directResponse.usage
          }
        };
        
      } else {
        throw new Error(`Неизвестный провайдер: ${selectedProvider}`);
      }
      
      // Обработка ответа (унифицированная)
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const modelResponse = response.data.choices[0].message.content;
        
        console.log(`✅ ${selectedProvider.toUpperCase()}: Получен ответ:`, modelResponse.substring(0, 200) + '...');
        console.log(`📊 ${selectedProvider.toUpperCase()}: Usage:`, response.data.usage);
        console.log(`🤖 ${selectedProvider.toUpperCase()}: Model:`, response.data.model);
        
        // Всегда сохраняем ответ в историю
        try {
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
            console.log(`💾 Ответ автоматически сохранен в историю: ${newResponse.id}`);
        } catch (error) {
            console.error('❌ Ошибка сохранения в историю:', error);
        }

        return res.json({ 
          success: true, 
          content: modelResponse,
          model: response.data.model,
          usage: response.data.usage,
          provider: selectedProvider,
          rag: ragInfo
        });
      } else {
        return res.status(500).json({ 
          error: 'Invalid response from AI model',
          provider: selectedProvider,
          data: response.data 
        });
      }
    } catch (error) {
      console.error(`❌ Error with provider:`, error);
      
      let errorMessage = 'Failed to process request';
      let errorDetails = null;
      
      if (error.response) {
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
        errorMessage = 'Network error. Could not connect to AI service.';
        errorDetails = { request: error.request };
      } else {
        errorMessage = error.message;
        errorDetails = { stack: error.stack };
      }
      
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
      
      // Разрешаем имя модели (может быть CHEAP/FAST/RICH или пусто)
      const resolved = resolveModelName(model, provider);
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
      console.log(`📤 Отправка запроса с промптом "${prompt_name}" к модели: ${model} (${selectedProvider})`);
      
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
        console.log('DEBUG SERVER: Model response via /api/send-request-sys:', modelResponse.substring(0, 500) + (modelResponse.length > 500 ? '...' : ''));
        console.log('DEBUG SERVER: Usage via /api/send-request-sys:', response.data.usage);
        console.log('DEBUG SERVER: Model used via /api/send-request-sys:', response.data.model);
        console.log('DEBUG SERVER: Prompt used:', prompt_name);

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
          
          console.log(`Response automatically saved to history with ID: ${newResponse.id}`);
        } catch (error) {
          console.error('Error saving response to history:', error);
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
        console.log('DEBUG SERVER: Invalid response structure from AI model via /api/send-request-sys:', response.data);
        return res.status(500).json({ 
          error: 'Invalid response from AI model',
          data: response.data 
        });
      }
    } catch (error) {
      console.error('Error sending request to AI model:', error);
      
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
      console.log('DEBUG SERVER: API error details via /api/send-request-sys:', {
          status: error.response.status,
          data: error.response.data
        });
      } else if (error.request) {
        // Ошибка сети
        errorMessage = 'Network error. Could not connect to AI service.';
        errorDetails = { request: error.request };
        console.log('DEBUG SERVER: Network error via /api/send-request-sys - no response received');
      } else {
        errorMessage = error.message;
        errorDetails = { stack: error.stack };
        console.log('DEBUG SERVER: General error via /api/send-request-sys:', error.message, error.stack);
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
      console.error('Error fetching available prompts:', error);
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
    console.error('Ошибка при получении контекстных кодов:', error);
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
    console.error('Ошибка при получении списка документов:', error);
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
    console.error('Ошибка при запросе к RAG:', error);
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
    console.error('Ошибка при сохранении файла:', error);
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
    console.error('Ошибка при получении информации о директории:', error);
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
    
    console.log('DEBUG: Received request to /analyze endpoint with params:', {
      model,
      promptLength: prompt ? prompt.length : 0,
      inputTextLength: inputText ? inputText.length : 0,
      useRag,
      contextCode
    });
    
    if (!prompt || !inputText) {
      return res.status(400).json({ error: 'Поля prompt и inputText обязательны' });
    }
    
    // Разрешаем имя модели (может быть CHEAP/FAST/RICH или пусто)
    const resolved = resolveModelName(model, provider);
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
    console.log(`Sending request to model via /analyze: ${model}`);
    
    let finalInputText = inputText;
    let ragInfo = null;
    
    // Если включен RAG и сервис доступен, обогащаем запрос контекстом из RAG
    if (useRag && config.langchainPg.enabled) {
      try {
        console.log(`Using RAG with context code: ${contextCode || 'all'}`);
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
          console.log('!!! No documents found in RAG response');
        }
  
      } catch (ragError) {
        console.error('Error using RAG:', ragError);
        // Продолжаем без RAG в случае ошибки
      }
    }
    else {
      console.log('!!! Without RAGs');
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
      console.log('DEBUG SERVER: Model response via /analyze:', modelResponse.substring(0, 500) + (modelResponse.length > 500 ? '...' : ''));
      console.log('DEBUG SERVER: Usage via /analyze:', response.data.usage);
      console.log('DEBUG SERVER: Model used via /analyze:', response.data.model);
      
      return res.json({ 
        success: true, 
        content: modelResponse,
        model: response.data.model,
        usage: response.data.usage,
        rag: ragInfo
      });
    } else {
      console.log('DEBUG SERVER: Invalid response structure from AI model via /analyze:', response.data);
      return res.status(500).json({ 
        error: 'Invalid response from AI model',
        data: response.data 
      });
    }
  } catch (error) {
    console.error('Error sending request to AI model via /analyze:', error);
    
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
      console.log('DEBUG SERVER: API error details via /analyze:', {
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.request) {
      // Ошибка сети
      errorMessage = 'Network error. Could not connect to AI service.';
      errorDetails = { request: error.request };
      console.log('DEBUG SERVER: Network error via /analyze - no response received');
    } else {
      errorMessage = error.message;
      errorDetails = { stack: error.stack };
      console.log('DEBUG SERVER: General error via /analyze:', error.message, error.stack);
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
    console.error(err);
    res.status(500).json({ error: 'Failed to load models' });
  }
});

// === ТЕСТ МОДЕЛИ В ОДИН КЛИК (улучшенная версия) ===
app.post('/api/test-model', async (req, res) => {
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
      const apiKeyEnv = model.api_key_env || 'ZAI_API_KEY';
      const baseUrl = model.base_url || "https://api.z.ai/api/paas/v4";
      const modelName = model.name.replace(/^glm-/, '');
      
      apiRes = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: modelName,
          messages: [{ role: "user", content: "Кто ты? Ответь в одном предложении на русском." }]
        },
        { headers: { Authorization: `Bearer ${process.env[apiKeyEnv]}` }, timeout: 20000 }
      );
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

  // Сохраняем
  const idx = models.findIndex(m => m.id === modelId);
  models[idx].last_test = result;
  await saveModels(models);

  res.json({ success: true, result });
});

// Текущие выбранные CHEAP / FAST / RICH
app.get('/api/default-models', async (req, res) => {
  const models = await loadModels();
  const defaults = {
    cheap: models.find(m => m.cost_level === 'cheap' && m.is_default) || null,
    fast:  models.find(m => m.cost_level === 'fast'  && m.is_default) || null,
    rich:  models.find(m => m.cost_level === 'rich'  && m.is_default) || null
  };
  res.json(defaults);
});

// Сменить дефолтную модель
app.post('/api/default-models/set', async (req, res) => {
  const { modelId, type } = req.body;

  if (!['cheap', 'fast', 'rich'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }

  let models = await loadModels();

  const target = models.find(m => m.id === modelId);
  if (!target) {
    return res.status(400).json({ error: 'Model not found' });
  }

  // Сбрасываем все is_default этого типа
  models = models.map(m => ({
    ...m,
    is_default: m.cost_level === type ? false : m.is_default
  }));

  // Меняем cost_level и устанавливаем is_default для выбранной модели
  const targetIndex = models.findIndex(m => m.id === modelId);
  if (targetIndex !== -1) {
    models[targetIndex] = {
      ...models[targetIndex],
      cost_level: type,
      is_default: true
    };
  }

  await saveModels(models);

  res.json({ success: true, selected: models[targetIndex] });
});

// Эндпоинт для получения конкретной модели по умолчанию по типу
app.get('/api/default-models/:type', (req, res) => {
    const { type } = req.params;
    
    if (!['cheap', 'fast', 'rich'].includes(type)) {
        return res.status(400).json({ 
            success: false,
            error: 'Недопустимый тип модели. Используйте: cheap, fast, rich' 
        });
    }
    
    res.json({
        success: true,
        type,
        model: config.defaultModels[type]
    });
});

async function refreshOpenRouterModels() {
  try {
    console.log('Обновляем список OpenRouter...');
    const { data } = await axios.get('https://openrouter.ai/api/v1/models');

    let localModels = await loadModels();

    // Сохраняем текущие дефолты
    const currentDefaults = {
      cheap: localModels.find(m => m.cost_level === 'cheap' && m.is_default)?.id,
      fast:  localModels.find(m => m.cost_level === 'fast'  && m.is_default)?.id,
      rich:  localModels.find(m => m.cost_level === 'rich'  && m.is_default)?.id
    };

    // Удаляем все старые openroute модели
    localModels = localModels.filter(m => m.provider !== 'openroute');

    // Добавляем новые
    for (const remote of data.data) {
      if (remote.id.includes(':free') || remote.id.includes('-free') || remote.id.endsWith(':free')) {
        const newModel = {
          id: `or-${remote.id.replace(/:/g, '-')}`,
          provider: "openroute",
          name: remote.id,
          visible_name: `OpenRouter → ${remote.name || remote.id}`,
          context: remote.context_length || 32768,
          cost_level: "cheap",
          is_default: currentDefaults.cheap === `or-${remote.id.replace(/:/g, '-')}`,
          enabled: true,
          free: true,
          added_at: new Date().toISOString()
        };
        localModels.push(newModel);
      }
    }

    await saveModels(localModels);
    console.log(`OpenRouter обновлён: добавлено/обновлено ${data.data.length} моделей`);
  } catch (err) {
    console.error('Ошибка автообновления OpenRouter:', err.message);
  }
}

// При старте и каждые 8 часов
refreshOpenRouterModels();
setInterval(refreshOpenRouterModels, 8 * 60 * 60 * 1000);

const PORT = process.env.PORT || config.port;

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Откройте http://localhost:${PORT} в вашем браузере`);
});