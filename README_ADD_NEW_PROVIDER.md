# Добавление нового провайдера моделей

Это руководство описывает процесс добавления нового провайдера AI-моделей в систему kosmos-model.

---

## Содержание

1. [Обзор архитектуры](#1-обзор-архитектуры)
2. [Способ 1: Использование существующих провайдеров](#2-способ-1-использование-существующих-провайдеров)
3. [Способ 2: Создание нового сервиса-провайдера](#3-способ-2-создание-нового-сервиса-провайдера)
4. [Интеграция в server.js](#4-интеграция-в-serverjs)
5. [Структура модели в available-models.json](#5-структура-модели-в-available-modelsjson)
6. [Конфигурация окружения](#6-конфигурация-окружения)
7. [Автоматическое обновление моделей](#7-автоматическое-обновление-моделей)
8. [Тестирование](#8-тестирование)

---

## 1. Обзор архитектуры

Система поддерживает три типа провайдеров:

| Провайдер | Описание | Файл сервиса |
|-----------|----------|--------------|
| `openroute` | OpenRouter API (агрегатор моделей) | Встроен в server.js |
| `groq` | GROQ Cloud (быстрые модели) | `groq-service.js` |
| `direct` | Любой OpenAI-совместимый API | `direct-service.js` |

### Поток запроса

```
Клиент → /api/send-request → server.js → Выбор провайдера → Сервис → API провайдера
```

---

## 2. Способ 1: Использование существующих провайдеров

Самый простой способ — добавить модель через уже реализованный провайдер.

### 2.1. OpenRouter (`openroute`)

Добавьте запись в `data/available-models.json`:

```json
{
  "id": "or-vendor/model-name-free",
  "provider": "openroute",
  "name": "vendor/model-name:free",
  "visible_name": "OpenRouter → Vendor Model Name (free)",
  "context": 32768,
  "cost_level": "cheap",
  "enabled": true,
  "free": true,
  "user_type": null,
  "added_at": "2025-01-01T00:00:00Z"
}
```

**Требования:**
- Переменная окружения `OPENROUTER_API_KEY` в `.env`
- Поле `name` должно соответствовать ID модели в OpenRouter API

### 2.2. GROQ (`groq`)

```json
{
  "id": "groq-llama-3.3-70b",
  "provider": "groq",
  "name": "llama-3.3-70b-versatile",
  "visible_name": "🚀 GROQ → Llama 3.3 70B",
  "context": 8192,
  "cost_level": "fast",
  "fast": true,
  "enabled": true,
  "user_type": null,
  "added_at": "2025-01-01T00:00:00Z"
}
```

**Требования:**
- Переменная окружения `GROQ_API_KEY` в `.env`
- Поле `name` должно соответствовать ID модели в GROQ API

### 2.3. Direct (`direct`) — OpenAI-совместимые API

Для любого API, совместимого с OpenAI Chat Completions:

```json
{
  "id": "direct-my-model",
  "provider": "direct",
  "name": "model-name-from-api",
  "visible_name": "MyProvider → Model Name",
  "base_url": "https://api.myprovider.com/v1",
  "api_key": "env:MY_PROVIDER_API_KEY",
  "context": 131072,
  "cost_level": "rich",
  "enabled": true,
  "user_type": null,
  "added_at": "2025-01-01T00:00:00Z"
}
```

**Важные поля для `direct`:**
- `base_url` — базовый URL API (без `/chat/completions`)
- `api_key` — ключ в формате `env:VAR_NAME` или напрямую (не рекомендуется)

**Примеры `base_url` для разных провайдеров:**

| Провайдер | base_url |
|-----------|----------|
| Z.AI | `https://api.z.ai/api/paas/v4` |
| Ollama (локально) | `http://localhost:11434/v1` |
| Azure OpenAI | `https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT` |
| Together.ai | `https://api.together.xyz/v1` |
| Fireworks | `https://api.fireworks.ai/inference/v1` |

---

## 3. Способ 2: Создание нового сервиса-провайдера

Если провайдер имеет специфичный API, создайте отдельный сервис.

### 3.1. Шаблон сервиса

Создайте файл `my-provider-service.js`:

```javascript
const axios = require('axios');

class MyProviderService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('MyProvider API ключ не настроен');
        }
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.myprovider.com/v1';
        console.log('🚀 MyProviderService инициализирован');
    }

    /**
     * Основной метод для отправки запросов
     * @param {Object} params - Параметры запроса
     * @param {string} params.model - Имя модели
     * @param {Array} params.messages - Массив сообщений [{role, content}]
     * @param {number} params.temperature - Температура (0-1)
     * @param {number} params.maxTokens - Максимум токенов в ответе
     * @param {boolean} params.stream - Включить стриминг
     * @returns {Object} - {content, model, usage, provider, responseTime}
     */
    async sendRequest({ model, messages, temperature = 0.7, maxTokens = 1024, stream = false }) {
        try {
            console.log(`📤 MyProvider: Отправляем запрос к модели ${model}`);
            
            const startTime = Date.now();
            
            // Формируем payload (адаптируйте под API провайдера)
            const payload = {
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
                stream
            };
            
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: 60000
                }
            );
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            if (stream) {
                return response.data;
            }
            
            const completion = response.data;
            const content = completion.choices?.[0]?.message?.content || '';
            
            const result = {
                content,
                model: completion.model || model,
                usage: completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                provider: 'myprovider',
                responseTime
            };
            
            console.log(`✅ MyProvider: Ответ за ${responseTime}ms`);
            console.log(`📊 MyProvider: Токены:`, completion.usage);
            
            return result;
            
        } catch (error) {
            console.error('❌ MyProvider API Error:', error.message);
            throw new Error(`MyProvider API Error: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    /**
     * Быстрый чат для тестирования
     */
    async quickChat(prompt, model = "default-model") {
        const messages = [{ role: "user", content: prompt }];
        return await this.sendRequest({ model, messages });
    }

    /**
     * Проверка доступности сервиса
     */
    async checkAvailability() {
        try {
            await this.quickChat("test");
            return { available: true, provider: 'myprovider' };
        } catch (error) {
            return { available: false, error: error.message };
        }
    }
}

module.exports = MyProviderService;
```

### 3.2. Обязательные методы сервиса

| Метод | Назначение |
|-------|------------|
| `constructor(apiKey)` | Инициализация с API ключом |
| `sendRequest({model, messages, temperature, maxTokens, stream})` | Основной метод отправки запроса |
| `quickChat(prompt, model)` | Упрощённый метод для тестов |
| `checkAvailability()` | Проверка доступности API |

### 3.3. Формат ответа `sendRequest()`

```javascript
{
    content: "Текст ответа модели",
    model: "имя-модели",
    usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
    },
    provider: "myprovider",
    responseTime: 1234  // миллисекунды
}
```

---

## 4. Интеграция в server.js

### 4.1. Импорт сервиса

В начале файла `server.js` (после строки 15):

```javascript
const GroqService = require('./groq-service');
const DirectService = require('./direct-service');
const MyProviderService = require('./my-provider-service');  // <-- Добавить
```

### 4.2. Инициализация сервиса

После инициализации groqService (около строки 178):

```javascript
// Инициализируем MyProvider сервис если ключ доступен
let myProviderService = null;
if (process.env.MY_PROVIDER_API_KEY) {
    try {
        myProviderService = new MyProviderService(process.env.MY_PROVIDER_API_KEY);
        console.log('✅ MyProvider сервис инициализирован');
    } catch (error) {
        console.warn('⚠️ MyProvider сервис не инициализирован:', error.message);
    }
} else {
    console.warn('⚠️ MY_PROVIDER_API_KEY не настроен');
}
```

### 4.3. Добавить провайдера в конфиг API

В эндпоинте `/api/config` (около строки 210):

```javascript
providers: {
    openroute: !!config.openRouterKey,
    groq: !!config.groqKey,
    myprovider: !!myProviderService  // <-- Добавить
},
```

### 4.4. Проверка доступности провайдера

В `/api/send-request` (около строки 679):

```javascript
if (selectedProvider === 'myprovider' && !myProviderService) {
    return res.status(500).json({ error: 'MyProvider сервис не настроен' });
}
```

### 4.5. Обработка запроса

В `/api/send-request` после блока `else if (selectedProvider === 'direct')` (около строки 844):

```javascript
} else if (selectedProvider === 'myprovider') {
    const myProviderResponse = await myProviderService.sendRequest({
        model,
        messages,
        temperature: finalTemperature,
        maxTokens: finalMaxTokens
    });
    
    response = {
        data: {
            choices: [{
                message: { content: myProviderResponse.content }
            }],
            model: myProviderResponse.model,
            usage: myProviderResponse.usage
        }
    };
}
```

### 4.6. Тестирование модели

В эндпоинте `/api/test-model` (около строки 1634):

```javascript
} else if (model.provider === 'myprovider') {
    if (!myProviderService) {
        throw new Error('MyProvider сервис не инициализирован');
    }
    
    const testResponse = await myProviderService.sendRequest({
        model: model.name,
        messages: [{ role: "user", content: "Кто ты? Ответь в одном предложении на русском." }],
        maxTokens: 120,
        temperature: 0
    });
    
    apiRes = {
        data: {
            choices: [{ message: { content: testResponse.content } }]
        }
    };
}
```

---

## 5. Структура модели в available-models.json

### 5.1. Обязательные поля

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Уникальный ID модели (например, `groq-llama-3.3-70b`) |
| `provider` | string | Имя провайдера: `openroute`, `groq`, `direct`, или ваш кастомный |
| `name` | string | Имя модели для API провайдера |
| `enabled` | boolean | Включена ли модель |

### 5.2. Опциональные поля

| Поле | Тип | Описание | Значение по умолчанию |
|------|-----|----------|----------------------|
| `visible_name` | string | Отображаемое имя в UI | `name` |
| `context` | number | Размер контекстного окна | `8192` |
| `cost_level` | string | Уровень стоимости: `cheap`, `fast`, `rich` | `cheap` |
| `fast` | boolean | Флаг быстрой модели | `false` |
| `free` | boolean | Бесплатная модель | `false` |
| `user_type` | string\|null | Роль: `CHEAP`, `FAST`, `RICH` или `null` | `null` |
| `base_url` | string | URL API (только для `direct`) | — |
| `api_key` | string | API ключ или `env:VAR_NAME` (только для `direct`) | — |
| `added_at` | string | Дата добавления (ISO 8601) | — |
| `last_test` | object | Результат последнего теста | — |

### 5.3. Структура `last_test`

```json
{
  "success": true,
  "response_time_ms": 1234,
  "sample_response": "Ответ модели...",
  "error_message": "Сообщение об ошибке или 'Неизвестная ошибка'",
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

### 5.4. Полные примеры

**OpenRouter модель:**
```json
{
  "id": "or-google/gemini-2.0-flash-exp-free",
  "provider": "openroute",
  "name": "google/gemini-2.0-flash-exp:free",
  "visible_name": "OpenRouter → Google: Gemini 2.0 Flash (free)",
  "context": 1048576,
  "cost_level": "cheap",
  "enabled": true,
  "free": true,
  "user_type": "CHEAP",
  "added_at": "2025-01-01T00:00:00Z"
}
```

**GROQ модель:**
```json
{
  "id": "groq-llama-3.3-70b-versatile",
  "provider": "groq",
  "name": "llama-3.3-70b-versatile",
  "visible_name": "🚀 GROQ → Llama 3.3 70B Versatile",
  "context": 8192,
  "cost_level": "fast",
  "fast": true,
  "enabled": true,
  "user_type": "FAST",
  "added_at": "2025-01-01T00:00:00Z"
}
```

**Direct модель (Z.AI):**
```json
{
  "id": "direct-glm-4.6",
  "provider": "direct",
  "name": "glm-4.6",
  "visible_name": "Z.AI → GLM 4.6",
  "base_url": "https://api.z.ai/api/paas/v4",
  "api_key": "env:ZAI_API_KEY",
  "context": 131072,
  "cost_level": "rich",
  "enabled": true,
  "user_type": "RICH",
  "added_at": "2025-01-01T00:00:00Z"
}
```

**Direct модель (Ollama локально):**
```json
{
  "id": "direct-ollama-llama3",
  "provider": "direct",
  "name": "llama3:8b",
  "visible_name": "Ollama → Llama 3 8B (локально)",
  "base_url": "http://localhost:11434/v1",
  "api_key": "ollama",
  "context": 8192,
  "cost_level": "cheap",
  "enabled": true,
  "user_type": null,
  "added_at": "2025-01-01T00:00:00Z"
}
```

---

## 6. Конфигурация окружения

### 6.1. Переменные в `.env`

```env
# Существующие провайдеры
OPENROUTER_API_KEY=sk-or-v1-xxxxx
GROQ_API_KEY=gsk_xxxxx

# Direct провайдеры
ZAI_API_KEY=your-zai-api-key

# Ваш новый провайдер
MY_PROVIDER_API_KEY=your-api-key
```

### 6.2. Обновление config.js (опционально)

Если нужно хранить ключ в конфиге, добавьте в `createConfig()`:

```javascript
return {
    // ...существующие поля
    myProviderKey: env.MY_PROVIDER_API_KEY,
    // ...
};
```

---

## 7. Автоматическое обновление моделей

Если провайдер имеет API для получения списка моделей, добавьте функцию refresh.

### 7.1. Функция обновления

```javascript
async function refreshMyProviderModels() {
    if (!myProviderService) {
        console.warn('⚠️ MyProvider сервис не настроен, обновление моделей пропущено.');
        return;
    }
    
    try {
        console.log('Обновляем список MyProvider моделей...');
        
        // Запрос к API провайдера для получения списка моделей
        const { data } = await axios.get('https://api.myprovider.com/v1/models', {
            headers: { Authorization: `Bearer ${process.env.MY_PROVIDER_API_KEY}` }
        });
        
        let localModels = await loadModels();
        
        // Собираем Map актуальных моделей
        const activeRemoteMap = new Map();
        for (const remote of data.data) {
            const internalId = `myprovider-${remote.id}`;
            activeRemoteMap.set(internalId, remote);
        }
        
        let addedCount = 0;
        let disabledCount = 0;
        
        // Отключаем модели, которых больше нет в API
        localModels = localModels.map(model => {
            if (model.provider === 'myprovider') {
                if (!activeRemoteMap.has(model.id)) {
                    if (model.enabled) {
                        disabledCount++;
                        return { ...model, enabled: false };
                    }
                }
            }
            return model;
        });
        
        // Добавляем новые модели
        for (const [id, remote] of activeRemoteMap) {
            const exists = localModels.some(m => m.id === id);
            if (!exists) {
                const newModel = {
                    id: id,
                    provider: "myprovider",
                    name: remote.id,
                    visible_name: `MyProvider → ${remote.name || remote.id}`,
                    context: remote.context_length || 8192,
                    cost_level: "cheap",
                    user_type: null,
                    enabled: true,
                    added_at: new Date().toISOString()
                };
                localModels.push(newModel);
                addedCount++;
            }
        }
        
        await saveModels(localModels);
        console.log(`MyProvider синхронизирован: ${addedCount} новых, ${disabledCount} отключено.`);
        
    } catch (err) {
        console.error('Ошибка автообновления MyProvider:', err.message);
    }
}
```

### 7.2. Запуск при старте и по расписанию

В конце `server.js` (перед `app.listen`):

```javascript
// При старте
refreshMyProviderModels();

// Каждые 8 часов
setInterval(refreshMyProviderModels, 8 * 60 * 60 * 1000);
```

---

## 8. Тестирование

### 8.1. Через UI

1. Откройте страницу моделей: `http://localhost:3002/models.html`
2. Найдите добавленную модель
3. Нажмите кнопку "Тест" для проверки

### 8.2. Через API

```bash
# Тестирование модели
curl -X POST http://localhost:3002/api/test-model \
  -H "Content-Type: application/json" \
  -d '{"modelId": "direct-my-model"}'

# Отправка запроса
curl -X POST http://localhost:3002/api/send-request \
  -H "Content-Type: application/json" \
  -d '{
    "model": "model-name",
    "provider": "myprovider",
    "prompt": "Ты полезный ассистент.",
    "inputText": "Привет! Кто ты?"
  }'
```

### 8.3. Проверка конфигурации

```bash
curl http://localhost:3002/api/config
```

Убедитесь, что в ответе `providers.myprovider: true`.

---

## Чек-лист добавления нового провайдера

- [ ] Определить тип интеграции (существующий провайдер или новый сервис)
- [ ] Добавить API ключ в `.env`
- [ ] Создать файл сервиса (если нужен новый провайдер)
- [ ] Добавить импорт и инициализацию в `server.js`
- [ ] Добавить обработку в `/api/send-request`
- [ ] Добавить обработку в `/api/test-model`
- [ ] Добавить модели в `data/available-models.json`
- [ ] (Опционально) Добавить функцию автообновления моделей
- [ ] Протестировать через UI и API

---

## Типичные ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `API ключ не настроен` | Не задана переменная окружения | Добавьте ключ в `.env` и перезапустите сервер |
| `Модель не найдена` | Неверное имя модели в `name` | Проверьте документацию API провайдера |
| `Timeout` | Слишком долгий ответ | Увеличьте timeout в сервисе |
| `401/403 Unauthorized` | Неверный или недействительный ключ | Проверьте API ключ |
| `429 Too Many Requests` | Превышен лимит запросов | Добавьте задержку или используйте другой ключ |

---

## Полезные ссылки

- [OpenRouter API Documentation](https://openrouter.ai/docs)
- [GROQ API Documentation](https://console.groq.com/docs)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference) (для совместимых API)

