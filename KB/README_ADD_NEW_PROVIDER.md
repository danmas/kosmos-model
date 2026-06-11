# Добавление нового провайдера моделей

**Актуализация:** 2026-02-16

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
8. [Продвинутые сценарии](#8-продвинутые-сценарии)
9. [Полный пример: GigaChat (Сбер)](#9-полный-пример-gigachat-сбер)
10. [Тестирование](#10-тестирование)

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

> **⚠️ КРИТИЧЕСКИ ВАЖНО: `user_type` при добавлении моделей**
>
> При добавлении новых моделей **ВСЕГДА** устанавливайте `user_type: null`!
>
> **Почему это важно:**
> - В системе может быть только **ОДНА** модель каждого типа (`CHEAP`, `FAST`, `RICH`)
> - Если вы установите `user_type: "RICH"` для новой модели, она **перезапишет** существующую дефолтную модель
> - Роль модели назначается пользователем через UI (страница моделей) или API `/api/default-models/set`
>
> **Неправильно** (перезапишет существующие дефолты):
> ```json
> { "id": "new-model-1", "user_type": "CHEAP" },
> { "id": "new-model-2", "user_type": "FAST" },
> { "id": "new-model-3", "user_type": "RICH" }
> ```
>
> **Правильно** (добавит модели без изменения дефолтов):
> ```json
> { "id": "new-model-1", "user_type": null },
> { "id": "new-model-2", "user_type": null },
> { "id": "new-model-3", "user_type": null }
> ```

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

> **Примечание:** Во всех примерах `user_type: null` — роль назначается после добавления через UI.

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
  "user_type": null,
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
  "user_type": null,
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
  "user_type": null,
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

## 8. Продвинутые сценарии

Этот раздел описывает более сложные случаи интеграции провайдеров.

### 8.1. OAuth2 / Token-based авторизация

Некоторые API (GigaChat, YandexGPT, некоторые enterprise решения) требуют сначала получить временный токен доступа.

**Паттерн реализации:**

```javascript
class TokenBasedService {
    constructor(authData) {
        this.authData = authData;
        this.token = null;
        this.tokenExpiresAt = 0;
    }

    // Получение токена с кэшированием
    async getAccessToken() {
        const now = Date.now();
        
        // Если токен валиден (с запасом 60 сек), возвращаем его
        if (this.token && this.tokenExpiresAt > now + 60_000) {
            return this.token;
        }

        // Запрос нового токена
        const response = await fetch('https://api.provider.com/oauth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${this.authData}`
            },
            body: 'scope=API_ACCESS'
        });

        if (!response.ok) {
            throw new Error(`Ошибка получения токена: ${response.status}`);
        }

        const data = await response.json();
        this.token = data.access_token;
        
        // Время жизни токена (обычно ~30 минут)
        this.tokenExpiresAt = data.expires_at 
            ? data.expires_at * 1000 
            : now + 29 * 60 * 1000;
        
        console.log('Токен обновлён');
        return this.token;
    }

    async sendRequest({ model, messages, ...params }) {
        const token = await this.getAccessToken();  // Автоматическое обновление
        
        // Используем Bearer токен для запроса
        const response = await fetch('https://api.provider.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ model, messages, ...params })
        });
        
        // ... обработка ответа
    }
}
```

**Ключевые моменты:**
- Токен кэшируется в памяти сервиса
- Проверка `tokenExpiresAt` перед каждым запросом
- Автоматическое обновление при истечении
- Запас времени (60 сек) для предотвращения race conditions

### 8.2. Работа с самоподписанными сертификатами

Некоторые российские API (GigaChat, внутренние корпоративные сервисы) используют самоподписанные SSL-сертификаты.

**Для `fetch` (Node.js 18+):**

```javascript
const https = require('https');

// Создаём агент, игнорирующий проверку сертификата
const agent = new https.Agent({
    rejectUnauthorized: false
});

const response = await fetch('https://api.provider.com:9443/oauth', {
    method: 'POST',
    agent: agent,  // Передаём агент
    headers: { ... },
    body: '...'
});
```

**Для `axios`:**

```javascript
const https = require('https');
const axios = require('axios');

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

