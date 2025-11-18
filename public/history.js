class HistoryViewer {
    constructor() {
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.totalItems = 0;
        this.currentFilters = {};
        this.historyData = [];
        this.selectedItemId = null;
        this.isModalMaximized = false;
        this.modalOriginalStyle = null;
        
        this.init();
    }

    async init() {
        try {
            this.attachEventListeners();
            await this.loadHistory();
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            this.showError('Ошибка инициализации приложения');
        }
    }

    attachEventListeners() {
        // Пагинация
        document.getElementById('prevBtn').addEventListener('click', () => this.previousPage());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextPage());

        // Фильтры
        document.getElementById('applyFilters').addEventListener('click', () => this.applyFilters());
        document.getElementById('resetFilters').addEventListener('click', () => this.resetFilters());

        // Применение фильтров при нажатии Enter
        const filterInputs = document.querySelectorAll('.filter-input, .filter-select');
        filterInputs.forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.applyFilters();
                }
            });
        });

        // Модальное окно для просмотра текста
        document.getElementById('viewRequestBtn').addEventListener('click', () => this.showRequestModal());
        document.getElementById('viewResponseBtn').addEventListener('click', () => this.showResponseModal());
        
        // Обработчики для закрытия модального окна
        document.getElementById('textViewModalClose').addEventListener('click', () => this.closeTextViewModal());
        document.querySelectorAll('.text-view-modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeTextViewModal());
        });

        // Максимизация окна
        document.getElementById('textViewModalMaximize').addEventListener('click', () => this.toggleMaximizeTextViewModal());

        // Копирование текста
        document.getElementById('textViewCopyBtn').addEventListener('click', () => this.copyTextViewContent());

        // Переключение вкладок
        document.querySelectorAll('.text-view-tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTextViewTab(e.target.dataset.tab));
        });

        // Закрытие модального окна по клику вне его
        window.addEventListener('click', (event) => {
            if (event.target == document.getElementById('textViewModal')) {
                this.closeTextViewModal();
            }
        });

        // Перетаскивание и изменение размера модального окна
        this.makeTextViewModalDraggable();
    }

    async loadHistory() {
        try {
            const url = new URL('/api/responses', window.location.origin);
            
            // Добавляем фильтры
            Object.entries(this.currentFilters).forEach(([key, value]) => {
                if (value) url.searchParams.append(key, value);
            });

            // Добавляем пагинацию
            url.searchParams.append('limit', this.itemsPerPage);
            url.searchParams.append('offset', (this.currentPage - 1) * this.itemsPerPage);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Ошибка загрузки истории');
            }

            const data = await response.json();
            
            // Обрабатываем новый формат ответа с пагинацией
            if (data.responses) {
                this.historyData = data.responses;
                this.totalItems = data.total || 0;
            } else {
                // Обратная совместимость со старым форматом
                this.historyData = Array.isArray(data) ? data : [];
                this.totalItems = this.historyData.length;
            }

            this.renderHistoryList();
            this.updatePaginationInfo();
            this.updateHistoryCount();
        } catch (error) {
            console.error('Ошибка загрузки истории:', error);
            this.showError('Ошибка загрузки истории: ' + error.message);
        }
    }

    renderHistoryList() {
        const container = document.getElementById('historyItems');
        
        if (this.historyData.length === 0) {
            container.innerHTML = `
                <div class="empty-message">
                    <i class="fas fa-inbox"></i><br>
                    История запросов пуста
                </div>
            `;
            return;
        }

        container.innerHTML = this.historyData.map(item => {
            const date = new Date(item.timestamp);
            const formattedDate = `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU')}`;
            const modelDisplayName = this.getModelDisplayName(item.model);
            const inputPreview = (item.inputText || '').substring(0, 100);
            const promptName = item.promptName || 'Пользовательский промпт';
            const autoSavedIcon = item.autoSaved ? '<i class="fas fa-robot" title="Автоматически сохранено"></i> ' : '';

            return `
                <div class="history-item" data-id="${item.id}" onclick="historyViewer.selectItem('${item.id}')">
                    <div class="history-item-header">
                        <div class="history-item-date">${autoSavedIcon}${formattedDate}</div>
                        <div class="history-item-model">${modelDisplayName}</div>
                    </div>
                    <div class="history-item-prompt">${promptName}</div>
                    <div class="history-item-preview">${inputPreview}${inputPreview.length >= 100 ? '...' : ''}</div>
                </div>
            `;
        }).join('');
    }

    selectItem(itemId) {
        this.selectedItemId = itemId;
        
        // Обновляем активный элемент в списке
        document.querySelectorAll('.history-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const selectedElement = document.querySelector(`[data-id="${itemId}"]`);
        if (selectedElement) {
            selectedElement.classList.add('active');
        }

        // Находим элемент в данных
        const item = this.historyData.find(h => h.id === itemId);
        if (!item) return;

        this.renderRequestPanel(item);
        this.renderResponsePanel(item);

        // Показываем и включаем кнопки просмотра
        document.getElementById('viewRequestBtn').style.display = 'inline-block';
        document.getElementById('viewResponseBtn').style.display = 'inline-block';
        document.getElementById('viewRequestBtn').disabled = false;
        document.getElementById('viewResponseBtn').disabled = false;
    }

    renderRequestPanel(item) {
        const container = document.getElementById('requestContent');
        const date = new Date(item.timestamp);
        const formattedDate = `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU')}`;
        const modelDisplayName = this.getModelDisplayName(item.model);
        const promptName = item.promptName || 'Пользовательский промпт';

        container.innerHTML = `
            <div class="meta-info">
                <div class="meta-row">
                    <span class="meta-label">Дата:</span>
                    <span class="meta-value">${formattedDate}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Модель:</span>
                    <span class="meta-value">${modelDisplayName}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Промпт:</span>
                    <span class="meta-value">${promptName}</span>
                </div>
                ${item.provider ? `
                <div class="meta-row">
                    <span class="meta-label">Провайдер:</span>
                    <span class="meta-value">${item.provider.toUpperCase()}</span>
                </div>
                ` : ''}
            </div>

            <h4 style="color: #b8b8b8; margin: 15px 0 8px 0; font-size: 14px; border-bottom: 1px solid #404040; padding-bottom: 4px;">
                <i class="fas fa-code"></i> Prompt
            </h4>
            <div style="background-color: #2a2a2a; padding: 10px; border-radius: 4px; margin-bottom: 15px; border: 1px solid #404040; white-space: pre-wrap; word-break: break-word;">
                ${this.escapeHtml(item.prompt || 'Нет данных')}
            </div>

            <h4 style="color: #b8b8b8; margin: 15px 0 8px 0; font-size: 14px; border-bottom: 1px solid #404040; padding-bottom: 4px;">
                <i class="fas fa-keyboard"></i> Input Text
            </h4>
            <div style="background-color: #2a2a2a; padding: 10px; border-radius: 4px; margin-bottom: 15px; border: 1px solid #404040; white-space: pre-wrap; word-break: break-word;">
                ${this.escapeHtml(item.inputText || 'Нет данных')}
            </div>

            <hr class="section-divider">

            <h4 style="color: #b8b8b8; margin: 15px 0 8px 0; font-size: 14px; border-bottom: 1px solid #404040; padding-bottom: 4px;">
                <i class="fas fa-file-code"></i> Raw Request JSON
            </h4>
            <div class="json-content">
                ${this.formatJson({
                    model: item.model,
                    prompt: item.prompt,
                    inputText: item.inputText,
                    promptName: item.promptName,
                    provider: item.provider,
                    timestamp: item.timestamp
                })}
            </div>
        `;
    }

    renderResponsePanel(item) {
        const container = document.getElementById('responseContent');

        // Определяем статус ответа
        const hasError = item.response && item.response.includes('ERROR:');
        const statusIcon = hasError ? '❌' : '✓';
        const statusText = hasError ? 'Ошибка' : 'Успешно';
        const statusColor = hasError ? '#F44336' : '#4CAF50';

        container.innerHTML = `
            <div class="meta-info">
                <div class="meta-row">
                    <span class="meta-label">ID ответа:</span>
                    <span class="meta-value">${item.id}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Статус:</span>
                    <span class="meta-value" style="color: ${statusColor};">${statusIcon} ${statusText}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Размер ответа:</span>
                    <span class="meta-value">${(item.response || '').length} символов</span>
                </div>
                ${item.tokens ? `
                <div class="meta-row">
                    <span class="meta-label">Токены (вход):</span>
                    <span class="meta-value">${item.tokens.input}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Токены (выход):</span>
                    <span class="meta-value">${item.tokens.output}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Токены (всего):</span>
                    <span class="meta-value">${item.tokens.total} ${item.tokens.source ? '(' + item.tokens.source + ')' : ''}</span>
                </div>
                ` : ''}
            </div>

            <h4 style="color: #b8b8b8; margin: 15px 0 8px 0; font-size: 14px; border-bottom: 1px solid #404040; padding-bottom: 4px;">
                <i class="fas fa-comment-dots"></i> Content
            </h4>
            <div style="background-color: #2a2a2a; padding: 10px; border-radius: 4px; margin-bottom: 15px; border: 1px solid #404040; white-space: pre-wrap; word-break: break-word; line-height: 1.5;">
                ${this.escapeHtml(item.response || 'Нет данных')}
            </div>

            <hr class="section-divider">

            <h4 style="color: #b8b8b8; margin: 15px 0 8px 0; font-size: 14px; border-bottom: 1px solid #404040; padding-bottom: 4px;">
                <i class="fas fa-file-code"></i> Raw Response JSON
            </h4>
            <div class="json-content">
                ${this.formatJson({
                    success: !hasError,
                    content: item.response,
                    timestamp: item.timestamp,
                    id: item.id,
                    model: item.model,
                    provider: item.provider,
                    tokens: item.tokens || null
                })}
            </div>
        `;
    }

    getModelDisplayName(modelName) {
        // Определяем провайдера и красивое имя модели
        if (!modelName) return 'Неизвестная модель';
        
        if (modelName.includes('llama') || modelName.includes('mixtral') || modelName.includes('gemma')) {
            return `🚀 GROQ: ${modelName}`;
        }
        
        if (modelName.includes('gpt') || modelName.includes('claude') || modelName.includes('google/')) {
            return `🌐 OpenRouter: ${modelName}`;
        }
        
        return modelName;
    }

    formatJson(obj) {
        try {
            return JSON.stringify(obj, null, 2);
        } catch (error) {
            return 'Ошибка форматирования JSON';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    applyFilters() {
        this.currentFilters = {
            model: document.getElementById('modelFilter').value.trim(),
            prompt: document.getElementById('promptFilter').value.trim(),
            dateFrom: document.getElementById('dateFromFilter').value,
            dateTo: document.getElementById('dateToFilter').value,
            sortBy: document.getElementById('sortBy').value,
            sortOrder: document.getElementById('sortOrder').value
        };

        // Сбрасываем на первую страницу при применении фильтров
        this.currentPage = 1;
        this.loadHistory();
    }

    resetFilters() {
        document.getElementById('modelFilter').value = '';
        document.getElementById('promptFilter').value = '';
        document.getElementById('dateFromFilter').value = '';
        document.getElementById('dateToFilter').value = '';
        document.getElementById('sortBy').value = 'date';
        document.getElementById('sortOrder').value = 'desc';

        this.currentFilters = {};
        this.currentPage = 1;
        this.loadHistory();
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.loadHistory();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.loadHistory();
        }
    }

    updatePaginationInfo() {
        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);

        const infoText = this.totalItems > 0 
            ? `Запись ${startItem} из ${this.totalItems} (страница ${this.currentPage} из ${totalPages})`
            : 'Нет записей';

        document.getElementById('paginationInfo').textContent = infoText;

        // Обновляем состояние кнопок пагинации
        document.getElementById('prevBtn').disabled = this.currentPage <= 1;
        document.getElementById('nextBtn').disabled = this.currentPage >= totalPages || totalPages === 0;
    }

    updateHistoryCount() {
        const countElement = document.getElementById('historyCount');
        if (countElement) {
            countElement.textContent = this.totalItems;
        }
    }

    showError(message) {
        const container = document.getElementById('historyItems');
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i> ${message}
            </div>
        `;
    }

    // --- Методы для модального окна просмотра текста ---

    showRequestModal() {
        if (!this.selectedItemId) return;
        const item = this.historyData.find(h => h.id === this.selectedItemId);
        if (!item) return;

        const requestText = `PROMPT:\n${item.prompt || 'Нет данных'}\n\nINPUT TEXT:\n${item.inputText || 'Нет данных'}`;
        this.openTextViewModal('Полный запрос (Request)', requestText);
    }

    showResponseModal() {
        if (!this.selectedItemId) return;
        const item = this.historyData.find(h => h.id === this.selectedItemId);
        if (!item) return;

        this.openTextViewModal('Полный ответ (Response)', item.response || 'Нет данных');
    }

    openTextViewModal(title, content) {
        document.getElementById('textViewModalTitle').textContent = title;
        document.getElementById('textViewModalText').value = content;
        
        // Сбрасываем на вкладку Plain Text
        this.switchTextViewTab('text');
        
        // Показываем модальное окно
        document.getElementById('textViewModal').style.display = 'block';
    }

    closeTextViewModal() {
        document.getElementById('textViewModal').style.display = 'none';
    }

    switchTextViewTab(tabName) {
        // Переключаем кнопки
        document.querySelectorAll('.text-view-tab-button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            }
        });

        // Переключаем содержимое
        document.querySelectorAll('.text-view-tab-content').forEach(content => {
            content.classList.remove('active');
        });

        if (tabName === 'text') {
            document.getElementById('textViewTextTab').classList.add('active');
        } else if (tabName === 'markdown') {
            document.getElementById('textViewMarkdownTab').classList.add('active');
            this.renderMarkdownPreview();
        }
    }

    renderMarkdownPreview() {
        const sourceText = document.getElementById('textViewModalText').value;
        const targetElement = document.getElementById('textViewMarkdownPreview');

        if (!sourceText || !targetElement) return;

        try {
            // Проверяем доступность библиотеки marked
            if (typeof marked === 'undefined') {
                targetElement.innerHTML = '<div class="error">Marked.js library not loaded</div>';
                return;
            }

            // Конфигурируем marked для поддержки GFM
            if (marked.setOptions) {
                marked.setOptions({
                    gfm: true,
                    breaks: true,
                    sanitize: false
                });
            }

            // Рендерим markdown
            const htmlContent = marked.parse ? marked.parse(sourceText) : marked(sourceText);
            targetElement.innerHTML = htmlContent;

            // Подсвечиваем код, если доступен highlight.js
            if (typeof hljs !== 'undefined') {
                targetElement.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightElement(block);
                });
            }
        } catch (error) {
            console.error('Ошибка рендеринга Markdown:', error);
            targetElement.innerHTML = '<div class="error">Ошибка рендеринга Markdown</div>';
        }
    }

    copyTextViewContent() {
        const content = document.getElementById('textViewModalText').value;
        navigator.clipboard.writeText(content).then(() => {
            const copyBtn = document.getElementById('textViewCopyBtn');
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Ошибка копирования:', err);
            alert('Не удалось скопировать текст.');
        });
    }

    makeTextViewModalDraggable() {
        const modalContent = document.getElementById('textViewModalContent');
        const modalHeader = document.getElementById('textViewModalHeader');
        const resizeHandle = document.getElementById('textViewResizeHandle');
        
        let isDragging = false;
        let isResizing = false;
        let startX, startY, startLeft, startTop, startWidth, startHeight;

        // Перетаскивание
        modalHeader.addEventListener('mousedown', (e) => {
            if (e.target.closest('.text-view-tab-buttons') || e.target.closest('.text-view-modal-header-buttons')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = modalContent.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            
            e.preventDefault();
            document.body.style.userSelect = 'none';
        });

        // Изменение размера
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = modalContent.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            
            e.preventDefault();
            e.stopPropagation();
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const newLeft = startLeft + e.clientX - startX;
                const newTop = startTop + e.clientY - startY;
                
                // Ограничиваем перемещение границами экрана
                const maxLeft = window.innerWidth - modalContent.offsetWidth;
                const maxTop = window.innerHeight - modalContent.offsetHeight;
                
                const constrainedLeft = Math.max(0, Math.min(newLeft, maxLeft));
                const constrainedTop = Math.max(0, Math.min(newTop, maxTop));
                
                modalContent.style.left = constrainedLeft + 'px';
                modalContent.style.top = constrainedTop + 'px';
                modalContent.style.transform = 'none';
            }
            
            if (isResizing) {
                const newWidth = startWidth + e.clientX - startX;
                const newHeight = startHeight + e.clientY - startY;
                
                // Минимальные размеры
                const minWidth = 400;
                const minHeight = 300;
                const maxWidth = window.innerWidth - parseInt(modalContent.style.left, 10) || window.innerWidth;
                const maxHeight = window.innerHeight - parseInt(modalContent.style.top, 10) || window.innerHeight;
                
                modalContent.style.width = Math.max(minWidth, Math.min(newWidth, maxWidth)) + 'px';
                modalContent.style.height = Math.max(minHeight, Math.min(newHeight, maxHeight)) + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            isResizing = false;
            document.body.style.userSelect = '';
        });
    }

    toggleMaximizeTextViewModal() {
        const modalContent = document.getElementById('textViewModalContent');
        const maximizeBtn = document.getElementById('textViewModalMaximize');
        
        if (!this.isModalMaximized) {
            // Сохраняем текущие размеры и позицию
            this.modalOriginalStyle = {
                width: modalContent.style.width || '80%',
                height: modalContent.style.height || '80%',
                left: modalContent.style.left || '50%',
                top: modalContent.style.top || '50%',
                transform: modalContent.style.transform || 'translate(-50%, -50%)'
            };
            
            // Максимизируем
            modalContent.style.width = '98vw';
            modalContent.style.height = '98vh';
            modalContent.style.left = '1vw';
            modalContent.style.top = '1vh';
            modalContent.style.transform = 'none';
            
            // Меняем иконку
            maximizeBtn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i>';
            maximizeBtn.title = 'Восстановить размер';
            
            this.isModalMaximized = true;
        } else {
            // Восстанавливаем оригинальные размеры
            if (this.modalOriginalStyle) {
                modalContent.style.width = this.modalOriginalStyle.width;
                modalContent.style.height = this.modalOriginalStyle.height;
                modalContent.style.left = this.modalOriginalStyle.left;
                modalContent.style.top = this.modalOriginalStyle.top;
                modalContent.style.transform = this.modalOriginalStyle.transform;
            }
            
            // Меняем иконку обратно
            maximizeBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
            maximizeBtn.title = 'Развернуть/Свернуть';
            
            this.isModalMaximized = false;
        }
    }
}

// Инициализация при загрузке страницы
let historyViewer;
document.addEventListener('DOMContentLoaded', () => {
    historyViewer = new HistoryViewer();
});

