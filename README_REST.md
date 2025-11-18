# AI Analytics Interface REST API

Полноценная документация по REST-интерфейсу приложения AI Analytics Interface. Док описывает все маршруты, поддерживаемые провайдерами GROQ и OpenRouter, работу с промптами, историей ответов, RAG и файловыми операциями.

## Базовая информация

- Базовый URL (по умолчанию): `http://localhost:3002`
- Альтернативный порт (если переопределён): `http://localhost:3000`
- Формат данных: `application/json` для всех запросов и ответов
- Аутентификация: на уровне внешних API (OpenRouter/GROQ). Сам REST-интерфейс не требует токена, но ожидает корректные ключи в `.env`.

## Quick Start

### Шаги
1. Поднимите сервер (`npm start`), убедитесь что `.env` содержит `OPENROUTER_API_KEY` и/или `GROQ_API_KEY`.
2. Выберите профиль модели (`CHEAP`, `FAST`, `RICH`) или конкретное имя из `/api/available-models`.
3. Выполните POST-запрос на `/api/send-request` с JSON-телом.

### Пример запроса
```powershell
curl -X POST http://localhost:3002/api/send-request ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"CHEAP\",\"prompt\":\"Ты помощник\",\"inputText\":\"Привет\"}"
```

### Пример ответа
```json
{
  "success": true,
  "content": "Привет! Чем могу помочь?",
  "model": "google/gemini-2.0-flash-exp:free",
  "provider": "openroute",
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 18,
    "total_tokens": 30
  },
  "rag": null
}
```

## Предустановленные профили моделей

| Тип | Назначение | Модель по умолчанию | Провайдер | Как использовать |
| --- | ---------- | ------------------- | --------- | ---------------- |
| `CHEAP` | Бесплатные простые запросы | `google/gemini-2.0-flash-exp:free` | `openroute` | Укажите `model: "CHEAP"` или оставьте поле `model` пустым |
| `FAST`  | Молниеносные ответы от GROQ | `llama3-70b-8192` | `groq` | Укажите `model: "FAST"` |
| `RICH`  | Максимальное качество и контекст | `google/gemini-2.5-pro-exp-03-25` | `openroute` | Укажите `model: "RICH"` |

Управляйте профилями через:
- `GET /api/default-models` — все профили
- `GET /api/default-models/{type}` — конкретный профиль (`cheap`, `fast`, `rich`)
- `POST /api/default-models` — обновление профиля

## Структура ошибок

```json
{
  "error": "Описание ошибки",
  "details": {
    "extra": "опциональные данные"
  }
}
```

При ошибках внешних API поле `data` может содержать полный ответ провайдера.

## 1. Работа с AI моделями

### POST `/api/send-request`

Отправка запроса с произвольным промптом.

Параметры тела:
- `model` — полное имя модели или ключевые слова `CHEAP` / `FAST` / `RICH`. Пустое значение эквивалентно `CHEAP`.
- `prompt` *(обязателен)* — системный промпт.
- `inputText` *(обязателен)* — пользовательский запрос.
- `provider` *(опционально)* — `groq` или `openroute` для принудительного выбора.
- `useRag` *(boolean)* — добавить контекст из RAG.
- `contextCode` — код набора документов для RAG.
- `saveResponse` *(boolean, default=false)* — сохранить ответ в историю.

Пример (профиль FAST):

```bash
curl -X POST http://localhost:3002/api/send-request ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"FAST\",\"prompt\":\"Ты аналитик\",\"inputText\":\"Сводка за Q3\",\"saveResponse\":true}"
```

Успешный ответ возвращает:
- `success`
- `content` — текст модели
- `model`, `provider`
- `usage` — `prompt_tokens`, `completion_tokens`, `total_tokens`
- `rag` — информация об использованных документах (если применялся RAG)

### POST `/api/send-request-sys`

То же, но промпт выбирается по имени из хранилища промптов.

Тело: `model`, `prompt_name`, `inputText`, опционально `provider`, `saveResponse` (по умолчанию `true`). Поддержка ключевых слов моделей идентична базовому маршруту.

### POST `/analyze`

Альтернативный маршрут с тем же телом, что и `/api/send-request`, но ориентирован на сценарии анализа (включая RAG).

### GET `/api/available-models`

Возвращает массив строк с именами моделей, доступных для выбора в API (`showInApi: true`).

### GET `/api/all-models`

Возвращает массив объектов `ModelInfo` с полным набором метаданных: `name`, `visible_name`, `provider`, `context`, `fast`, `showInApi`, `use_in_ui`.

