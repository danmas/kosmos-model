/**
 * 🚀 KOSMOS-MODEL | Models Manager JS
 * Reverted to "Classic Detailed" layout with modern Skin Integration
 * Full functionality restored from dev branch
 */

const PROVIDER_CONFIG = {
    direct: { name: 'Direct / (Togethr, Z.AI, ...)', icon: 'fas fa-server', color: '#9c27b0', class: 'direct' },
    groq: { name: 'GROQ', icon: 'fas fa-rocket', color: '#ff6b35', class: 'groq' },
    openroute: { name: 'OpenRouter', icon: 'fas fa-globe', color: '#28a745', class: 'openrouter' },
    gigachat: { name: 'GigaChat (Sber)', icon: 'fas fa-comments', color: '#21a038', class: 'direct' },
    _default: { name: 'Unknown Provider', icon: 'fas fa-cube', color: '#607d8b', class: 'direct' }
};

class ModelsPage {
    constructor() {
        this.allModels = [];
        this.filteredModels = [];
        this.validationData = null;
        this.init();
    }

    async init() {
        try {
            await Promise.all([
                this.loadModels(),
                this.loadValidationData()
            ]);
            this.setupEventListeners();
            this.renderStats();
            this.renderModels();
            this.hideLoading();
        } catch (err) {
            console.error('Boot error:', err);
            this.showError(err.message);
            this.hideLoading();
        }
    }

    async loadValidationData() {
        try {
            const res = await fetch('/api/user-type-validation');
            if (res.ok) this.validationData = await res.json();
        } catch (err) { console.error('Validation load fail:', err); }
    }

    async loadModels() {
        try {
            const res = await fetch('/api/all-models');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.allModels = data.map(m => ({
                ...m,
                isFast: !!m.fast,
                isFree: !!m.free,
                isDefault: m.priority === 'default'
            }));
            this.filteredModels = [...this.allModels];
        } catch (e) {
            console.error(e);
        }
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
                (m.visible_name && m.visible_name.toLowerCase().includes(term)) ||
                (m.user_type && m.user_type.toLowerCase().includes(term)) ||
                m.id.toLowerCase().includes(term)
            )
            : [...this.allModels];

