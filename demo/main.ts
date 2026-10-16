import { registerTextflow, editCssDeclarations, createDocument, createPageFromLayout, parseDocument, type PageContent, type PageTemplate } from '../src/index.js';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution.js';
import 'monaco-editor/esm/vs/language/css/monaco.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import { templates, initialContent } from './templates.js';
import { loadSaved, storageKey } from './storage.js';
import './style.css';
self.MonacoEnvironment = { getWorker: (_id, label) => label === 'css' ? new CssWorker() : new EditorWorker() };
registerTextflow();
let library = templates.map(template => ({ ...structuredClone(template), boxes: template.boxes.map(box => ({ ...structuredClone(box), content: structuredClone(initialContent[box.id]) })) })) as PageTemplate[];
let content: PageContent = {}, selected = 'title', cssPage = false, pageIndex = 0;
let activeDocument = createDocument([createPageFromLayout(library[0])]);
let interactionMode: 'content' | 'layout' = 'content';
try {
  const saved = loadSaved();
  if (saved) {
    library = saved.templates; activeDocument = saved.document; pageIndex = saved.pageIndex;
    interactionMode = saved.interactionMode === 'layout' ? 'layout' : 'content';
  }
} catch { /* Keep the stored data intact if it cannot be read. */ }
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<header class="app-header">
  <a class="brand" href="/" aria-label="Textflow home">textflow<span class="brand-dot" aria-hidden="true">.</span></a>
  <span class="document-name">Document studio</span>
  <div class="header-actions"><span id="save-status" role="status"></span><button id="import">Import JSON</button><input id="import-file" type="file" accept="application/json,.json" hidden><button id="export">Export JSON <span aria-hidden="true">↗</span></button></div>
</header>
<dialog id="add-page-dialog" aria-labelledby="add-page-title"><span class="eyebrow">ADD TO DOCUMENT</span><h2 id="add-page-title">Choose a page layout</h2><p class="dialog-description">Start a new page with one of your available layouts.</p><div id="page-layouts"></div><form method="dialog"><button>Cancel</button></form></dialog>
<p id="import-error" role="alert" hidden></p>
<div class="workspace">
  <main>
    <div class="canvas-toolbar" aria-label="Document pages">
      <div id="document-pages"><label for="document-page">Page</label><select id="document-page"></select><span id="page-count"></span></div>
      <button id="add-page"><span aria-hidden="true">＋</span> Add page</button>
    </div>
    <div class="canvas-scroll"><div id="page-wrap"><textflow-page></textflow-page></div><div class="page-caption"><span id="page-caption"></span></div></div>
    <footer class="canvas-status"><span id="mode-hint"></span><span id="layout-status" role="status"></span></footer>
  </main>
  <aside class="right-panel" aria-label="Document editor">
    <div class="inspector-header"><span class="eyebrow">EDITOR</span><label class="mode-control" for="interaction-mode">Mode<select id="interaction-mode"><option value="content">Content</option><option value="layout">Layout</option></select></label></div>
    <div id="navigation">
      <div class="section-row"><h2>Blocks <span id="block-count"></span></h2><button id="add" class="small-button" aria-label="Add text block"><span aria-hidden="true">＋</span> Add block</button></div>
      <nav id="blocks" aria-label="Content blocks"></nav>
    </div>
    <div id="layout-tools" aria-label="Layout editor">
      <div class="selection-heading"><span class="eyebrow">LAYOUT</span><h2 id="layout-field-title"></h2></div>
      <div class="segmented css-target"><button id="block-css">Block</button><button id="page-css">Page</button></div>
      <div id="element-selection"><p id="element-target"></p><button id="select-parent" class="small-button hidden">Select parent element</button></div>
      <div id="css-controls"><div id="quick-controls" class="property-grid"></div><p id="css-error" role="status"></p></div>
      <details class="advanced-section" id="custom-property"><summary>Custom property</summary><form id="declaration-form"><label>Property<input id="css-property" placeholder="letter-spacing" required></label><label>Value<input id="css-value" placeholder="0.05em"></label><button type="submit">Apply property</button></form></details>
      <details class="advanced-section" id="css-source"><summary>CSS source <span id="css-source-scope">Block stylesheet</span></summary><p id="css-selector"></p><div id="css-editor"></div></details>
      <div class="selection-actions"><button id="remove" class="delete">Remove block</button></div>
    </div>
    <div id="content-tools">
      <div class="selection-heading"><span class="eyebrow">CONTENT</span><h2 id="field-title"></h2><p>Edit the selected block. Changes appear as you type.</p></div>
      <p id="lock-message" class="lock-message hidden">This text is locked by the admin.</p>
      <div class="source-editor"><div class="editor-tabs"><label for="format">Source format</label><select id="format"><option value="markdown">Markdown</option><option value="html">HTML</option></select></div><div id="editor"></div><div class="editor-status"><span id="word-count"></span><span id="overflow-status" role="status"></span></div></div>
    </div>
  </aside>
