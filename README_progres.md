# Прогресс разработки Kosmos Model Gateway

## 2025-11-29: Streaming и UI для OpenAI API

### Суть изменений

Добавлен **streaming (SSE)** для OpenAI-совместимого API и интегрирован в веб-интерфейс.

### Streaming в `/v1/chat/completions`

При `stream: true` сервер возвращает Server-Sent Events в формате OpenAI:

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"}}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}}]}
data: [DONE]
```

**Поддержка провайдеров:**
| Провайдер | Реализация |
|-----------|------------|
| GROQ | Нативный streaming (async iterable) |
| OpenRouter | Нативный SSE (axios stream) |
| Direct/GigaChat | Эмуляция (ответ разбивается на чанки) |

### UI изменения (AI Analytics Interface)

В веб-интерфейс добавлены элементы управления:

| Элемент | Описание |
|---------|----------|
| **API режим** | Radio buttons: Legacy / OpenAI |
| **Streaming** | Checkbox, включён по умолчанию для OpenAI режима |

**Поведение:**
- **Legacy** — старый API `/api/send-request` (без streaming)
- **OpenAI + Streaming** — текст появляется в реальном времени по мере генерации
- **OpenAI без Streaming** — ждём полный ответ

Настройки сохраняются в `localStorage`.

### Изменения в файлах

**1. `server.js`**
- Хелперы: `createStreamChunk()`, `sendSSEChunk()`, `endSSEStream()`
- В `/v1/chat/completions` при `stream: true`:
  - SSE заголовки (`Content-Type: text/event-stream`)
  - Проксирование чанков от GROQ/OpenRouter
  - Эмуляция для Direct/GigaChat

**2. `public/app.js`**
- Свойства `apiMode` и `useStreaming`
- Radio buttons для выбора API режима
- Checkbox для streaming
- Обработка SSE через `response.body.getReader()`
- Сохранение настроек в localStorage

**3. `swagger.yaml`**
- Документация streaming режима
- Схема `OpenAIChatCompletionChunk`
- Примеры SSE ответов

---

## 2025-11-29: OpenAI-совместимый API

### Суть изменений

Добавлена полная совместимость со стандартом OpenAI Chat Completions API. Теперь сервер можно использовать как drop-in replacement для OpenAI с любыми клиентами: OpenAI Python SDK, LangChain, LlamaIndex и др.

### Новые эндпоинты

| Эндпоинт | Метод | Описание |
|----------|-------|----------|
| `/v1/chat/completions` | POST | Основной эндпоинт для chat completions |
| `/v1/models` | GET | Список моделей в формате OpenAI |

### Формат запроса (OpenAI-стандарт)

```json
{
  "model": "llama-3.3-70b-versatile",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "max_tokens": 1024
}
```

### Формат ответа (OpenAI-стандарт)

```json
{
  "id": "chatcmpl-abc123xyz",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "llama-3.3-70b-versatile",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "Hello!"},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": 42, "completion_tokens": 10, "total_tokens": 52}
}
```

### Аутентификация

- Если `OPENAI_COMPAT_API_KEY` задан в `.env` — требуется Bearer Token
- Если не задан — доступ без аутентификации (обратная совместимость)

### Пример использования с OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3903/v1",
    api_key="your-key"  # или любая строка если аутентификация отключена
)

response = client.chat.completions.create(
    model="FAST",  # поддерживаются алиасы CHEAP/FAST/RICH
    messages=[
        {"role": "system", "content": "Ты полезный помощник"},
        {"role": "user", "content": "Привет!"}
    ]
)
print(response.choices[0].message.content)
```

### Изменения в файлах

**1. `server.js`**
- Middleware `openaiAuthMiddleware()` для Bearer Token аутентификации
- Эндпоинт `POST /v1/chat/completions` с конвертацией messages → prompt+inputText
- Эндпоинт `GET /v1/models` со списком моделей в формате OpenAI
- Функция `generateChatCompletionId()` для генерации ID в стиле OpenAI

