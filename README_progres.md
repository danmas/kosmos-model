# Прогресс разработки Kosmos Model Gateway

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

