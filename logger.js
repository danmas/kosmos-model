/**
 * Модуль логирования - пишет в консоль и в файлы ./logs
 * Поддерживает уровни: debug, info, warn, error
 * Автоматическая ротация логов по дате
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, 'logs');
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

// Текущий уровень логирования (из переменной окружения или по умолчанию 'info')
let currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

// Создаём директорию logs если её нет
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Получить имя файла лога для текущей даты
 */
function getLogFileName(level = 'combined') {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(LOGS_DIR, `${dateStr}-${level}.log`);
}

/**
 * Форматирование сообщения лога
 */
function formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase().padEnd(5);
    
    // Преобразуем аргументы в строку
    let formattedArgs = args.map(arg => {
        if (arg instanceof Error) {
            return `${arg.message}\n${arg.stack}`;
        }
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');

    return `[${timestamp}] [${levelUpper}] ${message}${formattedArgs ? ' ' + formattedArgs : ''}`;
}

/**
 * Запись в файл (асинхронно, без блокировки)
 */
function writeToFile(filename, message) {
    fs.appendFile(filename, message + '\n', (err) => {
        if (err) {
            // Не используем console.error чтобы избежать рекурсии
            process.stderr.write(`Logger file write error: ${err.message}\n`);
        }
    });
}

/**
 * Основная функция логирования
 */
function log(level, message, ...args) {
    const levelNum = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    
    // Проверяем уровень логирования
    if (levelNum < currentLogLevel) {
        return;
    }

    const formattedMessage = formatMessage(level, message, ...args);
    
    // Вывод в консоль с цветами
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    const colors = {
        debug: '\x1b[36m', // cyan
        info: '\x1b[32m',  // green
        warn: '\x1b[33m',  // yellow
        error: '\x1b[31m', // red
        reset: '\x1b[0m'
    };
    
    console[consoleMethod](`${colors[level] || ''}${formattedMessage}${colors.reset}`);
    
    // Запись в файлы
    writeToFile(getLogFileName('combined'), formattedMessage);
    
    // Ошибки дополнительно пишем в отдельный файл
    if (level === 'error') {
        writeToFile(getLogFileName('error'), formattedMessage);
    }
}

/**
 * Установить уровень логирования
 */
function setLogLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
        currentLogLevel = LOG_LEVELS[level];
        log('info', `Уровень логирования изменён на: ${level}`);
    }
}

/**
 * Получить текущий уровень логирования
 */
function getLogLevel() {
    return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === currentLogLevel) || 'info';
}

// Экспорт логгера
const logger = {
    debug: (message, ...args) => log('debug', message, ...args),
    info: (message, ...args) => log('info', message, ...args),
    warn: (message, ...args) => log('warn', message, ...args),
    error: (message, ...args) => log('error', message, ...args),
    log: (message, ...args) => log('info', message, ...args), // alias для info
    setLogLevel,
    getLogLevel,
    LOGS_DIR
};

module.exports = logger;