const response = await axios.post('https://api.provider.com:9443/oauth', data, {
    httpsAgent: httpsAgent,
    headers: { ... }
});
```

> **⚠️ Внимание:** `rejectUnauthorized: false` отключает проверку сертификата. 
> Используйте только для доверенных API, не в production с внешними сервисами.

**Когда это нужно:**
- GigaChat API (Сбер) — порт 9443
- YandexGPT (некоторые endpoints)
- Внутренние корпоративные LLM-сервисы
- Локальные Ollama/LM Studio через HTTPS

### 8.3. Специфичные заголовки API

Некоторые провайдеры требуют дополнительные заголовки для трейсинга или авторизации.

**Примеры:**

```javascript
const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    
    // Уникальный ID запроса (GigaChat, некоторые enterprise API)
    'RqUID': crypto.randomUUID(),
    
    // Или альтернативные варианты
    'X-Request-ID': crypto.randomUUID(),
    'X-Trace-Id': `trace-${Date.now()}`,
    
    // Идентификация приложения (OpenRouter, некоторые API)
    'HTTP-Referer': 'http://localhost:3002',
    'X-Title': 'Kosmos Model Gateway',
    
    // Кастомные заголовки провайдера
    'X-API-Version': '2024-01-01'
};
```

**Генерация UUID в Node.js:**

```javascript
// Node.js 16+
const { randomUUID } = require('crypto');
const rquid = randomUUID();

// Или через глобальный crypto (Node.js 19+)
const rquid = crypto.randomUUID();
```

### 8.4. Выбор HTTP-клиента: axios vs fetch

| Характеристика | axios | fetch (native) |
|---------------|-------|----------------|
| Зависимости | Требует установки | Встроен в Node.js 18+ |
| Автоматический JSON | Да | Нужен `response.json()` |
| Интерцепторы | Да | Нет |
| Таймауты | Встроены | Через AbortController |
| Прогресс загрузки | Да | Сложнее |
| Размер бандла | ~15KB | 0 |

**Когда использовать axios (наш шаблон по умолчанию):**
- Более простой синтаксис
- Автоматическая обработка JSON
- Удобная обработка ошибок (`error.response.data`)
- Поддержка старых версий Node.js

**Когда использовать fetch:**
- Минимизация зависимостей
- Node.js 18+ проекты
- Соответствие браузерному API
- Специфичные требования (например, GigaChat использует fetch)

**Пример с fetch:**

```javascript
async sendRequest({ model, messages, temperature, maxTokens }) {
    const startTime = Date.now();
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    return {
        content: data.choices[0]?.message?.content || '',
        model: data.model || model,
        usage: data.usage || {},
        provider: 'myprovider',
        responseTime
    };
}
```

### 8.5. Специфичные параметры моделей

Некоторые провайдеры поддерживают дополнительные параметры:

```javascript
const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    
    // GigaChat
    repetition_penalty: 1.18,
    
    // Claude (Anthropic)
    top_k: 40,
    
    // OpenAI/совместимые
    presence_penalty: 0.6,
    frequency_penalty: 0.5,
    
    // Reasoning модели (o1, DeepSeek R1)
    // НЕ передавать temperature!
    
    // Стриминг
    stream: false
};
```

---

## 9. Полный пример: GigaChat (Сбер)

Реальный пример интеграции провайдера с OAuth2, самоподписанными сертификатами и специфичными заголовками.

### 9.1. Файл сервиса `gigachat-service.js`

```javascript
// gigachat-service.js
const https = require('https');
const crypto = require('crypto');

class GigaChatService {
    constructor(authData) {
        if (!authData) {
            throw new Error('GigaChat: AUTH_DATA не передан');
        }
        this.authData = authData.trim();
        this.token = null;
        this.tokenExpiresAt = 0;
        
        // Агент для работы с самоподписанным сертификатом
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });
        
        console.log('🟢 GigaChatService инициализирован');
    }

    // Получение токена с кэшированием
    async getAccessToken() {
        const now = Date.now();
        if (this.token && this.tokenExpiresAt > now + 60_000) {
            return this.token;
        }

        const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
            method: 'POST',
            agent: this.httpsAgent,
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
            throw new Error(`GigaChat OAuth: ${response.status} ${err}`);
        }

        const data = await response.json();
        this.token = data.access_token;
        this.tokenExpiresAt = data.expires_at 
            ? data.expires_at * 1000 
            : now + 29 * 60 * 1000;
            
        console.log('🔑 GigaChat: токен обновлён');
        return this.token;
    }

    async sendRequest({ model, messages, temperature = 0.7, maxTokens = 1024, stream = false }) {
        const token = await this.getAccessToken();
        const startTime = Date.now();

        const payload = {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            repetition_penalty: 1.18,  // Специфичный параметр GigaChat
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
            throw new Error(`GigaChat API: ${response.status} ${err}`);
        }

        const data = await response.json();
        const responseTime = Date.now() - startTime;

        return {
            content: data.choices[0]?.message?.content || '',
            model: data.model || model,
            usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            provider: 'gigachat',
            responseTime
        };
    }

    async quickChat(prompt, model = "GigaChat") {
        return this.sendRequest({
            model,
            messages: [{ role: "user", content: prompt }],
            maxTokens: 500
        });
    }

    async checkAvailability() {
        try {
            await this.quickChat("Привет");
            return { available: true, provider: 'gigachat' };
        } catch (err) {
            return { available: false, error: err.message };
        }
    }
}

