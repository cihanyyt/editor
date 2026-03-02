# editorapp

A single-file, mobile-first documentation editor. Write in rich text, see clean Markdown live alongside. No install, no build step, no backend — the entire application is one `index.html` you can self-host anywhere in seconds.

> Built entirely with [Claude Code](https://claude.ai/claude-code) by Anthropic.

---

## Goal

Most documentation tools are either too heavy (full IDEs, npm setups, cloud accounts) or too bare (plain textarea with no formatting). editorapp sits in between: a focused writing environment that gives you a rich-text editor and live Markdown output in the same view, packaged as a single file you own completely.

---

## Features

### Writing
- **Rich text editor** powered by Quill — headings, bold, italic, underline, strikethrough, lists, blockquotes, code blocks, links, horizontal rules
- **`==highlight==` syntax** — wrap text in `==double equals==` to apply a highlight mark; works in both the rich text and Markdown panes
- **Section collapse** — hover over any heading in the editor to reveal a collapse toggle; fold and unfold sections to focus on what matters
- **Instant cursor on new files** — new files open empty with the cursor already blinking at position 0, ready to type
- **Clickable links** — hold `Ctrl` (or `Cmd`) and click any link in the editor to open it in a new tab; protocol-less URLs like `www.example.com` are handled correctly
- **Live Markdown split pane** — every keystroke converts to clean Markdown in real time (150 ms debounce)
- **Bidirectional sync** — edit the Markdown directly in the split pane; the rich text view updates after a short pause
- **Markdown pane scroll sync** — scrolling the editor scrolls the Markdown pane proportionally; navigating to a heading via the sidebar also scrolls the Markdown pane to the matching line
- **Resizable split divider** — drag to set your preferred editor/markdown ratio on desktop
- **Font picker** — switch between Inter, Merriweather, and JetBrains Mono (default) via a custom dropdown that matches the rest of the UI
- **Font size picker** — choose from 13, 15, 16, 18, or 20 px; updates the editor instantly

### Organisation
- **File & folder tree** — create, rename, nest, and delete files and folders
- **Inline document outline** — expand any file in the tree to see its headings; click a heading to jump the editor (and Markdown pane) directly to that section
- **Drag & drop reordering** — drag files and folders with three drop zones per row: top edge reorders above, bottom edge reorders below, middle drops inside a folder; moving a folder moves all its contents
- **Multi-tab interface** — keep several files open and switch between them without losing edits
- **Unified tab bar** — the editor tabs and Markdown pane tabs sit at the same vertical level, forming a continuous strip across the full split width
- **Markdown pane tabs** — the Markdown split pane has its own tab bar mirroring all open files; tabs slide in from the right and let you switch files without leaving the Markdown view

### Workspace
- **Export single file** — download the active document as a `.md` file
- **Import `.md`** — drag a file onto the window or use the import button
- **Export workspace** — zip your entire folder structure as `.md` files with paths preserved
- **Import workspace** — restore a previously exported `.zip`

### UI / UX
- **Live word count** — the Markdown pane header shows a live word count for the current document
- **Light mode by default** — warm cream palette out of the box; toggle the moon/sun button for a phosphor-green dark mode; the full theme switches instantly via CSS variables with no JavaScript DOM walking
- **No visible scrollbars** — all scrollable areas (editor, file tree, markdown pane, tab bars) scroll normally but without a visible track
- **Save reminder on exit** — closing or navigating away while files are open triggers a browser "Leave site?" prompt to prevent accidental data loss
- **Privacy mode** — hides all content behind a screen lock; click to reveal
- **Wide view** — removes the editor max-width cap for full-viewport writing
- **Reading mode** — locks the editor and hides the toolbar for distraction-free reading
- **Mobile-first** — works on phones; the Markdown pane goes full-screen on mobile instead of splitting
- **Desktop onboarding** — on first load at large viewport (>1200 px) both the sidebar and Markdown pane open briefly so you can see all panels, then auto-collapse after 5 seconds
- **Keyboard shortcuts** — common actions bound to `⌘/Ctrl` combos (see below)

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + M` | Toggle Markdown split view |
| `⌘/Ctrl + S` | Save current file |
| `⌘/Ctrl + E` | Export current file as `.md` |
| `⌘/Ctrl + W` | Close current tab |
| `⌘/Ctrl + F` | Toggle file explorer |
| `Esc` | Close file explorer |

---

## Tech stack

All dependencies are loaded from CDN — no `npm install` required.

| Library | Version | Purpose |
|---|---|---|
| [Quill.js](https://quilljs.com) | 1.3.7 | Rich text editor |
| [Turndown](https://github.com/mixmark-io/turndown) | 7.1.2 | HTML → Markdown |
| [Marked](https://marked.js.org) | 9.1.6 | Markdown → HTML |
| [JSZip](https://stuk.github.io/jszip) | 3.10.1 | Workspace zip export/import |

---

## Deploy in 60 seconds (GitHub Pages)

1. Fork or create a new GitHub repository.
2. Add `index.html` to the root.
3. Go to **Settings → Pages**, set source to branch `main`, root `/`.
4. Your editor is live at `https://<username>.github.io/<repo>` within a minute.

No CI, no build pipeline. `git push` = deploy.

---

## Generated with Claude Code

This project was designed and built entirely through [Claude Code](https://claude.ai/claude-code) — Anthropic's agentic CLI for software engineering. Every feature, layout decision, CSS pattern, and architectural constraint was implemented in conversation with Claude, including:

- The push-sidebar layout (no overlay, editor stays interactive)
- The bidirectional Quill ↔ Markdown sync with loop-prevention guards
- The CSS-variable-only theme system (dark/light with zero JS DOM walking)
- The flex-height chain that makes the editor scroll correctly
- The drag-and-drop file tree with descendant-cycle protection
- The empty-file cursor UX (placeholder suppressed, auto-focus at position 0)
- The markdown pane tab bar with slide-in animation and active-file indicator
- The unified tab bar layout (editor and markdown tabs at identical vertical level)
- The three-zone folder drag & drop (reorder above/below/into, folders carry their contents)
- The Ctrl+click link handler with protocol-less URL correction
- The custom font and size picker dropdowns wired to CSS custom properties
- The global scrollbar-hiding approach (hidden but scrollable)
- The beforeunload save guard and `showLeaveWarning()` export modal
- The `==highlight==` mark blot registered in Quill with matching Turndown/marked extensions
- The section collapse overlay with dynamic heading-aligned positioning
- The proportional scroll sync between editor and markdown pane
- The inline document outline in the file tree with heading navigation

> If you're curious how it was built, read [`CLAUDE.md`](./CLAUDE.md) — it documents every architectural pattern and quirk for the AI assistant to reference across sessions.
