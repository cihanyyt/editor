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
- **Navbar** — always visible. Contains (left→right): hamburger (`#btn-drawer`) toggles the file drawer; filename display; **font picker** (`#font-picker`); **font size picker** (`#size-picker`, options 13/15/16/18/20px); **Markdown split button** (`#btn-split`); **dark/light mode toggle** (`#btn-theme`, moon/sun icon); divider; save button. Font picker, size picker, and Markdown button share the same `height: 36px` so they align visually.
- **File drawer** — inline push sidebar on the left (animates `width` 0 → 280px). Pushes the editor; does NOT overlay it, so the editor stays interactive while the drawer is open. Open by default on desktop (`>767px`), hidden by default on mobile (`≤767px`).
- **Desktop onboarding auto-collapse** — on first load at `>1200px`, both the file drawer and the markdown pane open automatically so the user can see all panels. After **5 seconds** both collapse via a `setTimeout` in `init()`. This is a one-time hint; toggling either panel manually after that works normally.
- **Editor pane** — always fills remaining space. Quill renders here. Content width is capped at `856px` via `max-width` + `margin: auto` so text never reflows when the drawer toggles. `#tabbar` lives **inside** `#editor-pane` as its first flex child (not between `#navbar` and `#main-area`) so it sits at the same vertical level as `#md-tabbar`.
- **Markdown pane** — hidden by default. On desktop: slides in as a split (resizable divider). On mobile (`≤767px`): replaces the editor pane full-screen. Contains `#md-tabbar` as its first flex child (height: `var(--tab-h)` to match the editor tab bar), then `.md-pane-header`, then `#md-textarea`. Tabs mirror `S.openTabs`, slide in from the right, and switch both the editor and markdown view on click.

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

**Light is the default theme.** `:root` holds the light palette. Dark mode is activated by adding `data-theme="dark"` to `<html>`, which triggers `html[data-theme="dark"]` overrides. The module-level flag `_isDark` starts as `false`; `toggleTheme()` sets/removes the attribute and swaps the icon (moon when in light mode → click for dark; sun when in dark mode → click for light). Do not swap the palette back to dark-as-default without also updating `_isDark`, the initial SVG icon, and swapping the `:root` / `html[data-theme]` blocks.

**Theme system — CSS variables only.** Every colour in the app is a CSS custom property (`--c-base`, `--c-surface`, `--c-raised`, `--c-border`, `--c-border-hi`, `--c-accent`, `--c-accent-dim`, `--c-accent2`, `--c-text`, `--c-text2`, `--c-text3`, `--c-danger`, `--c-code`). Dark mode is the default (values on `:root`). Light mode is activated by adding `data-theme="light"` to `<html>`, which triggers an `html[data-theme="light"]` block that overrides all tokens. Because Quill toolbar/editor colours and every other surface already reference these variables, the entire UI re-themes without any JavaScript DOM walking. The module-level flag `_isDark` tracks the current state; `toggleTheme()` toggles the attribute and swaps the navbar icon (moon ↔ sun).

**Markdown button is not a standard icon button.** `#btn-split` extends `.nav-btn` with custom overrides: `width: auto`, horizontal padding, a teal-tinted border, and an inline `<span>Markdown</span>` text label. Its active state fills solid accent with black text. Do not remove the `<span>` or collapse it back to icon-only — the visible label is an explicit UX requirement.

**Desktop auto-collapse is a one-shot timer.** The `setTimeout` in `init()` fires once, 5 seconds after page load, and closes the drawer + markdown pane if both were auto-opened. It does not run again. If the user manually opens either panel before the timer fires, `closeDrawer()` / `toggleSplit()` will still execute — this is acceptable because the user can re-open immediately and the timer is short.

**Quill placeholder is disabled.** The `placeholder` option is intentionally omitted from the Quill constructor and `.ql-editor.ql-blank::before` is set to `display: none`. This prevents the ghost "Start writing…" text from appearing in empty files, which caused the cursor to land mid-word on click. Instead, `initQuill()` calls `quill.focus()` and `quill.setSelection(0, 0)` after mounting so the cursor blinks at position 0 immediately — no click required. Do not re-add a placeholder string.

