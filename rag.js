// rag.js - Сервис для взаимодействия с langchain-pg API

const axios = require('axios');

class LangchainPgService {
  constructor(baseUrl = 'http://localhost:3005') {
    this.baseUrl = baseUrl;
  }

  /**
   * Получить ответ на вопрос с использованием RAG
   * @param {string} question - Вопрос пользователя
   * @param {string} contextCode - Код контекста для фильтрации документов
   * @param {boolean} showDetails - Включить детали в ответ
   * @returns {Promise<Object>} - Ответ от RAG системы
   */
  async askQuestion(question, contextCode = null, showDetails = false) {
    try {
      const response = await axios.post(`${this.baseUrl}/ask`, {
        question,
        contextCode,
        showDetails,
      });

      return response.data;
    } catch (error) {
      console.error('Ошибка при запросе к langchain-pg:', error);
      throw error;
    }
  }

  /**
   * Получить список всех доступных контекстных кодов
   * @returns {Promise<Array<string>>} - Список контекстных кодов
   */
  async getContextCodes() {
    try {
      const response = await axios.get(`${this.baseUrl}/context-codes`);
      return response.data;
    } catch (error) {
      console.error('Ошибка при получении контекстных кодов:', error);
      throw error;
    }
  }

  /**
   * Получить список всех документов
   * @returns {Promise<Array<Object>>} - Список документов
   */
  async getDocuments() {
    try {
      const response = await axios.get(`${this.baseUrl}/documents`);
      return response.data;
    } catch (error) {
      console.error('Ошибка при получении списка документов:', error);
      throw error;
    }
  }
}

module.exports = new LangchainPgService(); 