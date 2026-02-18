# 🏗 Developer Guide: Flexible Theming Architecture (The "Kosmos" Pattern)

This guide describes the architecture and best practices for implementing a flexible, scaleable, and real-time synchronized theming system in a web application.

---

## 1. Core Principles

The "Kosmos" theming pattern relies on three pillars:
1.  **CSS Variables (Tokens)**: All colors and styles must be defined as variables.
2.  **Attribute-Based Theming**: Themes are applied by switching a `data-theme` attribute on the root element.
3.  **Centralized Manager**: A single JavaScript class manages state, persistence, and event propagation.

---

## 2. The CSS Architecture

### Step A: Global Token Definitions
In your `themes.css` (or `tokens.css`), define the default theme on `:root`. Use semantic naming (e.g., `--bg-main` vs `--dark-blue`).

```css
:root {
    --bg-main: #0b0f1a;
    --primary: #60a5fa;
    --text-main: #e6ecff;
}
```

### Step B: Theme Overrides
Define theme-specific overrides using attribute selectors. This allows the browser to switch styles instantly without reloading CSS.

```css
[data-theme="light"] {
    --bg-main: #f0f2f5;
    --primary: #3b82f6;
    --text-main: #1f2937;
}
```

---

## 3. The JavaScript Manager (`ThemeManager`)

Avoid managing themes in scattered script tags. Encapsulate everything in a class.

### Key Features to Implement:
1.  **Persistence**: Store the user's choice in `localStorage`.
2.  **Application**: Set the attribute on `document.documentElement` during initialization.
3.  **Cross-Tab Sync**: Use the `storage` event to detect when the user changes the theme in another tab.

```javascript
window.addEventListener('storage', (e) => {
    if (e.key === 'your-app-theme') {
        this.applyTheme(e.newValue);
    }
});
```

4.  **Event Dispatching**: Emit custom events (`theme-changed`) for components that can't be styled by CSS alone (like Canvas, WebGL, or Terminal renderers).

---

## 4. Integrating 3rd-Party Libraries (e.g., xterm.js)

When a library uses its own internal state for colors, you must "bridge" the CSS variables to JavaScript.

**The "Bridge" Pattern:**
```javascript
getThemeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
        background: style.getPropertyValue('--term-bg').trim(),
        foreground: style.getPropertyValue('--term-fg').trim()
    };
}

// When theme changes:
terminal.options.theme = themeManager.getThemeColors();
```

---

## 5. Implementation Workflow for Developers

### 1. Standardization Phase
Audit your existing CSS. Find all hardcoded hex/rgb codes and replace them with variables. 
*   **Pro Tip**: If two hex codes are slightly different but serve the same purpose, consolidate them into one variable.

### 2. The Root Selector
Initialize the manager at the very top of your `head` (or as a blocking script) to prevent "Flash of Unstyled Content" (FOUC).

```html
<head>
    <link rel="stylesheet" href="themes.css">
    <script src="theme-manager.js"></script> <!-- This should run applyTheme() immediately -->
</head>
```

### 3. Real-time UI population
Implement a `setupUI()` method that finds all elements with a specific class (e.g., `.theme-selector`) and populates them automatically from a central `THEMES` array. This ensures that adding a new theme requires zero HTML changes.

---

## 6. Checklist for a "Premium" Feel

*   [ ] **Transitions**: Add a global CSS transition: `* { transition: background-color 0.3s ease, color 0.3s ease; }`. (Caution: use sparingly for performance).
*   [ ] **Meta-Theme**: Update the `<meta name="theme-color">` dynamically in JS to match the mobile browser header.
*   [ ] **Inverted Assets**: Use CSS filters like `filter: invert(1)` or different SVGs for logos if they don't look good on both dark/light backgrounds.
*   [ ] **Scrollbars**: Theme the scrollbars using variables for a truly integrated look.

---

## 7. Example Directory Structure
```text
project-root/
├── web/
│   ├── css/
│   │   ├── themes.css        # The Source of Truth (Tokens)
│   │   └── main.css          # Layout (Uses tokens)
│   └── js/
│       └── theme-manager.js  # The Brain (Logic)
```

---

*This architecture allows Kosmos Panel to support everything from subtle Dark modes to high-contrast Cyberpunk styles with a single point of configuration.*
