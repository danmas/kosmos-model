# KB — Оглавление базы знаний

**Назначение:** Единая точка входа в документацию проекта «Kosmos Model Gateway». Все документы БЗ перечислены ниже по секциям.

---

## Содержание

1. [Архитектура и обзор](#1-архитектура-и-обзор)
2. [API и интеграции](#2-api-и-интеграции)
3. [Модели и провайдеры](#3-модели-и-провайдеры)
4. [Автоматическая синхронизация и конфигурация](#4-автоматическая-синхронизация-и-конфигурация)
5. [Расширение системы](#5-расширение-системы)
6. [Правила ведения KB](#правила-ведения-kb)

---

## 1. Архитектура и обзор

| Файл | Описание | Ключевые темы | Актуализация |
|------|----------|---------------|------------|
| [README.md](../README.md) | Основной README проекта — архитектура, запуск, возможности | Мульти-провайдер, OpenAI API, RAG, стриминг, установка | 2026-02-16 |
| [README_progres.md](../README_progres.md) | Журнал изменений и история разработки | Streaming, OpenAI API, user_type, синхронизация, UI | 2026-02-16 |
| [README_about.md](../README_about.md) | Описание проекта и его назначения (если существует) | — | — |

---

## 2. API и интеграции

| Файл | Описание | Ключевые темы | Актуализация |
|------|----------|---------------|--------------|
| [README_REST_KOSMOS-MODEL.md](./README_REST_KOSMOS-MODEL.md) | Полная документация REST API | `/v1/chat/completions`, `/api/send-request`, профили CHEAP/FAST/RICH, streaming, RAG, промпты, история | 2026-02-16 |
| [README_agent_AI_MODEL_integration.md](./README_agent_AI_MODEL_integration.md) | Интеграция с сервером AI моделей для агентов | callLLM, env.ts, история запросов, mock-режим, TypeScript | 2026-02-16 |
| [README_task_AI_MODEL_integration.md](./README_task_AI_MODEL_integration.md) | Интеграция с AI Model Server (OpenAI-compatible) для задач | Клиент-серверная архитектура, callLLM, чеклист внедрения | 2026-02-16 |
| [README_panel_AI_MODEL_integration.md](./README_panel_AI_MODEL_integration.md) | Интеграция AI Model Server в веб-панели (Kosmos Panel) | WebSocket, xterm.js, AI-команды, безопасность, RAG | 2026-02-16 |

---

## 3. Модели и провайдеры

| Файл | Описание | Ключевые темы | Актуализация |
|------|----------|---------------|--------------|
| [README_REST_KOSMOS-MODEL.md](./README_REST_KOSMOS-MODEL.md) | REST API (включает описание провайдеров и профилей) | GROQ, OpenRouter, Direct, GigaChat, CHEAP/FAST/RICH | 2026-02-16 |
| [README_ADD_NEW_PROVIDER.md](./README_ADD_NEW_PROVIDER.md) | Добавление нового провайдера моделей | Архитектура, сервис-провайдер, OAuth2, GigaChat, available-models.json | 2026-02-16 |

---

## 4. Автоматическая синхронизация и конфигурация

| Файл | Описание | Ключевые темы | Актуализация |
|------|----------|---------------|--------------|
| [README_refreshModels.md](./README_refreshModels.md) | Автоматическая синхронизация моделей от провайдеров | Groq, OpenRouter, Direct, available-models.json, горячая перезагрузка | 2026-02-16 |
| [README_CONFIG.md](./README_CONFIG.md) | (Если существует) Система управления конфигурацией | — | — |

---

## 5. Расширение системы

| Файл | Описание | Ключевые темы | Актуализация |
|------|----------|---------------|--------------|
| [README_ADD_NEW_PROVIDER.md](./README_ADD_NEW_PROVIDER.md) | Инструкция по добавлению нового провайдера | Шаблон сервиса, интеграция в server.js, OAuth2, самоподписанные сертификаты | 2026-02-16 |
| [README_about.md](../README_about.md) | (Если существует) О проекте | — | — |

---

## Быстрый поиск по темам

- **Начать изучение:** [README.md](../README.md) (основной README) + [README_REST_KOSMOS-MODEL.md](./README_REST_KOSMOS-MODEL.md) (REST API).
- **Подключиться к моделям:** `/v1/chat/completions` (OpenAI-совместимый) или `/api/send-request` (Legacy). Используй профили `FAST`/`CHEAP`/`RICH`.
- **Добавить нового провайдера:** [README_ADD_NEW_PROVIDER.md](./README_ADD_NEW_PROVIDER.md).
- **Интеграция в агент/проект:** [README_agent_AI_MODEL_integration.md](./README_agent_AI_MODEL_integration.md) (для агентов), [README_task_AI_MODEL_integration.md](./README_task_AI_MODEL_integration.md) (для задач).
- **Интеграция в панель мониторинга:** [README_panel_AI_MODEL_integration.md](./README_panel_AI_MODEL_integration.md).
- **Синхронизация моделей:** [README_refreshModels.md](./README_refreshModels.md).
- **Обновление этой БЗ:** см. [Правила ведения KB](#правила-ведения-kb).

---

## Правила ведения KB

1. **Единая точка входа** — `README_INDEX.md`; каждый README из `KB/` перечислен в одной из секций с заполнением колонок (Файл, Описание, Ключевые темы, Актуализация).
2. **Именование** — документы в виде `README_<ТЕМА>.md`; исключения допускаются.
3. **Актуализация** — в колонке указывать `YYYY-MM-DD` при содержательных изменениях (не при правке опечаток).
4. **Ссылки** — внутри KB относительные (`./README_REST_KOSMOS-MODEL.md`); на код — от корня репозитория; на другие README — `../README.md`.
5. **Новый документ/фича** — создать или обновить README и добавить/обновить строку в индексе.
6. **Актуальность** — дата в колонке обновляется только при содержательных изменениях документа. Если документа нет или он устарел, ставить `—`.

**Последнее обновление:** 2026-06-11