**Markdown pane tab bar (`#md-tabbar`).** Sits above `.md-pane-header` inside `#md-pane`. Rendered by `renderMdTabs()`, which is called from `renderTabs()` (keeping it in sync with every open/close/switch operation) and from `toggleSplit()` (populating it when the pane first opens). Each tab uses the `.md-tab` class with a right-to-left slide-in animation (`@keyframes md-tab-in`). The active tab has a 2px teal top border and code-colour text. Clicking any tab calls `switchTab(id)` — the editor and markdown pane always show the same file. There is no independent "markdown-only" browsing mode.

**Font size.** Controlled by `--font-size-editor` CSS custom property (default `16px`). `.ql-editor` uses `font-size: var(--font-size-editor)`. The navbar `#size-picker` select calls `setFontSize(value)` which updates the property via `document.documentElement.style.setProperty`. Do not hardcode `font-size` on `.ql-editor`.

**Default editor font is JetBrains Mono.** `--f-editor` is set to `'JetBrains Mono', monospace` in `:root`. The font picker `#font-picker` has `selected` on the JetBrains Mono option. Both must be kept in sync if the default changes.

**Scrollbars are globally hidden.** `* { scrollbar-width: none; }` and `*::-webkit-scrollbar { display: none; }` are set globally. All scrollable elements (`#file-tree`, `.ql-editor`, `#md-textarea`, `#tabbar`, `#md-tabbar`) retain their `overflow: auto/scroll` properties so content is still scrollable — just without a visible track. Do not add individual `::-webkit-scrollbar` rules; the global rule covers everything.

**Beforeunload save prompt.** A single `beforeunload` listener fires `e.preventDefault()` + `e.returnValue = ''` when `S.files.length > 0`. This triggers the browser's native "Leave site?" dialog. Modern browsers do not allow custom messages or buttons in this dialog. `showLeaveWarning()` is a separate imperative modal (with an "Export Workspace" button) that can be called programmatically from other code paths — it is NOT called from `beforeunload` itself (that timing is too late for DOM operations).

**Ctrl+click links.** A delegated `click` listener on `#editor-pane` (which is never torn down) intercepts clicks where `e.ctrlKey || e.metaKey` is true and the target is inside an `<a href>`. It reads the raw `href` attribute (not `a.href`) to avoid the browser resolving protocol-less values like `www.google.com` as relative paths against the page base URL. If no URL scheme is detected (regex `/^[a-z][a-z\d+\-.]*:/i`), `https://` is prepended before calling `window.open`. Do not use `a.href` (the DOM property) here — it always returns an absolute URL resolved against the page origin.

### Drag & drop (file tree)
- `applyDrag(row, type, id)` — makes a row draggable, sets `drag.type` / `drag.id` on dragstart
- `applyFolderDrop(row, folderId)` — handles all interactions when hovering over a folder row using **three vertical zones**: top 25% → `drop-above` (reorder before folder), middle 50% → `drop-into` (move inside folder), bottom 25% → `drop-below` (reorder after folder). Drop into moves the item into the folder; drop above/below reorders among siblings using `moveItem` for folder→folder, or changes `folderId` to the target folder's parent for file→folder.
- `applyRowDrop(row, type, id, parentId)` — handles above/below reordering for **file rows only**. Its `dragover` and `drop` handlers both early-return for `type === 'folder'` to prevent double-firing with `applyFolderDrop`.
- `isFolderDescendant(targetId, ancestorId)` — guards against dropping a folder into its own subtree
- `moveItem(...)` — splices the item to the correct position in `S.files` or `S.folders`; child files/folders move with their parent automatically because they reference parent by ID, not by array position

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
- `#tabbar` is now inside `#editor-pane`, not between `#navbar` and `#main-area`. If you move it back out, the two tab bars will no longer be vertically aligned.
- Protocol-less link values (`www.example.com`) stored by Quill must be opened using the raw `getAttribute('href')` + scheme-prefix logic, not `a.href` (DOM property). Using `a.href` resolves them as relative paths against the page's base URL and sends the user to the wrong location.
- Light mode is the default. `:root` holds light colours; `html[data-theme="dark"]` overrides them. The `_isDark` JS flag starts as `false`. Swapping back to dark-default requires changing all three in tandem.
- Scrollbars are hidden globally via `* { scrollbar-width: none }` + `*::-webkit-scrollbar { display: none }`. Do not add per-element scrollbar rules — they are superseded by the global rule and create maintenance noise.
- `showLeaveWarning()` provides a custom "Export Workspace" modal for programmatic triggers (e.g. future keyboard shortcuts). It is distinct from the `beforeunload` native dialog and must not be called inside a `beforeunload` handler.
