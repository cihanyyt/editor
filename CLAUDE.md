# Editor

A single-file, mobile-first documentation editor. The **entire application lives in `index.html`** — no build step, no bundler, no npm install. Deploy by dropping the file into any static host.

## Stack (all loaded from CDN)

| Library | Version | Purpose |
|---|---|---|
| Quill.js | 1.3.7 | Rich text editor |
| Turndown | 7.1.2 | HTML → Markdown conversion |
| Marked | 9.1.6 | Markdown → HTML conversion |
| JSZip | 3.10.1 | Workspace zip export/import |

## Architecture

### Layout model
- **Navbar** — always visible. Contains (left→right): hamburger (`#btn-drawer`) toggles the file drawer; filename display; font picker; **Markdown split button** (`#btn-split`, pill-shaped with icon + "Markdown" text label, accent-coloured); **dark/light mode toggle** (`#btn-theme`, moon/sun icon); divider; save button.
- **File drawer** — inline push sidebar on the left (animates `width` 0 → 280px). Pushes the editor; does NOT overlay it, so the editor stays interactive while the drawer is open. Open by default on desktop (`>767px`), hidden by default on mobile (`≤767px`).
- **Desktop onboarding auto-collapse** — on first load at `>1200px`, both the file drawer and the markdown pane open automatically so the user can see all panels. After **5 seconds** both collapse via a `setTimeout` in `init()`. This is a one-time hint; toggling either panel manually after that works normally.
- **Editor pane** — always fills remaining space. Quill renders here. Content width is capped at `856px` via `max-width` + `margin: auto` so text never reflows when the drawer toggles.
- **Markdown pane** — hidden by default. On desktop: slides in as a split (resizable divider). On mobile (`≤767px`): replaces the editor pane full-screen. Contains a `#md-tabbar` at the top that mirrors all open file tabs; clicking a tab switches both the editor and markdown view to that file. Tabs slide in from the right via CSS animation.

### State object (`S`)
All runtime state lives in a single object:
```js
S = {
  folders:    [],   // { id, name, parentId, collapsed }
  files:      [],   // { id, name, folderId, htmlContent, lastModified }
  openTabs:   [],   // [fileId, ...]
  activeTab:  null,
  splitOpen:  false,
  drawerOpen: false,
}
```
Nothing is persisted to localStorage — workspace lives in memory and is exported as `.zip`.

### Critical patterns

**Always call `flushContent()` before switching tabs or files.** It writes `quill.root.innerHTML` back to `file.htmlContent`. Forgetting this loses unsaved edits.

**Sync loop prevention.** Quill's `text-change` event fires for both user input and programmatic DOM changes. The guard `source === 'user'` on the handler ensures only real keystrokes trigger a markdown sync. Setting `quill.root.innerHTML` directly from the md→quill direction is seen as `source = 'api'` and is safely ignored.

**Two separate debounce timers:**
- `mdSyncTimer` — quill → markdown pane (150ms debounce, reads `quill.root.innerHTML` directly)
- `document._mdBackTimer` — markdown pane → quill (600ms debounce, longer to avoid fighting the user)

**Flex height chain.** The editor scroll only works because every ancestor in the chain has `display:flex; flex-direction:column; overflow:hidden; min-height:0`. Breaking any link in this chain (e.g. a plain unstyled wrapper div) will cause the editor to expand to full content height and scroll will stop working.

**Quill toolbar overflow.** The toolbar must have `overflow: visible` (not `auto` or `hidden`). Any non-visible overflow creates a clipping context that hides the absolutely-positioned heading/format picker dropdowns. The toolbar uses `flex-wrap: nowrap` to prevent wrapping to a second row when the editor pane narrows.

**Editor font.** The editor font is controlled by the `--f-editor` CSS custom property on `:root`. The navbar `#font-picker` select calls `setFont(value)` which updates the property via `document.documentElement.style.setProperty`. Available fonts: Inter (default), Merriweather, JetBrains Mono. Do not hardcode `font-family` on `.ql-editor` — always use `var(--f-editor)`.

**Drawer is a push sidebar, not an overlay.** The drawer uses `width` animation (0 → `--sb-w`) inside a `#main-area` flex row. There is no full-screen overlay div. Do not revert to `position: fixed` + `transform` — that would block editor interaction.

**Theme system — CSS variables only.** Every colour in the app is a CSS custom property (`--c-base`, `--c-surface`, `--c-raised`, `--c-border`, `--c-border-hi`, `--c-accent`, `--c-accent-dim`, `--c-accent2`, `--c-text`, `--c-text2`, `--c-text3`, `--c-danger`, `--c-code`). Dark mode is the default (values on `:root`). Light mode is activated by adding `data-theme="light"` to `<html>`, which triggers an `html[data-theme="light"]` block that overrides all tokens. Because Quill toolbar/editor colours and every other surface already reference these variables, the entire UI re-themes without any JavaScript DOM walking. The module-level flag `_isDark` tracks the current state; `toggleTheme()` toggles the attribute and swaps the navbar icon (moon ↔ sun).

