/**
 * 🚀 KOSMOS-MODEL | Models Manager JS
 * Reverted to "Classic Detailed" layout with modern Skin Integration
 */

const PROVIDER_CONFIG = {
    direct: { name: 'Direct / (Togethr, Z.AI, ...)', icon: 'fas fa-server', class: 'direct' },
    groq: { name: 'GROQ', icon: 'fas fa-rocket', class: 'groq' },
    openroute: { name: 'OpenRouter', icon: 'fas fa-globe', class: 'openrouter' },
    gigachat: { name: 'GigaChat', icon: 'fas fa-comments', class: 'direct' },
    _default: { name: 'AI Provider', icon: 'fas fa-cube', class: 'direct' }
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
        } catch (err) {
            console.error('Boot error:', err);
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
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setVal('totalModelsCount', this.filteredModels.length);

        const passedCount = this.validationData?.passed?.length || 0;
        setVal('stat-valid', `${passedCount} OK`);

        setVal('stat-direct', this.filteredModels.filter(m => m.provider === 'direct').length);
        setVal('stat-or', this.filteredModels.filter(m => m.provider === 'openroute').length);

        const groqCount = this.filteredModels.filter(m => m.provider === 'groq').length;
        setVal('activeProvidersCount', groqCount);

        setVal('stat-fast', this.filteredModels.filter(m => m.isFast).length);
        setVal('stat-default', this.filteredModels.filter(m => m.isDefault).length);
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
        section.innerHTML = `
            <div class="provider-toolbar ${info.class}">
                <div class="toolbar-left">
                    <button class="toolbar-btn"><i class="fas fa-chevron-right"></i></button>
                    <i class="${info.icon}"></i>
                    <h2>${info.name}</h2>
                    <button class="toolbar-btn"><i class="fas fa-sync-alt"></i></button>
                    <button class="toolbar-btn"><i class="fas fa-plus"></i></button>
                </div>
                <div class="toolbar-right">
                    <span>${models.length} models</span>
                </div>
            </div>
            <div class="models-grid">
                ${models.map(m => this.createModelCard(m, provider)).join('')}
            </div>
        `;
        return section;
    }

    createModelCard(model, provider) {
        const badges = [];
        if (model.isFast) badges.push(`<span class="badge accent">⚡ Fast</span>`);
        if (model.isFree) badges.push(`<span class="badge success">FREE</span>`);
        if (model.user_type) badges.push(`<span class="badge accent"><i class="fas fa-fingerprint"></i> INSTRUCT</span>`);

        const test = model.last_test;
        let testStatusHtml = `<div class="status-box info" style="cursor:pointer" onclick="modelsPage.showTestDetails('${this.escapeForAttribute(model.id)}')">
            <i class="fas fa-info-circle"></i> No recent test data
        </div>`;

        if (test) {
            testStatusHtml = `<div class="status-box ${test.success ? '' : 'error'}" style="cursor:pointer" onclick="modelsPage.showTestDetails('${this.escapeForAttribute(model.id)}')">
                <i class="fas ${test.success ? 'fa-check' : 'fa-times'}"></i>
                OK (${this.timeAgo(new Date(test.timestamp))}, ${test.response_time_ms}ms)
            </div>`;
        }

        return `
            <div class="model-card">
                <div class="card-header">
                    <div class="model-title-block">
                        <h3>${this.escapeHtml(provider.toUpperCase())} → ${this.escapeHtml(model.visible_name || model.name)}</h3>
                        <p>${this.escapeHtml(model.visible_name || model.name)}</p>
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

                ${testStatusHtml}
                <div class="status-box info" style="cursor:pointer" onclick="modelsPage.showAboutDetails('${this.escapeForAttribute(model.id)}')">
                    <i class="fas fa-info-circle"></i> About (${model.last_seen ? this.timeAgo(new Date(model.last_seen)) : 'unknown'})
                </div>

                <div class="card-controls">
                    <div class="info-row">
                        <span class="info-label">Enabled:</span>
                        <label class="switch">
                            <input type="checkbox" ${model.enabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="info-row">
                        <span class="info-label">User Type:</span>
                        <input type="text" class="user-type-input" value="${this.escapeHtml(model.user_type || 'None')}">
                    </div>
                </div>

                <div class="id-input-group">
                    <input type="text" class="id-input" readonly value="${this.escapeHtml(model.id)}">
                    <button class="toolbar-btn" style="border-radius:0 8px 8px 0; background:var(--bg-card); border:1px solid var(--border-main); color:var(--text-muted);">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                </div>

                <div class="card-btn-row">
                    <button class="btn-action btn-blue" onclick="modelsPage.copy('${this.escapeForAttribute(model.name)}', this)">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    <button class="btn-action btn-cyan" onclick="modelsPage.testModel('${this.escapeForAttribute(model.id)}', this)">
                        <i class="fas fa-play"></i> Test
                    </button>
                    <button class="btn-action btn-teal">
                        <i class="fas fa-terminal"></i> CURL
                    </button>
                    <button class="btn-action btn-orange">
                        <i class="fas fa-info-circle"></i> About
                    </button>
                </div>
            </div>
        `;
    }

    showTestDetails(modelId) {
        const model = this.allModels.find(m => m.id === modelId);
        if (!model || !model.last_test) {
            this.openModal('Test Diagnostic', '<p>No diagnostic data available for this model yet. Please run a test first.</p>');
            return;
        }

        const t = model.last_test;
        const html = `
            <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border-left: 4px solid ${t.success ? 'var(--accent-green)' : 'var(--accent-red)'}">
                <p><strong>Status:</strong> ${t.success ? 'SUCCESS' : 'FAILED'}</p>
                <p><strong>Response Time:</strong> ${t.response_time_ms}ms</p>
                <p><strong>Timestamp:</strong> ${new Date(t.timestamp).toLocaleString()}</p>
            </div>
            <div style="margin-top: 15px;">
                <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 5px;">DEBUG LOG / OUTPUT:</p>
                <pre style="background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; overflow-x: auto; max-height: 300px;">${this.escapeHtml(t.error || 'Request completed successfully without warnings.\n\nLatency Trace: ' + t.response_time_ms + 'ms\nNode: ' + (model.provider || 'direct'))}</pre>
            </div>
        `;
        this.openModal(`Test Result: ${model.name}`, html);
    }

    showAboutDetails(modelId) {
        const model = this.allModels.find(m => m.id === modelId);
        if (!model) return;

        const html = `
            <div style="display: grid; gap: 15px;">
                <div class="info-row"><span class="info-label">Full ID:</span> <code>${model.id}</code></div>
                <div class="info-row"><span class="info-label">Visible Name:</span> ${model.visible_name || model.name}</div>
                <div class="info-row"><span class="info-label">Provider:</span> ${model.provider}</div>
                <div class="info-row"><span class="info-label">Context:</span> ${this.formatTokens(model.context)} tokens</div>
                <div class="info-row"><span class="info-label">Priority:</span> ${model.priority || 'standard'}</div>
                <div class="info-row">
                    <span class="info-label">Features:</span>
                    <div class="badge-list">
                        ${model.isFast ? '<span class="badge accent">Fast</span>' : ''}
                        ${model.isFree ? '<span class="badge success">Free</span>' : ''}
                        ${model.isDefault ? '<span class="badge">Default</span>' : ''}
                    </div>
                </div>
            </div>
        `;
        this.openModal('Model Architecture Info', html);
    }

    openModal(title, content) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        document.getElementById('details-modal').style.display = 'flex';
    }

    async testModel(modelId, btn) {
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const res = await fetch('/api/test-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId })
            });
            const data = await res.json();
            if (data.success) {
                btn.innerHTML = '<i class="fas fa-check"></i> OK';
                setTimeout(() => location.reload(), 1000);
            } else {
                alert('Ошибка теста: ' + (data.error || 'Неизвестная ошибка'));
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        } catch (err) {
            alert('Связь потеряна');
            btn.innerHTML = originalContent;
            btn.disabled = false;
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
        return String(text).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }
}

// Global instance
const modelsPage = new ModelsPage();
window.modelsPage = modelsPage;
