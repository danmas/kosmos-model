/**
 * Модуль для работы с информацией о сервере
 * Позволяет получать и отображать информацию о сервере в заголовке приложения
 */

/**
 * Конфигурация модуля
 * @type {Object}
 */
const ServerInfoConfig = {
    // Эндпоинт для получения информации о сервере
    endpoint: '/server-info',
    
    // Селектор элемента заголовка
    headerSelector: '#main-header',
    
    // Шаблон заголовка
    headerTemplate: '{appName} ({serverName}:{port})',
    
    // Шаблон заголовка окна (title)
    titleTemplate: '{appName} ({serverName}:{port})',
    
    // Название приложения
    appName: 'AI Analytics Interface',
    
    // Задержка перед обновлением заголовка (мс)
    updateDelay: 1000,
    
    // Включить логирование
    enableLogging: true,
    
    // Обновлять заголовок окна (title)
    updateWindowTitle: true
};

/**
 * Логирование с проверкой настроек
 * @param {string} message - Сообщение для логирования
 * @param {*} data - Дополнительные данные
 */
function log(message, data = null) {
    if (ServerInfoConfig.enableLogging) {
        if (data) {
            console.log(`[ServerInfo] ${message}`, data);
        } else {
            console.log(`[ServerInfo] ${message}`);
        }
    }
}

/**
 * Получение информации о сервере с сервера
 * @returns {Promise<Object>} Информация о сервере
 */
async function fetchServerInfo() {
    // Убираем отладочное сообщение
    // log('Запрос информации о сервере...');
    
    try {
        const response = await fetch(ServerInfoConfig.endpoint);
        
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        log('Получены данные о сервере:', data);
        
        return data;
    } catch (error) {
        log('Ошибка при получении информации о сервере:', error);
        throw error;
    }
}

/**
 * Получение информации о сервере из текущего местоположения (fallback)
 * @returns {Object} Информация о сервере
 */
function getLocalServerInfo() {
    const currentLocation = window.location;
    const hostname = currentLocation.hostname;
    const port = currentLocation.port || '80';
    
    log('Использование локальной информации о сервере:', { hostname, port });
    
    return {
        hostname: hostname,
        baseUrl: hostname,
        port: port
    };
}

/**
 * Форматирование заголовка с информацией о сервере
 * @param {Object} serverInfo - Информация о сервере
 * @param {string} template - Шаблон для форматирования
 * @returns {string} Отформатированный заголовок
 */
function formatHeaderText(serverInfo, template) {
    const serverName = serverInfo.hostname || serverInfo.baseUrl.replace(/^https?:\/\//, '');
    const port = serverInfo.port;
    
    return template
        .replace('{appName}', ServerInfoConfig.appName)
        .replace('{serverName}', serverName)
        .replace('{port}', port);
}

/**
 * Обновление заголовка с информацией о сервере
 * @param {Object} serverInfo - Информация о сервере
 * @returns {boolean} Успешно ли обновлен заголовок
 */
function updateHeader(serverInfo) {
    const headerElement = document.querySelector(ServerInfoConfig.headerSelector);
    
    if (!headerElement) {
        log('Элемент заголовка не найден');
        return false;
    }
    
    const headerText = formatHeaderText(serverInfo, ServerInfoConfig.headerTemplate);
    log(`Форматированный заголовок: ${headerText}`);
    
    headerElement.textContent = headerText;
    log('Текст заголовка обновлен');
    
    return true;
}

/**
 * Обновление заголовка окна (title) с информацией о сервере
 * @param {Object} serverInfo - Информация о сервере
 * @returns {boolean} Успешно ли обновлен заголовок окна
 */
function updateWindowTitle(serverInfo) {
    if (!ServerInfoConfig.updateWindowTitle) {
        log('Обновление заголовка окна отключено');
        return false;
    }
    
    const titleText = formatHeaderText(serverInfo, ServerInfoConfig.titleTemplate);
    log(`Форматированный заголовок окна: ${titleText}`);
    
    document.title = titleText;
    log('Заголовок окна обновлен');
    
    return true;
}

/**
 * Инициализация обновления заголовка
 * @param {Object} customConfig - Пользовательская конфигурация
 * @returns {Promise<boolean>} Успешно ли инициализировано обновление
 */
async function initServerInfo(customConfig = {}) {
    // Объединение пользовательской конфигурации с дефолтной
    Object.assign(ServerInfoConfig, customConfig);
    
    log('Инициализация обновления заголовка с конфигурацией:', ServerInfoConfig);
    
    try {
        // Получение информации о сервере
        const serverInfo = await fetchServerInfo();
        
        // Обновление заголовка и заголовка окна
        const headerUpdated = updateHeader(serverInfo);
        const titleUpdated = updateWindowTitle(serverInfo);
        
        return headerUpdated || titleUpdated;
    } catch (error) {
        log('Ошибка при инициализации, использование запасного варианта:', error);
        
        // Запасной вариант с локальной информацией
        const localServerInfo = getLocalServerInfo();
        const headerUpdated = updateHeader(localServerInfo);
        const titleUpdated = updateWindowTitle(localServerInfo);
        
        return headerUpdated || titleUpdated;
    }
}

// Экспорт функций для использования в других модулях
export {
    initServerInfo,
    updateHeader,
    updateWindowTitle,
    fetchServerInfo,
    getLocalServerInfo,
    ServerInfoConfig
}; 