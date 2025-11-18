// Клиентский сервис для работы с RAG API

class RagService {
  /**
   * Получить список контекстных кодов
   * @returns {Promise<Array<string>>} - Список контекстных кодов
   */
  async getContextCodes() {
    try {
      const response = await fetch('/api/rag/context-codes');
      
      if (!response.ok) {
        throw new Error(`Ошибка запроса: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Ошибка при получении контекстных кодов:', error);
      throw error;
    }
  }

  /**
   * Получить список документов
   * @returns {Promise<Array<Object>>} - Список документов
   */
  async getDocuments() {
    try {
      const response = await fetch('/api/rag/documents');
      
      if (!response.ok) {
        throw new Error(`Ошибка запроса: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Ошибка при получении списка документов:', error);
      throw error;
    }
  }

  /**
   * Задать вопрос с использованием RAG
   * @param {string} question - Вопрос пользователя
   * @param {string} contextCode - Код контекста для фильтрации документов
   * @param {boolean} showDetails - Включить детали в ответ
   * @returns {Promise<Object>} - Ответ от RAG системы
   */
  async askQuestion(question, contextCode = null, showDetails = false) {
    try {
      const response = await fetch('/api/rag/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          contextCode,
          showDetails,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ошибка запроса: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Ошибка при запросе к RAG:', error);
      throw error;
    }
  }
}

// Создаем глобальный экземпляр сервиса
window.ragService = new RagService(); 