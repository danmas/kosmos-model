// models.js - Скрипт для страницы доступных моделей

class ModelsPage {
    constructor() {
        this.models = [];
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
        } catch (error) {
            this.showError('Ошибка при загрузке моделей: ' + error.message);
            this.hideLoading();
        }
    }

    async loadModels() {
        console.log('Загружаем модели...');
        
        try {
            const response = await fetch('/api/all-models');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Полученные модели:', data);
            
            this.models = data || [];
            this.filteredModels = [...this.models];
            
            console.log(`Загружено ${this.models.length} моделей`);
        } catch (error) {
            console.error('Ошибка при загрузке моделей:', error);
            throw error;
        }
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterModels(e.target.value);
            });
        }
    }

    filterModels(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        
        if (!term) {
            this.filteredModels = [...this.models];
        } else {
            this.filteredModels = this.models.filter(model => 
                model.name.toLowerCase().includes(term) ||
                (model.visible_name && model.visible_name.toLowerCase().includes(term)) ||
                (model.provider && model.provider.toLowerCase().includes(term))
            );
        }
        
        this.renderModels();
        this.renderStats();
    }

    renderStats() {
        const statsSection = document.getElementById('statsSection');
        if (!statsSection) return;

        const groqModels = this.filteredModels.filter(m => m.provider === 'groq');
        const openrouterModels = this.filteredModels.filter(m => m.provider === 'openroute');
        const fastModels = this.filteredModels.filter(m => m.fast);

        statsSection.innerHTML = `
            <div class="stat-card">
                <div class="stat-number">${this.filteredModels.length}</div>
                <div class="stat-label">Всего моделей</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="color: #ff6b35;">${groqModels.length}</div>
                <div class="stat-label">GROQ модели</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="color: #28a745;">${openrouterModels.length}</div>
                <div class="stat-label">OpenRouter модели</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="color: #17a2b8;">${fastModels.length}</div>
                <div class="stat-label">Быстрые модели</div>
            </div>
        `;
    }

    renderModels() {
        const container = document.getElementById('modelsContainer');
        if (!container) return;

        // Группируем модели по провайдерам
        const groqModels = this.filteredModels.filter(m => m.provider === 'groq');
        const openrouterModels = this.filteredModels.filter(m => m.provider === 'openroute');

        container.innerHTML = '';

        // Рендерим GROQ модели
        if (groqModels.length > 0) {
            container.appendChild(this.createProviderSection('groq', groqModels));
        }

        // Рендерим OpenRouter модели
        if (openrouterModels.length > 0) {
            container.appendChild(this.createProviderSection('openrouter', openrouterModels));
        }

        // Если нет моделей после фильтрации
        if (this.filteredModels.length === 0) {
            container.innerHTML = `
                <div class="no-results" style="text-align: center; padding: 50px; color: #666;">
                    <i class="fas fa-search" style="font-size: 3em; margin-bottom: 20px; opacity: 0.5;"></i>
                    <h3>Модели не найдены</h3>
                    <p>Попробуйте изменить поисковый запрос</p>
                </div>
            `;
        }
    }

    createProviderSection(provider, models) {
        const section = document.createElement('div');
        section.className = 'provider-section';

        const providerInfo = this.getProviderInfo(provider);
        
        section.innerHTML = `
            <div class="provider-header ${provider}">
                <i class="${providerInfo.icon} provider-icon"></i>
                <h2 class="provider-title">${providerInfo.name}</h2>
                <div class="provider-stats">${models.length} ${this.getModelsWord(models.length)}</div>
            </div>
            <div class="models-grid">
                ${models.map(model => this.createModelCard(model)).join('')}
            </div>
        `;

        return section;
    }

    getProviderInfo(provider) {
        const providers = {
            'groq': {
                name: '🚀 GROQ API',
                icon: 'fas fa-rocket',
                description: 'Сверхбыстрые модели с высокой производительностью'
            },
            'openrouter': {
                name: '🌐 OpenRouter API', 
                icon: 'fas fa-globe',
                description: 'Широкий выбор моделей от различных провайдеров'
            }
        };
        
        return providers[provider] || { name: provider, icon: 'fas fa-brain' };
    }

    getModelsWord(count) {
        if (count === 1) return 'модель';
        if (count >= 2 && count <= 4) return 'модели';
        return 'моделей';
    }

    createModelCard(model) {
        const providerClass = model.provider || 'unknown';
        
        return `
            <div class="model-card ${providerClass}">
                <div class="model-provider ${providerClass}">
                    ${model.provider === 'groq' ? 'GROQ' : 'OpenRouter'}
                </div>
                
                <div class="model-header">
                    <div>
                        <h3 class="model-name">${this.escapeHtml(model.name)}</h3>
                        ${model.visible_name ? `<p class="model-visible-name">${this.escapeHtml(model.visible_name)}</p>` : ''}
                    </div>
                </div>

                <div class="model-details">
                    ${model.context ? `
                        <div class="model-detail">
                            <span class="detail-label">Контекст:</span>
                            <span class="context-badge">${this.formatContext(model.context)}</span>
                        </div>
                    ` : ''}
                    
                    ${model.fast ? `
                        <div class="model-detail">
                            <span class="detail-label">Производительность:</span>
                            <span class="fast-badge">⚡ Быстрая</span>
                        </div>
                    ` : ''}
                    
                    <div class="model-detail">
                        <span class="detail-label">Показывать в API:</span>
                        <span class="detail-value">${model.showInApi ? '✅ Да' : '❌ Нет'}</span>
                    </div>
                    
                    <div class="model-detail">
                        <span class="detail-label">Использовать в UI:</span>
                        <span class="detail-value">${model.use_in_ui ? '✅ Да' : '❌ Нет'}</span>
                    </div>
                </div>

                <div class="copy-section">
                    <input type="text" class="copy-input" value="${this.escapeHtml(model.name)}" readonly>
                    <button class="copy-button" onclick="modelsPage.copyModelName('${this.escapeHtml(model.name)}', this)">
                        <i class="fas fa-copy"></i>
                        Скопировать название
                    </button>
                </div>
            </div>
        `;
    }

    formatContext(context) {
        if (context >= 1000) {
            return `${Math.round(context / 1000)}K токенов`;
        }
        return `${context} токенов`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async copyModelName(modelName, buttonElement) {
        try {
            await navigator.clipboard.writeText(modelName);
            
            // Визуальная обратная связь
            const originalText = buttonElement.innerHTML;
            buttonElement.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
            buttonElement.classList.add('copied');
            
            setTimeout(() => {
                buttonElement.innerHTML = originalText;
                buttonElement.classList.remove('copied');
            }, 2000);
            
            console.log(`Скопировано: ${modelName}`);
            
        } catch (error) {
            console.error('Ошибка копирования:', error);
            
            // Fallback для старых браузеров
            const input = buttonElement.parentElement.querySelector('.copy-input');
            input.select();
            document.execCommand('copy');
            
            buttonElement.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
            buttonElement.classList.add('copied');
            
            setTimeout(() => {
                buttonElement.innerHTML = '<i class="fas fa-copy"></i> Скопировать название';
                buttonElement.classList.remove('copied');
            }, 2000);
        }
    }

    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        if (errorElement) {
            errorElement.style.display = 'block';
            errorElement.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Ошибка:</strong> ${message}
            `;
        }
    }

    hideLoading() {
        const loadingElement = document.getElementById('loadingIndicator');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }
}

// Глобальная переменная для доступа к методам из HTML
let modelsPage;

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализируем страницу моделей...');
    modelsPage = new ModelsPage();
});

// Экспорт для возможного использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModelsPage;
}