        this.renderStats();
        this.renderModels();
    }

    renderStats() {
        const stats = document.getElementById('statsSection');
        if (!stats) {
            // Fallback for old HTML structure
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };
            setVal('totalModelsCount', this.filteredModels.length);
            const passedCount = this.validationData?.passed?.length || 0;
            setVal('stat-valid', `${passedCount} OK`);
            setVal('stat-direct', this.filteredModels.filter(m => m.provider === 'direct').length);
            setVal('stat-or', this.filteredModels.filter(m => m.provider === 'openroute').length);
            setVal('activeProvidersCount', this.filteredModels.filter(m => m.provider === 'groq').length);
            setVal('stat-fast', this.filteredModels.filter(m => m.isFast).length);
            setVal('stat-default', this.filteredModels.filter(m => m.isDefault).length);
            return;
        }

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

        // Кнопка валидации user_type (первой в ряду)
        const validationButton = this.renderValidationButton();

        stats.innerHTML = `
            ${validationButton}
            <div class="stat-card"><div class="stat-number">${total}</div><div class="stat-label">Total</div></div>
            ${providerCards}
            <div class="stat-card"><div class="stat-number" style="color:#17a2b8">${fast}</div><div class="stat-label">Fast ⚡</div></div>
            <div class="stat-card"><div class="stat-number" style="color:#ffc107">${defaults}</div><div class="stat-label">Default ★</div></div>
        `;
    }

    renderValidationButton() {
        if (!this.validationData || !this.validationData.timestamp) {
            return `<button class="validation-button" onclick="modelsPage.showValidationModal()">
                <span class="validation-icon"><i class="fas fa-shield-alt"></i></span>
                <span class="validation-status">?</span>
                <span class="validation-label">user_type</span>
            </button>`;
        }

        const passed = this.validationData.passed?.length || 0;
        const failed = this.validationData.failed?.length || 0;
        const hasErrors = failed > 0;
        const inProgress = this.validationData.inProgress;

        if (inProgress) {
            return `<button class="validation-button" onclick="modelsPage.showValidationModal()">
                <span class="validation-icon"><i class="fas fa-spinner fa-spin"></i></span>
                <span class="validation-status">...</span>
                <span class="validation-label">проверка</span>
            </button>`;
        }

        const buttonClass = hasErrors ? 'validation-button has-errors' : 'validation-button';
        const icon = hasErrors ? 'fa-exclamation-triangle' : 'fa-check-circle';
        const statusText = hasErrors ? `${failed} ош.` : `${passed} OK`;

        return `<button class="${buttonClass}" onclick="modelsPage.showValidationModal()">
            <span class="validation-icon"><i class="fas ${icon}"></i></span>
            <span class="validation-status">${statusText}</span>
            <span class="validation-label">user_type</span>
        </button>`;
    }

    showValidationModal() {
        const modal = document.getElementById('validationModal');
        const body = document.getElementById('validationModalBody');
        const timestamp = document.getElementById('validationTimestamp');

        if (!modal || !body) return;

        if (!this.validationData || !this.validationData.timestamp) {
            body.innerHTML = `<p style="text-align: center; color: #666;">Данные валидации недоступны. Сервер ещё не выполнял проверку.</p>`;
            if (timestamp) timestamp.textContent = '';
        } else {
            const passed = this.validationData.passed || [];
            const failed = this.validationData.failed || [];

            let html = '';

            // Секция с ошибками (первой, если есть)
            if (failed.length > 0) {
                html += `<div class="validation-section failed">
                    <h4><i class="fas fa-times-circle"></i> Не прошли проверку (${failed.length})</h4>
                    ${failed.map(m => `
                        <div class="validation-item failed">
                            <div class="validation-item-header">
                                <span class="validation-item-type">[${m.user_type}]</span>
                                <span class="validation-item-time">${m.response_time_ms ? m.response_time_ms + 'ms' : '—'}</span>
                            </div>
                            <div class="validation-item-model">
                                <strong>${m.visible_name || m.name}</strong> 
                                <span style="color: #888;">(${m.provider})</span>
                            </div>
                            <div class="validation-item-error">
                                <i class="fas fa-exclamation-circle"></i> ${m.error_message}
                            </div>
                        </div>
                    `).join('')}
                </div>`;
            }

            // Секция успешных
            if (passed.length > 0) {
                html += `<div class="validation-section passed">
                    <h4><i class="fas fa-check-circle"></i> Прошли проверку (${passed.length})</h4>
                    ${passed.map(m => `
                        <div class="validation-item">
                            <div class="validation-item-header">
                                <span class="validation-item-type">[${m.user_type}]</span>
                                <span class="validation-item-time">${m.response_time_ms}ms</span>
                            </div>
                            <div class="validation-item-model">
                                <strong>${m.visible_name || m.name}</strong> 
                                <span style="color: #888;">(${m.provider})</span>
                            </div>
                        </div>
                    `).join('')}
                </div>`;
            }

            if (passed.length === 0 && failed.length === 0) {
                html = `<p style="text-align: center; color: #666;">Нет моделей с user_type для проверки.</p>`;
            }

            body.innerHTML = html;

            // Форматируем timestamp
            if (timestamp) {
                const date = new Date(this.validationData.timestamp);
                timestamp.textContent = `Проверено: ${date.toLocaleString('ru-RU')}`;
            }
        }

        modal.classList.add('show');
    }

    closeValidationModal() {
        const modal = document.getElementById('validationModal');
        if (modal) modal.classList.remove('show');
    }

    async rerunValidation() {
        const btn = document.getElementById('validationRerunBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Запуск...';
        }

        try {
            const res = await fetch('/api/user-type-validation/rerun', { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Ошибка запуска валидации');
                return;
            }

            // Закрываем модальное окно и ждём немного
            this.closeValidationModal();

            // Периодически проверяем статус
            const checkStatus = async () => {
                await this.loadValidationData();
                if (this.validationData?.inProgress) {
                    this.renderStats();
                    setTimeout(checkStatus, 2000);
                } else {
                    this.renderStats();
                    this.showValidationModal();
                }
            };

            setTimeout(checkStatus, 1000);
        } catch (err) {
            alert('Ошибка: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt"></i> Перезапустить';
            }
        }
    }

    renderModels() {
        const container = document.getElementById('providers-container');
        if (!container) return;

        const groups = {};
        this.filteredModels.forEach(m => {
            const p = m.provider || 'unknown';
            if (!groups[p]) groups[p] = [];
            groups[p].push(m);
        });

        container.innerHTML = '';
        const sortedProviders = Object.keys(groups).sort();

        sortedProviders.forEach(provider => {
            const section = this.renderProviderSection(provider, groups[provider]);
            container.appendChild(section);
        });
    }

    renderProviderSection(provider, models) {
        const info = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG._default;
        const section = document.createElement('div');
        section.className = 'provider-section';
        section.dataset.provider = provider;
        section.innerHTML = `
            <div class="provider-toolbar ${info.class}">
                <div class="toolbar-left">
                    <button class="toolbar-btn" onclick="modelsPage.toggleProviderSection('${provider}')" title="Collapse/expand">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <i class="${info.icon}"></i>
                    <h2>${info.name}</h2>
                    <button class="toolbar-btn" onclick="modelsPage.refreshProviderModels('${provider}')" title="Refresh provider models">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="toolbar-btn" onclick="modelsPage.openAddModelModal('${provider}')" title="Add new model">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <div class="toolbar-right">
                    <span>${models.length} model${models.length === 1 ? '' : 's'}</span>
                </div>
            </div>
            <div class="models-grid provider-models-container">
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
                testBadge = `<div class="status-box" style="cursor:pointer" onclick="modelsPage.showTestModal(${testDataEscaped}, true)">
                    <i class="fas fa-check"></i> OK (${ago}, ${test.response_time_ms}ms)
                </div>`;
            } else {
                testBadge = `<div class="status-box error" style="cursor:pointer" onclick="modelsPage.showTestModal(${testDataEscaped}, false)">
                    <i class="fas fa-times"></i> Error (${ago})
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
                aboutBadge = `<div class="status-box info" style="cursor:pointer" onclick="modelsPage.showTestModal(${aboutDataEscaped}, true, 'about')">
                    <i class="fas fa-info-circle"></i> About (${agoAbout})
                </div>`;
            } else {
                aboutBadge = `<div class="status-box error" style="cursor:pointer" onclick="modelsPage.showTestModal(${aboutDataEscaped}, false, 'about')">
                    <i class="fas fa-exclamation-triangle"></i> About error (${agoAbout})
                </div>`;
            }
        }

        const badges = [];
        if (model.user_type) badges.push(`<span class="badge accent">🏷️ ${model.user_type}</span>`);
        if (model.isFast) badges.push(`<span class="badge success">⚡ Fast</span>`);
        if (model.isFree) badges.push(`<span class="badge success">FREE</span>`);

        return `
            <div class="model-card" data-model-id="${this.escapeHtml(model.id)}">
                <div class="card-header">
                    <div class="model-title-block">
                        <h3>${this.escapeHtml(provider.toUpperCase())} → ${this.escapeHtml(model.visible_name || model.name)}</h3>
                        ${model.visible_name && model.name !== model.visible_name ? `<p>${this.escapeHtml(model.name)}</p>` : ''}
                    </div>
                    <span class="provider-tag">${provider.toUpperCase()}</span>
                </div>

                <div class="info-row">
                    <span class="info-label">Context:</span>
                    <span style="color:var(--accent-blue); font-weight:700;">${this.formatTokens(model.context)}</span>
                </div>

                <div class="badge-list">
                    ${badges.join('')}
                </div>

                ${testBadge}
                ${aboutBadge}

                <div class="card-controls">
                    <div class="info-row">
                        <span class="info-label">Enabled:</span>
                        <label class="switch">
                            <input type="checkbox" id="enabled-${model.id}" ${model.enabled ? 'checked' : ''} onchange="modelsPage.toggleModelEnabled('${this.escapeForAttribute(model.id)}', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="info-row">
                        <span class="info-label">User Type:</span>
                        <input type="text" class="user-type-input" 
                               id="usertype-${model.id}"
                               value="${this.escapeHtml(model.user_type || '')}" 
                               placeholder="None"
                               onchange="modelsPage.setUserType('${this.escapeForAttribute(model.id)}', this.value)"
                               title="Unique model label for API (e.g.: MY_FAST_EXPENSIVE)">
                    </div>
                </div>

                <div class="id-input-group">
                    <input type="text" class="id-input" readonly value="${this.escapeHtml(model.name)}">
                    <button class="toolbar-btn" style="border-radius:0 8px 8px 0; background:var(--bg-card); border:1px solid var(--border-main); color:var(--text-muted);" onclick="modelsPage.copy('${this.escapeForAttribute(model.name)}', this)">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>

                <div class="card-btn-row">
                    <button class="btn-action btn-blue" onclick="modelsPage.copy('${this.escapeForAttribute(model.name)}', this)">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    <button class="btn-action btn-cyan" onclick="modelsPage.testModel('${this.escapeForAttribute(model.id)}', this)">
                        <i class="fas fa-play"></i> Test
                    </button>
                    <button class="btn-action btn-teal" onclick="modelsPage.curlTest('${this.escapeForAttribute(model.id)}', '${this.escapeForAttribute(model.name)}', this)">
                        <i class="fas fa-terminal"></i> CURL
                    </button>
                    <button class="btn-action btn-orange" onclick="modelsPage.aboutModel('${this.escapeForAttribute(model.id)}', this)">
                        <i class="fas fa-info-circle"></i> About
                    </button>
                    ${model.provider_info ? `<button class="btn-action" style="background:#9c27b0" onclick="modelsPage.showProviderInfo('${this.escapeForAttribute(model.id)}')" title="Provider information">
                        <i class="fas fa-database"></i>
                    </button>` : ''}
                </div>
            </div>
        `;
    }

    // === MODAL: Show test/about result ===
    showTestModal(testData, success, type = 'test') {
        // Create modal if not exists
        let modal = document.getElementById('testResultModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'testResultModal';
            modal.className = 'test-result-modal';
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            };
            modal.innerHTML = `
                <div class="test-modal-content" onclick="event.stopPropagation()">
                    <h2 id="testModalTitle">
                        Model test result
                        <span onclick="document.getElementById('testResultModal').style.display='none'" style="cursor:pointer; font-size:1.5em">×</span>
                    </h2>
                    <div id="testModalContent"></div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const time = new Date(testData.timestamp).toLocaleString('en-US');
        // Convert literal \n to real line breaks
        const formatResponse = (text) => this.escapeHtml(text || '').replace(/\\n/g, '\n');
        const content = success
            ? `<pre class="test-response success">${formatResponse(testData.sample_response) || 'Empty response'}</pre>`
            : `<pre class="test-response error">${formatResponse(testData.error_message) || 'Unknown error'}</pre>`;

        // Title depends on type
        const titleText = type === 'about' ? 'Model Information (About)' : 'Model test result';
        const titleEl = document.getElementById('testModalTitle');
        if (titleEl) {
            titleEl.innerHTML = `${titleText}<span onclick="document.getElementById('testResultModal').style.display='none'" style="cursor:pointer; font-size:1.5em">×</span>`;
        }

        document.getElementById('testModalContent').innerHTML = `
            <p><strong>Time:</strong> ${time}</p>
            <p><strong>Response time:</strong> ${testData.response_time_ms} ms</p>
            <p><strong>Status:</strong> ${success ? '<span style="color:var(--accent-green)">✅ Success</span>' : '<span style="color:#f33">❌ Error</span>'}</p>
            <hr style="border-color:var(--border-main); margin: 15px 0;">
            ${content}
        `;

        modal.style.display = 'flex';
    }

    // === CURL TEST (OpenAI-compat version) ===
    async curlTest(modelId, modelName, button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            // Get current host
            const baseUrl = window.location.origin;
            
            // Run test through OpenAI-compatible endpoint
            const startTime = Date.now();
            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [{ role: "user", content: "Who are you? Answer in one sentence." }],
                    max_tokens: 120,
                    temperature: 0,
                    stream: false
                })
            });
            
            const responseTime = Date.now() - startTime;
            const data = await res.json();
            
            // Build result
            const success = res.ok && data.choices?.[0]?.message?.content;
            let content;
            if (success) {
                content = data.choices[0].message.content;
            } else if (data.error?.message) {
                content = data.error.message;
            } else if (data.error) {
                content = JSON.stringify(data.error, null, 2);
            } else {
                content = JSON.stringify(data, null, 2);
            }
            
            // Generate curl command for display
            const curlCommand = `curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelName}",
    "messages": [{"role": "user", "content": "Test message"}],
    "stream": false
  }'

