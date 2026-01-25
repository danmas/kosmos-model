/**
 * History Viewer V2 - Master-Detail Interface
 */
class HistoryViewerV2 {
    constructor() {
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.totalItems = 0;
        this.historyData = [];
        this.selectedItemId = null;
        this.currentFilters = {};
        this.searchQuery = '';
        
        // Modal state
        this.isTextModalMaximized = false;
        this.textModalOriginalStyle = null;
        this.currentTextContent = '';
        this.currentTextTitle = '';
        
        this.init();
    }

    async init() {
        this.attachEventListeners();
        await this.loadHistory();
    }

    // ==================== Event Listeners ====================

    attachEventListeners() {
        // Search
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', this.debounce(() => {
            this.searchQuery = searchInput.value.trim();
            this.currentPage = 1;
            this.filterAndRenderList();
        }, 300));

        // Pagination
        document.getElementById('prevBtn').addEventListener('click', () => this.previousPage());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextPage());

        // Tabs
        document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.closest('.tab-btn').dataset.tab));
        });

        // Expand button
        document.getElementById('expandBtn').addEventListener('click', () => this.openTextModal());

        // Filter Modal
        document.getElementById('filterBtn').addEventListener('click', () => this.openFilterModal());
        document.getElementById('filterModalClose').addEventListener('click', () => this.closeFilterModal());
        document.getElementById('filterModalOverlay').addEventListener('click', () => this.closeFilterModal());
        document.getElementById('filterApply').addEventListener('click', () => this.applyFilters());
        document.getElementById('filterReset').addEventListener('click', () => this.resetFilters());

        // Text Modal
        document.getElementById('textModalClose').addEventListener('click', () => this.closeTextModal());
        document.getElementById('textModalOverlay').addEventListener('click', () => this.closeTextModal());
        document.getElementById('textModalCopy').addEventListener('click', () => this.copyTextContent());
        document.getElementById('textModalMaximize').addEventListener('click', () => this.toggleMaximizeTextModal());

        // Text Modal Tabs
        document.querySelectorAll('.text-modal-tab').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTextModalTab(e.target.dataset.tab));
        });

        // Make modals draggable and resizable
        this.makeModalDraggable('filterModal', 'filterModalHeader');
        this.makeModalResizable('filterModal', 'filterModalResize');
        this.makeModalDraggable('textModal', 'textModalHeader');
        this.makeModalResizable('textModal', 'textModalResize');

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeFilterModal();
                this.closeTextModal();
            }
        });
    }

    // ==================== Data Loading ====================

    async loadHistory() {
        try {
            const url = new URL('/api/responses', window.location.origin);
            
            // Add filters
            Object.entries(this.currentFilters).forEach(([key, value]) => {
                if (value) url.searchParams.append(key, value);
            });

            // Add pagination
            url.searchParams.append('limit', this.itemsPerPage);
            url.searchParams.append('offset', (this.currentPage - 1) * this.itemsPerPage);

            const response = await fetch(url);
            if (!response.ok) throw new Error('Ошибка загрузки');

            const data = await response.json();
            
            if (data.responses) {
                this.historyData = data.responses;
                this.totalItems = data.total || 0;
            } else {
                this.historyData = Array.isArray(data) ? data : [];
                this.totalItems = this.historyData.length;
            }

            this.filterAndRenderList();
            this.updatePagination();
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            this.showListError('Ошибка загрузки данных');
        }
    }

    // ==================== List Rendering ====================

    filterAndRenderList() {
        let filtered = this.historyData;

        // Client-side search by inputText
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(item => 
                (item.inputText || '').toLowerCase().includes(query)
            );
        }

        this.renderList(filtered);
    }

    renderList(items) {
        const container = document.getElementById('listContainer');

        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <div>Нет записей</div>
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(item => {
            const date = new Date(item.timestamp);
            const formattedDate = `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
            const providerInfo = this.getProviderInfo(item.model, item.provider);
            const promptName = item.promptName || 'Пользовательский промпт';
            const inputPreview = (item.inputText || '').substring(0, 80);
            const isSelected = item.id === this.selectedItemId;

            return `
                <div class="list-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                    <div class="list-item-header">
                        <span class="list-item-date">${formattedDate}</span>
                        <span class="list-item-badge ${providerInfo.badgeClass}">${providerInfo.label}</span>
                    </div>
                    <div class="list-item-prompt">${this.escapeHtml(promptName)}</div>
                    <div class="list-item-preview">${this.escapeHtml(inputPreview)}${inputPreview.length >= 80 ? '...' : ''}</div>
                </div>
            `;
        }).join('');

        // Attach click listeners
        container.querySelectorAll('.list-item').forEach(el => {
            el.addEventListener('click', () => this.selectItem(el.dataset.id));
        });
    }

    showListError(message) {
        document.getElementById('listContainer').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle" style="color: #f87171;"></i>
                <div>${message}</div>
            </div>
        `;
    }

    getProviderInfo(model, provider) {
        if (provider === 'groq' || (model && (model.includes('llama') || model.includes('mixtral') || model.includes('gemma')))) {
            return { label: 'GROQ', badgeClass: 'badge-groq' };
        }
        if (provider === 'openrouter' || (model && (model.includes('gpt') || model.includes('claude') || model.includes('google/')))) {
            return { label: 'OpenRouter', badgeClass: 'badge-openrouter' };
        }
        if (provider === 'gigachat') {
            return { label: 'GigaChat', badgeClass: 'badge-gigachat' };
        }
        return { label: provider || 'API', badgeClass: 'badge-default' };
    }

    // ==================== Item Selection ====================

    selectItem(itemId) {
        this.selectedItemId = itemId;

        // Update list selection
        document.querySelectorAll('.list-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === itemId);
        });

        // Find item
        const item = this.historyData.find(h => h.id === itemId);
        if (!item) return;

        // Show details panel
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('detailsPanel').style.display = 'flex';

        this.renderMetaHeader(item);
        this.renderRequestTab(item);
        this.renderResponseTab(item);
        this.renderStatsTab(item);

        // Activate request tab by default
        this.switchTab('request');
    }

    // ==================== Meta Header ====================

    renderMetaHeader(item) {
        const date = new Date(item.timestamp);
        const formattedDate = `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU')}`;
        const providerInfo = this.getProviderInfo(item.model, item.provider);
        const hasError = item.response && item.response.includes('ERROR:');
        const statusClass = hasError ? 'badge-error' : 'badge-success';
        const statusText = hasError ? 'Ошибка' : 'Успешно';
        const statusIcon = hasError ? 'times-circle' : 'check-circle';

        let tokensHtml = '';
        if (item.tokens) {
            tokensHtml = `
                <span class="meta-info"><i class="fas fa-arrow-right"></i> ${item.tokens.input || 0}</span>
                <span class="meta-info"><i class="fas fa-arrow-left"></i> ${item.tokens.output || 0}</span>
                <span class="meta-info"><i class="fas fa-calculator"></i> ${item.tokens.total || 0}</span>
            `;
        }

        document.getElementById('metaHeader').innerHTML = `
            <div class="meta-header-row">
                <span class="meta-id">${item.id}</span>
                <span class="meta-badge ${providerInfo.badgeClass}">${providerInfo.label}</span>
                <span class="meta-badge ${statusClass}"><i class="fas fa-${statusIcon}"></i> ${statusText}</span>
            </div>
            <div class="meta-header-row">
                <span class="meta-info"><i class="fas fa-calendar"></i> ${formattedDate}</span>
                <span class="meta-info"><i class="fas fa-robot"></i> ${this.escapeHtml(item.model || 'N/A')}</span>
                ${tokensHtml}
            </div>
        `;
    }

    // ==================== Tabs ====================

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        if (tabName === 'request') {
            document.getElementById('requestTab').classList.add('active');
        } else if (tabName === 'response') {
            document.getElementById('responseTab').classList.add('active');
        } else if (tabName === 'stats') {
            document.getElementById('statsTab').classList.add('active');
        }
    }

    renderRequestTab(item) {
        const promptName = item.promptName || 'Пользовательский промпт';
        
        const rawJson = JSON.stringify({
            model: item.model,
            prompt: item.prompt,
            inputText: item.inputText,
            promptName: item.promptName,
            provider: item.provider,
            timestamp: item.timestamp
        }, null, 2);

        document.getElementById('requestTab').innerHTML = `
            <div class="content-section">
                <div class="content-section-title">
                    <i class="fas fa-tag"></i> Промпт: ${this.escapeHtml(promptName)}
                </div>
            </div>

            <div class="content-section">
                <div class="raw-json-toggle" onclick="historyViewer.toggleRawJson(this)">
                    <i class="fas fa-chevron-right"></i> <i class="fas fa-code"></i> System Prompt
                </div>
                <div class="raw-json-content">
                    <div class="content-block">${this.escapeHtml(item.prompt || 'Нет данных')}</div>
                </div>
            </div>

            <div class="content-section">
                <div class="content-section-title"><i class="fas fa-keyboard"></i> Input Text</div>
                <div class="content-block">${this.escapeHtml(item.inputText || 'Нет данных')}</div>
            </div>

            <div class="content-section">
                <div class="raw-json-toggle" onclick="historyViewer.toggleRawJson(this)">
                    <i class="fas fa-chevron-right"></i> Raw JSON
                </div>
                <div class="raw-json-content">
                    <div class="content-block">${this.escapeHtml(rawJson)}</div>
                </div>
            </div>
        `;
    }

    renderResponseTab(item) {
        const responseLength = (item.response || '').length;
        
        const rawJson = JSON.stringify({
            success: !(item.response && item.response.includes('ERROR:')),
            content: item.response,
            timestamp: item.timestamp,
            id: item.id,
            model: item.model,
            provider: item.provider,
            tokens: item.tokens || null
        }, null, 2);

        document.getElementById('responseTab').innerHTML = `
            <div class="content-section">
                <div class="content-section-title">
                    <i class="fas fa-info-circle"></i> Размер ответа: ${responseLength} символов
                </div>
            </div>

            <div class="content-section">
                <div class="content-section-title"><i class="fas fa-comment-dots"></i> Content</div>
                <div class="content-block" style="max-height: 400px;">${this.escapeHtml(item.response || 'Нет данных')}</div>
            </div>

            <div class="content-section">
                <div class="raw-json-toggle" onclick="historyViewer.toggleRawJson(this)">
                    <i class="fas fa-chevron-right"></i> Raw JSON
                </div>
                <div class="raw-json-content">
                    <div class="content-block">${this.escapeHtml(rawJson)}</div>
                </div>
            </div>
        `;
    }

    renderStatsTab(item) {
        // Text statistics
        const promptText = item.prompt || '';
        const inputText = item.inputText || '';
        const responseText = item.response || '';

        const promptChars = promptText.length;
        const inputChars = inputText.length;
        const responseChars = responseText.length;
        const totalChars = promptChars + inputChars + responseChars;

        const promptWords = this.countWords(promptText);
        const inputWords = this.countWords(inputText);
        const responseWords = this.countWords(responseText);
        const totalWords = promptWords + inputWords + responseWords;

        const promptLines = this.countLines(promptText);
        const inputLines = this.countLines(inputText);
        const responseLines = this.countLines(responseText);

        // Token statistics
        const tokens = item.tokens || {};
        const inputTokens = tokens.input || 0;
        const outputTokens = tokens.output || 0;
        const totalTokens = tokens.total || (inputTokens + outputTokens);
        const tokenSource = tokens.source || 'API';

        // Ratios
        const charsPerToken = totalTokens > 0 ? (totalChars / totalTokens).toFixed(2) : '—';
        const wordsPerToken = totalTokens > 0 ? (totalWords / totalTokens).toFixed(2) : '—';
        const compressionRatio = (promptChars + inputChars) > 0 
            ? (responseChars / (promptChars + inputChars)).toFixed(2) 
            : '—';

        // Time info
        const timestamp = new Date(item.timestamp);
        const dateStr = timestamp.toLocaleDateString('ru-RU', { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
        const timeStr = timestamp.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });

        // Status
        const hasError = responseText.includes('ERROR:');
        const statusClass = hasError ? 'error' : 'success';
        const statusText = hasError ? 'Ошибка' : 'Успешно';

        // Provider info
        const providerInfo = this.getProviderInfo(item.model, item.provider);

        document.getElementById('statsTab').innerHTML = `
            <div class="stats-grid">
                <!-- Tokens Card -->
                <div class="stats-card">
                    <div class="stats-card-header">
                        <div class="stats-card-icon blue"><i class="fas fa-coins"></i></div>
                        <span class="stats-card-title">Токены</span>
                    </div>
                    <div class="stats-inline" style="margin-bottom: 12px;">
                        <div class="stats-inline-item">
                            <div class="stats-big-number">${this.formatNumber(totalTokens)}</div>
                            <div class="stats-big-label">Всего</div>
                        </div>
                        <div class="stats-inline-item">
                            <div class="stats-big-number" style="color: #4ade80;">${this.formatNumber(inputTokens)}</div>
                            <div class="stats-big-label">Вход</div>
                        </div>
                        <div class="stats-inline-item">
                            <div class="stats-big-number" style="color: #60a5fa;">${this.formatNumber(outputTokens)}</div>
                            <div class="stats-big-label">Выход</div>
                        </div>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Источник данных</span>
                        <span class="stats-value">${this.escapeHtml(tokenSource)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Символов на токен</span>
                        <span class="stats-value">${charsPerToken}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Слов на токен</span>
                        <span class="stats-value">${wordsPerToken}</span>
                    </div>
                </div>

                <!-- Request Stats Card -->
                <div class="stats-card">
                    <div class="stats-card-header">
                        <div class="stats-card-icon green"><i class="fas fa-paper-plane"></i></div>
                        <span class="stats-card-title">Запрос (Prompt + Input)</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Символов (prompt)</span>
                        <span class="stats-value">${this.formatNumber(promptChars)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Символов (input)</span>
                        <span class="stats-value">${this.formatNumber(inputChars)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Символов (всего)</span>
                        <span class="stats-value highlight">${this.formatNumber(promptChars + inputChars)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Слов (prompt)</span>
                        <span class="stats-value">${this.formatNumber(promptWords)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Слов (input)</span>
                        <span class="stats-value">${this.formatNumber(inputWords)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Строк (prompt)</span>
                        <span class="stats-value">${promptLines}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Строк (input)</span>
                        <span class="stats-value">${inputLines}</span>
                    </div>
                </div>

                <!-- Response Stats Card -->
                <div class="stats-card">
                    <div class="stats-card-header">
                        <div class="stats-card-icon purple"><i class="fas fa-reply"></i></div>
                        <span class="stats-card-title">Ответ</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Символов</span>
                        <span class="stats-value highlight">${this.formatNumber(responseChars)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Слов</span>
                        <span class="stats-value">${this.formatNumber(responseWords)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Строк</span>
                        <span class="stats-value">${responseLines}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Коэф. расширения</span>
                        <span class="stats-value">${compressionRatio}x</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Статус</span>
                        <span class="stats-value ${statusClass}">${statusText}</span>
                    </div>
                </div>

                <!-- Model & Provider Card -->
                <div class="stats-card">
                    <div class="stats-card-header">
                        <div class="stats-card-icon cyan"><i class="fas fa-robot"></i></div>
                        <span class="stats-card-title">Модель и провайдер</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Модель</span>
                        <span class="stats-value" style="font-size: 10px; word-break: break-all;">${this.escapeHtml(item.model || 'N/A')}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Провайдер</span>
                        <span class="stats-value">${providerInfo.label}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Имя промпта</span>
                        <span class="stats-value">${this.escapeHtml(item.promptName || 'Custom')}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">ID записи</span>
                        <span class="stats-value" style="font-size: 10px;">${item.id}</span>
                    </div>
                </div>

                <!-- Time Card -->
                <div class="stats-card">
                    <div class="stats-card-header">
                        <div class="stats-card-icon amber"><i class="fas fa-clock"></i></div>
                        <span class="stats-card-title">Время</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Дата</span>
                        <span class="stats-value" style="font-size: 10px;">${dateStr}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Время</span>
                        <span class="stats-value">${timeStr}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Timestamp (Unix)</span>
                        <span class="stats-value">${timestamp.getTime()}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">ISO</span>
                        <span class="stats-value" style="font-size: 9px;">${timestamp.toISOString()}</span>
                    </div>
                </div>

                <!-- Summary Card -->
                <div class="stats-card">
                    <div class="stats-card-header">
                        <div class="stats-card-icon red"><i class="fas fa-chart-pie"></i></div>
                        <span class="stats-card-title">Общая статистика</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Всего символов</span>
                        <span class="stats-value highlight">${this.formatNumber(totalChars)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Всего слов</span>
                        <span class="stats-value">${this.formatNumber(totalWords)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Всего строк</span>
                        <span class="stats-value">${promptLines + inputLines + responseLines}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Средняя длина слова</span>
                        <span class="stats-value">${totalWords > 0 ? (totalChars / totalWords).toFixed(1) : '—'}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Автосохранение</span>
                        <span class="stats-value">${item.autoSaved ? 'Да' : 'Нет'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Helper methods for stats
    countWords(text) {
        if (!text) return 0;
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    }

    countLines(text) {
        if (!text) return 0;
        return text.split('\n').length;
    }

    formatNumber(num) {
        return num.toLocaleString('ru-RU');
    }

    toggleRawJson(toggleElement) {
        toggleElement.classList.toggle('expanded');
        const content = toggleElement.nextElementSibling;
        content.classList.toggle('visible');
    }

    // ==================== Pagination ====================

    updatePagination() {
        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
        const start = (this.currentPage - 1) * this.itemsPerPage + 1;
        const end = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);

        const infoText = this.totalItems > 0 
            ? `${start}-${end} из ${this.totalItems}`
            : '—';

        document.getElementById('paginationInfo').textContent = infoText;
        document.getElementById('prevBtn').disabled = this.currentPage <= 1;
        document.getElementById('nextBtn').disabled = this.currentPage >= totalPages || totalPages === 0;
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

    // ==================== Filter Modal ====================

    openFilterModal() {
        document.getElementById('filterModalOverlay').classList.add('visible');
        document.getElementById('filterModal').style.display = 'flex';
        document.getElementById('filterBtn').classList.add('active');
    }

    closeFilterModal() {
        document.getElementById('filterModalOverlay').classList.remove('visible');
        document.getElementById('filterModal').style.display = 'none';
        document.getElementById('filterBtn').classList.remove('active');
    }

    applyFilters() {
        this.currentFilters = {
            model: document.getElementById('filterModel').value.trim(),
            prompt: document.getElementById('filterPrompt').value.trim(),
            dateFrom: document.getElementById('filterDateFrom').value,
            dateTo: document.getElementById('filterDateTo').value,
            sortBy: document.getElementById('filterSortBy').value,
            sortOrder: document.getElementById('filterSortOrder').value
        };

        this.currentPage = 1;
        this.closeFilterModal();
        this.loadHistory();
    }

    resetFilters() {
        document.getElementById('filterModel').value = '';
        document.getElementById('filterPrompt').value = '';
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';
        document.getElementById('filterSortBy').value = 'date';
        document.getElementById('filterSortOrder').value = 'desc';

        this.currentFilters = {};
        this.currentPage = 1;
        this.closeFilterModal();
        this.loadHistory();
    }

    // ==================== Text View Modal ====================

    openTextModal() {
        if (!this.selectedItemId) return;

        const item = this.historyData.find(h => h.id === this.selectedItemId);
        if (!item) return;

        // Determine which tab is active
        const isRequestTab = document.getElementById('requestTab').classList.contains('active');

        if (isRequestTab) {
            this.currentTextTitle = 'Запрос (Request)';
            this.currentTextContent = `PROMPT:\n${item.prompt || 'Нет данных'}\n\nINPUT TEXT:\n${item.inputText || 'Нет данных'}`;
        } else {
            this.currentTextTitle = 'Ответ (Response)';
            this.currentTextContent = item.response || 'Нет данных';
        }

        document.getElementById('textModalTitle').innerHTML = `<i class="fas fa-file-alt"></i> ${this.currentTextTitle}`;
        document.getElementById('textModalTextarea').value = this.currentTextContent;

        // Reset to plain text tab
        this.switchTextModalTab('text');

        document.getElementById('textModalOverlay').classList.add('visible');
        document.getElementById('textModal').style.display = 'flex';
    }

    closeTextModal() {
        document.getElementById('textModalOverlay').classList.remove('visible');
        document.getElementById('textModal').style.display = 'none';
        
        // Reset maximize state
        if (this.isTextModalMaximized) {
            this.toggleMaximizeTextModal();
        }
    }

    switchTextModalTab(tabName) {
        document.querySelectorAll('.text-modal-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        document.querySelectorAll('.text-modal-content').forEach(content => {
            content.classList.remove('active');
        });

        if (tabName === 'text') {
            document.getElementById('textTabPlain').classList.add('active');
        } else {
            document.getElementById('textTabMarkdown').classList.add('active');
            this.renderMarkdownPreview();
        }
    }

    renderMarkdownPreview() {
        const content = this.currentTextContent;
        const container = document.getElementById('textModalMarkdown');

        try {
            if (typeof marked !== 'undefined') {
                if (marked.setOptions) {
                    marked.setOptions({ gfm: true, breaks: true });
                }
                const html = marked.parse ? marked.parse(content) : marked(content);
                container.innerHTML = html;

                // Highlight code blocks
                if (typeof hljs !== 'undefined') {
                    container.querySelectorAll('pre code').forEach(block => {
                        hljs.highlightElement(block);
                    });
                }
            } else {
                container.innerHTML = '<div style="color: #f87171;">Marked.js не загружен</div>';
            }
        } catch (error) {
            console.error('Markdown render error:', error);
            container.innerHTML = '<div style="color: #f87171;">Ошибка рендеринга Markdown</div>';
        }
    }

    copyTextContent() {
        navigator.clipboard.writeText(this.currentTextContent).then(() => {
            const btn = document.getElementById('textModalCopy');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => { btn.innerHTML = originalHtml; }, 1500);
        }).catch(err => {
            console.error('Copy error:', err);
        });
    }

    toggleMaximizeTextModal() {
        const modal = document.getElementById('textModal');
        const btn = document.getElementById('textModalMaximize');

        if (!this.isTextModalMaximized) {
            // Save current style
            this.textModalOriginalStyle = {
                width: modal.style.width,
                height: modal.style.height,
                top: modal.style.top,
                left: modal.style.left
            };

            // Maximize
            modal.style.width = '95vw';
            modal.style.height = '90vh';
            modal.style.top = '5vh';
            modal.style.left = '2.5vw';

            btn.innerHTML = '<i class="fas fa-compress"></i>';
            this.isTextModalMaximized = true;
        } else {
            // Restore
            if (this.textModalOriginalStyle) {
                modal.style.width = this.textModalOriginalStyle.width;
                modal.style.height = this.textModalOriginalStyle.height;
                modal.style.top = this.textModalOriginalStyle.top;
                modal.style.left = this.textModalOriginalStyle.left;
            }

            btn.innerHTML = '<i class="fas fa-expand"></i>';
            this.isTextModalMaximized = false;
        }
    }

    // ==================== Modal Drag & Resize ====================

    makeModalDraggable(modalId, headerId) {
        const modal = document.getElementById(modalId);
        const header = document.getElementById(headerId);

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = modal.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const newLeft = startLeft + e.clientX - startX;
            const newTop = startTop + e.clientY - startY;

            const maxLeft = window.innerWidth - modal.offsetWidth;
            const maxTop = window.innerHeight - modal.offsetHeight;

            modal.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
            modal.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            document.body.style.userSelect = '';
        });
    }

    makeModalResizable(modalId, handleId) {
        const modal = document.getElementById(modalId);
        const handle = document.getElementById(handleId);

        let isResizing = false;
        let startX, startY, startWidth, startHeight;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = modal.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;

            document.body.style.userSelect = 'none';
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const newWidth = startWidth + e.clientX - startX;
            const newHeight = startHeight + e.clientY - startY;

            const minWidth = parseInt(modal.style.minWidth) || 300;
            const minHeight = parseInt(modal.style.minHeight) || 200;

            modal.style.width = Math.max(minWidth, newWidth) + 'px';
            modal.style.height = Math.max(minHeight, newHeight) + 'px';
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
            document.body.style.userSelect = '';
        });
    }

    // ==================== Utilities ====================

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    debounce(fn, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    }
}

// Initialize
let historyViewer;
document.addEventListener('DOMContentLoaded', () => {
    historyViewer = new HistoryViewerV2();
});
