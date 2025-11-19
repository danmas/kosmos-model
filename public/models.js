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
                        ${model.name !== model.visible_name ? `<p class="model-visible-name">${model.name}</p>` : ''}
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
                    ${badges.length ? `<div class="badges" style="margin-top:10px">${badges.join(' ')}</div>` : ''}
                </div>
                <div class="copy-section">
                    <input type="text" class="copy-input" value="${model.name}" readonly>
                    <button class="copy-button" onclick="modelsPage.copy('${model.name}', this)">
                        <i class="fas fa-copy"></i> Скопировать
                    </button>
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