</div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const page = document.querySelector('textflow-page')!;
page.editorMode = 'user';
$<HTMLSelectElement>('interaction-mode').value = interactionMode;
const addPageDialog = $<HTMLDialogElement>('add-page-dialog');
const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = { model: null, theme: 'vs', automaticLayout: true, minimap: { enabled: false }, fontSize: 13, lineHeight: 23, fontFamily: 'Consolas, monospace', wordWrap: 'on', lineNumbers: 'on', lineNumbersMinChars: 2, glyphMargin: false, folding: false, scrollBeyondLastLine: false, padding: { top: 16, bottom: 16 }, overviewRulerLanes: 0, renderLineHighlight: 'none' };
const editor = monaco.editor.create($('editor'), { ...editorOptions, ariaLabel: 'Editor content' });
const cssEditor = monaco.editor.create($('css-editor'), { ...editorOptions, ariaLabel: 'CSS source' });
const models = new Map<string, monaco.editor.ITextModel>();
let syncing = false;
const overflows = new Map<string, boolean>();
function save() { if (page.snapshot) activeDocument.pages[pageIndex] = page.snapshot; try { localStorage.setItem(storageKey, JSON.stringify({ templates: library, document: activeDocument, pageIndex, interactionMode })); $('save-status').textContent = ''; } catch { $('save-status').textContent = 'Unsaved · Export to keep changes'; } }
function activePage() { return page.template!; }
function editingPageCss() { return cssPage || !selected; }
function currentCss() { return editingPageCss() ? activePage().css : activePage().boxes.find(b => b.id === selected)?.css || ''; }
function updateStatus() {
  $('word-count').textContent = `${(content[selected]?.value || '').trim().split(/\s+/).filter(Boolean).length} words`;
  $('overflow-status').textContent = selected ? overflows.get(selected) ? 'Overflow · content clipped' : 'Fits in block' : '';
  $('overflow-status').classList.toggle('warning', !!overflows.get(selected));
  $('page-caption').textContent = [...overflows.values()].some(Boolean) ? 'Some content exceeds its block.' : '';
  $('layout-status').textContent = page.layoutModified ? 'Layout customized' : 'Original layout';
}
function renderBlocks() {
  $('blocks').replaceChildren(); $('block-count').textContent = String(activePage().boxes.length);
  activePage().boxes.forEach((box, index) => {
    const button = document.createElement('button'); button.className = `block-row ${box.id === selected ? 'active' : ''}`;
    const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('strong'); name.textContent = box.label; button.append(number, name);
    if (box.locked) { const badge = document.createElement('span'); badge.className = 'lock-badge'; badge.textContent = 'Locked'; button.append(badge); }
    button.setAttribute('aria-pressed', String(box.id === selected));
    button.onclick = () => select(box.id); $('blocks').append(button);
  });
  $('page-css').classList.toggle('active', editingPageCss());
  $('block-css').classList.toggle('active', !editingPageCss() && !page.selectedElement);
  $('page-css').setAttribute('aria-pressed', String(editingPageCss()));
  $('block-css').setAttribute('aria-pressed', String(!editingPageCss() && !page.selectedElement));
  $<HTMLButtonElement>('block-css').disabled = !selected;
}
function syncModel(target: monaco.editor.IStandaloneCodeEditor, key: string, source: string, language: string) {
  let model = models.get(key);
  if (!model) { model = monaco.editor.createModel(source, language); models.set(key, model); }
  if (model.getValue() !== source) {
    model.pushStackElement(); model.pushEditOperations([], [{ range: model.getFullModelRange(), text: source }], () => null); model.pushStackElement();
  }
  monaco.editor.setModelLanguage(model, language); target.setModel(model);
}
function syncEditor() {
  syncing = true;
  syncModel(editor, `content/${pageIndex}/${selected}`, content[selected]?.value || '', content[selected]?.format || 'markdown');
  syncModel(cssEditor, `css/${pageIndex}/${activePage().id}/${editingPageCss() ? 'page' : selected}`, currentCss(), 'css');
  syncing = false;
  const locked = !!activePage().boxes.find(box => box.id === selected)?.locked;
  editor.updateOptions({ readOnly: !selected || (locked) });
  $<HTMLSelectElement>('format').disabled = !selected || (locked);
  $('lock-message').classList.toggle('hidden', !locked);
}
function select(id: string) {
  selected = id; cssPage = !id; page.selectedBoxId = id || null;
  $('field-title').textContent = activePage().boxes.find(b => b.id === id)?.label || 'No block selected';
  $('layout-field-title').textContent = activePage().boxes.find(b => b.id === id)?.label || 'Page';
  $<HTMLSelectElement>('format').value = content[id]?.format || 'markdown';
  $('remove').classList.toggle('hidden', !selected);
  syncEditor(); renderBlocks(); renderControls(); updateStatus();
}
function renderControls() {
  const controls = $('quick-controls'); controls.replaceChildren();
  const element = !editingPageCss() ? page.selectedElement : null;
  const boxName = activePage().boxes.find(box => box.id === selected)?.label || 'Block';
  $('layout-field-title').textContent = editingPageCss() ? 'Page layout' : boxName;
  $('element-target').textContent = element ? `<${element.localName}> selected` : '';
  $('element-selection').classList.toggle('hidden', !element);
  $('css-selector').textContent = element ? `Selected element: ${page.selectedElementSelector}` : '';
  $('css-source-scope').textContent = editingPageCss() ? 'Page stylesheet' : 'Block stylesheet';
  $('remove').classList.toggle('hidden', editingPageCss() || !!element);
  $('select-parent').classList.toggle('hidden', !element);
  $<HTMLButtonElement>('select-parent').disabled = !element || element.parentElement === page.getBoxElement(selected)?.querySelector(':scope > .content');
  for (const property of editingPageCss() ? ['width','height','background-color'] : element ? ['width','height','font-size','color'] : ['left','top','width','height','font-size','color']) {
    const label = document.createElement('label'); label.textContent = ({left:'X position',top:'Y position',width:'Width',height:'Height','font-size':'Font size',color:'Text color','background-color':'Background'} as Record<string,string>)[property] || property;
    const input = document.createElement('input'); input.dataset.property = property;
    input.onchange = () => applyDeclarations({ [property]: input.value });
    label.append(input); controls.append(label);
  }
  updateControls();
}
function updateControls() {
  const element = editingPageCss() ? page.pageElement : page.selectedElement ?? page.getBoxElement(selected);
  if (!element) return;
  const computed = getComputedStyle(element);
  for (const input of $('quick-controls').querySelectorAll<HTMLInputElement>('input')) {
    if (input !== document.activeElement) input.value = computed.getPropertyValue(input.dataset.property!);
  }
}
function applyDeclarations(changes: Record<string, string>) {
  for (const [property, value] of Object.entries(changes)) {
    if (value && !CSS.supports(property, value)) { $('css-error').textContent = `Invalid CSS: ${property}: ${value}`; return; }
  }
  try {
    if (!editingPageCss() && page.selectedElement) page.setSelectedElementCss(changes);
    else {
      const css = editCssDeclarations(currentCss(), changes);
      if (editingPageCss()) page.setPageCss(css); else page.setBoxCss(selected, css);
    }
    $('css-error').textContent = ''; syncEditor(); updateControls();
  } catch { $('css-error').textContent = 'Fix the CSS syntax before using the controls.'; }
}
function loadDocumentPage() {
  overflows.clear(); page.snapshot = activeDocument.pages[pageIndex]; content = page.content;
  select(activePage().boxes.some(b => b.id === selected) ? selected : activePage().boxes[0]?.id || '');
  const pages = $<HTMLSelectElement>('document-page'); pages.replaceChildren();
  activeDocument.pages.forEach((snapshot, index) => pages.add(new Option(`${index + 1}. ${snapshot.name}`, String(index))));
  pages.value = String(pageIndex);
  $('page-count').textContent = `${pageIndex + 1} of ${activeDocument.pages.length}`;
}
function arrangePanels() {
  const layout = interactionMode === 'layout';
  page.editable = layout;
  $('content-tools').classList.toggle('hidden', layout);
  $('layout-tools').classList.toggle('hidden', !layout);
  $('add').classList.toggle('hidden', !layout);
  $('mode-hint').textContent = layout ? 'Drag boxes · Resize corners · Click HTML elements to style them' : 'Choose a text box and enter HTML or Markdown';
  editor.layout(); cssEditor.layout();
}
$<HTMLButtonElement>('add-page').disabled = !library.length;
$('add-page').title = library.length ? '' : 'No page layouts are available';
$('css-source').addEventListener('toggle', () => cssEditor.layout());
$('add-page').onclick = () => addPageDialog.showModal();
for (const layout of library) {
  const button = document.createElement('button'); button.textContent = layout.name;
  button.onclick = () => {
    save();
    activeDocument.pages.push(createPageFromLayout(layout));
    pageIndex = activeDocument.pages.length - 1;
    loadDocumentPage(); save(); addPageDialog.close();
  };
  $('page-layouts').append(button);
}
$('document-page').onchange = () => { save(); pageIndex = Number($<HTMLSelectElement>('document-page').value); loadDocumentPage(); save(); };
editor.onDidChangeModelContent(() => {
  if (syncing || !selected) return;
  if (!page.setFieldContent(selected, { format: $<HTMLSelectElement>('format').value as 'markdown' | 'html', value: editor.getValue() })) syncEditor();
});
cssEditor.onDidChangeModelContent(() => {
  if (syncing) return;
  if (editingPageCss()) page.setPageCss(cssEditor.getValue()); else page.setBoxCss(selected, cssEditor.getValue());
  $('css-error').textContent = '';
});
$('format').onchange = () => { if (!selected) return; const format = $<HTMLSelectElement>('format').value as 'markdown' | 'html'; if (page.setFieldContent(selected, { format, value: editor.getValue() })) monaco.editor.setModelLanguage(editor.getModel()!, format); };
$('interaction-mode').onchange = () => { interactionMode = $<HTMLSelectElement>('interaction-mode').value as 'content' | 'layout'; arrangePanels(); syncEditor(); renderControls(); renderBlocks(); save(); };
page.addEventListener('content-change', () => {
  content = page.content;
  renderControls(); renderBlocks(); updateStatus(); save();
});
page.addEventListener('selection-change', event => { select((event as CustomEvent).detail.boxId || ''); });
page.addEventListener('template-change', () => {
  content = page.content;
  for (const id of overflows.keys()) if (!activePage().boxes.some(b => b.id === id)) overflows.delete(id);
  save(); syncEditor(); updateControls(); updateStatus(); renderBlocks();
});
page.addEventListener('overflow-change', event => { const { boxId, overflowing } = (event as CustomEvent).detail; overflows.set(boxId, overflowing); updateStatus(); });
$('page-css').onclick = () => { page.selectContentElement(null); cssPage = true; syncEditor(); renderControls(); renderBlocks(); };
$('block-css').onclick = () => { page.selectContentElement(null); cssPage = false; syncEditor(); renderControls(); renderBlocks(); };
page.addEventListener('element-selection-change', () => { cssPage = false; syncEditor(); renderControls(); renderBlocks(); });
$('select-parent').onclick = () => { page.selectContentElement(page.selectedElement?.parentElement ?? null); };
$('add').onclick = () => {
  page.addBox();
}; $('remove').onclick = () => page.removeBox(selected);
$('declaration-form').onsubmit = event => { event.preventDefault(); applyDeclarations({ [$<HTMLInputElement>('css-property').value.trim()]: $<HTMLInputElement>('css-value').value.trim() }); };
$('export').onclick = () => {
  save();
  const url = URL.createObjectURL(new Blob([JSON.stringify(activeDocument, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'textflow-document.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('import').onclick = () => $<HTMLInputElement>('import-file').click();
$('import-file').onchange = async () => {
  const input = $<HTMLInputElement>('import-file'), file = input.files?.[0]; if (!file) return;
  try {
    const imported = parseDocument(await file.text());
    syncing = true; editor.setModel(null); cssEditor.setModel(null); models.forEach(model => model.dispose()); models.clear(); syncing = false;
    activeDocument = imported; pageIndex = 0; loadDocumentPage(); save(); $('import-error').hidden = true;
  } catch (error) { $('import-error').textContent = error instanceof Error ? error.message : 'Could not import document.'; $('import-error').hidden = false; }
  input.value = '';
};
arrangePanels();
loadDocumentPage();
window.addEventListener('pagehide', () => { editor.dispose(); cssEditor.dispose(); models.forEach(model => model.dispose()); });
