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
- **Navbar** — always visible. Hamburger opens the file drawer; split button toggles markdown pane.
- **File drawer** — slides in as an overlay from the left. Contains the full file tree, import/export actions.
- **Editor pane** — always fills remaining space. Quill renders here.
- **Markdown pane** — hidden by default. On desktop: slides in as a split (resizable divider). On mobile (`≤767px`): replaces the editor pane full-screen.

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

**Quill toolbar overflow.** The toolbar must have `overflow: visible` (not `auto` or `hidden`). Any non-visible overflow creates a clipping context that hides the absolutely-positioned heading/format picker dropdowns.

### Drag & drop (file tree)
- `applyDrag(row, type, id)` — makes a row draggable, sets `drag.type` / `drag.id` on dragstart
- `applyFolderDrop(row, folderId)` — handles dropping **into** a folder (highlights with dashed accent border)
- `applyRowDrop(row, type, id, parentId)` — handles dropping **above/below** a row (shows 2px accent line)
- `isFolderDescendant(targetId, ancestorId)` — guards against dropping a folder into its own subtree
- `moveItem(...)` — splices the item to the correct position in `S.files` or `S.folders`

## File structure

```
markforge/
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

## Known quirks & things to watch

- Quill 1.3.7 is old but stable. Quill 2.x has breaking API changes — do not upgrade without testing the toolbar and text-change handler.
- `marked.parse()` is synchronous in v9. If upgrading Marked, check if the API changed to async.
- `TurndownService` is instantiated once as `TD` at the top level. It's stateless and safe to reuse.
- On iOS Safari, `100vh` includes the browser chrome. The app uses `100dvh` to avoid this.
- The modal system is imperative (creates/removes DOM nodes). There is intentionally no modal state in `S` — keep it that way to avoid re-render complexity.