**2. `.env.example`**
- Добавлена переменная `OPENAI_COMPAT_API_KEY`

**3. `swagger.yaml`**
- Новый тег `OpenAI Compatible`
- Схемы `OpenAIChatCompletionRequest`, `OpenAIChatCompletionResponse`, `OpenAIModelList` и др.
- SecurityScheme `BearerAuth`

### Совместимость

После реализации работает с:
- ✅ OpenAI Python SDK
- ✅ LangChain
- ✅ LlamaIndex
- ✅ Любые клиенты с OpenAI-совместимым API

**Важно:** Старый REST API (`/api/send-request`, `/api/send-request-sys`, `/analyze`) полностью сохранён и работает для существующих клиентов.

---

## 2025-11-29: Кнопка About для моделей

### Суть изменений

Добавлена кнопка **About** рядом с кнопкой **Test** на странице моделей. Позволяет узнать у самой модели информацию о себе.

### Как работает

1. При нажатии About отправляется запрос к модели с вопросом:
   > "Привет! Что ты за модель? В чем твоя особенность? В чем твоё преимущество перед другими моделями?"

2. Результат **кэшируется** в `available-models.json` в поле `last_about`
3. При повторном нажатии — показывается сохранённый ответ (без нового запроса к API)
4. Ответ отображается в модальном окне

### Изменения в файлах

**1. `server.js`**
- Новый эндпоинт `POST /api/about-model`
- `max_tokens: 512` для развёрнутого ответа
- Результат сохраняется в `model.last_about`

**2. `public/models.js`**
- Кнопка About в карточке модели
- Метод `aboutModel()` с кэшированием
- Бейдж `ℹ️ About` для отображения статуса
- `showTestModal()` поддерживает тип `'about'`

**3. `public/models.html`**
- Стили `.about-button` (оранжевый цвет)
- Стили `.about-badge`

### UI

| Элемент | Описание |
|---------|----------|
| Кнопка About | Оранжевая, рядом с Test |
| Бейдж ℹ️ About | Показывает время последнего запроса |
| Модальное окно | Заголовок "Информация о модели (About)" |

---

## 2025-11-29: Гибкий механизм user_type

### Суть изменений

Расширен механизм меток моделей `user_type`:
- Базовые типы `CHEAP`, `FAST`, `RICH` сохранены для совместимости
- Добавлена поддержка **произвольных меток** (например `MY_FAST_EXPENSIVE`, `GIGACHAT_MAX`)
- Гарантируется **уникальность**: одна метка = одна модель
- Создан API для получения всех используемых меток

### Изменения в файлах

**1. `server.js`**
- Новый эндпоинт `GET /api/user-types` — возвращает все уникальные user_type с информацией о моделях
- Функция `resolveModelName()` теперь асинхронная и поддерживает произвольные user_type
- Эндпоинт `/api/models/update/:id` — добавлена проверка уникальности при установке user_type

**2. `public/models.js`**
- В карточку модели добавлено поле ввода `user_type`
- Метод `setUserType(modelId, userType)` с валидацией уникальности

**3. `public/models.html`**
- CSS стили для поля `.user-type-input`

**4. `public/app.js`**
- Загрузка user_types с `/api/user-types`
- Селектор `userTypeSelect` перед селектором модели
- При выборе user_type автоматически выбирается связанная модель

### API

```
GET /api/user-types
→ {
    success: true,
    count: 4,
    types: ["RICH", "CHEAP", "FAST", "GIGACHAT_MAX"],
    details: [
      { user_type: "RICH", model_id: "...", model_name: "...", provider: "...", enabled: true },
      ...
    ]
  }
```

### Логика работы

1. Внешняя система вызывает `/api/send-request` с `model: "MY_FAST_EXPENSIVE"`
2. `resolveModelName()` находит модель с `user_type: "MY_FAST_EXPENSIVE"`
3. Запрос выполняется к найденной модели

