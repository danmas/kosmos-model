class AITestApp {
  constructor() {
    this.prompts = [];
    this.activePrompt = null;

    // Существующие свойства
    //this.model = 'google/gemini-2.0-flash-exp:free';
    this.model = 'google/gemma-3-27b-it:free';
    this.apiKey = null;
    this.abortController = null;
    this.activeModal = null;

    // Добавляем маппинг модальных окон
    this.modalMapping = {
      'inputModal': 'inputText',
      'promptModal': 'prompt',
      'responseModal': 'response'
    };

    // Добавляем свойства для RAG
    this.useRag = false;
    this.contextCodes = [];
    this.selectedContextCode = null;
    this.ragEnabled = false;

    // Добавляем свойства для моделей по умолчанию
    this.defaultModels = null;
    this.selectedModelType = null; // cheap, fast, rich или null для ручного выбора

    this.init();
  }


  async init() {
    try {
      const response = await fetch('/api/config');
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.status}`);
      }

      const config = await response.json();
      console.log('Received config from server:', config);
      
      if (!config.apiKey) {
        throw new Error('API key is missing in config');
      }
      this.apiKey = config.apiKey;
      
      // Проверяем доступность RAG
      console.log('Checking RAG availability:', config.langchainPg);
      if (config.langchainPg && config.langchainPg.enabled) {
        console.log('RAG is enabled in config');
        this.ragEnabled = true;
        // Загружаем контекстные коды
        try {
          console.log('Trying to load context codes...');
          this.contextCodes = await window.ragService.getContextCodes();
          console.log('Loaded context codes:', this.contextCodes);
        } catch (error) {
          console.error('Failed to load context codes:', error);
          this.contextCodes = [];
        }
      } else {
        console.log('RAG is disabled or not configured');
      }
      
      await this.loadPrompts();
      await this.loadDefaultModels(); // Загружаем модели по умолчанию
      console.log('RAG enabled status before render:', this.ragEnabled);
      this.render();
      this.attachEventListeners();
      await this.loadModels(); 
      
      this.populateProviderSelect();
      
      // Проверяем сохраненную модель и устанавливаем провайдера
      const savedModelName = localStorage.getItem('selectedModel');
      let initialProvider = '';
      
      if (savedModelName && this.modelsList) {
        const savedModel = this.modelsList.find(m => m.name === savedModelName);
        if (savedModel) {
          initialProvider = savedModel.provider;
          const providerSelect = document.getElementById('providerSelect');
          if (providerSelect) {
            providerSelect.value = initialProvider;
          }
        }
      }
      
      this.populateModelSelect(initialProvider);

      this.loadSavedState();

      // Деактивируем кнопку сохранения при запуске (до получения ответа)
      const saveResponseButton = document.getElementById('saveResponseButton');
      if (saveResponseButton) {
        saveResponseButton.disabled = true;
      }

    } catch (error) {
      console.error('Initialization failed:', error);
      document.getElementById('error').style.display = 'block';
      document.getElementById('error').textContent = `Initialization failed: ${error.message}`;
      document.getElementById('loading').style.display = 'none';
    }
  }


  async loadModels() {
    try {
      const [allRes, defaultsRes] = await Promise.all([
        fetch('/api/all-models'),
        fetch('/api/default-models')
      ]);

      if (!allRes.ok || !defaultsRes.ok) throw new Error('Network error');

      const allModels = await allRes.json();
      const defaultModels = await defaultsRes.json();

      // Сохраняем данные для populateModelSelect()
      this.modelsList = allModels;
      this.defaultModelsData = defaultModels;
      
      this.setupAssignTypeListener(allModels);
    } catch (err) {
      console.error('Ошибка загрузки моделей:', err);
      this.showError('Не удалось загрузить модели');
      this.modelsList = [];
      this.defaultModelsData = {};
    }
  }
  
  // Заполнение селекта моделей (вызывается после render())
  populateModelSelect(provider = '') {
    const select = document.getElementById('modelSelect');
    if (!select || !this.modelsList) {
      return;
    }

    const savedModel = localStorage.getItem('selectedModel');
    select.innerHTML = ''; // Очищаем

    const filteredModels = provider 
      ? this.modelsList.filter(model => model.provider === provider)
      : this.modelsList;

    if (filteredModels.length === 0) {
      select.innerHTML = '<option value="">-- Нет моделей для этого провайдера --</option>';
      return;
    }
    
    select.innerHTML = '<option value="">-- Выбрать модель --</option>';

    // Добавляем все модели
    filteredModels.forEach(model => {
      const opt = document.createElement('option');
      opt.value = model.name;
      let textContent = model.visible_name || model.name;

      if (model.provider === 'groq') {
        textContent = `[groq] ${textContent}`;
      }

      if (model.is_default) {
        const emoji = model.cost_level === 'cheap' ? '💸' : model.cost_level === 'fast' ? '⚡' : '💎';
        textContent = `${emoji} ${textContent} ← ${model.cost_level.toUpperCase()}`;
      }

      opt.textContent = textContent;
      opt.dataset.provider = model.provider;
      opt.dataset.id = model.id;

      select.appendChild(opt);
    });

    if (savedModel && filteredModels.some(m => m.name === savedModel)) {
      select.value = savedModel;
      this.model = savedModel;
    } else if (filteredModels.length > 0) {
      // select.value = '';
      // this.model = '';
    }
  }

  populateProviderSelect() {
    const select = document.getElementById('providerSelect');
    if (!select || !this.modelsList) {
      return;
    }

    const providers = [...new Set(this.modelsList.map(model => model.provider))];
    
    select.innerHTML = '<option value="">-- Все провайдеры --</option>';
    providers.forEach(provider => {
      const opt = document.createElement('option');
      opt.value = provider;
      opt.textContent = provider.charAt(0).toUpperCase() + provider.slice(1);
      select.appendChild(opt);
    });
  }

  async loadDefaultModels() {
    try {
      const response = await fetch('/api/default-models');
      if (!response.ok) {
        throw new Error('Failed to load default models');
      }
      const data = await response.json();
      // Новый формат: { cheap: {...}, fast: {...}, rich: {...} }
      // Старый формат: { defaultModels: { cheap: {...}, ... } }
      if (data.defaultModels) {
        this.defaultModels = data.defaultModels;
      } else {
        // Новый формат - преобразуем в старый для совместимости
        this.defaultModels = {
          cheap: data.cheap ? {
            model: data.cheap.name,
            provider: data.cheap.provider,
            description: data.cheap.visible_name || data.cheap.name
          } : null,
          fast: data.fast ? {
            model: data.fast.name,
            provider: data.fast.provider,
            description: data.fast.visible_name || data.fast.name
          } : null,
          rich: data.rich ? {
            model: data.rich.name,
            provider: data.rich.provider,
            description: data.rich.visible_name || data.rich.name
          } : null
        };
      }
      console.log('Loaded default models:', this.defaultModels);
    } catch (error) {
      console.error('Failed to load default models:', error);
      this.defaultModels = null;
    }
  }

  async loadPrompts() {
    try {
      const response = await fetch('/api/prompts');
      if (!response.ok) {
        throw new Error('Failed to load prompts');
      }
      this.prompts = await response.json();

      // Update the select element with new prompts
      const promptSelect = document.getElementById('promptSelect');
      if (promptSelect) {
        promptSelect.innerHTML = `
          <option value="">-- Select Prompt --</option>
          ${this.prompts.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
        `;
      }
    } catch (error) {
      console.error('Failed to load prompts:', error);
    }
  }


  // Обновление метода render()
  render() {
    document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="card">
        <div class="app-header">
          <h2>AI Analytics Interface</h2>
          <div class="nav-links">
            <a href="/models.html" class="nav-link" target="_blank">
              <i class="fas fa-brain"></i> Доступные модели
            </a>
            <a href="/history.html" class="nav-link" target="_blank">
              <i class="fas fa-history"></i> История запросов
            </a>
          </div>
        </div>
        
        <div class="form-group">
          <label>Тип модели / Модель:</label>
          <div class="model-selector-row" style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap;">
            <select id="providerSelect" style="flex: 1; min-width: 150px; padding: 8px; border-radius: 4px; background: #333; color: white; border: 1px solid #555;">
              <option value="">-- Все провайдеры --</option>
            </select>
            
            <select id="modelSelect" style="flex: 2; min-width: 300px; padding: 8px; border-radius: 4px; background: #333; color: white; border: 1px solid #555;">
              <option value="">-- Сначала выберите провайдера --</option>
            </select>

            <span style="font-size: 1.3em; color: #666;">→</span>

            <select id="assignTypeSelect" style="width: 160px; padding: 8px; border-radius: 4px; background: #2a2a2a; color: white; border: 1px solid #555; font-weight: bold;">
              <option value="">— Не назначать —</option>
              <option value="cheap" style="background: #4a2a5a; color: #fff;">💸 Сделать CHEAP</option>
              <option value="fast" style="background: #2a5a2a; color: #fff;">⚡ Сделать FAST</option>
              <option value="rich" style="background: #5a2a2a; color: #ffaa00;">💎 Сделать RICH</option>
            </select>
          </div>
        </div>

        ${this.ragEnabled ? `
        <div class="form-group rag-controls">
          <div class="rag-toggle">
            <label>
              <input type="checkbox" id="useRagCheckbox" ${this.useRag ? 'checked' : ''}>
              RAG
            </label>
         
          <div class="rag-options" id="ragOptions" style="${this.useRag ? 'display: flex;' : 'display: none;'}">
            <label for="contextCodeSelect">Контекст:</label>
            <select id="contextCodeSelect">
              <option value="">Все документы</option>
              ${this.contextCodes.map(code => `<option value="${code}" ${this.selectedContextCode === code ? 'selected' : ''}>${code}</option>`).join('')}
            </select>
          </div>
          </div>
        </div>
        ` : ''}

        <div class="form-group">
          <div class="input-with-button">
            <div class="prompt-controls">
              <label>Prompt:</label>
              <select id="promptSelect">
                <option value="">-- Select Prompt --</option>
                ${this.prompts.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
              </select>
              <button id="newPromptBtn">New</button>
              <button id="editPromptBtn">Edit</button>
              <button id="deletePromptBtn">Delete</button>
              <button class="expand-button" data-target="promptModal">⬚</button>
            </div>
          </div>
          <textarea id="prompt"></textarea>
        </div>

        <div class="form-group">
          <div class="input-with-button">
            <label>Input Text:</label>
            <button class="expand-button" data-target="inputModal">⬚</button>
          </div>
          <textarea id="inputText"></textarea>
        </div>

        <div class="form-group file-upload-group">
          <div class="input-with-button">
            <label>Upload File:</label>
            <button id="clearFileBtn" class="small-button">Clear</button>
          </div>
          <div class="file-upload-container">
            <input type="file" id="fileInput" accept=".txt,.sq,.md,.js,.py,.json,.html,.css,.csv">
            <div class="file-info" id="fileInfo">No file selected</div>
          </div>
        </div>

<!-- div class="button-group">
  <button id="sendButton">Send Request (Client)</button>
  <button id="sendServerButton">Send Request (Server)</button>
  <button id="cancelButton" style="display: none;">Cancel</button>
  <button id="saveResponseButton">Save Response</button>
  <button id="viewHistoryButton">View History</button>
</div -->

<div class="button-group">
  <button id="useFileContentBtn" class="use-file-button-main">Use File Content</button>
  <button id="sendButton">Send (Client)</button>
  <button id="sendServerButton">Send (Server)</button>
  <button id="sendServerSysButton">Send (Using Prompt)</button>
  <button id="cancelButton" style="display: none;">Cancel</button>
  <button id="saveResponseButton">Save Response</button>
  <button id="viewHistoryButton">View History</button>
  <button id="debugRagButton" class="debug-button">Debug RAG</button>
</div>

        <div class="form-group">
          <div class="input-with-button">
            <label>Response:</label>
            <button class="expand-button" data-target="responseModal">⬚</button>
          </div>
          <textarea id="response" readonly></textarea>
        </div>

        <!-- Input Modal -->
        <div id="inputModal" class="modal">
          <div class="modal-content resizable">
            <div class="modal-header">
              <h3>Edit Input Text</h3>
              <button class="modal-close">&times;</button>
            </div>
            <textarea class="modal-textarea" id="inputModalText"></textarea>
            <div class="modal-footer">
              <button class="modal-save">Save</button>
              <button class="modal-cancel">Cancel</button>
            </div>
            <div class="resize-handle"></div>
          </div>
        </div>

        <!-- Response Modal -->
<!-- Response Modal с поддержкой Markdown -->
<div id="responseModal" class="modal">
  <div class="modal-content resizable">
    <div class="modal-header">
      <h3>View Response</h3>
      <div class="tab-buttons">
        <button class="tab-button active" data-tab="text">Plain Text</button>
        <button class="tab-button" data-tab="markdown">Markdown</button>
      </div>
      <button class="modal-close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="tab-content active" id="textTab">
        <textarea class="modal-textarea" id="responseModalText" readonly></textarea>
      </div>
      <div class="tab-content" id="markdownTab">
        <div class="markdown-preview" id="responseMarkdownPreview"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button id="saveAsMarkdownBtn" class="modal-save">Save as markdown</button>
      <button class="modal-close">Close</button>
    </div>
    <div class="resize-handle"></div>
  </div>
</div>

        <!-- Prompt Modal -->
        <div id="promptModal" class="modal">
          <div class="modal-content resizable">
            <div class="modal-header">
              <h3>Edit Prompt</h3>
              <button class="modal-close">&times;</button>
            </div>
            <textarea class="modal-textarea" id="promptModalText"></textarea>
            <div class="modal-footer">
              <button class="modal-save">Save</button>
              <button class="modal-cancel">Cancel</button>
            </div>
            <div class="resize-handle"></div>
          </div>
        </div>

        <!-- New Prompt Modal -->
        <div id="newPromptModal" class="modal">
          <div class="modal-content resizable">
            <div class="modal-header">
              <h3>New Prompt</h3>
              <button class="modal-close">&times;</button>
            </div>
            <div class="form-group">
              <label>Name:</label>
              <input type="text" id="newPromptName" class="modal-input">
            </div>
            <textarea class="modal-textarea" id="newPromptText"></textarea>
            <div class="modal-footer">
              <button class="modal-save">Save</button>
              <button class="modal-cancel">Cancel</button>
            </div>
            <div class="resize-handle"></div>
          </div>
        </div>

        <!-- History Modal -->
        <div id="historyModal" class="modal">
          <div class="modal-content resizable" style="width: 90%; height: 80%;">
            <div class="modal-header">
              <h3>Response History</h3>
              <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body history-modal-body">
              <div class="history-filters">
                <div class="filter-row">
                  <div class="filter-group">
                    <label>Model:</label>
                    <input type="text" id="historyFilterModel" class="filter-input">
                  </div>
                  <div class="filter-group">
                    <label>Prompt:</label>
                    <input type="text" id="historyFilterPrompt" class="filter-input">
                  </div>
                  <div class="filter-group">
                    <label>Date From:</label>
                    <input type="date" id="historyFilterDateFrom" class="filter-input">
                  </div>
                  <div class="filter-group">
                    <label>Date To:</label>
                    <input type="date" id="historyFilterDateTo" class="filter-input">
                  </div>
                </div>
                <div class="filter-row">
                  <div class="filter-group">
                    <label>Sort By:</label>
                    <select id="historySortBy" class="filter-input">
                      <option value="date">Date</option>
                      <option value="model">Model</option>
                      <option value="promptName">Prompt</option>
                    </select>
                  </div>
                  <div class="filter-group">
                    <label>Order:</label>
                    <select id="historySortOrder" class="filter-input">
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </div>
                  <div class="filter-group">
                    <button id="historyFilterApply" class="filter-button">Apply Filters</button>
                    <button id="historyFilterReset" class="filter-button">Reset</button>
                  </div>
                </div>
              </div>
              
              <div class="history-table-container">
                <table class="history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Model</th>
                      <th>Prompt</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="historyTableBody">
                    <!-- Results will be populated here -->
                  </tbody>
                </table>
              </div>
            </div>
            <div class="modal-footer">
              <button class="modal-close">Close</button>
            </div>
            <div class="resize-handle"></div>
          </div>
        </div>

        <!-- Response Details Modal -->
        <div id="responseDetailsModal" class="modal">
          <div class="modal-content resizable">
            <div class="modal-header">
              <h3>Response Details</h3>
              <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
              <div class="details-section">
                <h4>Timestamp</h4>
                <div id="detailsTimestamp" class="details-content"></div>
              </div>
              <div class="details-section">
                <h4>Model</h4>
                <div id="detailsModel" class="details-content"></div>
              </div>
              <div class="details-section">
                <h4>Prompt</h4>
                <div id="detailsPrompt" class="details-content">
                  <div><strong>Name:</strong> <span id="detailsPromptName"></span></div>
                  <div><strong>Text:</strong> <pre id="detailsPromptText"></pre></div>
                </div>
              </div>
              <div class="details-section">
                <h4>Input Text</h4>
                <pre id="detailsInputText" class="details-content"></pre>
              </div>
              <div class="details-section">
                <h4>Response</h4>
                <pre id="detailsResponse" class="details-content"></pre>
              </div>

<!-- Обновленная секция ответа в модальном окне деталей -->
<div class="details-section">
  <h4>Response</h4>
  <div class="tab-buttons">
    <button class="tab-button details-tab-button active" data-tab="detailsText">Plain Text</button>
    <button class="tab-button details-tab-button" data-tab="detailsMarkdown">Markdown</button>
  </div>
  <div class="tab-content active" id="detailsTextTab">
    <pre id="detailsResponse" class="details-content"></pre>
  </div>
  <div class="tab-content" id="detailsMarkdownTab">
    <div class="markdown-preview" id="detailsMarkdownPreview"></div>
  </div>
</div>

            </div>
            <div class="modal-footer">
              <button class="modal-close">Close</button>
              <button id="detailsReload">Reload This Request</button>
              <button id="detailsDelete">Delete</button>
            </div>
            <div class="resize-handle"></div>
          </div>
        </div>

        <!-- Debug RAG Modal -->
        <div id="debugRagModal" class="modal">
          <div class="modal-content resizable">
            <div class="modal-header">
              <h3>RAG Debug Information</h3>
              <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
              <div class="debug-section">
                <h4>RAG Status</h4>
                <pre id="ragStatusDebug" class="debug-content"></pre>
              </div>
              <div class="debug-section">
                <h4>Final Input Text (with RAG context)</h4>
                <pre id="finalInputTextDebug" class="debug-content"></pre>
              </div>
              <div class="debug-section">
                <h4>RAG Info</h4>
                <pre id="ragInfoDebug" class="debug-content"></pre>
              </div>
            </div>
            <div class="modal-footer">
              <button class="modal-close">Close</button>
            </div>
            <div class="resize-handle"></div>
          </div>
        </div>

        <!-- Модальное окно для сохранения файла -->
        <div id="saveFileModal" class="modal">
          <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
              <h3>Сохранить как markdown</h3>
              <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="padding: 15px;">
              <div class="form-group">
                <label for="saveFilename">Имя файла:</label>
                <input type="text" id="saveFilename" class="modal-input" placeholder="Введите имя файла">
              </div>
              <div class="form-group">
                <label for="saveDirectory">Директория (оставьте пустым для использования по умолчанию):</label>
                <input type="text" id="saveDirectory" class="modal-input" placeholder="Путь к директории (необязательно)">
              </div>
            </div>
            <div class="modal-footer">
              <button id="confirmSaveFileBtn" class="modal-save">Сохранить</button>
              <button class="modal-cancel">Отмена</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

    // Делаем все модальные окна изменяемыми по размеру
    this.initializeResizableModals();
    this.initializeDraggableModals();
  }

  // Обновление метода attachEventListeners()
  attachEventListeners() {
    // Существующие обработчики
    const sendButton = document.getElementById('sendButton');
    const cancelButton = document.getElementById('cancelButton');
    const modelSelect = document.getElementById('modelSelect');
    const inputText = document.getElementById('inputText');
    const prompt = document.getElementById('prompt');
    const promptSelect = document.getElementById('promptSelect');
    const newPromptBtn = document.getElementById('newPromptBtn');
    const editPromptBtn = document.getElementById('editPromptBtn');
    const deletePromptBtn = document.getElementById('deletePromptBtn');
    const debugRagButton = document.getElementById('debugRagButton');

    const providerSelect = document.getElementById('providerSelect');
    if (providerSelect) {
      providerSelect.addEventListener('change', (e) => {
        this.populateModelSelect(e.target.value);
      });
    }

    // Обработчик для селектора модели
    if (modelSelect) {
      modelSelect.addEventListener('change', (e) => {
        const selectedModel = e.target.value;
        this.model = selectedModel;
        localStorage.setItem('selectedModel', selectedModel);
        
        console.log('Выбрана модель:', selectedModel);
        this.saveState();
      });
    }
    
    // Элементы для работы с файлами
    const fileInput = document.getElementById('fileInput');
    const clearFileBtn = document.getElementById('clearFileBtn');
    const fileInfo = document.getElementById('fileInfo');
    const useFileContentBtn = document.getElementById('useFileContentBtn');

    if (promptSelect) {
      promptSelect.addEventListener('change', (e) => this.handlePromptSelect(e));
    }

    if (newPromptBtn) {
      newPromptBtn.addEventListener('click', () => this.openNewPromptModal());
    }

    if (editPromptBtn) {
      editPromptBtn.addEventListener('click', () => this.handleEditPrompt());
    }

    if (deletePromptBtn) {
      deletePromptBtn.addEventListener('click', () => this.handleDeletePrompt());
    }

    if (debugRagButton) {
      debugRagButton.addEventListener('click', () => this.openRagDebugModal());
    }

    // Обработчики для работы с файлами
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          fileInfo.textContent = `Selected file: ${file.name} (${this.formatFileSize(file.size)})`;
          useFileContentBtn.disabled = false;
        } else {
          fileInfo.textContent = 'No file selected';
          useFileContentBtn.disabled = true;
        }
      });
    }

    if (clearFileBtn) {
      clearFileBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileInfo.textContent = 'No file selected';
        useFileContentBtn.disabled = true;
      });
    }

    if (useFileContentBtn) {
      // Убираем стрелочную функцию и используем привязку this для сохранения контекста
      useFileContentBtn.addEventListener('click', this.handleFileContent.bind(this));
      useFileContentBtn.disabled = !fileInput || !fileInput.files[0];
    }

    // Добавляем обработчики для кнопок истории запросов
    this.initializeHistory();

    // Add event listener for new prompt modal
    const newPromptModal = document.getElementById('newPromptModal');
    if (newPromptModal) {
      const saveButton = newPromptModal.querySelector('.modal-save');
      const closeButton = newPromptModal.querySelector('.modal-close');
      const cancelButton = newPromptModal.querySelector('.modal-cancel');

      if (saveButton) {
        saveButton.addEventListener('click', () => this.saveNewPrompt());
      }
      if (closeButton) {
        closeButton.addEventListener('click', () => this.closeActiveModal());
      }
      if (cancelButton) {
        cancelButton.addEventListener('click', () => this.closeActiveModal());
      }
    }

    if (!sendButton || !cancelButton || !modelSelect) {
      console.error('Required DOM elements not found');
      return;
    }

    // Добавляем обработчик для кнопки отправки запроса через сервер с выбором промпта
    const sendServerSysButton = document.getElementById('sendServerSysButton');
    if (sendServerSysButton) {
      sendServerSysButton.addEventListener('click', () => this.handleServerSysSubmit());
    }

    // Добавляем обработчик для кнопки отправки запроса через сервер
    const sendServerButton = document.getElementById('sendServerButton');
    if (sendServerButton) {
      sendServerButton.addEventListener('click', () => this.handleServerSubmit());
    }

    sendButton.addEventListener('click', () => this.handleSubmit());
    cancelButton.addEventListener('click', () => this.handleCancel());

    // Обработчики для модальных окон
    const expandButtons = document.querySelectorAll('.expand-button');
    expandButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const modalId = e.target.dataset.target;
        this.openModal(modalId);
      });
    });

    // Закрытие модальных окон
    const closeButtons = document.querySelectorAll('.modal-close');
    closeButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.closeActiveModal();
      });
    });

    // Сохранение изменений в модальных окнах
    const saveButtons = document.querySelectorAll('.modal-save');
    saveButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.saveModalChanges();
      });
    });

    // Отмена изменений в модальных окнах
    const cancelButtons = document.querySelectorAll('.modal-cancel');
    cancelButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.closeActiveModal();
      });
    });

    // Закрытие по клику вне модального окна
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.closeActiveModal();
      }
    });

    if (inputText) {
      inputText.addEventListener('input', () => this.saveState());
    }

    if (prompt) {
      prompt.addEventListener('input', () => this.saveState());
    }

    // Инициализация вкладок для Markdown
    this.initializeTabs();

    // Обработчики событий для RAG
    if (this.ragEnabled) {
      const useRagCheckbox = document.getElementById('useRagCheckbox');
      const ragOptions = document.getElementById('ragOptions');
      const contextCodeSelect = document.getElementById('contextCodeSelect');

      if (useRagCheckbox) {
        useRagCheckbox.addEventListener('change', (e) => {
          this.useRag = e.target.checked;
          ragOptions.style.display = this.useRag ? 'flex' : 'none';
          this.saveState();
        });
      }

      if (contextCodeSelect) {
        contextCodeSelect.addEventListener('change', (e) => {
          this.selectedContextCode = e.target.value || null;
          this.saveState();
        });
      }
    }
    
    // Добавляем обработчик для кнопки Save as markdown
    const saveAsMarkdownBtn = document.getElementById('saveAsMarkdownBtn');
    if (saveAsMarkdownBtn) {
      saveAsMarkdownBtn.addEventListener('click', () => this.saveAsMarkdown());
    }
  }


  initializeResizableModals() {
    const modals = document.querySelectorAll('.modal-content');

    modals.forEach(modal => {
      // Проверяем, есть ли уже хэндл для изменения размера
      let handle = modal.querySelector('.resize-handle');
      if (!handle) {
        handle = document.createElement('div');
        handle.className = 'resize-handle';
        modal.appendChild(handle);
      }

      let isResizing = false;
      let originalWidth;
      let originalHeight;
      let originalX;
      let originalY;

      handle.addEventListener('mousedown', startResize);

      function startResize(e) {
        e.preventDefault();
        isResizing = true;
        originalWidth = modal.offsetWidth;
        originalHeight = modal.offsetHeight;
        originalX = e.clientX;
        originalY = e.clientY;

        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);
      }

      function resize(e) {
        if (!isResizing) return;

        const width = Math.max(300, originalWidth + (e.clientX - originalX));
        const height = Math.max(200, originalHeight + (e.clientY - originalY));

        modal.style.width = `${width}px`;
        modal.style.height = `${height}px`;

        // Принудительно обновляем размер текстового поля, чтобы оно заполняло доступное пространство
        const textarea = modal.querySelector('.modal-textarea');
        if (textarea) {
          // Размер текстового поля рассчитывается автоматически благодаря flex
          textarea.style.height = 'auto';
        }
      }

      function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
      }
    });
  }


  initializeDraggableModals() {
    const modals = document.querySelectorAll('.modal-content');

    modals.forEach(modal => {
      const header = modal.querySelector('.modal-header');

      let isDragging = false;
      let currentX;
      let currentY;
      let initialX;
      let initialY;
      let xOffset = 0;
      let yOffset = 0;

      header.addEventListener('mousedown', startDragging);

      function startDragging(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === header) {
          isDragging = true;
        }
      }

      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', stopDragging);

      function drag(e) {
        if (isDragging) {
          e.preventDefault();

          currentX = e.clientX - initialX;
          currentY = e.clientY - initialY;

          xOffset = currentX;
          yOffset = currentY;

          setTranslate(currentX, currentY, modal);
        }
      }

      function stopDragging() {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
      }

      function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate(${xPos}px, ${yPos}px)`;
      }
    });
  }


  async handlePromptSelect(e) {
    const selectedName = e.target.value;
    const prompt = this.prompts.find(p => p.name === selectedName);
    if (prompt) {
      document.getElementById('prompt').value = prompt.text;
      this.activePrompt = prompt;
    }
  }


  async handleDeletePrompt() {
    if (!this.activePrompt) {
      this.showError('Please select a prompt to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete prompt "${this.activePrompt.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/prompts/${this.activePrompt.name}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete prompt');
      }

      await this.loadPrompts();
      document.getElementById('prompt').value = '';
      this.activePrompt = null;
      this.showError('Prompt deleted successfully');
    } catch (error) {
      this.showError(error.message);
    }
  }



  openNewPromptModal() {
    const modal = document.getElementById('newPromptModal');
    modal.style.display = 'block';
    this.activeModal = modal;
  }


  async handleEditPrompt() {
    if (!this.activePrompt) {
      this.showError('Please select a prompt to edit');
      return;
    }

    // Открываем модальное окно редактирования промпта
    const modal = document.getElementById('promptModal');
    const modalTextarea = modal.querySelector('.modal-textarea');

    // Заполняем текстовое поле текущим текстом промпта
    modalTextarea.value = document.getElementById('prompt').value;

    // Отображаем модальное окно
    modal.style.display = 'block';
    this.activeModal = modal;
  }


  async handleDeletePrompt() {
    if (!this.activePrompt) {
      this.showError('Please select a prompt to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete prompt "${this.activePrompt.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/prompts/${this.activePrompt.name}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete prompt');
      }

      await this.loadPrompts();
      document.getElementById('prompt').value = '';
      this.activePrompt = null;
      this.showError('Prompt deleted successfully');
    } catch (error) {
      this.showError(error.message);
    }
  }

  async saveNewPrompt() {
    const nameInput = document.getElementById('newPromptName');
    const textInput = document.getElementById('newPromptText');

    const name = nameInput.value.trim();
    const text = textInput.value.trim();

    if (!name || !text) {
      this.showError('Name and text are required');
      return;
    }

    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, text })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save prompt');
      }

      // Clear the inputs
      nameInput.value = '';
      textInput.value = '';

      // Reload prompts and update UI
      await this.loadPrompts();
      this.closeActiveModal();

      // Update the main prompt area
      document.getElementById('promptSelect').value = name;
      document.getElementById('prompt').value = text;

      // Store as active prompt
      this.activePrompt = { name, text };

      this.showError('Prompt saved successfully');
    } catch (error) {
      this.showError(error.message);
    }
  }


  closeActiveModal() {
    if (this.activeModal) {
      this.activeModal.style.display = 'none';
      this.activeModal = null;
    }
  }


  async saveModalChanges() {
    if (!this.activeModal) return;

    const modalTextarea = this.activeModal.querySelector('.modal-textarea');
    const sourceId = this.modalMapping[this.activeModal.id] || this.activeModal.id.replace('Modal', '');
    const sourceElement = document.getElementById(sourceId);

    if (modalTextarea && sourceElement && !sourceElement.readOnly) {
      const newText = modalTextarea.value;
      sourceElement.value = newText;

      // Если мы сохраняем из модального окна промпта и у нас есть активный промпт, обновляем его на сервере
      if (this.activeModal.id === 'promptModal' && this.activePrompt) {
        try {
          const response = await fetch(`/api/prompts/${this.activePrompt.name}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: newText })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update prompt');
          }

          // Обновляем текст активного промпта
          this.activePrompt.text = newText;

          // Перезагружаем промпты для синхронизации
          await this.loadPrompts();

          this.showError('Prompt updated successfully');
        } catch (error) {
          this.showError(error.message);
          // Восстанавливаем текст, если сохранение не удалось
          sourceElement.value = this.activePrompt.text;
          return;
        }
      }

      this.saveState();
    }

    this.closeActiveModal();
  }


  loadSavedState() {
    try {
      const savedState = localStorage.getItem('aiTestAppState');
      if (savedState) {
        const state = JSON.parse(savedState);
        if (state.model) this.model = state.model;
        if (state.prompt) document.getElementById('prompt').value = state.prompt;
        if (state.inputText) document.getElementById('inputText').value = state.inputText;
        if (state.activePrompt) this.activePrompt = state.activePrompt;
        
        // Загружаем выбранный тип модели
        if (state.selectedModelType !== undefined) {
          this.selectedModelType = state.selectedModelType;
        }
        
        // Загружаем настройки RAG
        if (this.ragEnabled) {
          if (state.useRag !== undefined) this.useRag = state.useRag;
          if (state.selectedContextCode !== undefined) this.selectedContextCode = state.selectedContextCode;
          
          // Обновляем UI в соответствии с загруженными настройками
          const useRagCheckbox = document.getElementById('useRagCheckbox');
          const ragOptions = document.getElementById('ragOptions');
          const contextCodeSelect = document.getElementById('contextCodeSelect');
          
          if (useRagCheckbox) useRagCheckbox.checked = this.useRag;
          if (ragOptions) ragOptions.style.display = this.useRag ? 'flex' : 'none';
          if (contextCodeSelect) {
            const option = Array.from(contextCodeSelect.options).find(opt => opt.value === this.selectedContextCode);
            if (option) contextCodeSelect.value = this.selectedContextCode;
          }
        }
        
        // Устанавливаем выбранную модель
        const modelSelect = document.getElementById('modelSelect');
        if (modelSelect) {
          const option = Array.from(modelSelect.options).find(opt => opt.value === this.model);
          if (option) modelSelect.value = this.model;
        }
        
        // Устанавливаем выбранный промпт
        if (this.activePrompt) {
          const promptSelect = document.getElementById('promptSelect');
          if (promptSelect) {
            const option = Array.from(promptSelect.options).find(opt => opt.value === this.activePrompt);
            if (option) promptSelect.value = this.activePrompt;
          }
        }
      }
    } catch (error) {
      console.error('Error loading saved state:', error);
    }
  }

  saveState() {
    try {
      const state = {
        model: this.model,
        prompt: document.getElementById('prompt').value,
        inputText: document.getElementById('inputText').value,
        activePrompt: this.activePrompt,
        // Сохраняем настройки RAG
        useRag: this.useRag,
        selectedContextCode: this.selectedContextCode,
        // Сохраняем выбранный тип модели
        selectedModelType: this.selectedModelType
      };
      localStorage.setItem('aiTestAppState', JSON.stringify(state));
    } catch (error) {
      console.error('Error saving state:', error);
    }
  }

  validateInputs() {
    const inputText = document.getElementById('inputText');
    const prompt = document.getElementById('prompt');

    if (!inputText || !prompt) return false;

    if (!inputText.value.trim()) {
      this.showError('Please enter input text');
      return false;
    }

    if (!prompt.value.trim()) {
      this.showError('Please enter a prompt');
      return false;
    }

    return true;
  }

  showError(message) {
    const responseArea = document.getElementById('response');
    if (responseArea) {
      responseArea.value = `Error: ${message}`;
      responseArea.style.color = '#ff6b6b';
    }
  }


  handleCancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.updateUIState(false);
    }
  }

  // updateUIState(isLoading) {
  //   const sendButton = document.getElementById('sendButton');
  //   const sendServerButton = document.getElementById('sendServerButton');
  //   const cancelButton = document.getElementById('cancelButton');
  //   const inputs = document.querySelectorAll('textarea, select');

  //   if (!sendButton || !cancelButton || !sendServerButton) return;

  //   if (isLoading) {
  //     sendButton.disabled = true;
  //     sendServerButton.disabled = true;
  //     cancelButton.style.display = 'inline';
  //     inputs.forEach(input => input.disabled = true);
  //   } else {
  //     sendButton.disabled = false;
  //     sendServerButton.disabled = false;
  //     cancelButton.style.display = 'none';
  //     inputs.forEach(input => input.disabled = false);
  //   }
  // }
  updateUIState(isLoading) {
    const sendButton = document.getElementById('sendButton');
    const sendServerButton = document.getElementById('sendServerButton');
    const sendServerSysButton = document.getElementById('sendServerSysButton');
    const cancelButton = document.getElementById('cancelButton');
    const inputs = document.querySelectorAll('textarea, select');
  
    if (!sendButton || !cancelButton || !sendServerButton || !sendServerSysButton) return;
  
    if (isLoading) {
      sendButton.disabled = true;
      sendServerButton.disabled = true;
      sendServerSysButton.disabled = true;
      cancelButton.style.display = 'inline';
      inputs.forEach(input => input.disabled = true);
    } else {
      sendButton.disabled = false;
      sendServerButton.disabled = false;
      sendServerSysButton.disabled = false;
      cancelButton.style.display = 'none';
      inputs.forEach(input => input.disabled = false);
    }
  }

  async handleServerSysSubmit() {
    if (!this.validateSysInputs()) {
      return;
    }

    const inputText = document.getElementById('inputText');
    const promptSelect = document.getElementById('promptSelect');
    const responseArea = document.getElementById('response');
    const saveResponseButton = document.getElementById('saveResponseButton');

    if (!inputText || !promptSelect || !responseArea) {
      console.error('Required DOM elements not found');
      return;
    }

    // Деактивируем кнопку сохранения до получения ответа
    if (saveResponseButton) {
      saveResponseButton.disabled = true;
    }

    this.updateUIState(true);
    this.abortController = new AbortController();

    try {
      const response = await fetch('/api/send-request-sys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          prompt_name: promptSelect.value,
          inputText: inputText.value
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();

      // Обновляем поле ответа
      responseArea.value = data.content;
      responseArea.style.color = '#e0e0e0';

      // Показываем дополнительную информацию
      console.log(`Response from model: ${data.model}`);
      console.log(`Prompt used: ${data.prompt_used.name}`);
      console.log(`Tokens used: ${data.usage?.total_tokens || 'N/A'}`);

      // Автоматическое сохранение уже произошло на сервере, но активируем кнопку сохранения
      // на случай, если пользователь захочет повторно сохранить
      if (saveResponseButton) {
        saveResponseButton.disabled = false;
      }

      // Показываем уведомление, что ответ уже был сохранен
      this.showSuccess('Response received and automatically saved to history');
    } catch (error) {
      if (error.name === 'AbortError') {
        responseArea.value = 'Request cancelled by user';
      } else {
        this.showError(error.message);
      }

      // Кнопка сохранения остается деактивированной в случае ошибки
      if (saveResponseButton) {
        saveResponseButton.disabled = true;
      }
    } finally {
      this.updateUIState(false);
      this.abortController = null;
    }
  }

  // Добавьте метод для проверки входных данных в режиме выбора промптов
  validateSysInputs() {
    const inputText = document.getElementById('inputText');
    const promptSelect = document.getElementById('promptSelect');

    if (!inputText || !promptSelect) return false;

    if (!inputText.value.trim()) {
      this.showError('Please enter input text');
      return false;
    }

    if (!promptSelect.value) {
      this.showError('Please select a prompt from the dropdown');
      return false;
    }

    return true;
  }

  // Добавьте метод для отображения успешных сообщений
  showSuccess(message) {
    const responseArea = document.getElementById('response');
    if (responseArea) {
      const currentText = responseArea.value;
      responseArea.value = `${currentText}\n\n--- ${message} ---`;
      responseArea.style.color = '#e0e0e0';
    }
  }

  async handleSubmit() {
    if (!this.validateInputs()) {
      return;
    }

    const inputText = document.getElementById('inputText');
    const prompt = document.getElementById('prompt');
    const responseArea = document.getElementById('response');
    const saveResponseButton = document.getElementById('saveResponseButton');

    if (!inputText || !prompt || !responseArea) {
      console.error('Required DOM elements not found');
      return;
    }

    // Деактивируем кнопку сохранения до получения ответа
    if (saveResponseButton) {
      saveResponseButton.disabled = true;
    }

    // Добавляем отладочный вывод для проверки параметров RAG
    console.log('DEBUG: RAG parameters before request:');
    console.log('DEBUG: this.useRag =', this.useRag);
    console.log('DEBUG: this.selectedContextCode =', this.selectedContextCode);
    console.log('DEBUG: this.ragEnabled =', this.ragEnabled);
    console.log('DEBUG: useRagCheckbox checked =', document.getElementById('useRagCheckbox')?.checked);

    this.updateUIState(true);
    this.abortController = new AbortController();

    try {
      // Используем серверный API вместо прямого запроса к OpenRouter
      console.log('Sending request with RAG settings:', {
        useRag: this.useRag,
        contextCode: this.selectedContextCode
      });
      
      const response = await fetch('/api/send-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt.value,
          inputText: inputText.value,
          useRag: this.useRag,
          contextCode: this.selectedContextCode
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response from server');
      }

      const data = await response.json();
      
      // Отображаем ответ
      responseArea.innerHTML = '';
      
      // Добавляем основной ответ
      const responseText = document.createElement('div');
      responseText.className = 'response-text';
      responseText.textContent = data.content;
      responseArea.appendChild(responseText);
      
      // Если есть информация о RAG, добавляем её
      if (data.rag && data.rag.used) {
        const ragInfo = document.createElement('div');
        ragInfo.className = 'rag-info';
        
        const ragTitle = document.createElement('h4');
        ragTitle.textContent = 'Информация о RAG';
        ragInfo.appendChild(ragTitle);
        
        const ragDetails = document.createElement('p');
        ragDetails.textContent = `Использован контекстный код: ${data.rag.contextCode || 'все документы'}`;
        ragDetails.textContent += `, найдено документов: ${data.rag.documentsCount}`;
        ragInfo.appendChild(ragDetails);
        
        if (data.rag.sources && data.rag.sources.length > 0) {
          const sourcesTitle = document.createElement('h4');
          sourcesTitle.textContent = 'Источники:';
          ragInfo.appendChild(sourcesTitle);
          
          const sourcesList = document.createElement('div');
          sourcesList.className = 'rag-sources';
          
          const ul = document.createElement('ul');
          data.rag.sources.forEach(source => {
            const li = document.createElement('li');
            li.textContent = `${source.filename} (${source.contextCode})`;
            ul.appendChild(li);
          });
          
          sourcesList.appendChild(ul);
          ragInfo.appendChild(sourcesList);
        }
        
        responseArea.appendChild(ragInfo);
      }
      
      // Активируем кнопку сохранения после получения ответа
      if (saveResponseButton) {
        saveResponseButton.disabled = false;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        responseArea.textContent = 'Request was cancelled';
      } else {
        responseArea.textContent = `Error: ${error.message}`;
        console.error('Error:', error);
      }
    } finally {
      this.updateUIState(false);
      this.abortController = null;
    }
  }

  destroy() {
    // Cleanup event listeners
    const elements = ['sendButton', 'cancelButton', 'modelSelect', 'inputText', 'prompt'];
    elements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.replaceWith(element.cloneNode(true));
      }
    });

    // Cancel any pending requests
    this.handleCancel();
  }

  // Добавьте эти методы в класс AITestApp

  // Метод для инициализации истории запросов
  initializeHistory() {
    // Находим кнопки
    const saveResponseButton = document.getElementById('saveResponseButton');
    const viewHistoryButton = document.getElementById('viewHistoryButton');

    // Добавляем обработчики событий
    if (saveResponseButton) {
      saveResponseButton.addEventListener('click', () => this.handleSaveResponse());
      // По умолчанию кнопка сохранения недоступна, пока нет ответа
      saveResponseButton.disabled = true;
    }

    if (viewHistoryButton) {
      viewHistoryButton.addEventListener('click', () => this.openHistoryModal());
    }

    // Инициализация модального окна истории
    const historyModal = document.getElementById('historyModal');
    if (historyModal) {
      // Обработчики фильтров и сортировки
      const filterApplyBtn = document.getElementById('historyFilterApply');
      const filterResetBtn = document.getElementById('historyFilterReset');

      if (filterApplyBtn) {
        filterApplyBtn.addEventListener('click', () => this.loadHistoryWithFilters());
      }

      if (filterResetBtn) {
        filterResetBtn.addEventListener('click', () => this.resetHistoryFilters());
      }
    }

    // Инициализация модального окна деталей
    const detailsModal = document.getElementById('responseDetailsModal');
    if (detailsModal) {
      const reloadBtn = document.getElementById('detailsReload');
      const deleteBtn = document.getElementById('detailsDelete');

      if (reloadBtn) {
        reloadBtn.addEventListener('click', () => this.reloadHistoryItem());
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this.deleteHistoryItem());
      }
    }
  }

  // Метод для сохранения ответа в историю
  async handleSaveResponse() {
    const modelSelect = document.getElementById('modelSelect');
    const promptSelect = document.getElementById('promptSelect');
    const promptText = document.getElementById('prompt');
    const inputText = document.getElementById('inputText');
    const responseText = document.getElementById('response');

    if (!modelSelect || !promptSelect || !promptText || !inputText || !responseText) {
      this.showError('Could not find required elements');
      return;
    }

    if (!responseText.value.trim()) {
      this.showError('No response to save');
      return;
    }

    try {
      const promptName = promptSelect.value || 'Custom Prompt';

      const response = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelSelect.value,
          promptName: promptName,
          prompt: promptText.value,
          inputText: inputText.value,
          response: responseText.value
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save response');
      }

      const result = await response.json();
      this.showError('Response saved successfully');
    } catch (error) {
      this.showError(`Error saving response: ${error.message}`);
    }
  }

  // Метод для открытия модального окна истории
  async openHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (!modal) return;

    // Загружаем историю запросов
    await this.loadHistoryWithFilters();

    // Отображаем модальное окно
    modal.style.display = 'block';
    this.activeModal = modal;
  }

  // Метод для загрузки истории с фильтрами
  async loadHistoryWithFilters() {
    const tableBody = document.getElementById('historyTableBody');
    if (!tableBody) return;

    // Собираем значения фильтров
    const modelFilter = document.getElementById('historyFilterModel')?.value;
    const promptFilter = document.getElementById('historyFilterPrompt')?.value;
    const dateFromFilter = document.getElementById('historyFilterDateFrom')?.value;
    const dateToFilter = document.getElementById('historyFilterDateTo')?.value;
    const sortBy = document.getElementById('historySortBy')?.value || 'date';
    const sortOrder = document.getElementById('historySortOrder')?.value || 'desc';

    // Формируем URL с параметрами
    const url = new URL('/api/responses', window.location.origin);
    if (modelFilter) url.searchParams.append('model', modelFilter);
    if (promptFilter) url.searchParams.append('prompt', promptFilter);
    if (dateFromFilter) url.searchParams.append('dateFrom', dateFromFilter);
    if (dateToFilter) url.searchParams.append('dateTo', dateToFilter);
    url.searchParams.append('sortBy', sortBy);
    url.searchParams.append('sortOrder', sortOrder);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }

      const data = await response.json();
      const historyItems = (data && Array.isArray(data.responses))
        ? data.responses
        : (Array.isArray(data) ? data : []);

      // Очищаем таблицу
      tableBody.innerHTML = '';

      // Заполняем таблицу данными
      if (historyItems.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="4" style="text-align: center;">No history items found</td>';
        tableBody.appendChild(row);
      } else {
        historyItems.forEach(item => {
          const row = document.createElement('tr');

          // Форматируем дату
          const date = new Date(item.timestamp);
          const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

          row.innerHTML = `
          <td>${formattedDate}</td>
          <td>${item.model}</td>
          <td>${item.promptName}</td>
          <td>
            <div class="table-actions">
              <button class="table-action-button view" data-id="${item.id}">View</button>
              <button class="table-action-button reload" data-id="${item.id}">Reload</button>
              <button class="table-action-button delete" data-id="${item.id}">Delete</button>
            </div>
          </td>
        `;

          tableBody.appendChild(row);
        });

        // Добавляем обработчики для кнопок
        const viewButtons = tableBody.querySelectorAll('.table-action-button.view');
        const reloadButtons = tableBody.querySelectorAll('.table-action-button.reload');
        const deleteButtons = tableBody.querySelectorAll('.table-action-button.delete');

        viewButtons.forEach(button => {
          button.addEventListener('click', () => this.viewHistoryItem(button.dataset.id, historyItems));
        });

        reloadButtons.forEach(button => {
          button.addEventListener('click', () => this.reloadHistoryItemFromList(button.dataset.id, historyItems));
        });

        deleteButtons.forEach(button => {
          button.addEventListener('click', () => this.deleteHistoryItemFromList(button.dataset.id));
        });
      }
    } catch (error) {
      console.error('Error loading history:', error);
      tableBody.innerHTML = `<tr><td colspan="4">Error loading history: ${error.message}</td></tr>`;
    }
  }

  // Метод для сброса фильтров истории
  resetHistoryFilters() {
    document.getElementById('historyFilterModel').value = '';
    document.getElementById('historyFilterPrompt').value = '';
    document.getElementById('historyFilterDateFrom').value = '';
    document.getElementById('historyFilterDateTo').value = '';
    document.getElementById('historySortBy').value = 'date';
    document.getElementById('historySortOrder').value = 'desc';

    this.loadHistoryWithFilters();
  }


  // Метод для перезагрузки элемента истории из списка
  reloadHistoryItemFromList(id, historyItems) {
    const item = historyItems.find(item => item.id === id);
    if (!item) return;

    // Заполняем форму данными из истории
    document.getElementById('modelSelect').value = item.model;
    document.getElementById('prompt').value = item.prompt;
    document.getElementById('inputText').value = item.inputText;

    // Пытаемся найти и выбрать соответствующий промпт
    const promptSelect = document.getElementById('promptSelect');
    const promptOption = Array.from(promptSelect.options).find(option => option.value === item.promptName);
    if (promptOption) {
      promptSelect.value = item.promptName;
      this.handlePromptSelect({ target: promptSelect });
    } else {
      promptSelect.value = '';
    }

    // Закрываем модальное окно истории
    this.closeActiveModal();
  }

  // Метод для перезагрузки элемента из модального окна деталей
  reloadHistoryItem() {
    const id = document.getElementById('detailsReload').dataset.id;
    if (!id) return;

    // Заполняем форму данными из деталей
    document.getElementById('modelSelect').value = document.getElementById('detailsModel').textContent;
    document.getElementById('prompt').value = document.getElementById('detailsPromptText').textContent;
    document.getElementById('inputText').value = document.getElementById('detailsInputText').textContent;

    // Пытаемся найти и выбрать соответствующий промпт
    const promptName = document.getElementById('detailsPromptName').textContent;
    const promptSelect = document.getElementById('promptSelect');
    const promptOption = Array.from(promptSelect.options).find(option => option.value === promptName);
    if (promptOption) {
      promptSelect.value = promptName;
      this.handlePromptSelect({ target: promptSelect });
    } else {
      promptSelect.value = '';
    }

    // Закрываем модальное окно деталей
    this.closeActiveModal();
  }

  // Метод для удаления элемента истории из модального окна деталей
  async deleteHistoryItem() {
    const id = document.getElementById('detailsDelete').dataset.id;
    if (!id) return;

    if (!confirm('Are you sure you want to delete this history item?')) {
      return;
    }

    try {
      const response = await fetch(`/api/responses/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete history item');
      }

      // Закрываем модальное окно деталей и открываем историю с обновленными данными
      this.closeActiveModal();
      await this.openHistoryModal();
      this.showError('History item deleted successfully');
    } catch (error) {
      this.showError(`Error deleting history item: ${error.message}`);
    }
  }

  // Метод для удаления элемента истории из списка
  async deleteHistoryItemFromList(id) {
    if (!confirm('Are you sure you want to delete this history item?')) {
      return;
    }

    try {
      const response = await fetch(`/api/responses/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete history item');
      }

      // Обновляем список истории
      await this.loadHistoryWithFilters();
      this.showError('History item deleted successfully');
    } catch (error) {
      this.showError(`Error deleting history item: ${error.message}`);
    }
  }


  // Исправленный метод для инициализации вкладок
  initializeTabs() {
    // Инициализация вкладок в модальном окне ответа
    const responseTabButtons = document.querySelectorAll('.tab-button[data-tab]');
    responseTabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        const isDetailsTab = e.target.classList.contains('details-tab-button');

        // Определяем, какой набор вкладок нужно обновить
        const tabPrefix = isDetailsTab ? 'details' : '';

        // Делаем кнопку активной и деактивируем остальные
        const buttons = isDetailsTab
          ? document.querySelectorAll('.details-tab-button')
          : document.querySelectorAll('.tab-button:not(.details-tab-button)');

        buttons.forEach(btn => {
          btn.classList.remove('active');
        });
        e.target.classList.add('active');

        // Показываем нужный контент и скрываем остальные
        let tabContents;
        if (isDetailsTab) {
          tabContents = document.querySelectorAll('#detailsTextTab, #detailsMarkdownTab');
        } else {
          tabContents = document.querySelectorAll('#textTab, #markdownTab');
        }

        tabContents.forEach(content => {
          if (content) {
            content.classList.remove('active');
          }
        });

        const targetTab = document.getElementById(`${tabPrefix}${tabName}Tab`);
        if (targetTab) {
          targetTab.classList.add('active');

          // Если открывается вкладка markdown, рендерим Markdown-контент
          if (tabName.toLowerCase().includes('markdown')) {
            this.renderMarkdown(isDetailsTab);
          }
        }
      });
    });

    // Подготовка marked.js с highlight.js
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        highlight: function (code, lang) {
          if (typeof hljs !== 'undefined') {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
          }
          return code;
        },
        langPrefix: 'hljs language-',
        gfm: true,
        breaks: true
      });
    }
  }

  // Исправленный метод для просмотра деталей ответа
  viewHistoryItem(id, historyItems) {
    // Находим элемент по ID
    const item = historyItems.find(item => item.id === id);
    if (!item) return;

    // Заполняем данные в модальном окне деталей
    document.getElementById('detailsTimestamp').textContent = new Date(item.timestamp).toLocaleString();
    document.getElementById('detailsModel').textContent = item.model;
    document.getElementById('detailsPromptName').textContent = item.promptName;
    document.getElementById('detailsPromptText').textContent = item.prompt;
    document.getElementById('detailsInputText').textContent = item.inputText;

    // Обновляем текст ответа для обеих вкладок
    const detailsResponse = document.getElementById('detailsResponse');
    if (detailsResponse) {
      detailsResponse.textContent = item.response;
    }

    // Сбрасываем вкладки на текст по умолчанию
    const tabButtons = document.querySelectorAll('.details-tab-button');
    tabButtons.forEach(button => {
      button.classList.remove('active');
      if (button.dataset.tab === 'detailsText') {
        button.classList.add('active');
      }
    });

    // Проверяем наличие вкладок перед манипуляцией с ними
    const textTab = document.getElementById('detailsTextTab');
    const markdownTab = document.getElementById('detailsMarkdownTab');

    if (textTab) textTab.classList.add('active');
    if (markdownTab) markdownTab.classList.remove('active');

    // Сохраняем ID текущего элемента для возможных действий (удаление, перезагрузка)
    const deleteBtn = document.getElementById('detailsDelete');
    const reloadBtn = document.getElementById('detailsReload');

    if (deleteBtn) deleteBtn.dataset.id = id;
    if (reloadBtn) reloadBtn.dataset.id = id;

    // Закрываем модальное окно истории и открываем окно деталей
    this.closeActiveModal();
    const detailsModal = document.getElementById('responseDetailsModal');
    detailsModal.style.display = 'block';
    this.activeModal = detailsModal;
  }


  // Метод для рендеринга Markdown
  // Исправленный метод для рендеринга Markdown
  renderMarkdown(isDetailsView = false) {
    // Выбираем исходный текст в зависимости от того, где мы находимся
    let sourceText;
    let targetElement;

    if (isDetailsView) {
      const detailsResponse = document.getElementById('detailsResponse');
      const detailsMarkdownPreview = document.getElementById('detailsMarkdownPreview');

      if (!detailsResponse || !detailsMarkdownPreview) {
        console.error('Required DOM elements for markdown rendering not found');
        return;
      }

      sourceText = detailsResponse.textContent;
      targetElement = detailsMarkdownPreview;
    } else {
      const responseModalText = document.getElementById('responseModalText');
      const responseMarkdownPreview = document.getElementById('responseMarkdownPreview');

      if (!responseModalText || !responseMarkdownPreview) {
        console.error('Required DOM elements for markdown rendering not found');
        return;
      }

      sourceText = responseModalText.value;
      targetElement = responseMarkdownPreview;
    }

    if (!sourceText || !targetElement) return;

    try {
      // Проверяем доступность библиотеки marked
      if (typeof marked === 'undefined') {
        targetElement.innerHTML = '<div class="error">Marked.js library not loaded</div>';
        return;
      }

      // Рендерим Markdown с использованием marked.js
      const renderedHTML = marked.parse(sourceText);
      targetElement.innerHTML = renderedHTML;

      // Применяем подсветку синтаксиса ко всем блокам кода, если доступен highlight.js
      if (typeof hljs !== 'undefined') {
        targetElement.querySelectorAll('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });
      }
    } catch (error) {
      console.error('Error rendering Markdown:', error);
      targetElement.innerHTML = `<div class="error">Error rendering Markdown: ${error.message}</div>`;
    }
  }

  // Обновляем метод openModal для инициализации Markdown
  // Исправленный метод openModal
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      console.error(`Modal with id ${modalId} not found`);
      return;
    }

    // Если это окно разделения файла, используем упрощенное открытие
    if (modalId === 'fileSplitModal') {
      modal.style.display = 'block';
      return;
    }

    const modalTextarea = modal.querySelector('.modal-textarea');
    const sourceId = this.modalMapping[modalId] || modalId.replace('Modal', '');
    const sourceElement = document.getElementById(sourceId);

    if (modalTextarea && sourceElement) {
      modalTextarea.value = sourceElement.value;
      
      // Если открывается модальное окно с ответом, подготавливаем Markdown-превью
      if (modalId === 'responseModal') {
        // Сбрасываем вкладки на текст по умолчанию
        const tabButtons = modal.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
          button.classList.remove('active');
          if (button.dataset.tab === 'text') {
            button.classList.add('active');
          }
        });

        const tabContents = modal.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
          if (content) {
            content.classList.remove('active');
          }
        });

        const textTab = document.getElementById('textTab');
        if (textTab) {
          textTab.classList.add('active');
        }
      }

      // If opening prompt modal, update active prompt if not already set
      if (modalId === 'promptModal' && !this.activePrompt) {
        const promptSelect = document.getElementById('promptSelect');
        if (promptSelect) {
          const selectedName = promptSelect.value;
          if (selectedName) {
            this.activePrompt = this.prompts.find(p => p.name === selectedName);
          }
        }
      }
    }

    modal.style.display = 'block';
    this.activeModal = modal;
  }


  // Обновляем метод viewHistoryItem для инициализации Markdown в деталях
  viewHistoryItem(id, historyItems) {
    // Находим элемент по ID
    const item = historyItems.find(item => item.id === id);
    if (!item) return;

    // Заполняем данные в модальном окне деталей
    document.getElementById('detailsTimestamp').textContent = new Date(item.timestamp).toLocaleString();
    document.getElementById('detailsModel').textContent = item.model;
    document.getElementById('detailsPromptName').textContent = item.promptName;
    document.getElementById('detailsPromptText').textContent = item.prompt;
    document.getElementById('detailsInputText').textContent = item.inputText;

    // Обновляем текст ответа для обеих вкладок
    const detailsResponse = document.getElementById('detailsResponse');
    if (detailsResponse) {
      detailsResponse.textContent = item.response;
    }

    // Сбрасываем вкладки на текст по умолчанию
    const tabButtons = document.querySelectorAll('.details-tab-button');
    tabButtons.forEach(button => {
      button.classList.remove('active');
      if (button.dataset.tab === 'detailsText') {
        button.classList.add('active');
      }
    });

    // Проверяем наличие вкладок перед манипуляцией с ними
    const textTab = document.getElementById('detailsTextTab');
    const markdownTab = document.getElementById('detailsMarkdownTab');

    if (textTab) textTab.classList.add('active');
    if (markdownTab) markdownTab.classList.remove('active');

    // Сохраняем ID текущего элемента для возможных действий (удаление, перезагрузка)
    const deleteBtn = document.getElementById('detailsDelete');
    const reloadBtn = document.getElementById('detailsReload');

    if (deleteBtn) deleteBtn.dataset.id = id;
    if (reloadBtn) reloadBtn.dataset.id = id;

    // Закрываем модальное окно истории и открываем окно деталей
    this.closeActiveModal();
    const detailsModal = document.getElementById('responseDetailsModal');
    detailsModal.style.display = 'block';
    this.activeModal = detailsModal;
  }

  // Добавьте этот метод в класс AITestApp после метода handleSubmit()
  async handleServerSubmit() {
    if (!this.validateInputs()) {
      return;
    }

    const inputText = document.getElementById('inputText');
    const prompt = document.getElementById('prompt');
    const responseArea = document.getElementById('response');
    const saveResponseButton = document.getElementById('saveResponseButton');

    if (!inputText || !prompt || !responseArea) {
      console.error('Required DOM elements not found');
      return;
    }

    // Деактивируем кнопку сохранения до получения ответа
    if (saveResponseButton) {
      saveResponseButton.disabled = true;
    }

    // Добавляем отладочный вывод для проверки параметров RAG
    console.log('DEBUG SERVER: RAG parameters before request:');
    console.log('DEBUG SERVER: this.useRag =', this.useRag);
    console.log('DEBUG SERVER: this.selectedContextCode =', this.selectedContextCode);
    console.log('DEBUG SERVER: this.ragEnabled =', this.ragEnabled);
    console.log('DEBUG SERVER: useRagCheckbox checked =', document.getElementById('useRagCheckbox')?.checked);

    this.updateUIState(true);
    this.abortController = new AbortController();

    try {
      const response = await fetch('/api/send-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt.value,
          inputText: inputText.value,
          useRag: this.useRag,
          contextCode: this.selectedContextCode
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();

      // Обновляем поле ответа
      responseArea.value = data.content;
      responseArea.style.color = '#e0e0e0';

      // Показываем дополнительную информацию
      console.log(`Response from model: ${data.model}`);
      console.log(`Tokens used: ${data.usage?.total_tokens || 'N/A'}`);

      // Активируем кнопку сохранения после получения ответа
      if (saveResponseButton) {
        saveResponseButton.disabled = false;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        responseArea.value = 'Request cancelled by user';
      } else {
        this.showError(error.message);
      }

      // Кнопка сохранения остается деактивированной в случае ошибки
      if (saveResponseButton) {
        saveResponseButton.disabled = true;
      }
    } finally {
      this.updateUIState(false);
      this.abortController = null;
    }
  }

  // Добавляем метод для открытия модального окна отладки RAG
  async openRagDebugModal() {
    try {
      // Получаем отладочную информацию с сервера
      const response = await fetch('/api/rag/debug-info');
      if (!response.ok) {
        throw new Error(`Failed to fetch RAG debug info: ${response.status}`);
      }
      
      const debugInfo = await response.json();
      
      // Заполняем модальное окно данными
      const ragStatusDebug = document.getElementById('ragStatusDebug');
      const finalInputTextDebug = document.getElementById('finalInputTextDebug');
      const ragInfoDebug = document.getElementById('ragInfoDebug');
      
      if (ragStatusDebug) {
        ragStatusDebug.textContent = `RAG Enabled: ${debugInfo.ragEnabled}
Timestamp: ${debugInfo.timestamp || 'N/A'}`;
      }
      
      if (finalInputTextDebug) {
        finalInputTextDebug.textContent = debugInfo.finalInputText || 'No input text available';
      }
      
      if (ragInfoDebug) {
        if (debugInfo.ragInfo) {
          ragInfoDebug.textContent = JSON.stringify(debugInfo.ragInfo, null, 2);
        } else {
          ragInfoDebug.textContent = 'No RAG info available';
        }
      }
      
      // Открываем модальное окно
      const modal = document.getElementById('debugRagModal');
      if (modal) {
        modal.style.display = 'block';
        this.activeModal = modal;
      }
    } catch (error) {
      console.error('Error fetching RAG debug info:', error);
      this.showError(`Failed to fetch RAG debug info: ${error.message}`);
    }
  }

  // Добавляем методы для работы с файлами
  
  /**
   * Форматирует размер файла в удобочитаемый вид
   * @param {number} bytes - Размер файла в байтах
   * @returns {string} Отформатированный размер файла
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  }
  
  /**
   * Обрабатывает загруженный файл и вставляет его содержимое в поле ввода
   */
  async handleFileContent() {
    console.log('handleFileContent вызван');
    
    const fileInput = document.getElementById('fileInput');
    console.log('fileInput:', fileInput);
    
    const inputText = document.getElementById('inputText');
    console.log('inputText:', inputText);
    
    if (!fileInput || !fileInput.files[0] || !inputText) {
      console.log('Отсутствуют необходимые элементы:', {
        fileInput: !!fileInput,
        hasFiles: fileInput ? !!fileInput.files[0] : false,
        inputText: !!inputText
      });
      return;
    }
    
    const file = fileInput.files[0];
    console.log('Файл выбран:', file.name, file.size, file.type);
    
    const maxSize = 10485760; // 10MB
    
    if (file.size > maxSize) {
      const confirmSplit = confirm(`Файл слишком большой (${this.formatFileSize(file.size)}). 
Хотите разделить его на части и отправить по частям?`);
      
      if (confirmSplit) {
        this.showMessage(`Подготовка к анализу файла ${file.name} по частям...`);
        this.processLargeFile(file);
      } else {
        this.showError(`Файл слишком большой. Максимальный размер: ${this.formatFileSize(maxSize)}`);
      }
      return;
    }
    
    // Проверяем тип файла
    const textFileTypes = [
      'text/plain', 'text/markdown', 'text/html', 'text/css', 'text/javascript', 
      'application/json', 'application/javascript', 'application/x-javascript'
    ];
    
    try {
      let content;
      
      // Для текстовых файлов читаем как текст
      if (textFileTypes.includes(file.type) || file.name.match(/\.(txt|md|js|py|json|html|css|csv)$/i)) {
        content = await this.readFileAsText(file);
      } else {
        // Для бинарных файлов показываем предупреждение
        const confirmBinary = confirm(`Файл '${file.name}' может быть бинарным. Попытаться прочитать его как текст?`);
        if (!confirmBinary) return;
        content = await this.readFileAsText(file);
      }
      
      // Получаем текущий текст из поля ввода
      const currentText = inputText.value;
      
      // Обрезаем содержимое, если оно слишком большое
      const maxContentLength = 1000000; // ~1MB текста
      
      // Формируем новое содержимое: добавляем разделитель, если в поле уже есть текст
      let newContent = currentText;
      
      if (newContent && newContent.trim() !== '') {
        newContent += '\n\n---- Содержимое файла ' + file.name + ' ----\n\n';
      }
      
      if (content.length > maxContentLength) {
        const truncated = content.substring(0, maxContentLength);
        newContent += truncated + '\n\n[...Содержимое обрезано из-за большого размера...]';
        this.showMessage(`Файл загружен частично из-за большого размера: ${file.name}`);
      } else {
        newContent += content;
        this.showMessage(`Содержимое файла успешно добавлено: ${file.name}`);
      }
      
      // Устанавливаем новое содержимое в поле ввода
      inputText.value = newContent;
      
      // Фокусируемся на поле ввода и прокручиваем к концу
      inputText.focus();
      inputText.scrollTop = inputText.scrollHeight;
      
    } catch (error) {
      console.error('Ошибка при чтении файла:', error);
      this.showError(`Не удалось прочитать файл: ${error.message}`);
    }
  }

  /**
   * Обрабатывает большой файл, разбивая его на части для анализа
   * @param {File} file - Файл для обработки
   */
  async processLargeFile(file) {
    try {
      const content = await this.readFileAsText(file);
      
      // Создаем модальное окно для разделения файла
      this.createFileSplitModal(file.name, content);
    } catch (error) {
      console.error('Ошибка при чтении большого файла:', error);
      this.showError(`Не удалось прочитать файл для разделения: ${error.message}`);
    }
  }

  /**
   * Создает модальное окно для разделения файла на части
   * @param {string} fileName - Имя файла
   * @param {string} content - Содержимое файла
   */
  createFileSplitModal(fileName, content) {
    // Создаем модальное окно
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'fileSplitModal';
    
    // Разделяем файл на части (примерно по 800KB каждая)
    const partSize = 800000;
    const totalParts = Math.ceil(content.length / partSize);
    
    const parts = [];
    for (let i = 0; i < totalParts; i++) {
      const start = i * partSize;
      const end = Math.min((i + 1) * partSize, content.length);
      parts.push({
        index: i + 1,
        content: content.substring(start, end),
        size: end - start
      });
    }
    
    // HTML для модального окна
    modal.innerHTML = `
      <div class="modal-content resizable">
        <div class="modal-header">
          <h3>Анализ файла по частям: ${fileName}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body file-split-body">
          <div class="file-split-info">
            <p>Файл разделен на ${totalParts} част${totalParts === 1 ? 'ь' : totalParts < 5 ? 'и' : 'ей'} 
            (всего ${this.formatFileSize(content.length)})</p>
            <div class="split-controls">
              <label>
                <input type="checkbox" id="appendPartInfo" checked> 
                Добавлять информацию о части в запрос
              </label>
              <button id="processPreviousParts" disabled>Использовать результаты предыдущих частей</button>
            </div>
          </div>
          <div class="file-parts-list">
            <table class="file-parts-table">
              <thead>
                <tr>
                  <th>Часть</th>
                  <th>Размер</th>
                  <th>Действия</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                ${parts.map(part => `
                  <tr data-part="${part.index}">
                    <td>Часть ${part.index} из ${totalParts}</td>
                    <td>${this.formatFileSize(part.size)}</td>
                    <td>
                      <button class="process-part-btn" data-part="${part.index}">Обработать</button>
                    </td>
                    <td class="part-status" data-part="${part.index}">Ожидает обработки</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-save" id="saveAllResultsBtn">Сохранить все результаты</button>
          <button class="modal-cancel">Закрыть</button>
        </div>
        <div class="resize-handle"></div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Сохраняем данные частей
    this.fileParts = parts;
    this.filePartsResults = new Array(totalParts).fill(null);
    
    // Отображаем модальное окно
    this.openModal('fileSplitModal');
    
    // Добавляем обработчики событий
    this.attachFileSplitModalEvents();
  }

  /**
   * Добавляет обработчики событий для модального окна разделения файла
   */
  attachFileSplitModalEvents() {
    const modal = document.getElementById('fileSplitModal');
    if (!modal) return;
    
    // Обработчик закрытия
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.closeModal('fileSplitModal');
      });
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.closeModal('fileSplitModal');
      });
    }
    
    // Обработчики для кнопок обработки частей
    const processButtons = modal.querySelectorAll('.process-part-btn');
    processButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const partIndex = parseInt(e.target.getAttribute('data-part'), 10);
        this.processFilePart(partIndex);
      });
    });
    
    // Кнопка для использования предыдущих результатов
    const previousPartsBtn = modal.querySelector('#processPreviousParts');
    if (previousPartsBtn) {
      previousPartsBtn.addEventListener('click', () => {
        this.useResultsFromPreviousParts();
      });
    }
    
    // Кнопка для сохранения всех результатов
    const saveAllBtn = modal.querySelector('#saveAllResultsBtn');
    if (saveAllBtn) {
      saveAllBtn.addEventListener('click', () => {
        this.saveAllFilePartsResults();
      });
    }
  }

  /**
   * Обрабатывает конкретную часть файла
   * @param {number} partIndex - Индекс части файла
   */
  async processFilePart(partIndex) {
    if (!this.fileParts || !this.fileParts[partIndex - 1]) return;
    
    const part = this.fileParts[partIndex - 1];
    const modal = document.getElementById('fileSplitModal');
    
    if (!modal) return;
    
    // Обновляем статус
    const statusCell = modal.querySelector(`.part-status[data-part="${partIndex}"]`);
    if (statusCell) {
      statusCell.textContent = 'Обработка...';
      statusCell.className = 'part-status processing';
    }
    
    // Отключаем кнопку
    const processButton = modal.querySelector(`.process-part-btn[data-part="${partIndex}"]`);
    if (processButton) {
      processButton.disabled = true;
    }
    
    // Получаем текущие значения полей
    const model = document.getElementById('modelSelect').value;
    const prompt = document.getElementById('prompt').value;
    const appendPartInfo = document.getElementById('appendPartInfo').checked;
    
    // Формируем содержимое для обработки
    let contentToProcess = part.content;
    
    // Если нужно добавить информацию о части
    if (appendPartInfo) {
      contentToProcess = `Это часть ${partIndex} из ${this.fileParts.length} файла. Анализируйте только эту часть.\n\n${contentToProcess}`;
    }
    
    try {
      // Отправляем запрос
      const response = await this.sendServerRequest(model, prompt, contentToProcess);
      
      // Сохраняем результат
      this.filePartsResults[partIndex - 1] = {
        content: response.content,
        partIndex: partIndex,
        totalParts: this.fileParts.length,
        processed: true,
        timestamp: new Date().toISOString()
      };
      
      // Обновляем статус
      if (statusCell) {
        statusCell.textContent = 'Обработано';
        statusCell.className = 'part-status success';
      }
      
      // Активируем кнопку "Использовать результаты предыдущих частей", если есть обработанные части
      const hasProcessedParts = this.filePartsResults.some(result => result !== null);
      const previousPartsBtn = modal.querySelector('#processPreviousParts');
      if (previousPartsBtn && hasProcessedParts) {
        previousPartsBtn.disabled = false;
      }
      
      this.showMessage(`Часть ${partIndex} успешно обработана`);
    } catch (error) {
      console.error(`Ошибка при обработке части ${partIndex}:`, error);
      
      // Обновляем статус
      if (statusCell) {
        statusCell.textContent = `Ошибка: ${error.message || 'Не удалось обработать'}`;
        statusCell.className = 'part-status error';
      }
      
      // Включаем кнопку обратно
      if (processButton) {
        processButton.disabled = false;
      }
      
      this.showError(`Ошибка при обработке части ${partIndex}: ${error.message || 'Неизвестная ошибка'}`);
    }
  }

  /**
   * Отправляет запрос на сервер для обработки части файла
   * @param {string} model - Модель AI
   * @param {string} prompt - Промпт для модели
   * @param {string} inputText - Текст для обработки
   * @returns {Promise<Object>} - Результат обработки
   */
  async sendServerRequest(model, prompt, inputText) {
    if (!model || !prompt || !inputText) {
      throw new Error('Не указаны обязательные параметры');
    }
    
    try {
      const response = await fetch('/api/send-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          prompt,
          inputText,
          useRag: this.useRag,
          contextCode: this.selectedContextCode
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка при отправке запроса');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Ошибка при отправке запроса:', error);
      throw error;
    }
  }

  /**
   * Использует результаты обработки предыдущих частей для анализа следующей части
   */
  async useResultsFromPreviousParts() {
    // Проверяем, есть ли результаты предыдущих частей
    const processedResults = this.filePartsResults.filter(result => result !== null);
    
    if (processedResults.length === 0) {
      this.showError('Нет обработанных частей файла');
      return;
    }
    
    // Находим первую необработанную часть
    const nextPartIndex = this.filePartsResults.findIndex(result => result === null);
    
    if (nextPartIndex === -1) {
      this.showMessage('Все части уже обработаны');
      return;
    }
    
    // Получаем текущие значения полей
    const model = document.getElementById('modelSelect').value;
    const basePrompt = document.getElementById('prompt').value;
    
    // Создаем расширенный промпт с результатами предыдущих частей
    let enhancedPrompt = basePrompt + '\n\nРезультаты анализа предыдущих частей:\n\n';
    
    processedResults.forEach(result => {
      enhancedPrompt += `--- Часть ${result.partIndex} из ${result.totalParts} ---\n`;
      enhancedPrompt += result.content + '\n\n';
    });
    
    enhancedPrompt += `\nТеперь проанализируйте часть ${nextPartIndex + 1}, учитывая результаты предыдущих частей.`;
    
    // Обновляем статус
    const modal = document.getElementById('fileSplitModal');
    const statusCell = modal.querySelector(`.part-status[data-part="${nextPartIndex + 1}"]`);
    if (statusCell) {
      statusCell.textContent = 'Обработка с учетом предыдущих частей...';
      statusCell.className = 'part-status processing';
    }
    
    // Отключаем кнопку
    const processButton = modal.querySelector(`.process-part-btn[data-part="${nextPartIndex + 1}"]`);
    if (processButton) {
      processButton.disabled = true;
    }
    
    try {
      // Отправляем запрос
      const response = await this.sendServerRequest(
        model, 
        enhancedPrompt, 
        this.fileParts[nextPartIndex].content
      );
      
      // Сохраняем результат
      this.filePartsResults[nextPartIndex] = {
        content: response.content,
        partIndex: nextPartIndex + 1,
        totalParts: this.fileParts.length,
        processed: true,
        usedPreviousResults: true,
        timestamp: new Date().toISOString()
      };
      
      // Обновляем статус
      if (statusCell) {
        statusCell.textContent = 'Обработано с учетом предыдущих частей';
        statusCell.className = 'part-status success';
      }
      
      this.showMessage(`Часть ${nextPartIndex + 1} успешно обработана с учетом предыдущих результатов`);
    } catch (error) {
      console.error(`Ошибка при обработке части ${nextPartIndex + 1}:`, error);
      
      // Обновляем статус
      if (statusCell) {
        statusCell.textContent = `Ошибка: ${error.message || 'Не удалось обработать'}`;
        statusCell.className = 'part-status error';
      }
      
      // Включаем кнопку обратно
      if (processButton) {
        processButton.disabled = false;
      }
      
      this.showError(`Ошибка при обработке части ${nextPartIndex + 1}: ${error.message || 'Неизвестная ошибка'}`);
    }
  }

  /**
   * Сохраняет все результаты обработки частей файла
   */
  saveAllFilePartsResults() {
    // Проверяем, есть ли результаты
    const processedResults = this.filePartsResults.filter(result => result !== null);
    
    if (processedResults.length === 0) {
      this.showError('Нет обработанных частей файла для сохранения');
      return;
    }
    
    // Формируем содержимое файла
    let content = `# Результаты анализа файла\n\n`;
    content += `Дата: ${new Date().toLocaleString()}\n`;
    content += `Всего частей: ${this.fileParts.length}\n`;
    content += `Обработано частей: ${processedResults.length}\n\n`;
    
    // Добавляем результаты каждой части
    this.filePartsResults.forEach((result, index) => {
      if (result) {
        content += `## Часть ${index + 1} из ${this.fileParts.length}\n\n`;
        content += `${result.content}\n\n`;
        content += `---\n\n`;
      }
    });
    
    // Создаем и скачиваем файл
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `file-analysis-results-${new Date().toISOString().replace(/:/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.showMessage('Результаты анализа файла успешно сохранены');
  }

  /**
   * Закрывает модальное окно
   * @param {string} modalId - ID модального окна
   */
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
      
      // Если это окно разделения файла, удаляем его из DOM
      if (modalId === 'fileSplitModal') {
        modal.remove();
        // Очищаем данные о частях файла
        this.fileParts = null;
        this.filePartsResults = null;
      }
    }
  }

  /**
   * Читает содержимое файла как текст
   * @param {File} file - Файл для чтения
   * @returns {Promise<string>} Содержимое файла
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        resolve(event.target.result);
      };
      
      reader.onerror = (error) => {
        reject(error);
      };
      
      reader.readAsText(file);
    });
  }
  
  /**
   * Показывает сообщение об успешном действии
   * @param {string} message - Текст сообщения
   */
  showMessage(message) {
    console.log('Success:', message);
    
    // Создаем элемент для уведомления
    const notification = document.createElement('div');
    notification.className = 'notification success-notification';
    notification.textContent = message;
    
    // Добавляем элемент в DOM
    document.body.appendChild(notification);
    
    // Удаляем уведомление через 3 секунды
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 500);
    }, 3000);
  }
  
  /**
   * Показывает сообщение об ошибке
   * @param {string} message - Текст сообщения об ошибке
   */
  showError(message) {
    console.error('Error:', message);
    
    // Создаем элемент для уведомления
    const notification = document.createElement('div');
    notification.className = 'notification error-notification';
    notification.textContent = message;
    
    // Добавляем элемент в DOM
    document.body.appendChild(notification);
    
    // Удаляем уведомление через 3 секунды
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 500);
    }, 3000);
  }

  /**
   * Открывает модальное окно для сохранения текущего ответа как markdown
   */
  saveAsMarkdown() {
    // Получаем текущий ответ
    const responseText = document.getElementById('responseModalText').value;
    if (!responseText) {
      this.showError('Нет текста для сохранения');
      return;
    }
    
    // Создаем дефолтное имя файла на основе даты и времени
    const defaultFilename = `response_${new Date().toISOString().replace(/:/g, '-')}.md`;
    
    // Устанавливаем дефолтное имя файла
    const filenameInput = document.getElementById('saveFilename');
    if (filenameInput) {
      filenameInput.value = defaultFilename;
    }
    
    // Очищаем поле директории
    const directoryInput = document.getElementById('saveDirectory');
    if (directoryInput) {
      directoryInput.value = '';
    }
    
    // Открываем модальное окно
    const saveFileModal = document.getElementById('saveFileModal');
    if (saveFileModal) {
      saveFileModal.style.display = 'block';
      
      // Добавляем обработчик для кнопки сохранения
      const confirmSaveBtn = document.getElementById('confirmSaveFileBtn');
      if (confirmSaveBtn) {
        // Удаляем предыдущие обработчики, если они есть
        const newBtn = confirmSaveBtn.cloneNode(true);
        confirmSaveBtn.parentNode.replaceChild(newBtn, confirmSaveBtn);
        
        // Добавляем новый обработчик
        newBtn.addEventListener('click', () => {
          const filename = document.getElementById('saveFilename').value || defaultFilename;
          const directory = document.getElementById('saveDirectory').value || '';
          
          this.saveMarkdownToServer(responseText, filename, directory);
          this.closeModal('saveFileModal');
        });
      }
      
      // Добавляем обработчик для кнопки отмены
      const cancelBtn = saveFileModal.querySelector('.modal-cancel');
      if (cancelBtn) {
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        newCancelBtn.addEventListener('click', () => {
          this.closeModal('saveFileModal');
        });
      }
      
      // Добавляем обработчик для кнопки закрытия
      const closeBtn = saveFileModal.querySelector('.modal-close');
      if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        
        newCloseBtn.addEventListener('click', () => {
          this.closeModal('saveFileModal');
        });
      }
    }
  }
  
  /**
   * Сохраняет markdown-контент на сервере
   * @param {string} content - Контент для сохранения
   * @param {string} filename - Имя файла
   * @param {string} directory - Директория для сохранения (опционально)
   */
  async saveMarkdownToServer(content, filename, directory) {
    try {
      const response = await fetch('/api/save-markdown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          filename,
          directory
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        this.showMessage(`Файл успешно сохранен: ${data.filePath}`);
      } else {
        throw new Error(data.error || 'Ошибка при сохранении файла');
      }
    } catch (error) {
      console.error('Error saving markdown file:', error);
      this.showError(`Не удалось сохранить файл: ${error.message}`);
    }
  }

  setupAssignTypeListener(allModels) {
    const assignSelect = document.getElementById('assignTypeSelect');
    if (assignSelect) {
      // Удаляем старый обработчик если есть
      const newAssignSelect = assignSelect.cloneNode(true);
      assignSelect.parentNode.replaceChild(newAssignSelect, assignSelect);

      newAssignSelect.addEventListener('change', async (e) => {
        const type = e.target.value;
        if (!type) return;

        const selectedModelName = document.getElementById('modelSelect')?.value;
        if (!selectedModelName) {
          this.showError('Сначала выберите модель!');
          newAssignSelect.value = '';
          return;
        }

        const model = allModels.find(m => m.name === selectedModelName);
        if (!model) {
          this.showError('Модель не найдена!');
          newAssignSelect.value = '';
          return;
        }

        try {
          const res = await fetch('/api/default-models/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: type,
              modelId: model.id,
            }),
          });
          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Ошибка при назначении модели');
          }
          await this.loadModels(); // Перезагружаем модели для обновления UI
          this.showMessage(`Модель "${model.visible_name || model.name}" теперь ${type.toUpperCase()} по умолчанию!`);
        } catch (error) {
          this.showError(error.message);
        } finally {
          newAssignSelect.value = '';
        }
      });
    }
  }
}