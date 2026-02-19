# Документация страницы models.html

## Обзор

Страница **models.html** — это административный интерфейс для управления AI моделями в системе Kosmos Model Gateway. Позволяет просматривать, тестировать, настраивать и добавлять модели от различных провайдеров.

---

## Связанные файлы

| Файл | Описание |
|------|----------|
| `public/models.html` | Основная HTML-страница |
| `public/models.js` | JavaScript-логика (класс ModelsPage) |
| `public/styles.css` | Основные стили приложения |
| `public/compact-styles.css` | Компактные стили |
| `server.js` | Backend API эндпоинты |
| `data/available-models.json` | Хранилище данных моделей |

---

## Модальные окна (диалоги)

### 1. Validation Modal (`#validationModal`)
**Статическое модальное окно** — определено в HTML.

**Назначение:** Отображение результатов валидации моделей с `user_type`.

**Элементы:**
- `#validationModalBody` — тело с результатами
- `#validationTimestamp` — время последней проверки
- `#validationRerunBtn` — кнопка перезапуска валидации

**Обработчики:**
- `modelsPage.closeValidationModal()` — закрытие
- `modelsPage.rerunValidation()` — перезапуск валидации

---

### 2. Test Result Modal (`#testResultModal`)
**Динамически создаваемое окно** — создаётся в JavaScript при первом вызове.

**Назначение:** Отображение результатов:
- Тестирования модели (Test)
- Информации о модели (About)
- CURL-теста через OpenAI API

**Обработчики:**
- `modelsPage.showTestModal(testData, success, type)` — отображение результата
- `modelsPage.showCurlModal(modelName, success, content, responseTime, curlCommand, httpStatus)` — CURL результат

---

### 3. Add Model Modal (`#addModelModal`)
**Динамически создаваемое окно** — создаётся в JavaScript при первом вызове.

**Назначение:** Форма добавления новой модели.

**Поля формы:**
- `newModelProvider` — провайдер (hidden)
- `newModelId` — ID модели
- `newModelName` — API имя
- `newModelVisibleName` — отображаемое имя
- `newModelContext` — размер контекста
- `newModelBaseUrl` — Base URL (для direct)
- `newModelApiKey` — API ключ (для direct)

**Обработчики:**
- `modelsPage.openAddModelModal(provider)` — открытие
- `modelsPage.saveNewModel(event)` — сохранение

---

## Класс ModelsPage (models.js)

### Свойства класса

```javascript
this.allModels = [];        // Все загруженные модели
this.filteredModels = [];   // Отфильтрованные модели (после поиска)
this.validationData = null; // Данные валидации user_type
```

### Методы класса

#### Инициализация

| Метод | Описание |
|-------|----------|
| `constructor()` | Инициализация свойств, вызов init() |
| `init()` | Загрузка данных, установка обработчиков, рендеринг |
| `loadModels()` | Загрузка моделей с `/api/all-models` |
| `loadValidationData()` | Загрузка данных валидации с `/api/user-type-validation` |
| `setupEventListeners()` | Установка обработчика поиска |

#### Рендеринг

| Метод | Описание |
|-------|----------|
| `renderStats()` | Рендеринг статистики (количество моделей по провайдерам) |
| `renderValidationButton()` | Рендеринг кнопки валидации user_type |
| `renderModels()` | Рендеринг всех моделей, группировка по провайдерам |
| `createProviderSection(provider, models)` | Создание секции провайдера |
| `createModelCard(model, provider)` | Создание карточки модели |

#### Модальные окна

| Метод | Описание |
|-------|----------|
| `showValidationModal()` | Открытие модального окна валидации |
| `closeValidationModal()` | Закрытие модального окна валидации |
| `showTestModal(testData, success, type)` | Показ результата теста/about |
| `showCurlModal(...)` | Показ результата CURL-теста |
| `openAddModelModal(provider)` | Открытие формы добавления модели |
| `showProviderInfo(modelId)` | Показ информации от провайдера |

#### Валидация