---

## 2025-11-29: Добавление провайдера GigaChat и динамический UI

### 1. Документация `README_ADD_NEW_PROVIDER.md`

Создана полная инструкция по добавлению новых провайдеров AI-моделей:

- **10 разделов** с пошаговыми инструкциями
- **Продвинутые сценарии:**
  - OAuth2 / Token-based авторизация
  - Работа с самоподписанными сертификатами
  - Специфичные заголовки API (RqUID, X-Request-ID)
  - Выбор HTTP-клиента (axios vs fetch)
- **Полный пример интеграции GigaChat** как reference implementation
- **Критическое предупреждение** про `user_type: null` при добавлении моделей

### 2. Провайдер GigaChat (Сбер)

Реализован новый провайдер для работы с GigaChat API:

**Файлы:**
- `gigachat-service.js` — сервис с OAuth2 авторизацией и автоматическим кэшированием токена
- Обновлён `server.js` — импорт, инициализация, обработка в `/api/send-request` и `/api/test-model`
- Добавлены модели в `data/available-models.json`

**Модели GigaChat:**
| ID | Название | Контекст |
|----|----------|----------|
| `gigachat-max` | GigaChat Max | 32K |
| `gigachat-pro` | GigaChat Pro | 16K |
| `gigachat-lite` | GigaChat (Lite) | 8K |

**Особенности реализации:**
- OAuth2 токен с автообновлением (живёт ~30 минут)
- Работа с самоподписанным сертификатом Сбера (`NODE_TLS_REJECT_UNAUTHORIZED=0`)
- Специфичный параметр `repetition_penalty: 1.18`

### 3. Динамический UI моделей

Рефакторинг `public/models.js` — провайдеры теперь определяются автоматически:

**Добавлен конфиг провайдеров:**
```javascript
const PROVIDER_CONFIG = {
    direct: { name: 'Direct / Z.AI', icon: 'fas fa-server', color: '#9c27b0' },
    groq: { name: 'GROQ', icon: 'fas fa-rocket', color: '#ff6b35' },
    openroute: { name: 'OpenRouter', icon: 'fas fa-globe', color: '#28a745' },
    gigachat: { name: 'GigaChat (Сбер)', icon: 'fas fa-comments', color: '#21a038' },
    _default: { name: 'Unknown Provider', icon: 'fas fa-cube', color: '#607d8b' }
};
```

**Изменения:**
- `renderStats()` — динамически собирает провайдеров из данных
- `renderModels()` — группирует модели по всем найденным провайдерам
- `createProviderSection()` — использует конфиг с fallback на `_default`

**Результат:** Любой новый провайдер автоматически появляется в UI без изменения кода!

---

## Быстрое добавление нового провайдера (чек-лист)

1. Создать `xxx-service.js` с методами:
   - `constructor(apiKey)`
   - `sendRequest({model, messages, temperature, maxTokens})`
   - `quickChat(prompt, model)`
   - `checkAvailability()`

2. Обновить `server.js`:
   - Импорт сервиса
   - Инициализация при наличии ключа
   - Добавить в `/api/config` → `providers`
   - Обработка в `/api/send-request`
   - Тестирование в `/api/test-model`

3. Добавить модели в `data/available-models.json`:
   - **ВАЖНО:** `user_type: null` для всех новых моделей!

4. (Опционально) Добавить в `PROVIDER_CONFIG` в `public/models.js`:
   - Красивое название
   - Иконка FontAwesome
   - Цвет бренда

---

## Конфигурация `.env`

```env
# Существующие провайдеры
OPENROUTER_API_KEY=sk-or-v1-xxxxx
GROQ_API_KEY=gsk_xxxxx
ZAI_API_KEY=xxxxx

# GigaChat (Сбер)
# Получить: https://developers.sber.ru/portal/products/gigachat-api
GIGACHAT_AUTH_DATA=ваша_base64_строка_авторизации
```