### `/api/default-models*`

- `GET /api/default-models` — `{ success, defaultModels: { cheap, fast, rich } }`
- `GET /api/default-models/{type}` — параметры: `type` ∈ `cheap|fast|rich`
- `POST /api/default-models` — тело: `{ type, model, provider }`, обновляет профиль и синхронизирует `.env`

Ошибка 400 возникает, если тип не входит в список или модель отсутствует в доступных.

## 2. Управление промптами

### GET `/api/prompts`
Список всех сохранённых промптов. Возвращает массив `{ name, text }`.
Есть упрощённый алиас `GET /api/available-prompts`, который отдаёт тот же список и используется UI для автодополнения.

### POST `/api/prompts`
Создаёт новый промпт. Тело: `{ name, text }`.

### PUT `/api/prompts/{name}`
Обновляет текст промпта. Тело: `{ text }`.

### DELETE `/api/prompts/{name}`
Удаляет промпт по имени.

Во всех случаях возвращается успех или ошибка 404 (если промпт не найден).

## 3. История ответов

### GET `/api/responses`

Поддерживает фильтры в query:
- `sortBy`, `sortOrder`
- `model`, `prompt`
- `dateFrom`, `dateTo` (ISO datetime)
- `limit`

Ответ — массив `ResponseRecord` с полями `id`, `timestamp`, `model`, `promptName`, `prompt`, `inputText`, `response`.

### POST `/api/responses`
Ручное сохранение записи. Тело: `{ model, promptName, prompt, inputText, response }`.

### DELETE `/api/responses/{id}`
Удаляет запись по идентификатору.

## 4. RAG (Retrieval-Augmented Generation)

- `GET /api/rag/context-codes` — список доступных кодов контекста.
- `GET /api/rag/documents` — массив `RagDocument` (id, filename, contextCode, source).
- `POST /api/rag/ask` — тело `{ question, contextCode?, showDetails? }`. Возвращает `RagResponse` с `answer` и массивом документов.
- `GET /api/rag/debug-info` — последняя информация о выполненном запросе с RAG (`ragEnabled`, `finalInputText`, `ragInfo`, `timestamp`).

## 5. Работа с файлами

### POST `/api/save-markdown`

Сохраняет Markdown-файл. Тело:
- `content` *(обязателен)* — markdown-текст
- `filename` *(опционально)* — имя файла
- `directory` *(опционально)* — путь сохранения

Ответ: `{ success, filePath, message }`.

### GET `/api/output-dir-info`

Возвращает информацию о директории вывода: `outputDir`, `exists`, `files[]` (имя, путь, размер).

## 6. Конфигурация и состояние сервера

- `GET /api/check-api-key` — проверяет доступность текущего API-ключа. Ответ `{ isAvailable, serviceProvider }`.
- `GET /api/config` — серверная конфигурация (`server`, `n8n`, маскированный `apiKey`, `logging`).
- `GET /server-info` — хостнейм, платформа, архитектура, версия Node, uptime, `baseUrl`, `port`, `appName`, `timestamp`.

## 7. Маршруты для статического UI

- `GET /` — перенаправляет на `/main`.
- `GET /main` — основной интерфейс (`main.html`).
- `GET /models.html` — страница со списком моделей.
- UI опирается на те же REST-эндпоинты, поэтому поведение описано выше.

## 8. Инструменты для Markdown

- `GET /api/markdown_files` — список `.md` файлов в корне проекта.
- `GET /show_md` — страница просмотра markdown (использует query `file`).
- `GET /get_md_content?file=README.md` — возвращает содержимое выбранного файла.
- `POST /api/save-markdown` / `GET /api/output-dir-info` — см. раздел «Работа с файлами».

## 9. Подсказки по интеграции

1. **Выбор модели** — сначала попробуйте ключевые слова `CHEAP/FAST/RICH`. Для кастомных моделей используйте имена из `/api/available-models`.
2. **RAG** — устанавливайте `useRag: true` и указывайте `contextCode`. В отладочных целях используйте `/api/rag/debug-info`.
3. **Сохранение истории** — передайте `saveResponse: true`, чтобы сервер автоматически добавил запись в `/api/responses`.
4. **Обновление профилей** — после `POST /api/default-models` значения синхронизируются в `props.env`, и UI начнёт использовать новую конфигурацию.

---

Файл актуален для спецификации `swagger.yaml` (версия 1.0.0). При добавлении новых маршрутов сначала обновляйте swagger, затем синхронизируйте README_REST.md.