| Метод | Описание |
|-------|----------|
| `rerunValidation()` | Перезапуск валидации user_type моделей |

#### Действия с моделями

| Метод | Описание |
|-------|----------|
| `testModel(modelId, button)` | Тестирование модели |
| `curlTest(modelId, modelName, button)` | CURL-тест через OpenAI API |
| `aboutModel(modelId, button)` | Запрос информации о модели |
| `toggleModelEnabled(modelId, isEnabled)` | Включение/выключение модели |
| `setUserType(modelId, userType)` | Установка user_type метки |
| `saveNewModel(event)` | Сохранение новой модели |
| `refreshProviderModels(provider)` | Обновление моделей провайдера |
| `toggleProviderSection(provider)` | Сворачивание/разворачивание секции |

#### Фильтрация и поиск

| Метод | Описание |
|-------|----------|
| `filterModels(term)` | Фильтрация по имени, visible_name, user_type |

#### Утилиты

| Метод | Описание |
|-------|----------|
| `copy(text, btn)` | Копирование в буфер обмена |
| `formatTokens(n)` | Форматирование токенов (8192 → 8K) |
| `timeAgo(date)` | Форматирование времени ("5m ago") |
| `escapeHtml(text)` | Экранирование HTML |
| `escapeForAttribute(text)` | Экранирование для атрибутов |
| `plural(n)` | Склонение (русское) |
| `showError(msg)` | Показ ошибки |
| `hideLoading()` | Скрытие индикатора загрузки |

---

## API эндпоинты (Backend)

### Получение данных

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/all-models` | GET | Все модели с полной информацией |
| `/api/user-type-validation` | GET | Результаты валидации user_type |
| `/api/user-types` | GET | Список всех user_type меток |

### Управление моделями

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/models/update/:id` | POST | Обновление модели (enabled, user_type) |
| `/api/models/add` | POST | Добавление новой модели |
| `/api/test-model` | POST | Тестирование модели |
| `/api/about-model` | POST | Запрос информации от модели |

### Обновление моделей провайдеров

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/refresh-groq-models` | POST | Обновление списка GROQ моделей |
| `/api/refresh-openrouter-models` | POST | Обновление списка OpenRouter моделей |
| `/api/refresh-direct-models` | POST | Обновление списка Direct моделей |
| `/api/user-type-validation/rerun` | POST | Перезапуск валидации |

### OpenAI Compatible

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/v1/chat/completions` | POST | OpenAI-совместимый endpoint (для CURL-теста) |

---

## Конфигурация провайдеров

```javascript
const PROVIDER_CONFIG = {
    direct: { name: 'Direct / (Togethr, Z.AI, ...)', icon: 'fas fa-server', color: '#9c27b0' },
    groq: { name: 'GROQ', icon: 'fas fa-rocket', color: '#ff6b35' },
    openroute: { name: 'OpenRouter', icon: 'fas fa-globe', color: '#28a745' },
    gigachat: { name: 'GigaChat (Sber)', icon: 'fas fa-comments', color: '#21a038' },
    _default: { name: 'Unknown Provider', icon: 'fas fa-cube', color: '#607d8b' }
};
```

---

## Структура карточки модели

Каждая карточка модели содержит:

1. **Заголовок**
   - Видимое имя модели
   - API имя (если отличается)
   - Бейдж провайдера

2. **Детали**
   - Размер контекста
   - Бейджи (user_type, Fast, FREE)
   - Бейдж последнего теста
   - Бейдж About информации

3. **Управление**
   - Toggle: Enabled/Disabled
   - Input: User Type (уникальная метка)

4. **Кнопки действий**
   - Copy — копировать имя модели
   - Test — тестовый запрос
   - CURL — тест через OpenAI API
   - About — запрос информации о модели
   - Provider Info — информация от провайдера (если есть)

---

## Обработчики событий

### На уровне документа

```javascript
document.addEventListener('DOMContentLoaded', () => {
    modelsPage = new ModelsPage();
});
```

### Поиск