# If authorization is enabled (KOSMOS_API_KEY), add:
# -H "Authorization: Bearer YOUR_API_KEY"`;
            
            // Show result in modal
            this.showCurlModal(modelName, success, content, responseTime, curlCommand, res.status);
            
        } catch (err) {
            alert('CURL test error: ' + err.message);
            console.error(err);
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-terminal"></i> CURL';
        }
    }

    // Modal window for CURL result
    showCurlModal(modelName, success, content, responseTime, curlCommand, httpStatus = 200) {
        let modal = document.getElementById('testResultModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'testResultModal';
            modal.className = 'test-result-modal';
            modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
            modal.innerHTML = `
                <div class="test-modal-content" onclick="event.stopPropagation()">
                    <h2 id="testModalTitle">
                        CURL Test
                        <span onclick="document.getElementById('testResultModal').style.display='none'" style="cursor:pointer; font-size:1.5em">×</span>
                    </h2>
                    <div id="testModalContent"></div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const titleEl = document.getElementById('testModalTitle');
        if (titleEl) {
            titleEl.innerHTML = `CURL Test: ${this.escapeHtml(modelName)}<span onclick="document.getElementById('testResultModal').style.display='none'" style="cursor:pointer; font-size:1.5em">×</span>`;
        }

        const statusHtml = success 
            ? '<span style="color:var(--accent-green)">✅ OpenAI-compatible API works</span>'
            : `<span style="color:#f33">❌ HTTP ${httpStatus}</span>`;
        
        const responseClass = success ? 'test-response success' : 'test-response error';

        // Escape curlCommand for use in onclick
        const escapedCurlCommand = curlCommand.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');

        document.getElementById('testModalContent').innerHTML = `
            <p><strong>Status:</strong> ${statusHtml}</p>
            <p><strong>Response time:</strong> ${responseTime} ms</p>
            <hr style="border-color:var(--border-main); margin: 15px 0;">
            <h4>Response:</h4>
            <pre class="${responseClass}">${this.escapeHtml(content)}</pre>
            <hr style="border-color:var(--border-main); margin: 15px 0;">
            <h4>CURL command to copy:</h4>
            <pre class="curl-command">${this.escapeHtml(curlCommand)}</pre>
            <button class="btn-action btn-blue" onclick="navigator.clipboard.writeText('${escapedCurlCommand}'); this.innerHTML='✅ Copied!'" style="margin-top: 10px;">
                <i class="fas fa-copy"></i> Copy CURL
            </button>
        `;

        modal.style.display = 'flex';
    }

    // === ABOUT MODEL — Request info from model ===
    async aboutModel(modelId, button) {
        // Check if saved result exists
        const model = this.allModels.find(m => m.id === modelId);
        if (model && model.last_about && model.last_about.success) {
            // Show saved result without request
            this.showTestModal(model.last_about, true, 'about');
            return;
        }

        // No cache — make request
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const res = await fetch('/api/about-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId })
            });
            const data = await res.json();

            if (data.success) {
                // Update only this card
                const card = button.closest('.model-card');
                const newAbout = data.result;
                const ago = this.timeAgo(new Date(newAbout.timestamp));
                const aboutDataEscaped = this.escapeForAttribute(JSON.stringify(newAbout));
                
                const badgeHtml = newAbout.success
                    ? `<div class="status-box info" style="cursor:pointer" onclick="modelsPage.showTestModal(${aboutDataEscaped}, true, 'about')">
                        <i class="fas fa-info-circle"></i> About (${ago})
                       </div>`
                    : `<div class="status-box error" style="cursor:pointer" onclick="modelsPage.showTestModal(${aboutDataEscaped}, false, 'about')">
                        <i class="fas fa-exclamation-triangle"></i> About error (${ago})
                       </div>`;

                // Find existing about badge and replace or insert new
                if (card) {
                    const existingAbout = card.querySelector('.status-box.info');
                    if (existingAbout && existingAbout.textContent.includes('About')) {
                        existingAbout.outerHTML = badgeHtml;
                    }
                }

                // Update local cache
                if (model) model.last_about = newAbout;

                // Immediately show modal with result
                this.showTestModal(newAbout, newAbout.success, 'about');
            } else {
                alert('About error: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            alert('No connection to server');
            console.error(err);
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-info-circle"></i> About';
        }
    }

    // === SHOW PROVIDER INFORMATION ===
    showProviderInfo(modelId) {
        const model = this.allModels.find(m => m.id === modelId);
        if (!model || !model.provider_info) {
            alert('Provider information not available for this model');
            return;
        }

        // Use existing modal
        let modal = document.getElementById('testResultModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'testResultModal';
            modal.className = 'test-result-modal';
            modal.onclick = (e) => {
                if (e.target === modal) modal.style.display = 'none';
            };
            modal.innerHTML = `
                <div class="test-modal-content" onclick="event.stopPropagation()">
                    <h2 id="testModalTitle">
                        Provider information
                        <span onclick="document.getElementById('testResultModal').style.display='none'" style="cursor:pointer; font-size:1.5em">×</span>
                    </h2>
                    <div id="testModalContent"></div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const titleEl = document.getElementById('testModalTitle');
        if (titleEl) {
            titleEl.innerHTML = `Provider info: ${this.escapeHtml(model.visible_name || model.name)}<span onclick="document.getElementById('testResultModal').style.display='none'" style="cursor:pointer; font-size:1.5em">×</span>`;
        }

        document.getElementById('testModalContent').innerHTML = `
            <pre class="curl-command">${this.escapeHtml(JSON.stringify(model.provider_info, null, 2))}</pre>
        `;

        modal.style.display = 'flex';
    }

    async testModel(modelId, button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const res = await fetch('/api/test-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId })
            });
            const data = await res.json();

            if (data.success) {
                // Update only this card without reload
                const card = button.closest('.model-card');
                const newTest = data.result;
                const ago = this.timeAgo(new Date(newTest.timestamp));
                const testDataEscaped = this.escapeForAttribute(JSON.stringify(newTest));
                
                const badgeHtml = newTest.success
                    ? `<div class="status-box" style="cursor:pointer" onclick="modelsPage.showTestModal(${testDataEscaped}, true)">
                        <i class="fas fa-check"></i> OK (${ago}, ${newTest.response_time_ms}ms)
                       </div>`
                    : `<div class="status-box error" style="cursor:pointer" onclick="modelsPage.showTestModal(${testDataEscaped}, false)">
                        <i class="fas fa-times"></i> Error (${ago})
                       </div>`;

                // Find place for badge and insert
                if (card) {
                    const badgeList = card.querySelector('.badge-list');
                    const existingTestBox = card.querySelector('.status-box:not(.info)');
                    if (existingTestBox) {
                        existingTestBox.outerHTML = badgeHtml;
                    } else if (badgeList) {
                        badgeList.insertAdjacentHTML('afterend', badgeHtml);
                    }
                }
            } else {
                alert('Test error: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            alert('No connection to server');
            console.error(err);
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-play"></i> Test';
        }
    }

    // === Model management methods ===
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
            alert(`Model update error: ${err.message}`);
        }
    }

    // === Set user_type (unique model label) ===
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
                alert(`Error: ${data.error || 'Server error'}`);
                return;
            }
            
            console.log(`✅ user_type for ${modelId} set: ${normalizedType || 'null'}`);
            
            // Reload all models to update UI
            await this.loadModels();
            this.filterModels(document.getElementById('searchInput')?.value || '');
            
        } catch (err) {
            console.error('Failed to set user_type:', err);
            alert(`user_type set error: ${err.message}`);
        }
    }

    // === ADD MODEL MODAL ===
    openAddModelModal(provider) {
        let modal = document.getElementById('addModelModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'addModelModal';
            modal.className = 'add-model-modal';
            modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="add-modal-content" onclick="event.stopPropagation()">
                <div class="add-modal-header">
                    <h2>Add new model</h2>
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
                        <label for="newModelBaseUrl">Base URL (for 'direct' provider)</label>
                        <input type="text" id="newModelBaseUrl" placeholder="e.g., https://api.example.com/v1">
                    </div>
                    <div class="form-group">
                        <label for="newModelApiKey">API Key (for 'direct' provider)</label>
                        <input type="text" id="newModelApiKey" placeholder="e.g., env:MY_API_KEY or literal key">
                    </div>
                    <button type="submit" class="submit-btn">Save model</button>
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
            this.filterModels(document.getElementById('searchInput')?.value || '');
        } catch (err) {
            console.error('Failed to save new model:', err);
            alert(`Model save error: ${err.message}`);
        }
    }

    // === COLLAPSE/EXPAND PROVIDER SECTION ===
    toggleProviderSection(provider) {
        const section = document.querySelector(`.provider-section[data-provider="${provider}"]`);
        if (!section) return;

        const container = section.querySelector('.provider-models-container');
        const toggleBtn = section.querySelector('.toolbar-btn i');
        
        if (container.style.display === 'none') {
            container.style.display = '';
            if (toggleBtn) toggleBtn.className = 'fas fa-chevron-down';
            section.classList.remove('collapsed');
        } else {
            container.style.display = 'none';
            if (toggleBtn) toggleBtn.className = 'fas fa-chevron-right';
            section.classList.add('collapsed');
        }
    }

    // === REFRESH PROVIDER MODELS ===
    async refreshProviderModels(provider) {
        const section = document.querySelector(`.provider-section[data-provider="${provider}"]`);
        const btn = section ? section.querySelector('.toolbar-btn:nth-child(4)') : null;
        
        const originalHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            let endpoint = '';
            if (provider === 'groq') {
                endpoint = '/api/refresh-groq-models';
            } else if (provider === 'openroute') {
                endpoint = '/api/refresh-openrouter-models';
            } else if (provider === 'direct') {
                endpoint = '/api/refresh-direct-models';
            } else {
                alert(`Refresh for provider ${provider} is not supported`);
                return;
            }

            const res = await fetch(endpoint, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                await this.loadModels();
                this.filterModels(document.getElementById('searchInput')?.value || '');
                alert(`Provider ${provider} models successfully updated`);
            } else {
                alert(`Update error: ${data.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Model update error:', err);
            alert('Failed to update models: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }
    }

    async copy(text, btn) {
        await navigator.clipboard.writeText(text);
        const oldContent = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copied';
        setTimeout(() => { btn.innerHTML = oldContent; }, 2000);
    }

    timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return `только что`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}м назад`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}ч назад`;
        return `${Math.floor(seconds / 86400)}д назад`;
    }

    formatTokens(n) {
        if (!n) return '—';
        return n >= 1000 ? (n / 1000) + 'K' : n;
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

    plural(n) {
        if (n % 10 === 1 && n % 100 !== 11) return 'ь';
        if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'и';
        return 'ей';
    }

    showError(msg) {
        const el = document.getElementById('errorMessage');
        if (el) {
            el.style.display = 'block';
            el.textContent = 'Failed to load models: ' + msg;
        }
    }

    hideLoading() {
        const el = document.getElementById('loadingIndicator');
        if (el) el.style.display = 'none';
    }
}

// Global object
let modelsPage;

document.addEventListener('DOMContentLoaded', () => {
    modelsPage = new ModelsPage();
});