module.exports = GigaChatService;
```

### 9.2. Конфигурация `.env`

```env
# GigaChat (Сбер)
# Получить: https://developers.sber.ru/portal/products/gigachat-api
# → Ваш проект → Настройки → "Скопировать данные авторизации"
GIGACHAT_AUTH_DATA=ваша_строка_авторизации_base64
```

### 9.3. Интеграция в `server.js`

```javascript
// Импорт (в начало файла)
const GigaChatService = require('./gigachat-service');

// Инициализация (после groqService)
let gigachatService = null;
if (process.env.GIGACHAT_AUTH_DATA) {
    try {
        gigachatService = new GigaChatService(process.env.GIGACHAT_AUTH_DATA);
        console.log('✅ GigaChat сервис инициализирован');
    } catch (error) {
        console.warn('⚠️ GigaChat не инициализирован:', error.message);
    }
} else {
    console.warn('⚠️ GIGACHAT_AUTH_DATA не настроен');
}

// В /api/config → providers:
providers: {
    openroute: !!config.openRouterKey,
    groq: !!config.groqKey,
    gigachat: !!gigachatService
},

// В /api/send-request → проверка доступности:
if (selectedProvider === 'gigachat' && !gigachatService) {
    return res.status(500).json({ error: 'GigaChat сервис не настроен' });
}

// В /api/send-request → обработка запроса:
} else if (selectedProvider === 'gigachat') {
    const gcResponse = await gigachatService.sendRequest({
        model,
        messages,
        temperature: finalTemperature,
        maxTokens: finalMaxTokens
    });
    
    response = {
        data: {
            choices: [{ message: { content: gcResponse.content } }],
            model: gcResponse.model,
            usage: gcResponse.usage
        }
    };
}

// В /api/test-model:
} else if (model.provider === 'gigachat') {
    if (!gigachatService) throw new Error('GigaChat не инициализирован');
    
    const test = await gigachatService.sendRequest({
        model: model.name,
        messages: [{ role: "user", content: "Кто ты? Ответь кратко." }],
        temperature: 0,
        maxTokens: 100
    });

    apiRes = {
        data: { choices: [{ message: { content: test.content } }] }
    };
}
```

### 9.4. Модели в `available-models.json`

```json
{
  "id": "gigachat-max",
  "provider": "gigachat",
  "name": "GigaChat-Max",
  "visible_name": "Сбер → GigaChat Max",
  "context": 32768,
  "cost_level": "rich",
  "enabled": true,
  "user_type": null,
  "added_at": "2025-01-01T00:00:00Z"
},
{
  "id": "gigachat-pro",
  "provider": "gigachat",
  "name": "GigaChat-Pro",
  "visible_name": "Сбер → GigaChat Pro",
  "context": 16384,
  "cost_level": "fast",
  "enabled": true,
  "user_type": null,
  "added_at": "2025-01-01T00:00:00Z"
},
{
  "id": "gigachat-lite",
  "provider": "gigachat",
  "name": "GigaChat",
  "visible_name": "Сбер → GigaChat (Lite)",
  "context": 8192,
  "cost_level": "cheap",
  "enabled": true,
  "user_type": null,
  "added_at": "2025-01-01T00:00:00Z"
}
```

> **Обратите внимание:** Все модели добавлены с `user_type: null`. 
> Роль назначается пользователем после добавления через UI.

---

## 10. Тестирование

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
- [GigaChat API (Сбер)](https://developers.sber.ru/portal/products/gigachat-api)
- [YandexGPT API](https://cloud.yandex.ru/docs/yandexgpt/)
- [Together.ai API](https://docs.together.ai/reference)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)

