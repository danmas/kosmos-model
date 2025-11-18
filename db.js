// import OpenAI from "openai";
// import { createClient } from "@supabase/supabase-js";
// import { Client } from "pg";
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("pg");


// Конфигурация Supabase
// Загружаем из переменных окружения или используем значения по умолчанию
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gdtgqhnrjdfsixfwzusr.supabase.co';
// Анонимный публичный ключ - используется только для чтения, но лучше хранить в env
const SUPABASE_KEY = process.env.SUPABASE_KEY; // || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkdGdxaG5yamRmc2l4Znd6dXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwNjkxODcsImV4cCI6MjA1NTY0NTE4N30.wiBhq_qUSYeKPPfbQy7oLQviA53gQyE_mQxxejCFzYY';

// Логирование без раскрытия полного ключа
console.log('Supabase URL:', SUPABASE_URL);
console.log('Supabase Key:', SUPABASE_KEY ? '***' + SUPABASE_KEY.slice(-6) : null); // Показываем только последние 6 символов

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


// host:
// aws-0-eu-central-1.pooler.supabase.com

// port:
// 6543

// database:
// postgres

// user:
// postgres.gdtgqhnrjdfsixfwzusr

// pool_mode:
// transaction

//psql -h aws-0-eu-central-1.pooler.supabase.com -p 6543 -d postgres -U postgres.gdtgqhnrjdfsixfwzusr

// Конфигурация PostgreSQL
const pgClient = new Client({
  user: "postgres.gdtgqhnrjdfsixfwzusr",
  host: "aws-0-eu-central-1.pooler.supabase.com",
  database: "postgres",
  password: "uiaait_5",
  port: 5432
});

// Оборачиваем в async функцию
async function main() {
  try {
    await pgClient.connect();
    console.log("✅ Подключение к базе данных установлено.");
  } catch (error) {
    console.error("❌ Ошибка подключения:", error);
  }
}


// Конфигурация OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "your-openai-api-key", // Используем переменную окружения
});

// 📌 1️⃣ Загружаем файл в Supabase Storage
async function uploadFile(filePath, fileName) {
  const { data, error } = await supabase.storage
    .from("ai_files")
    .upload(fileName, filePath, { cacheControl: "3600", upsert: true });

  if (error) throw error;
  return `${SUPABASE_URL}/storage/v1/object/public/ai_files/${fileName}`;
}

// 📌 2️⃣ Генерируем эмбеддинг
async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });

  return response.data[0].embedding;
}

// 📌 3️⃣ Сохраняем эмбеддинг в PostgreSQL (pgvector)
async function saveEmbedding(fileUrl, embedding) {
  const embeddingString = `[${embedding.join(",")}]`;
  const query = "INSERT INTO file_vectors (file_url, embedding) VALUES ($1, $2)";

  await pgClient.query(query, [fileUrl, embeddingString]);
}

// 📌 4️⃣ Запуск процесса
async function processFile(filePath, fileName, textContent) {
  try {
    console.log("📤 Загружаем файл...");
    const fileUrl = await uploadFile(filePath, fileName);
    console.log("✅ Файл загружен:", fileUrl);

    console.log("🧠 Генерируем эмбеддинг...");
    const embedding = await generateEmbedding(textContent);
    console.log("✅ Эмбеддинг создан");

    console.log("💾 Сохраняем эмбеддинг в базе...");
    await saveEmbedding(fileUrl, embedding);
    console.log("✅ Данные сохранены!");
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    pgClient.end();
  }
}

// 📌 5️⃣ Пример использования
const filePath = "./sample.pdf"; // Локальный путь к файлу
const fileName = "sample.pdf"; // Имя файла
const textContent = "Your extracted text from the PDF file"; // Извлечённый текст

main(); // Вызов функции
processFile(filePath, fileName, textContent);