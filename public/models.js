// models.js – полностью переписан под новый available-models.json (ноябрь 2025)

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
            isDefault: m.is_default || false,
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
        const groq = this.filteredModels.filter(m => m.provider === 'groq').length;
        const openrouter = this.filteredModels.filter(m => m.provider === 'openroute').length;
        const direct = this.filteredModels.filter(m => m.provider === 'direct').length;
        const fast = this.filteredModels.filter(m => m.isFast).length;
        const defaults = this.filteredModels.filter(m => m.isDefault).length;

        stats.innerHTML = `
            <div class="stat-card"><div class="stat-number">${total}</div><div class="stat-label">Всего</div></div>
            <div class="stat-card"><div class="stat-number" style="color:#ff6b35">${groq}</div><div class="stat-label">GROQ</div></div>
            <div class="stat-card"><div class="stat-number" style="color:#28a745">${openrouter}</div><div class="stat-label">OpenRouter</div></div>
            <div class="stat-card"><div class="stat-number" style="color:#9c27b0">${direct}</div><div class="stat-label">Direct</div></div>
            <div class="stat-card"><div class="stat-number" style="color:#17a2b8">${fast}</div><div class="stat-label">Быстрые ⚡</div></div>
            <div class="stat-card"><div class="stat-number" style="color:#ffc107">${defaults}</div><div class="stat-label">По умолчанию ★</div></div>
        `;
    }

    renderModels() {
        const container = document.getElementById('modelsContainer');
        if (!container) return;

        const groups = {
            direct: this.filteredModels.filter(m => m.provider === 'direct'),
            groq: this.filteredModels.filter(m => m.provider === 'groq'),
            openroute: this.filteredModels.filter(m => m.provider === 'openroute')
        };

        container.innerHTML = '';

        // Direct
        if (groups.direct.length) container.appendChild(this.createProviderSection('direct', groups.direct));
        // GROQ
        if (groups.groq.length) container.appendChild(this.createProviderSection('groq', groups.groq));
        // OpenRouter
        if (groups.openroute.length) container.appendChild(this.createProviderSection('openroute', groups.openroute));

        if (this.filteredModels.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:60px;color:#888">
                <i class="fas fa-search" style="font-size:4em;opacity:0.3"></i>
                <h3>Ничего не найдено</h3>
            </div>`;
        }
    }

    createProviderSection(provider, models) {
        const info = {
            direct: { name: 'Direct / Z.AI', icon: 'fas fa-server', color: '#9c27b0' },
            groq: { name: 'GROQ', icon: 'fas fa-rocket', color: '#ff6b35' },
            openroute: { name: 'OpenRouter', icon: 'fas fa-globe', color: '#28a745' }
        }[provider];

        const section = document.createElement('div');
        section.className = 'provider-section';
        section.innerHTML = `
            <div class="provider-header" style="background:linear-gradient(135deg, ${info.color} 0%, ${info.color}cc 100%)">
                <i class="${info.icon} provider-icon"></i>
                <h2 class="provider-title">${info.name}</h2>
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
            if (test.success) {
                testBadge = `<div class="test-badge success" title="Ответ: ${this.escapeHtml(test.sample_response)}\nВремя ответа: ${test.response_time_ms}мс\n${ago}">
                    ✅ Работает (${ago}, ${test.response_time_ms}мс)
                </div>`;
            } else {
                testBadge = `<div class="test-badge error" title="Ошибка: ${this.escapeHtml(test.error_message)}\n${ago}">
                    ❌ Ошибка (${ago})
                </div>`;
            }
        }

        const badges = [];
        if (model.isDefault) badges.push(`<span class="badge default">★ По умолчанию</span>`);
        if (model.isFast) badges.push(`<span class="badge fast">⚡ Быстрая</span>`);
        if (model.isFree) badges.push(`<span class="badge free">БЕСПЛАТНО</span>`);
        if (model.cost_level === 'rich') badges.push(`<span class="badge rich">Мощная</span>`);

        return `
            <div class="model-card ${provider}">
                <div class="model-provider ${provider}">${provider.toUpperCase()}</div>
                <div class="model-header">
                    <div>
                        <h3 class="model-name">${model.visible_name || model.name}</h3>
                        ${model.name !== (model.visible_name || '') ? `<p class="model-visible-name">${model.name}</p>` : ''}
                    </div>
                </div>
                <div class="model-details">
                    <div class="model-detail">
                        <span class="detail-label">Контекст:</span>
                        <span class="context-badge">${this.formatTokens(model.context)}</span>
                    </div>
                    ${model.cost_level ? `
                    <div class="model-detail">
                        <span class="detail-label">Категория:</span>
                        <span class="detail-value">${this.costLevelText(model.cost_level)}</span>
                    </div>` : ''}
                    ${badges.length ? `<div class="badges">${badges.join(' ')}</div>` : ''}
                    ${testBadge}
                </div>
                <div class="copy-section">
                    <input type="text" class="copy-input" value="${this.escapeHtml(model.name)}" readonly>
                    <div style="display:flex;gap:8px;">
                        <button class="copy-button" onclick="modelsPage.copy('${this.escapeHtml(model.name).replace(/'/g, "\\'")}', this)">
                            <i class="fas fa-copy"></i> Скопировать
                        </button>
                        <button class="test-button" onclick="modelsPage.testModel('${this.escapeHtml(model.id).replace(/'/g, "\\'")}', this)">
                            <i class="fas fa-play"></i> Test
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    costLevelText(level) {
        return { cheap: 'Дешёвая', fast: 'Быстрая', rich: 'Мощная' }[level] || level;
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
                location.reload(); // проще всего — обновим страницу
            } else {
                alert('Ошибка теста: ' + data.error);
            }
        } catch (err) {
            alert('Ошибка соединения');
            console.error(err);
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-play"></i> Test';
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
