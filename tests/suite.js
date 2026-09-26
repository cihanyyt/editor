// Regression suite for index.html — run via tests/run-tests.sh (headless Chrome).
// run-tests.sh injects this file after the app's own <script>, so every app global
// (S, openFile, mdToHtml, quill, …) is reachable. Tests run sequentially against one
// live app instance; results are written to <pre id="TEST-RESULTS">.

(() => {
  const tests   = [];
  const test    = (name, fn, opts = {}) => tests.push({ name, fn, ...opts });
  const wait    = ms => new Promise(r => setTimeout(r, ms));
  const assert  = (cond, msg) => { if (!cond) throw new Error(msg); };
  // Poll for async work (e.g. JSZip import) instead of guessing a fixed delay
  const waitFor = async (cond, ms = 5000) => {
    for (const end = Date.now() + ms; Date.now() < end; await wait(25)) if (cond()) return;
    throw new Error('timed out waiting for ' + cond.toString().slice(0, 80));
  };
  const errors  = [];
  const alerts  = [];

  window.__pwned = [];                                   // exploit payloads push their id here
  window.addEventListener('error', e => errors.push(e.message));
  window.alert   = m => alerts.push(String(m));          // headless must never block on a dialog
  window.confirm = () => true;

  // ── Helpers (use the same code paths as the real UI) ─────────────────────
  let seq = 0;
  const newFile = htmlContent => {
    const f = { id: 'test' + (++seq), name: 'test' + seq + '.md', folderId: null, htmlContent, lastModified: 0 };
    S.files.push(f); openFile(f.id);
    return f;
  };
  const openMd     = md   => newFile(mdToHtml(md));      // = import / drag-drop / zip import path
  const openStored = html => newFile(html);              // = HTML already stored in the workspace
  const editorHtml = ()   => quill.root.innerHTML;
  const mdPane     = ()   => document.getElementById('md-textarea');
  async function mdPaneEdit(md) {                        // = user typing in the markdown pane
    mdPane().value = md;
    mdPane().dispatchEvent(new Event('input'));
    await wait(800);                                     // > 600ms md→quill debounce
  }
  const payload = id => `<script>top.__pwned.push('${id}')<\/script>`;
  const jsUrl   = id => `javascript:top.__pwned.push('${id}')`;
  const notExecuted = id => assert(!__pwned.includes(id), `payload ${id} EXECUTED`);

  // ═════════════════════════════════════════════════════════════════════════
  // SECURITY — every payload here executed before the DOMPurify fix
  // ═════════════════════════════════════════════════════════════════════════
  test('xss: iframe srcdoc inside HTML table (file open)', async () => {
    openMd(`<table><tr><td><iframe srcdoc="${payload('S1')}"></iframe></td></tr></table>`);
    await wait(500); notExecuted('S1');
  });

  test('xss: iframe srcdoc inside GFM table cell (file open)', async () => {
    openMd(`| a |\n|---|\n| <iframe srcdoc="${payload('S2')}"></iframe> |`);
    await wait(500); notExecuted('S2');
  });

  test('xss: iframe srcdoc typed into markdown pane', async () => {
    openStored('<p>hello</p>');
    await mdPaneEdit(`hello\n\n<iframe srcdoc="${payload('S3')}"></iframe>`);
    await wait(300); notExecuted('S3');
  });

  test('xss: javascript: URL with leading space', async () => {
    openMd(`<table><tr><td><iframe src=" ${jsUrl('S4')}"></iframe></td></tr></table>`);
    await wait(500); notExecuted('S4');
  });

  test('xss: javascript: URL with tab inside scheme', async () => {
    openMd(`<table><tr><td><iframe src="java&#9;script:top.__pwned.push('S5')"></iframe></td></tr></table>`);
    await wait(500); notExecuted('S5');
  });

  test('xss: escaped HTML text stays text through turndown round trip', async () => {
    const shown = `<iframe srcdoc="${payload('S6')}"></iframe>`;
    const asText = shown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    openStored(`<p>Example: ${asText}</p>`);
    await wait(200); syncMdPane();
    assert(mdPane().value.includes('\\<iframe'), 'markdown pane did not escape "<iframe": ' + mdPane().value.slice(0, 80));
    await mdPaneEdit(mdPane().value + ' ');
    await wait(300);
    notExecuted('S6');
    assert(editorHtml().includes('&lt;iframe'), 'text was not preserved as visible text');
  });

  test('xss: stored raw HTML with <img onerror> (initQuill converter)', async () => {
    openStored(`<p>x<img src="x:" onerror="top.__pwned.push('S7')"></p>`);
    await wait(500); notExecuted('S7');
  });

  test('xss: stored table HTML is re-sanitized by TableBlot', async () => {
    openStored(`<table><tbody><tr><td>cell<iframe srcdoc="${payload('S8')}"></iframe></td></tr></tbody></table>`);
    await wait(500); notExecuted('S8');
    assert(!editorHtml().includes('<iframe'), 'iframe survived inside table');
    assert(editorHtml().includes('cell'), 'table text lost');
  });

  test('xss: javascript: link is neutralised in reading mode', async () => {
    openMd(`<table><tr><td><a href=" ${jsUrl('S9')}">Read more</a></td></tr></table>`);
    await wait(200);
    toggleReadingMode();
    try { quill.root.querySelector('a')?.click(); await wait(300); }
    finally { toggleReadingMode(); }
    notExecuted('S9');
  });

  test('xss: sanitizer strips active/obscure vectors', () => {
    const cases = {
      'svg xlink:href':  '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
      'object data':     '<object data="javascript:alert(1)"></object>',
      'form action':     '<form action="https://evil.example"><input type="password"></form>',
      'script':          '<script>alert(1)</script>',
      'event handler':   '<p onclick="alert(1)">x</p>',
      'embed':           '<embed src="https://evil.example/x.swf">',
      'data: link':      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    };
    for (const [label, html] of Object.entries(cases)) {
      const out = mdToHtml(html);
      assert(!/<(svg|object|form|input|script|embed|iframe)\b|onclick|javascript:|data:text/i.test(out), `${label} survived: ${out}`);
    }
  });

  test('zip export: folder names cannot produce traversal paths', async () => {
    S.folders.push({ id: 'zdot', name: '..', parentId: null, collapsed: false },
                   { id: 'zsub', name: 'a/../b', parentId: 'zdot', collapsed: false });
    S.files.push({ id: 'zfile', name: 'z.md', folderId: 'zsub', htmlContent: '<p>z</p>', lastModified: 0 });
    const blob  = await captureExport();
    const paths = Object.keys((await JSZip.loadAsync(blob)).files);
    assert(paths.every(p => !p.split('/').some(seg => seg === '..' || seg === '.')), 'traversal segment in ' + paths.join(', '));
    assert(paths.includes('_/a_.._b/z.md'), 'unexpected path: ' + paths.join(', '));
    S.folders = S.folders.filter(f => !f.id.startsWith('z'));
    S.files   = S.files.filter(f => f.id !== 'zfile');
  });

  test('import: oversize files are rejected', () => {
    const before = S.files.length;
    alerts.length = 0;
    handleImportMd({ target: { files: [{ name: 'big.md', size: MAX_MD_BYTES + 1 }], value: 'x' } });
    handleImportWorkspace({ target: { files: [{ name: 'big.zip', size: MAX_ZIP_BYTES + 1 }], value: 'x' } });
    assert(S.files.length === before, 'oversize file was imported');
    assert(alerts.length === 2 && alerts.every(a => a.includes('too large')), 'expected two "too large" alerts, got ' + JSON.stringify(alerts));
  });

  // ═════════════════════════════════════════════════════════════════════════
  // RENDERING / BEHAVIOUR
  // ═════════════════════════════════════════════════════════════════════════
  const SAMPLE = [
    '# Title', '## Sub', '### Third',
    'Some **bold**, *italic*, `code`, ==highlight==.',
    '- a\n- b', '1. one\n2. two',
    '> quoted **text**',
    '```\nconst x = 1 < 2;\n```',
    '---',
    '| Col | Other |\n|---|---|\n| **b** | [lnk](https://example.org) |',
    '[https](https://example.org) [mail](mailto:a@b.c)',
    '![img](https://example.org/p.png)',
    'math: x < 5 and a<b',
  ].join('\n\n');
  let sampleHtml = '';

  test('render: headings h1–h3', async () => {
    openMd(SAMPLE); await wait(200); sampleHtml = editorHtml();
    assert(/<h1>Title<\/h1>/.test(sampleHtml) && /<h2>Sub<\/h2>/.test(sampleHtml) && /<h3>Third<\/h3>/.test(sampleHtml), sampleHtml.slice(0, 120));
  });
  test('render: bold / italic / inline code', () => {
    assert(/<strong>bold<\/strong>/.test(sampleHtml) && /<em>italic<\/em>/.test(sampleHtml) && /<code>code<\/code>/.test(sampleHtml), 'inline formats missing');
  });
  test('render: ==highlight== → <mark>', () => assert(/<mark>highlight<\/mark>/.test(sampleHtml), 'mark missing'));
  test('render: bullet + ordered lists', () => assert(/<ul>.*<li>a<\/li>/s.test(sampleHtml) && /<ol>.*<li>one<\/li>/s.test(sampleHtml), 'lists missing'));
  test('render: blockquote keeps inline formatting', () => assert(/<blockquote>quoted <strong>text<\/strong><\/blockquote>/.test(sampleHtml), 'blockquote wrong'));
  test('render: code block keeps "<"', () => assert(/class="ql-syntax"/.test(sampleHtml) && sampleHtml.includes('1 &lt; 2'), 'code block wrong'));
  test('render: horizontal rule', () => assert(/<hr>/.test(sampleHtml), 'hr missing'));
  test('render: table with bold + link inside', () => assert(/<table>.*<strong>b<\/strong>.*href="https:\/\/example.org".*<\/table>/s.test(sampleHtml), 'table wrong'));
  test('render: absolute + mailto links kept', () => {
    // Relative / protocol-less links are not asserted: under file:// Quill resolves them to
    // the file: scheme and rewrites to about:blank. They work on https hosting.
    assert(sampleHtml.includes('href="https://example.org"') && sampleHtml.includes('href="mailto:a@b.c"'), 'links missing');
  });
  test('render: remote image', () => assert(sampleHtml.includes('src="https://example.org/p.png"'), 'image missing'));
  test('render: plain text "<" is preserved', () => assert(sampleHtml.includes('x &lt; 5 and a&lt;b'), 'text with < mangled'));

  test('render: nested list indent survives reopen', async () => {
    const f = openStored('<ul><li>top</li><li class="ql-indent-1">nested</li></ul>');
    await wait(100);
    openStored('<p>other</p>'); await wait(100);
    switchTab(f.id); await wait(100);
    assert(editorHtml().includes('ql-indent-1'), 'indent class lost: ' + editorHtml());
  });

  test('render: ~~strike~~ shows strikethrough', async () => {
    openMd('a ~~gone~~ b'); await wait(100);
    assert(/<s>gone<\/s>/.test(editorHtml()), 'strike lost: ' + editorHtml());
  }, { known: 'pre-existing: Quill has no matcher for marked\'s <del>' });

  test('markdown pane: shows markdown for the open file', async () => {
    openMd('# Head\n\nBody **b**'); await wait(100); syncMdPane();
    assert(mdPane().value === '# Head\n\nBody **b**', 'got: ' + JSON.stringify(mdPane().value));
  });

  test('markdown pane: "x < 5" round-trips unescaped', async () => {
    openMd('x < 5'); await wait(100); syncMdPane();
    assert(mdPane().value === 'x < 5', 'got: ' + JSON.stringify(mdPane().value));
  });

  test('markdown pane: edit syncs to editor + file, no loop', async () => {
    const f = openMd('start'); await wait(100); syncMdPane();
    await mdPaneEdit('start\n\nadded **line**\n\n| a |\n|---|\n| 1 |\n\n==hl==');
    const h = editorHtml();
    assert(/added <strong>line<\/strong>/.test(h) && /<table>/.test(h) && /<mark>hl<\/mark>/.test(h), 'editor not updated: ' + h);
    assert(f.htmlContent.includes('added <strong>line</strong>'), 'file.htmlContent not updated');
    const md = mdPane().value;
    await wait(400);
    assert(mdPane().value === md, 'markdown pane changed on its own (sync loop)');
  });

  test('tabs: user edits survive switching tabs', async () => {
    const a = openMd('alpha'); await wait(100);
    quill.insertText(quill.getLength() - 1, ' EDITED', 'user');
    openMd('beta'); await wait(100);
    switchTab(a.id); await wait(100);
    assert(editorHtml().includes('alpha EDITED'), 'edit lost: ' + editorHtml());
  });

  test('export: current file → markdown', async () => {
    openMd('# Doc\n\n- item\n\n==hl=='); await wait(100);
    flushContent();
    const md = htmlToMd(getFile(S.activeTab).htmlContent);
    assert(md === '# Doc\n\n*   item\n\n==hl==','got: ' + JSON.stringify(md));
  });

  test('workspace: zip export → import round trip keeps folders + content', async () => {
    S.folders = [{ id: 'rf', name: 'notes', parentId: null, collapsed: false },
                 { id: 'rs', name: 'sub', parentId: 'rf', collapsed: false }];
    S.files   = [{ id: 'r1', name: 'root.md', folderId: null, htmlContent: '<h1>Root</h1>', lastModified: 0 },
                 { id: 'r2', name: 'deep.md', folderId: 'rs', htmlContent: '<p><strong>deep</strong></p>', lastModified: 0 }];
    S.openTabs = []; S.activeTab = null; quill = null;
    const blob = await captureExport();
    handleImportWorkspace({ target: { files: [new File([blob], 'ws.zip')], value: '' } });
    await waitFor(() => S.files.length === 2 && S.files.every(f => !f.id.startsWith('r')));
    const deep = S.files.find(f => f.name === 'deep.md');
    assert(S.files.length === 2 && deep, 'files: ' + S.files.map(f => f.name));
    const sub = getFolder(deep.folderId);
    assert(sub?.name === 'sub' && getFolder(sub.parentId)?.name === 'notes', 'folder structure lost');
    assert(deep.htmlContent.includes('<strong>deep</strong>'), 'content lost: ' + deep.htmlContent);
  });

  test('zip import: ".." segments are dropped', async () => {
    const zip = new JSZip();
    zip.file('../../evil.md', 'x');
    zip.file('a/./../b.md', 'y');
    handleImportWorkspace({ target: { files: [new File([await zip.generateAsync({ type: 'blob' })], 'e.zip')], value: '' } });
    await waitFor(() => S.files.length === 2 && !S.files.some(f => f.name === 'root.md'));
    assert(S.folders.every(f => f.name !== '..' && f.name !== '.'), 'folders: ' + S.folders.map(f => f.name));
    assert(S.files.map(f => f.name).sort().join() === 'b.md,evil.md', 'files: ' + S.files.map(f => f.name));
  });

  test('no uncaught errors during the run', () => assert(errors.length === 0, errors.join(' | ')));

  // Capture the blob exportWorkspace() would download, without triggering a download.
  async function captureExport() {
    const realDl = window.dl;
    try {
      return await new Promise(res => { window.dl = (_name, blob) => res(blob); exportWorkspace(); });
    } finally { window.dl = realDl; }
  }

  // ── Runner ───────────────────────────────────────────────────────────────
  async function run() {
    const lines = [];
    // Only require libraries the page under test actually includes (older versions lack DOMPurify)
    const libs  = { Quill: 'quill', marked: 'marked', TurndownService: 'turndown', JSZip: 'jszip', DOMPurify: 'dompurify' };
    const deps  = Object.entries(libs)
      .filter(([global, src]) => document.querySelector(`script[src*="/${src}/"]`) && typeof window[global] === 'undefined')
      .map(([global]) => global);
    if (deps.length) return report([`RESULT: ERROR — dependencies failed to load (${deps.join(', ')}). Offline?`]);

    await wait(300);
    if (!S.splitOpen) toggleSplit();
    let pass = 0, fail = 0, xfail = 0, xpass = 0;
    for (const t of tests) {
      let err = null;
      try {
        await Promise.race([t.fn(), wait(8000).then(() => { throw new Error('timeout'); })]);
      } catch (e) { err = e; }
      if (t.known) {
        if (err) { xfail++; lines.push(`XFAIL ${t.name}  (known: ${t.known})`); }
        else     { xpass++; lines.push(`XPASS ${t.name}  (now passes — remove the "known" flag)`); }
      } else if (err) { fail++; lines.push(`FAIL  ${t.name}\n      ${err.message}`); }
      else            { pass++; lines.push(`PASS  ${t.name}`); }
    }
    lines.push('', `RESULT: ${pass} passed, ${fail} failed, ${xfail} known failures` + (xpass ? `, ${xpass} unexpectedly passed` : ''));
    report(lines);
  }
  function report(lines) {
    const pre = document.createElement('pre');
    pre.id = 'TEST-RESULTS';
    pre.textContent = lines.join('\n');
    document.body.appendChild(pre);
  }
  run().catch(e => report(['RESULT: ERROR — runner crashed: ' + e.stack]));
})();