```javascript
search?.addEventListener('input', e => this.filterModels(e.target.value));
```

### Inline обработчики (в HTML-шаблонах)

- `onclick="modelsPage.toggleProviderSection('provider')"` — сворачивание секции
- `onclick="modelsPage.refreshProviderModels('provider')"` — обновление моделей
- `onclick="modelsPage.openAddModelModal('provider')"` — добавление модели
- `onchange="modelsPage.toggleModelEnabled('id', this.checked)"` — toggle enabled
- `onchange="modelsPage.setUserType('id', this.value)"` — установка user_type
- `onclick="modelsPage.copy('name', this)"` — копирование
- `onclick="modelsPage.testModel('id', this)"` — тестирование
- `onclick="modelsPage.curlTest('id', 'name', this)"` — CURL-тест
- `onclick="modelsPage.aboutModel('id', this)"` — информация о модели
- `onclick="modelsPage.showProviderInfo('id')"` — информация от провайдера
- `onclick="modelsPage.showTestModal(...)"` — показ результата (на бейджах)

---

## Структура данных модели

```javascript
{
    id: "groq-llama3-70b",           // Уникальный ID
    name: "llama3-70b-8192",         // API имя
    visible_name: "Llama 3 70B",     // Отображаемое имя
    provider: "groq",                 // Провайдер
    context: 8192,                    // Размер контекста
    enabled: true,                    // Включена/выключена
    user_type: "FAST",               // Метка для внешних систем
    fast: true,                       // Флаг "быстрая"
    free: true,                       // Флаг "бесплатная"
    base_url: "...",                  // Base URL (для direct)
    api_key: "env:VAR_NAME",         // API ключ (для direct)
    provider_info: {...},             // Информация от провайдера
    last_test: {                      // Результат последнего теста
        success: true,
        response_time_ms: 1234,
        sample_response: "...",
        timestamp: "2025-02-19T..."
    },
    last_about: {                     // Результат последнего About
        success: true,
        response_time_ms: 2345,
        sample_response: "...",
        timestamp: "2025-02-19T..."
    }
}
```

---

## Валидация user_type

Система автоматически валидирует модели с установленным `user_type` при старте сервера.

**Структура данных валидации:**

```javascript
{
    timestamp: "2025-02-19T10:30:00.000Z",
    inProgress: false,
    passed: [
        {
            user_type: "FAST",
            name: "llama3-70b-8192",
            visible_name: "Llama 3 70B",
            provider: "groq",
            response_time_ms: 1234
        }
    ],
    failed: [
        {
            user_type: "RICH",
            name: "gpt-4",
            visible_name: "GPT-4",
            provider: "openroute",
            error_message: "429 Too Many Requests"
        }
    ]
}
```

---

## CSS-классы

### Провайдеры
- `.provider-header.groq` — оранжевый градиент
- `.provider-header.openrouter` — зелёный градиент
- `.provider-header.direct` — фиолетовый градиент
- `.model-card.groq` — оранжевая левая граница
- `.model-card.openrouter` — зелёная левая граница
- `.model-card.direct` — фиолетовая левая граница

### Бейджи
- `.badge.default` — жёлтый (user_type)
- `.badge.fast` — зелёный (Fast)
- `.badge.free` — синий (FREE)

### Тест-бейджи
- `.test-badge.success` — зелёный фон
- `.test-badge.error` — красный фон
- `.about-badge` — оранжевая левая граница

### Валидация
- `.validation-button` — зелёная кнопка (OK)
- `.validation-button.has-errors` — красная кнопка (ошибки)
- `.validation-section.passed` — зелёный заголовок
- `.validation-section.failed` — красный заголовок

---

## Глобальные объекты

```javascript
// Глобальный экземпляр ModelsPage
let modelsPage;

// Конфигурация провайдеров
const PROVIDER_CONFIG = {...};
```

---

## Зависимости

- **Font Awesome 6.0.0** — иконки
- **styles.css** — базовые стили приложения
- **compact-styles.css** — компактные стили
