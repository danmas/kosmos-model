# Интеграция с AI Model Server (OpenAI-compatible)

Этот документ описывает архитектуру и шаги по внедрению взаимодействия с сервером моделей ИИ (например, локальный LLM через LM Studio, Ollama или внешний OpenAI API) в Node.js/TypeScript проект.

Данная инструкция основана на реализации в проекте `kosmos-task`.

## 1. Общая Архитектура

Взаимодействие строится по классической клиент-серверной архитектуре:
1.  **Приложение (Client)**: Отправляет HTTP запросы с историей сообщений.
2.  **AI Server**: Принимает запросы в формате OpenAI API (`POST /chat/completions`) и возвращает сгенерированный текст.

Ключевые особенности реализации:
-   **Централизованная конфигурация**: Все параметры (URL, ключи) вынесены в переменные окружения.
-   **Типизация**: Использование TypeScript интерфейсов для сообщений (`user`, `system`, `assistant`).
-   **Отказоустойчивость**: Обработка ошибок сети и статусов ответа.
-   **Логирование**: Сохранение истории запросов и ответов в JSON файл (`history.json`) для отладки.

---

## 2. Настройка Окружения

### 2.1 Файл `.env`
В корне проекта создайте или дополните файл `.env`. Эти переменные управляют подключением.

```ini
# URL сервера API. Для локальных (LM Studio/Ollama) обычно http://localhost:1234/v1 или http://localhost:3002
LLM_SERVER_URL=http://localhost:3002

# (Опционально) API ключ. Для локальных серверов часто можно оставить пустым или любым строковым значением
LLM_API_KEY=my-secret-key

# Имя модели, которую нужно использовать (например, "gpt-4", "llama-3-8b", "RICH")
LLM_MODEL=RICH
```

### 2.2 Загрузчик конфигурации (`src/env.ts`)
Создайте модуль для типизированного доступа к переменным окружения. Это предотвращает использование "магических строк" в коде.

```typescript
// src/env.ts
import dotenv from 'dotenv';
dotenv.config(); // Убедитесь, что dotenv установлен: npm install dotenv

export const LLM_BASE_URL = process.env.LLM_SERVER_URL || "http://localhost:3002";
export const LLM_API_KEY = process.env.LLM_API_KEY || "";
export const LLM_MODEL = process.env.LLM_MODEL || "gpt-3.5-turbo"; // Значение по умолчанию
```

---

## 3. Реализация Клиента (LLM Client)

Вся логика общения с сервером должна быть инкапсулирована в одном модуле (например, `src/llm.ts`).

### 3.1 Основные интерфейсы
Определите форматы данных, совместимые с OpenAI API.

```typescript
// Тип сообщения
export type Message = { 
  role: "system" | "user" | "assistant"; 
  content: string 
};

// Интерфейс для лога (истории)
interface HistoryEntry {
  timestamp: string;
  model: string;
  messages: Message[];
  response: string;
  error?: string;
}
```

### 3.2 Функция вызова API (`callLLM`)

Создайте асинхронную функцию, которая:
1.  Формирует заголовки (включая Auth).
2.  Выполняет `fetch` запрос к эндпоинту `/chat/completions`.
3.  Обрабатывает ответ.

```typescript
// src/llm.ts
import { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } from "./env";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

// ... (интерфейсы выше) ...

// Путь к файлу истории
const HISTORY_FILE = join(process.cwd(), "history.json");

// Хелпер для сохранения истории (помогает при отладке промптов)
function saveHistory(entry: HistoryEntry) {
    let history: HistoryEntry[] = [];
    if (existsSync(HISTORY_FILE)) {
        try { history = JSON.parse(readFileSync(HISTORY_FILE, "utf-8")); } catch(e) {}
    }
    history.push(entry);
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

export async function callLLM(messages: Message[], model = LLM_MODEL): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (LLM_API_KEY) {
    headers["Authorization"] = `Bearer ${LLM_API_KEY}`;
  }

  const timestamp = new Date().toISOString();

  console.log(`📡 Connecting to LLM: ${LLM_BASE_URL} (${model})...`);

  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3, // Степень вариативности (0.0 - строго, 1.0 - креативно)
      }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`LLM Error ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    
    // Извлекаем ответ из стандартной структуры OpenAI
    const content = data.choices?.[0]?.message?.content || "";
    
    if (!content) throw new Error("Empty response from LLM");

    // Сохраняем успешный запрос в историю
    saveHistory({ timestamp, model, messages, response: content });

    return content;

  } catch (error: any) {
    // Сохраняем ошибку в историю
    saveHistory({ timestamp, model, messages, response: "", error: error.message });
    console.error("❌ LLM Request Failed:", error.message);
    throw error; // Пробрасываем ошибку выше, чтобы вызывающий код знал о сбое
  }
}
```

---

## 4. Использование в других модулях

Теперь, когда у вас есть клиент, используйте его в бизнес-логике.

**Пример: Генератор задач**

```typescript
import { callLLM, Message } from "./llm";

async function generateTaskDescription(userInput: string) {
    const messages: Message[] = [
        { 
            role: "system", 
            content: "Ты опытный менеджер проектов. Твоя задача - описать техническое задание на основе ввода пользователя." 
        },
        { 
            role: "user", 
            content: userInput 
        }
    ];

    try {
        const result = await callLLM(messages);
        console.log("Результат от AI:", result);
    } catch (error) {
        console.log("Не удалось получить ответ от AI. Проверьте сервер.");
    }
}
```

## 5. Mock-режим и отладка (Best Practices)

В процессе разработки сервер AI может быть недоступен. Рекомендуется внедрить "Mock-режим" (заглушку).

1.  В `callLLM` перед вызовом `fetch` или в блоке `catch` можно добавить проверку: если сервер недоступен, возвращать заранее заготовленный ответ.
2.  Это позволит разрабатывать интерфейс и логику приложения без работающей LLM.

**Пример простой реализации Mock:**
```typescript
// Внутри callLLM, при ошибке fetch:
if (error.code === 'ECONNREFUSED') {
    console.warn("⚠️ Сервер недоступен, возвращаю тестовый ответ.");
    return "Это тестовый ответ, так как AI сервер выключен.";
}
```

## 6. Чеклист внедрения

1.  [ ] Добавлены переменные `LLM_*` в `.env`.
2.  [ ] Создан файл `src/env.ts` для чтения переменных.
3.  [ ] Создан `src/llm.ts` с функцией `callLLM`.
4.  [ ] Установлена зависимость `dotenv` (`npm install dotenv`).
5.  [ ] Проверьте формат URL: он должен указывать на корень API или полный путь, в зависимости от того, как вы конструируете его в `fetch` (в примере - `${BASE_URL}/chat/completions`).

Это исчерпывающее руководство для добавления поддержки AI сервера в проект архитектуры Kosmos.
