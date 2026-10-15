import { registerTextflow, editCssDeclarations, createDocument, createPageSnapshot, parseDocument, type PageContent, type PageTemplate } from '../src/index.js';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution.js';
import 'monaco-editor/esm/vs/language/css/monaco.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import { templates, initialContent, pageCss } from './templates.js';
import { loadSaved, storageKey } from './storage.js';
import './style.css';
self.MonacoEnvironment = { getWorker: (_id, label) => label === 'css' ? new CssWorker() : new EditorWorker() };
registerTextflow();
let library = templates.map(template => ({ ...structuredClone(template), boxes: template.boxes.map(box => ({ ...structuredClone(box), content: structuredClone(initialContent[box.id]) })) })) as PageTemplate[];
let content: PageContent = {}, current = 0, selected = 'title', cssPage = false, pageIndex = 0;
let activeDocument = createDocument([createPageSnapshot(library[0], initialContent)]);
let mode: 'admin' | 'user' = 'admin';
try {
  const saved = loadSaved();
  if (saved) {
    library = saved.templates; activeDocument = saved.document; pageIndex = saved.pageIndex;
    current = library.findIndex(template => template.id === saved.templateId); mode = saved.mode === 'user' ? 'user' : 'admin';
  }
} catch { /* Keep the stored data intact if it cannot be read. */ }
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<header><a class="brand" href="/" aria-label="Textflow home">textflow</a><span class="document-name">Template editor</span><div class="header-actions"><span id="save-status" role="status"></span><label for="role">View as</label><select id="role"><option value="admin">Admin</option><option value="user">Editor</option></select><button id="import">Import JSON</button><input id="import-file" type="file" accept="application/json,.json" hidden><button id="export">Export JSON</button></div></header>
<p id="import-error" role="alert" hidden></p><div class="workspace">
<aside class="left-panel" aria-label="Admin controls"><div class="panel-heading">ADMIN</div><button id="new-template" class="wide">＋ New page template</button><button id="add" class="wide">＋ Add text block</button><h2 id="admin-field-title"></h2><label id="lock-row" class="lock-row"><input id="locked" type="checkbox"> Lock text for users</label><div class="segmented css-target"><button id="block-css">Block CSS</button><button id="page-css">Page CSS</button></div><div id="css-editor"></div><div id="css-controls"><div class="section-label">CSS DECLARATIONS</div><div id="quick-controls" class="property-grid"></div><form id="declaration-form"><label>Property<input id="css-property" placeholder="letter-spacing" required></label><label>Value<input id="css-value" placeholder="0.05em"></label><button type="submit">Apply</button></form><p id="css-error" role="status"></p><button id="remove" class="delete">Remove block</button></div></aside>
<main><div class="canvas-scroll"><div id="page-wrap"><textflow-page></textflow-page></div><div class="page-caption"><span id="page-caption"></span></div></div><footer><span id="mode-hint"></span></footer></main>
<aside class="right-panel" aria-label="Text editor"><div id="navigation"><div id="document-pages" class="hidden"><label class="section-label" for="document-page">DOCUMENT PAGE</label><select id="document-page"></select></div><label class="section-label" for="template">PAGE TEMPLATE</label><select id="template"></select><div class="section-row"><span class="section-label">CONTENT BLOCKS</span><span id="block-count"></span></div><nav id="blocks" aria-label="Content blocks"></nav></div><div class="panel-heading">CONTENT</div><div class="editor-heading"><h2 id="field-title"></h2></div><p id="lock-message" class="lock-message hidden">This text is locked by the admin.</p><div class="editor-tabs"><label for="format">SOURCE</label><select id="format"><option value="markdown">Markdown</option><option value="html">HTML</option></select></div><div id="editor"></div><div class="editor-status"><span id="word-count"></span><span id="overflow-status" role="status"></span></div></aside></div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const page = document.querySelector('textflow-page')!;
page.editorMode = mode;
$<HTMLSelectElement>('role').value = mode;
const templateSelect = $<HTMLSelectElement>('template');
const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = { model: null, theme: 'vs', automaticLayout: true, minimap: { enabled: false }, fontSize: 13, lineHeight: 23, fontFamily: 'Consolas, monospace', wordWrap: 'on', lineNumbers: 'on', lineNumbersMinChars: 2, glyphMargin: false, folding: false, scrollBeyondLastLine: false, padding: { top: 16, bottom: 16 }, overviewRulerLanes: 0, renderLineHighlight: 'none' };
const editor = monaco.editor.create($('editor'), { ...editorOptions, ariaLabel: 'Editor content' });
const cssEditor = monaco.editor.create($('css-editor'), { ...editorOptions, ariaLabel: 'CSS source' });
const models = new Map<string, monaco.editor.ITextModel>();
let syncing = false;
const overflows = new Map<string, boolean>();
function save() { if (page.snapshot) activeDocument.pages[pageIndex] = page.snapshot; try { localStorage.setItem(storageKey, JSON.stringify({ templates: library, document: activeDocument, pageIndex, templateId: current >= 0 ? library[current].id : null, mode })); $('save-status').textContent = ''; } catch { $('save-status').textContent = 'Unsaved · Export to keep changes'; } }
function activePage() { return page.template!; }
function editingPageCss() { return cssPage || !selected; }
function currentCss() { return editingPageCss() ? activePage().css : activePage().boxes.find(b => b.id === selected)?.css || ''; }
function updateStatus() {
  $('word-count').textContent = `${(content[selected]?.value || '').trim().split(/\s+/).filter(Boolean).length} words`;
  $('overflow-status').textContent = selected ? overflows.get(selected) ? 'Overflow · content clipped' : 'Fits in block' : '';
  $('overflow-status').classList.toggle('warning', !!overflows.get(selected));
  $('page-caption').textContent = [...overflows.values()].some(Boolean) ? 'Some content exceeds its block.' : '';
}
function renderBlocks() {
  $('blocks').replaceChildren(); $('block-count').textContent = String(activePage().boxes.length).padStart(2, '0');
  activePage().boxes.forEach((box, index) => {
    const button = document.createElement('button'); button.className = `block-row ${box.id === selected ? 'active' : ''}`;
    const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('strong'); name.textContent = box.label; button.append(number, name);
    if (box.locked) { const badge = document.createElement('span'); badge.className = 'lock-badge'; badge.textContent = 'Locked'; button.append(badge); }
    button.onclick = () => select(box.id); $('blocks').append(button);
  });
  $('page-css').classList.toggle('active', editingPageCss());
  $('block-css').classList.toggle('active', !editingPageCss());
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
  editor.updateOptions({ readOnly: !selected || (mode === 'user' && locked) });
  cssEditor.updateOptions({ readOnly: mode !== 'admin' });
  $<HTMLSelectElement>('format').disabled = !selected || (mode === 'user' && locked);
  $<HTMLInputElement>('locked').checked = locked;
  $('lock-row').classList.toggle('hidden', !selected);
  $('lock-message').classList.toggle('hidden', mode !== 'user' || !locked);
}
function select(id: string) {
  selected = id; cssPage = !id; page.selectedBoxId = id || null;
  $('field-title').textContent = activePage().boxes.find(b => b.id === id)?.label || 'No block selected';
  $('admin-field-title').textContent = activePage().boxes.find(b => b.id === id)?.label || 'Page';
  $<HTMLSelectElement>('format').value = content[id]?.format || 'markdown';
  $('remove').classList.toggle('hidden', !selected);
  syncEditor(); renderBlocks(); renderControls(); updateStatus();
}
function renderControls() {
  const controls = $('quick-controls'); controls.replaceChildren();
  for (const property of !editingPageCss() ? ['left','top','width','height','font-size','color'] : ['width','height','background-color']) {
    const label = document.createElement('label'); label.textContent = property;
    const input = document.createElement('input'); input.dataset.property = property;
    input.onchange = () => applyDeclarations({ [property]: input.value });
    label.append(input); controls.append(label);
  }
  updateControls();
}
function updateControls() {
  const element = editingPageCss() ? page.pageElement : page.getBoxElement(selected);
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
    const css = editCssDeclarations(currentCss(), changes);
    if (editingPageCss()) page.setPageCss(css); else page.setBoxCss(selected, css);
    $('css-error').textContent = ''; syncEditor(); updateControls();
  } catch { $('css-error').textContent = 'Fix the CSS syntax before using the controls.'; }
}
function loadDocumentPage() {
  overflows.clear(); page.snapshot = activeDocument.pages[pageIndex]; content = page.content;
  select(activePage().boxes.some(b => b.id === selected) ? selected : activePage().boxes[0]?.id || '');
  const pages = $<HTMLSelectElement>('document-page'); pages.replaceChildren();
  activeDocument.pages.forEach((snapshot, index) => pages.add(new Option(`${index + 1}. ${snapshot.name}`, String(index))));
  pages.value = String(pageIndex); $('document-pages').classList.toggle('hidden', activeDocument.pages.length < 2);
  templateSelect.querySelector('option[value=""]')?.remove();
  if (current < 0) templateSelect.add(new Option('Saved document', ''));
  templateSelect.value = current >= 0 ? library[current].id : '';
}
function arrangePanels() {
  const user = mode === 'user';
  document.querySelector('.workspace')!.classList.toggle('user-view', user);
  page.editorMode = mode; page.editable = !user;
  $('mode-hint').textContent = user ? 'Select a block to edit its text' : 'Drag to move · Corner to resize · Edit text on the right';
  editor.layout(); cssEditor.layout();
}
for (const template of library) templateSelect.add(new Option(template.name, template.id));
templateSelect.onchange = () => {
  const next = library.findIndex(t => t.id === templateSelect.value); if (next < 0) return;
  current = next; activeDocument.pages[pageIndex] = createPageSnapshot(library[current], content); loadDocumentPage(); save();
};
$('document-page').onchange = () => { save(); pageIndex = Number($<HTMLSelectElement>('document-page').value); current = -1; loadDocumentPage(); save(); };
editor.onDidChangeModelContent(() => {
  if (syncing || !selected) return;
  if (!page.setFieldContent(selected, { format: $<HTMLSelectElement>('format').value as 'markdown' | 'html', value: editor.getValue() })) syncEditor();
});
cssEditor.onDidChangeModelContent(() => {
  if (syncing || mode !== 'admin') return;
  if (editingPageCss()) page.setPageCss(cssEditor.getValue()); else page.setBoxCss(selected, cssEditor.getValue());
  $('css-error').textContent = '';
});
$('format').onchange = () => { if (!selected) return; const format = $<HTMLSelectElement>('format').value as 'markdown' | 'html'; if (page.setFieldContent(selected, { format, value: editor.getValue() })) monaco.editor.setModelLanguage(editor.getModel()!, format); };
$('locked').onchange = () => { page.setBoxLocked(selected, $<HTMLInputElement>('locked').checked); syncEditor(); };
$('role').onchange = () => { mode = $<HTMLSelectElement>('role').value as 'admin' | 'user'; arrangePanels(); syncEditor(); save(); };
page.addEventListener('content-change', () => {
  content = page.content;
  if (mode === 'admin' && current >= 0) library[current] = page.template!;
  updateStatus(); save();
});
page.addEventListener('selection-change', event => { select((event as CustomEvent).detail.boxId || ''); });
page.addEventListener('template-change', event => {
  if (current >= 0) library[current] = (event as CustomEvent<{template: PageTemplate}>).detail.template;
  content = page.content;
  for (const id of overflows.keys()) if (!activePage().boxes.some(b => b.id === id)) overflows.delete(id);
  save(); syncEditor(); updateControls(); updateStatus(); renderBlocks();
});
page.addEventListener('overflow-change', event => { const { boxId, overflowing } = (event as CustomEvent).detail; overflows.set(boxId, overflowing); updateStatus(); });
$('page-css').onclick = () => { cssPage = true; syncEditor(); renderControls(); renderBlocks(); };
$('block-css').onclick = () => { cssPage = false; syncEditor(); renderControls(); renderBlocks(); };
$('new-template').onclick = () => {
  const template: PageTemplate = { id: crypto.randomUUID(), name: `Template ${library.length + 1}`, css: pageCss, boxes: [] };
  library.push(template); current = library.length - 1; templateSelect.add(new Option(template.name, template.id)); templateSelect.value = template.id; activeDocument.pages[pageIndex] = createPageSnapshot(template); loadDocumentPage(); save();
};
$('add').onclick = () => {
  if (mode !== 'admin') return;
  page.addBox(); editor.focus();
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
    activeDocument = imported; pageIndex = 0; current = -1; loadDocumentPage(); save(); $('import-error').hidden = true;
  } catch (error) { $('import-error').textContent = error instanceof Error ? error.message : 'Could not import document.'; $('import-error').hidden = false; }
  input.value = '';
};
arrangePanels();
loadDocumentPage();
window.addEventListener('pagehide', () => { editor.dispose(); cssEditor.dispose(); models.forEach(model => model.dispose()); });