**Markdown button is not a standard icon button.** `#btn-split` extends `.nav-btn` with custom overrides: `width: auto`, horizontal padding, a teal-tinted border, and an inline `<span>Markdown</span>` text label. Its active state fills solid accent with black text. Do not remove the `<span>` or collapse it back to icon-only — the visible label is an explicit UX requirement.

**Desktop auto-collapse is a one-shot timer.** The `setTimeout` in `init()` fires once, 5 seconds after page load, and closes the drawer + markdown pane if both were auto-opened. It does not run again. If the user manually opens either panel before the timer fires, `closeDrawer()` / `toggleSplit()` will still execute — this is acceptable because the user can re-open immediately and the timer is short.

**Quill placeholder is disabled.** The `placeholder` option is intentionally omitted from the Quill constructor and `.ql-editor.ql-blank::before` is set to `display: none`. This prevents the ghost "Start writing…" text from appearing in empty files, which caused the cursor to land mid-word on click. Instead, `initQuill()` calls `quill.focus()` and `quill.setSelection(0, 0)` after mounting so the cursor blinks at position 0 immediately — no click required. Do not re-add a placeholder string.

**Markdown pane tab bar (`#md-tabbar`).** Sits above `.md-pane-header` inside `#md-pane`. Rendered by `renderMdTabs()`, which is called from `renderTabs()` (keeping it in sync with every open/close/switch operation) and from `toggleSplit()` (populating it when the pane first opens). Each tab uses the `.md-tab` class with a right-to-left slide-in animation (`@keyframes md-tab-in`). The active tab has a 2px teal top border and code-colour text. Clicking any tab calls `switchTab(id)` — the editor and markdown pane always show the same file. There is no independent "markdown-only" browsing mode.

### Drag & drop (file tree)
- `applyDrag(row, type, id)` — makes a row draggable, sets `drag.type` / `drag.id` on dragstart
- `applyFolderDrop(row, folderId)` — handles dropping **into** a folder (highlights with dashed accent border)
- `applyRowDrop(row, type, id, parentId)` — handles dropping **above/below** a row (shows 2px accent line)
- `isFolderDescendant(targetId, ancestorId)` — guards against dropping a folder into its own subtree
- `moveItem(...)` — splices the item to the correct position in `S.files` or `S.folders`

## File structure

```
editorapp/
├── index.html      ← entire application
├── CLAUDE.md       ← this file
└── README.md       ← GitHub / deployment docs
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + S` | Save current file |
| `⌘/Ctrl + E` | Export current file as `.md` |
| `⌘/Ctrl + M` | Toggle markdown split view |
| `⌘/Ctrl + W` | Close current tab |
| `⌘/Ctrl + F` | Toggle file explorer drawer |
| `Esc` | Close file explorer drawer |

## Deployment

**GitHub Pages** — push `index.html` to any public repo, enable Pages from Settings → Pages → branch `main`, root `/`. Live in ~60 seconds at `https://<username>.github.io/<repo>`.

No build step. No CI needed. `git push` = deploy.

## Fonts

| Font | Stack | Purpose |
|---|---|---|
| Inter | `'Inter', sans-serif` | Default editor font — modern, readable |
| Merriweather | `'Merriweather', serif` | Serif option for long-form reading |
| JetBrains Mono | `'JetBrains Mono', monospace` | Monospace — also used for UI (`--f-mono`) |

All three are loaded from Google Fonts. Syne remains the UI font (`--f-ui`).

## Known quirks & things to watch

- Quill 1.3.7 is old but stable. Quill 2.x has breaking API changes — do not upgrade without testing the toolbar and text-change handler.
- `marked.parse()` is synchronous in v9. If upgrading Marked, check if the API changed to async.
- `TurndownService` is instantiated once as `TD` at the top level. It's stateless and safe to reuse.
- On iOS Safari, `100vh` includes the browser chrome. The app uses `100dvh` to avoid this.
- The modal system is imperative (creates/removes DOM nodes). There is intentionally no modal state in `S` — keep it that way to avoid re-render complexity.
- Light theme colours are tuned for WCAG contrast against `#f0f2f5`. If changing `--c-accent` in light mode, re-verify contrast on both `--c-surface` and `--c-base` backgrounds.
- The auto-collapse timer in `init()` uses the module-level `S.splitOpen` flag to decide whether to call `toggleSplit()`. If you restructure `init()`, ensure the split state is set before the timer callback runs.
- `#btn-split` has explicit `width: auto` to accommodate the text label — do not apply a fixed `width` via `.nav-btn` overrides or the text will be clipped.
- Do not re-add a Quill `placeholder` string or restore `.ql-editor.ql-blank::before` content — the intentionally empty editor with auto-focus is the designed behaviour for new files.
- `#md-tabbar` uses `:empty { display: none }` so it collapses cleanly when no tabs are open (e.g. right after a workspace wipe). Do not add a minimum height or it will show as a blank strip.
