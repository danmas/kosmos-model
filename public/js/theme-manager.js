/**
 * 🧠 ThemeManager - Professional Version
 * Handles multi-theme switching, persistence, and UI synchronization.
 */

const THEMES = [
    { id: 'dark', name: '🌙 Ночная', icon: '🌙' },
    { id: 'light', name: '☀️ Дневная', icon: '☀️' },
    { id: 'cyberpunk', name: '🤖 Киберпанк', icon: '🤖' },
    { id: 'cyber-hud', name: '🌐 HUD-интерфейс', icon: '🌐' }
];

class ThemeManager {
    constructor() {
        this.themeKey = 'kosmos-app-theme';
        this.currentTheme = localStorage.getItem(this.themeKey) || 'dark';
        this.init();
    }

    init() {
        // Apply theme immediately
        this.applyTheme(this.currentTheme);

        // Listen for storage changes in other tabs
        window.addEventListener('storage', (e) => {
            if (e.key === this.themeKey) {
                this.applyTheme(e.newValue);
                this.updateUI();
            }
        });

        // Setup UI when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupUI());
        } else {
            this.setupUI();
        }

        window.themeManager = this;
    }

    applyTheme(themeId) {
        document.documentElement.setAttribute('data-theme', themeId);
        this.currentTheme = themeId;
        localStorage.setItem(this.themeKey, themeId);

        // Meta theme color for mobile
        const style = getComputedStyle(document.documentElement);
        const metaColor = style.getPropertyValue('--bg-main').trim();
        this.setMetaThemeColor(metaColor);

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: themeId } }));
    }

    setMetaThemeColor(color) {
        let metaTag = document.querySelector('meta[name="theme-color"]');
        if (!metaTag) {
            metaTag = document.createElement('meta');
            metaTag.name = 'theme-color';
            document.head.appendChild(metaTag);
        }
        metaTag.content = color;
    }

    setupUI() {
        // Handle any elements with class .theme-selector
        const selectors = document.querySelectorAll('.theme-selector');
        selectors.forEach(selector => {
            if (selector.tagName === 'SELECT') {
                selector.innerHTML = '';
                THEMES.forEach(theme => {
                    const opt = document.createElement('option');
                    opt.value = theme.id;
                    opt.textContent = theme.name;
                    opt.selected = theme.id === this.currentTheme;
                    selector.appendChild(opt);
                });
                selector.addEventListener('change', (e) => this.applyTheme(e.target.value));
            }
        });
        this.updateUI();
    }

    updateUI() {
        // Update all selectors to match current state
        const selectors = document.querySelectorAll('.theme-selector');
        selectors.forEach(s => { if (s.value !== this.currentTheme) s.value = this.currentTheme; });

        // Update specialized toggle icons if they exist
        const themeIcon = document.querySelector('#themeToggle i');
        if (themeIcon) {
            const theme = THEMES.find(t => t.id === this.currentTheme);
            if (this.currentTheme === 'dark') {
                themeIcon.className = 'fas fa-moon';
                themeIcon.style.color = 'var(--accent-amber)';
            } else if (this.currentTheme === 'light') {
                themeIcon.className = 'fas fa-sun';
                themeIcon.style.color = '#f59e0b';
            } else {
                themeIcon.className = 'fas fa-atom';
                themeIcon.style.color = 'var(--primary)';
            }
        }
    }

    toggleTheme() {
        const currentIndex = THEMES.findIndex(t => t.id === this.currentTheme);
        const nextIndex = (currentIndex + 1) % THEMES.length;
        this.applyTheme(THEMES[nextIndex].id);
        this.updateUI();
    }

    getThemeColors() {
        const style = getComputedStyle(document.documentElement);
        return {
            background: style.getPropertyValue('--bg-main').trim(),
            foreground: style.getPropertyValue('--text-main').trim(),
            accent: style.getPropertyValue('--primary').trim()
        };
    }
}

// Instantiate
new ThemeManager();
