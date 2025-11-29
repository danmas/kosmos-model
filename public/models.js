// models.js – финальная версия с модалкой и умным обновлением (19.11.2025)

// Конфиг провайдеров — расширяемый, новые провайдеры добавляются сюда
const PROVIDER_CONFIG = {
    direct: { name: 'Direct / Z.AI', icon: 'fas fa-server', color: '#9c27b0' },
    groq: { name: 'GROQ', icon: 'fas fa-rocket', color: '#ff6b35' },
    openroute: { name: 'OpenRouter', icon: 'fas fa-globe', color: '#28a745' },
    gigachat: { name: 'GigaChat (Сбер)', icon: 'fas fa-comments', color: '#21a038' },
    // Дефолт для неизвестных провайдеров (автоматически подхватит любой новый)
    _default: { name: 'Unknown Provider', icon: 'fas fa-cube', color: '#607d8b' }
};

class ModelsPage {
    constructor() {
        this.allModels = [];
        this.filteredModels = [];
        this.init();
    }

    async init() {
        try {
            await this.loadModels();
            this.setupEventListeners();
            this.renderStats();
            this.renderModels();
            this.hideLoading();
        } catch (err) {
            this.showError('Не удалось загрузить модели: ' + err.message);
            this.hideLoading();
        }
    }

    async loadModels() {
        const res = await fetch('/api/all-models');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Добавляем подсвеченные дефолты
        this.allModels = data.map(m => ({
            ...m,
            isFast: !!m.fast,
            isFree: !!m.free
        }));

        this.filteredModels = [...this.allModels];
    }

    setupEventListeners() {
        const search = document.getElementById('searchInput');
        search?.addEventListener('input', e => this.filterModels(e.target.value));
    }

    filterModels(term) {
        term = term.toLowerCase().trim();
        this.filteredModels = term
            ? this.allModels.filter(m =>
                m.name.toLowerCase().includes(term) ||
                (m.visible_name && m.visible_name.toLowerCase().includes(term))
            )
            : [...this.allModels];

        this.renderStats();
        this.renderModels();
    }

    renderStats() {
        const stats = document.getElementById('statsSection');
        if (!stats) return;

        const total = this.filteredModels.length;
        const fast = this.filteredModels.filter(m => m.isFast).length;
        const defaults = this.filteredModels.filter(m => m.user_type).length;

        // Динамически собираем провайдеров из данных
        const providerCounts = {};
        this.filteredModels.forEach(m => {
            const p = m.provider || 'unknown';
            providerCounts[p] = (providerCounts[p] || 0) + 1;
        });

        // Генерируем карточки для каждого провайдера
        const providerCards = Object.entries(providerCounts)
            .map(([provider, count]) => {
                const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG._default;
                return `<div class="stat-card"><div class="stat-number" style="color:${config.color}">${count}</div><div class="stat-label">${config.name}</div></div>`;
            })
            .join('');

        stats.innerHTML = `
            <div class="stat-card"><div class="stat-number">${total}</div><div class="stat-label">Всего</div></div>
            ${providerCards}
            <div class="stat-card"><div class="stat-number" style="color:#17a2b8">${fast}</div><div class="stat-label">Быстрые ⚡</div></div>
            <div class="stat-card"><div class="stat-number" style="color:#ffc107">${defaults}</div><div class="stat-label">По умолчанию ★</div></div>
        `;
    }

    renderModels() {
        const container = document.getElementById('modelsContainer');
        if (!container) return;

        // Динамически группируем модели по провайдерам
        const groups = {};
        this.filteredModels.forEach(m => {
            const p = m.provider || 'unknown';
            if (!groups[p]) groups[p] = [];
            groups[p].push(m);
        });

        container.innerHTML = '';

        // Порядок отображения: сначала известные провайдеры, потом остальные
        const knownOrder = ['direct', 'gigachat', 'groq', 'openroute'];
        const sortedProviders = [
            ...knownOrder.filter(p => groups[p]?.length),
            ...Object.keys(groups).filter(p => !knownOrder.includes(p))
        ];

        // Рендерим секции для каждого провайдера
        sortedProviders.forEach(provider => {
            if (groups[provider]?.length) {
                container.appendChild(this.createProviderSection(provider, groups[provider]));
            }
        });

        if (this.filteredModels.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:60px;color:#888">
                <i class="fas fa-search" style="font-size:4em;opacity:0.3"></i>
                <h3>Ничего не найдено</h3>
            </div>`;
        }
    }

    createProviderSection(provider, models) {
        // Используем конфиг провайдера или дефолтный для неизвестных
        const info = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG._default;

        const section = document.createElement('div');
        section.className = 'provider-section';
        section.innerHTML = `
            <div class="provider-header" style="background:linear-gradient(135deg, ${info.color} 0%, ${info.color}cc 100%)">
                <i class="${info.icon} provider-icon"></i>
                <h2 class="provider-title">${info.name}</h2>
                <button class="add-model-btn" onclick="modelsPage.openAddModelModal('${provider}')" title="Добавить новую модель">+</button>
                <div class="provider-stats">${models.length} модел${this.plural(models.length)}</div>
            </div>
            <div class="models-grid">
                ${models.map(m => this.createModelCard(m, provider)).join('')}
            </div>
        `;
        return section;
    }

    createModelCard(model, provider) {
        const test = model.last_test;
        let testBadge = '';
        if (test) {
            const ago = this.timeAgo(new Date(test.timestamp));
            const testDataEscaped = this.escapeForAttribute(JSON.stringify(test));
            if (test.success) {
                testBadge = `<div class="test-badge success" onclick="modelsPage.showTestModal(${testDataEscaped}, true)" style="cursor:pointer">
                    ✅ Работает (${ago}, ${test.response_time_ms}мс)
                </div>`;
            } else {
                testBadge = `<div class="test-badge error" onclick="modelsPage.showTestModal(${testDataEscaped}, false)" style="cursor:pointer">
                    ❌ Ошибка (${ago})
                </div>`;
            }
        }

        // About badge (last_about)
        const about = model.last_about;
        let aboutBadge = '';
        if (about) {
            const agoAbout = this.timeAgo(new Date(about.timestamp));
            const aboutDataEscaped = this.escapeForAttribute(JSON.stringify(about));
            if (about.success) {
                aboutBadge = `<div class="test-badge about-badge success" onclick="modelsPage.showTestModal(${aboutDataEscaped}, true, 'about')" style="cursor:pointer">
                    ℹ️ About (${agoAbout})
                </div>`;
            } else {
                aboutBadge = `<div class="test-badge about-badge error" onclick="modelsPage.showTestModal(${aboutDataEscaped}, false, 'about')" style="cursor:pointer">
                    ⚠️ About ошибка (${agoAbout})
                </div>`;
            }
        }

        const badges = [];
        if (model.user_type) badges.push(`<span class="badge default">🏷️ ${model.user_type}</span>`);
        if (model.isFast) badges.push(`<span class="badge fast">⚡ Быстрая</span>`);
        if (model.isFree) badges.push(`<span class="badge free">БЕСПЛАТНО</span>`);

        return `
            <div class="model-card ${provider}" data-model-id="${this.escapeHtml(model.id)}">
                <div class="model-provider ${provider}">${provider.toUpperCase()}</div>
                <div class="model-header">
                    <div>
                        <h3 class="model-name">${this.escapeHtml(model.visible_name || model.name)}</h3>
                        ${model.visible_name && model.name !== model.visible_name ? `<p class="model-visible-name">${this.escapeHtml(model.name)}</p>` : ''}
                    </div>
                </div>
                <div class="model-details">
                    <div class="model-detail">
                        <span class="detail-label">Контекст:</span>
                        <span class="context-badge">${this.formatTokens(model.context)}</span>
                    </div>
                    ${badges.length ? `<div class="badges">${badges.join(' ')}</div>` : ''}
                    ${testBadge}
                    ${aboutBadge}
                </div>
                <div class="model-controls">
                    <div class="control-item">
                        <label for="enabled-${model.id}" class="switch-label">Включена:</label>
                        <label class="switch">
                            <input type="checkbox" id="enabled-${model.id}" ${model.enabled ? 'checked' : ''} onchange="modelsPage.toggleModelEnabled('${this.escapeForAttribute(model.id)}', this.checked)">
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div class="control-item user-type-control">
                        <label for="usertype-${model.id}" class="role-label" title="Уникальная метка для внешних систем (например: MY_FAST_EXPENSIVE)">User Type:</label>
                        <input type="text" 
                               id="usertype-${model.id}" 
                               class="user-type-input"
                               value="${this.escapeHtml(model.user_type || '')}" 
                               placeholder="Нет"
                               onchange="modelsPage.setUserType('${this.escapeForAttribute(model.id)}', this.value)"
                               title="Уникальная метка модели для API (например: MY_FAST_EXPENSIVE)">
                    </div>
                </div>
                <div class="copy-section">
                    <input type="text" class="copy-input" value="${this.escapeHtml(model.name)}" readonly>
                    <div style="display:flex;gap:8px;">
                        <button class="copy-button" onclick="modelsPage.copy('${this.escapeForAttribute(model.name)}', this)">
                            <i class="fas fa-copy"></i> Скопировать
                        </button>
                        <button class="test-button" onclick="modelsPage.testModel('${this.escapeForAttribute(model.id)}', this)">
                            <i class="fas fa-play"></i> Test
                        </button>
                        <button class="test-button about-button" onclick="modelsPage.aboutModel('${this.escapeForAttribute(model.id)}', this)">
                            <i class="fas fa-info-circle"></i> About
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // === НОВАЯ ФУНКЦИЯ: модальное окно с результатом ===
    showTestModal(testData, success, type = 'test') {
        // Создаём модалку, если ещё нет
        let modal = document.getElementById('testResultModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'testResultModal';
            modal.style.cssText = `
                display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8);
                z-index:10000; justify-content:center; align-items:center;
            `;
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            };
            modal.innerHTML = `
                <div onclick="event.stopPropagation()" style="background:#222; color:#eee; padding:20px; border-radius:12px; max-width:90%; width:700px; max-height:90%; overflow:auto; position:relative">
                    <h2 id="testModalTitle" style="margin-top:0; display:flex; justify-content:space-between; align-items:center">
                        Результат теста модели
                        <span onclick="document.getElementById('testResultModal').style.display='none'" style="cursor:pointer; font-size:1.5em">×</span>
                    </h2>
                    <div id="testModalContent"></div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const time = new Date(testData.timestamp).toLocaleString('ru-RU');
        const content = success
            ? `<pre style="background:#000; padding:15px; border-radius:8px; overflow-x:auto; margin:15px 0; border:1px solid #0f0; white-space:pre-wrap; word-wrap:break-word">${this.escapeHtml(testData.sample_response || 'Пустой ответ')}</pre>`
            : `<pre style="background:#300; padding:15px; border-radius:8px; overflow-x:auto; margin:15px 0; border:1px solid #f33; color:#fcc; white-space:pre-wrap; word-wrap:break-word">${this.escapeHtml(testData.error_message || 'Неизвестная ошибка')}</pre>`;

        // Заголовок зависит от типа
        const titleText = type === 'about' ? 'Информация о модели (About)' : 'Результат теста модели';
        const titleEl = document.getElementById('testModalTitle');
        if (titleEl) {
            titleEl.innerHTML = `${titleText}<span onclick="document.getElementById('testResultModal').style.display='none'" style="cursor:pointer; font-size:1.5em">×</span>`;
        }

        document.getElementById('testModalContent').innerHTML = `
            <p><strong>Время:</strong> ${time}</p>
            <p><strong>Время ответа:</strong> ${testData.response_time_ms} мс</p>
            <p><strong>Статус:</strong> ${success ? '<span style="color:#0f0">✅ Успешно</span>' : '<span style="color:#f33">❌ Ошибка</span>'}</p>
            <hr style="border-color:#444">
            ${content}
        `;

        modal.style.display = 'flex';
    }

    // === УЛУЧШЕННЫЙ ТЕСТ БЕЗ ПЕРЕЗАГРУЗКИ ===
    async testModel(modelId, button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Тест...';

        try {
            const res = await fetch('/api/test-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId })
            });
            const data = await res.json();

            if (data.success) {
                // Обновляем только эту карточку
                const card = button.closest('.model-card');
                const newTest = data.result;
                const ago = this.timeAgo(new Date(newTest.timestamp));
                const testDataEscaped = this.escapeForAttribute(JSON.stringify(newTest));
                
                const badgeHtml = newTest.success
                    ? `<div class="test-badge success" onclick="modelsPage.showTestModal(${testDataEscaped}, true)" style="cursor:pointer">
                        ✅ Работает (${ago}, ${newTest.response_time_ms}мс)
                       </div>`
                    : `<div class="test-badge error" onclick="modelsPage.showTestModal(${testDataEscaped}, false)" style="cursor:pointer">
                        ❌ Ошибка (${ago})
                       </div>`;

                // Находим место для бейджа и вставляем
                const details = card.querySelector('.model-details');
                const oldBadge = details.querySelector('.test-badge:not(.about-badge)');
                if (oldBadge) oldBadge.remove();
                details.insertAdjacentHTML('beforeend', badgeHtml);
            } else {
                alert('Ошибка теста: ' + (data.error || 'Неизвестная ошибка'));
            }
        } catch (err) {
            alert('Нет связи с сервером');
            console.error(err);
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-play"></i> Test';
        }
    }

    // === ABOUT МОДЕЛИ — ПОДРОБНАЯ ИНФОРМАЦИЯ ===
    // Если есть кэш (last_about) — показываем его, иначе запрашиваем у модели
    async aboutModel(modelId, button) {
        // Проверяем, есть ли уже сохранённый результат
        const model = this.allModels.find(m => m.id === modelId);
        if (model && model.last_about && model.last_about.success) {
            // Показываем сохранённый результат без запроса
            this.showTestModal(model.last_about, true, 'about');
            return;
        }

        // Нет кэша — делаем запрос
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> About...';

        try {
            const res = await fetch('/api/about-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId })
            });
            const data = await res.json();

            if (data.success) {
                // Обновляем только эту карточку
                const card = button.closest('.model-card');
                const newAbout = data.result;
                const ago = this.timeAgo(new Date(newAbout.timestamp));
                const aboutDataEscaped = this.escapeForAttribute(JSON.stringify(newAbout));
                
                const badgeHtml = newAbout.success
                    ? `<div class="test-badge about-badge success" onclick="modelsPage.showTestModal(${aboutDataEscaped}, true, 'about')" style="cursor:pointer">
                        ℹ️ About (${ago})
                       </div>`
                    : `<div class="test-badge about-badge error" onclick="modelsPage.showTestModal(${aboutDataEscaped}, false, 'about')" style="cursor:pointer">
                        ⚠️ About ошибка (${ago})
                       </div>`;

                // Находим место для бейджа и вставляем
                const details = card.querySelector('.model-details');
                const oldAboutBadge = details.querySelector('.about-badge');
                if (oldAboutBadge) oldAboutBadge.remove();
                details.insertAdjacentHTML('beforeend', badgeHtml);

                // Обновляем локальный кэш
                if (model) model.last_about = newAbout;

                // Сразу показываем модальное окно с результатом
                this.showTestModal(newAbout, newAbout.success, 'about');
            } else {
                alert('Ошибка About: ' + (data.error || 'Неизвестная ошибка'));
            }
        } catch (err) {
            alert('Нет связи с сервером');
            console.error(err);
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-info-circle"></i> About';
        }
    }

    formatTokens(n) {
        return n >= 1000 ? (n / 1000) + 'K' : n;
    }

    plural(n) {
        if (n % 10 === 1 && n % 100 !== 11) return 'ь';
        if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'и';
        return 'ей';
    }

    async copy(text, btn) {
        await navigator.clipboard.writeText(text);
        const old = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.innerHTML = old;
            btn.classList.remove('copied');
        }, 2000);
    }

    timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return `${seconds}с назад`;
        if (seconds < 3600) return `${Math.floor(seconds/60)}м назад`;
        if (seconds < 86400) return `${Math.floor(seconds/3600)}ч назад`;
        return `${Math.floor(seconds/86400)}д назад`;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeForAttribute(text) {
        if (!text) return '';
        return String(text)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    // === НОВЫЕ МЕТОДЫ ДЛЯ УПРАВЛЕНИЯ МОДЕЛЯМИ ===
    async toggleModelEnabled(modelId, isEnabled) {
        try {
            const res = await fetch(`/api/models/update/${encodeURIComponent(modelId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: isEnabled })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Server error');
            
            const model = this.allModels.find(m => m.id === modelId);
            if (model) model.enabled = isEnabled;
        } catch (err) {
            console.error('Failed to update model:', err);
            alert(`Ошибка обновления модели: ${err.message}`);
        }
    }

    // === Установка user_type (уникальной метки модели) ===
    async setUserType(modelId, userType) {
        const normalizedType = userType ? userType.trim().toUpperCase() : null;
        
        try {
            const res = await fetch(`/api/models/update/${encodeURIComponent(modelId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_type: normalizedType })
            });
            const data = await res.json();
            
            if (!res.ok) {
                alert(`Ошибка: ${data.error || 'Server error'}`);
                return;
            }
            
            console.log(`✅ user_type для ${modelId} установлен: ${normalizedType || 'null'}`);
            
            // Перезагружаем все модели чтобы обновить UI (старая модель сбросилась)
            await this.loadModels();
            this.filterModels(document.getElementById('searchInput')?.value || '');
            
        } catch (err) {
            console.error('Failed to set user_type:', err);
            alert(`Ошибка установки user_type: ${err.message}`);
        }
    }

    openAddModelModal(provider) {
        let modal = document.getElementById('addModelModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'addModelModal';
            modal.className = 'add-model-modal'; // for styling
            modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>Добавить новую модель</h2>
                    <span class="close-button" onclick="document.getElementById('addModelModal').style.display='none'">&times;</span>
                </div>
                <form id="addModelForm" onsubmit="modelsPage.saveNewModel(event)">
                    <input type="hidden" id="newModelProvider" value="${provider}">
                    <div class="form-group">
                        <label for="newModelId">ID</label>
                        <input type="text" id="newModelId" placeholder="e.g., groq-llama3-70b" required>
                    </div>
                    <div class="form-group">
                        <label for="newModelName">Name (API name)</label>
                        <input type="text" id="newModelName" placeholder="e.g., llama3-70b-8192" required>
                    </div>
                    <div class="form-group">
                        <label for="newModelVisibleName">Visible Name</label>
                        <input type="text" id="newModelVisibleName" placeholder="e.g., Llama 3 70B">
                    </div>
                    <div class="form-group">
                        <label for="newModelContext">Context</label>
                        <input type="number" id="newModelContext" value="8192" required>
                    </div>
                     <div class="form-group">
                        <label for="newModelBaseUrl">Base URL (для 'direct' провайдера)</label>
                        <input type="text" id="newModelBaseUrl" placeholder="e.g., https://api.example.com/v1">
                    </div>
                    <div class="form-group">
                        <label for="newModelApiKey">API Key (для 'direct' провайдера)</label>
                        <input type="text" id="newModelApiKey" placeholder="e.g., env:MY_API_KEY or literal key">
                    </div>
                    <button type="submit" class="submit-btn">Сохранить модель</button>
                </form>
            </div>
        `;

        modal.style.display = 'flex';
    }

    async saveNewModel(event) {
        event.preventDefault();
        const newModel = {
            provider: document.getElementById('newModelProvider').value,
            id: document.getElementById('newModelId').value.trim(),
            name: document.getElementById('newModelName').value.trim(),
            visible_name: document.getElementById('newModelVisibleName').value.trim(),
            context: parseInt(document.getElementById('newModelContext').value, 10),
            base_url: document.getElementById('newModelBaseUrl').value.trim() || undefined,
            api_key: document.getElementById('newModelApiKey').value.trim() || undefined,
        };

        try {
            const res = await fetch('/api/models/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newModel)
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `Server error: ${res.status}`);
            }
            
            document.getElementById('addModelModal').style.display = 'none';
            await this.loadModels();
            this.filterModels(document.getElementById('searchInput').value); // Re-filter and re-render
        } catch (err) {
            console.error('Failed to save new model:', err);
            alert(`Ошибка сохранения модели: ${err.message}`);
        }
    }


    showError(msg) {
        document.getElementById('errorMessage').style.display = 'block';
        document.getElementById('errorMessage').textContent = msg;
    }

    hideLoading() {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

// Глобальный объект
let modelsPage;

document.addEventListener('DOMContentLoaded', () => {
    modelsPage = new ModelsPage();
});
