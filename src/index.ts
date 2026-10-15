import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { createTextBox, createPageSnapshot, type PageTemplate, type PageContent, type PageSnapshot, type FieldContent } from './model.js';
import { editCssDeclarations } from './css.js';
export * from './model.js';
export { editCssDeclarations } from './css.js';

const styles = `
:scope { display:block; width:max-content; --tf-accent:#22785b; }
:where(.page,.box,.content) { box-sizing:border-box; }
:where(.page) { position:relative; overflow:hidden; isolation:isolate; }
:where(.box) { position:absolute; outline:none; }
:where(.content) { width:100%; height:100%; overflow:hidden; overflow-wrap:anywhere; }
:scope[data-layout-editing] .box { cursor:move; touch-action:none; }
:scope[data-layout-editing] .box::after { content:''; position:absolute;inset:0;pointer-events:none;outline:1px solid #22785b44; }
:scope[data-layout-editing] .box.selected::after { outline:2px solid var(--tf-accent); outline-offset:2px; }
.tf-label {position:absolute;left:0;top:0;transform:translateY(-100%);background:var(--tf-accent);color:white;font:11px Arial,sans-serif;padding:4px 7px;white-space:nowrap;pointer-events:none;z-index:2}
.tf-handle {position:absolute;right:-5px;bottom:-5px;width:12px;height:12px;border:2px solid white;background:var(--tf-accent);cursor:nwse-resize;z-index:3}
@media print { .box::after,.tf-label,.tf-handle {display:none} }
`;
function scopedStyle(css: string) {
  const style = document.createElement('style');
  style.textContent = `@scope {\n${css}\n}`;
  return style;
}

/** Light-DOM page with CSS-driven blocks and optional built-in editing. */
export class TextflowPage extends HTMLElement {
  static observedAttributes = ['editable'];
  #template: PageTemplate | null = null;
  #content: PageContent = {};
  #selected: string | null = null;
  #editorMode: 'admin' | 'user' = 'user';
  #page: HTMLElement | null = null;
  #pageStyle: HTMLStyleElement | null = null;
  #elements = new Map<string, HTMLElement>();
  #sheets = new Map<string, HTMLStyleElement>();
  #observer = new ResizeObserver(() => this.#checkOverflow());
  #overflow = new Map<string, boolean>();
  #frame = 0;
  #drag: { id: string; pointer: number; x: number; y: number; left: number; top: number; width: number; height: number; css: string; resize: boolean; scaleX: number; scaleY: number } | null = null;

  constructor() {
    super();
    this.addEventListener('pointerdown', this.#pointerDown);
    this.addEventListener('pointermove', this.#pointerMove);
    this.addEventListener('pointerup', this.#pointerEnd);
    this.addEventListener('pointercancel', this.#pointerCancel);
    this.addEventListener('keydown', this.#keyDown);
    this.addEventListener('load', () => this.#scheduleOverflow(), true);
  }
  connectedCallback() {
    this.#render();
    document.fonts.addEventListener('loadingdone', this.#scheduleOverflow);
    void document.fonts.ready.then(() => { if (this.isConnected) this.#scheduleOverflow(); });
  }
  disconnectedCallback() {
    this.#observer.disconnect(); cancelAnimationFrame(this.#frame); this.#drag = null;
    document.fonts.removeEventListener('loadingdone', this.#scheduleOverflow);
  }
  attributeChangedCallback() { this.#renderSelection(); }
  get editorMode() { return this.#editorMode; }
  set editorMode(value: 'admin' | 'user') {
    this.#pointerCancel(); this.#editorMode = value; this.#renderSelection();
  }
  get editable() { return this.#editorMode === 'admin' && this.hasAttribute('editable'); }
  set editable(value: boolean) { this.toggleAttribute('editable', value); }
  get template() { return this.#template ? structuredClone(this.#template) : null; }
  set template(value: PageTemplate | null) {
    this.#template = value ? structuredClone(value) : null;
    for (const box of this.#template?.boxes ?? []) if (box.locked) this.#content[box.id] = structuredClone(box.content ?? { format: 'markdown', value: '' });
    if (!value?.boxes.some(box => box.id === this.#selected)) this.#selected = null;
    this.#overflow.clear(); if (this.isConnected) this.#render();
  }
  get content(): PageContent {
    return Object.fromEntries((this.#template?.boxes ?? []).map(box => [box.id, structuredClone(this.#content[box.id] ?? box.content ?? { format: 'markdown', value: '' })]));
  }
  set content(value: PageContent) {
    const previous = this.content;
    this.#content = structuredClone(value);
    for (const box of this.#template?.boxes ?? []) {
      if (box.locked && this.#editorMode !== 'admin') this.#content[box.id] = previous[box.id];
      else if (this.#editorMode === 'admin' && value[box.id]) box.content = structuredClone(value[box.id]);
    }
    this.#renderContent();
  }
  get snapshot(): PageSnapshot | null {
    return this.#template ? createPageSnapshot(this.#template, this.content) : null;
  }
  /** Hydration is a host operation; it restores the saved layout and all content together. */
  set snapshot(value: PageSnapshot | null) {
    this.#content = value ? Object.fromEntries(value.boxes.map(box => [box.id, structuredClone(box.content)])) : {};
    this.template = value;
  }
  setFieldContent(id: string, field: FieldContent): boolean {
    const box = this.#template?.boxes.find(box => box.id === id);
    if (!box || (box.locked && this.#editorMode !== 'admin')) return false;
    this.#content[id] = structuredClone(field);
    if (this.#editorMode === 'admin') box.content = structuredClone(field);
    this.#renderContent();
    this.dispatchEvent(new CustomEvent('content-change', { detail: { boxId: id, content: this.content }, bubbles: true }));
    return true;
  }
  setBoxLocked(id: string, locked: boolean): boolean {
    if (this.#editorMode !== 'admin') return false;
    const box = this.#template?.boxes.find(box => box.id === id);
    if (!box) return false;
    box.content = this.content[id]; box.locked = locked;
    this.#renderSelection(); this.#emitChange(); return true;
  }
  get selectedBoxId() { return this.#selected; }
  set selectedBoxId(id: string | null) { this.#selected = this.#elements.has(id ?? '') ? id : null; this.#renderSelection(); }
  get pageElement() { return this.#page; }
  getBoxElement(id: string) { return this.#elements.get(id) ?? null; }
  setBoxCss(id: string, css: string) {
    if (this.#editorMode !== 'admin') return;
    const box = this.#template?.boxes.find(b => b.id === id);
    if (!box) return;
    box.css = css;
    const sheet = this.#sheets.get(id); if (sheet) sheet.textContent = `@scope {\n${css}\n}`;
    this.#scheduleOverflow(); this.#emitChange();
  }
  setPageCss(css: string) {
    if (this.#editorMode !== 'admin') return;
    if (!this.#template) return;
    this.#template.css = css;
    if (this.#pageStyle) this.#pageStyle.textContent = `@scope {\n${css}\n}`;
    this.#scheduleOverflow(); this.#emitChange();
  }
  addBox(box = createTextBox()) {
    if (this.#editorMode !== 'admin') return;
    if (!this.#template || this.#template.boxes.some(b => b.id === box.id)) return;
    this.#template.boxes.push(structuredClone(box)); this.#selected = box.id; this.#render(); this.#emitChange(); this.#emitSelection();
  }
  removeBox(id: string) {
    if (this.#editorMode !== 'admin') return;
    if (!this.#template) return;
    this.#template.boxes = this.#template.boxes.filter(b => b.id !== id);
    this.#overflow.delete(id);
    if (this.#selected === id) this.#selected = null;
    this.#render(); this.#emitChange(); this.#emitSelection();
  }
  #emitChange() { this.dispatchEvent(new CustomEvent('template-change', { detail: { template: this.template }, bubbles: true })); }
  #emitSelection() { this.dispatchEvent(new CustomEvent('selection-change', { detail: { boxId: this.#selected }, bubbles: true })); }
  #renderSelection() {
    this.toggleAttribute('data-layout-editing', this.editable);
    for (const [id, element] of this.#elements) {
      element.toggleAttribute('data-locked', !!this.#template?.boxes.find(box => box.id === id)?.locked);
      element.querySelectorAll(':scope > .tf-label,:scope > .tf-handle').forEach(node => node.remove());
      element.classList.toggle('selected', this.editable && id === this.#selected);
      if (this.editable) element.tabIndex = 0; else element.removeAttribute('tabindex');
      if (!this.editable || id !== this.#selected) continue;
      const label = document.createElement('span'); label.className = 'tf-label'; label.textContent = this.#template!.boxes.find(b => b.id === id)!.label;
      const handle = document.createElement('span'); handle.className = 'tf-handle'; handle.setAttribute('aria-hidden', 'true');
      element.append(label, handle);
    }
  }
  #renderContent() {
    for (const [id, element] of this.#elements) {
      const field = this.#content[id] ?? this.#template?.boxes.find(box => box.id === id)?.content;
      element.querySelector('.content')!.innerHTML = DOMPurify.sanitize(field ? field.format === 'markdown' ? marked.parse(field.value, { async: false }) : field.value : '', { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'input', 'button', 'form', 'textarea', 'select'], FORBID_ATTR: ['style'] });
    }
    this.#scheduleOverflow();
  }
  #render() {
    this.#observer.disconnect(); this.#elements.clear(); this.#sheets.clear(); this.#page = null;
    this.replaceChildren(scopedStyle(styles));
    if (!this.#template) return;
    const page = document.createElement('div'); page.className = 'page'; this.#page = page;
    this.#pageStyle = scopedStyle(this.#template.css); page.append(this.#pageStyle);
    for (const box of this.#template.boxes) {
      const element = document.createElement('section'); element.className = 'box'; element.dataset.block = box.id;
      element.setAttribute('aria-label', box.label);
      const content = document.createElement('div'); content.className = 'content';
      const sheet = scopedStyle(box.css); element.append(sheet, content);
      this.#elements.set(box.id, element); this.#sheets.set(box.id, sheet);
      page.append(element); this.#observer.observe(content);
    }
    this.append(page); this.#renderContent(); this.#renderSelection();
  }
  #scheduleOverflow = () => { cancelAnimationFrame(this.#frame); this.#frame = requestAnimationFrame(() => this.#checkOverflow()); };
  #checkOverflow() {
    for (const [boxId, element] of this.#elements) {
      const content = element.querySelector('.content') as HTMLElement;
      const overflowing = content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1;
      if (this.#overflow.get(boxId) !== overflowing) {
        this.#overflow.set(boxId, overflowing);
        this.dispatchEvent(new CustomEvent('overflow-change', { detail: { boxId, overflowing }, bubbles: true }));
      }
    }
  }
  #pointerDown = (e: PointerEvent) => {
    if (!this.editable || e.button !== 0) return;
    const element = (e.target as HTMLElement).closest<HTMLElement>('.box');
    if (!element || !this.#elements.has(element.dataset.block!)) { this.selectedBoxId = null; this.#emitSelection(); return; }
    const id = element.dataset.block!, box = this.#template!.boxes.find(b => b.id === id)!;
    // Refuse a malformed source rather than discard it when a control writes CSS.
    try { editCssDeclarations(box.css, {}); } catch { return; }
    e.preventDefault();
    const bounds = this.#page!.getBoundingClientRect();
    const computed = getComputedStyle(element);
    this.#drag = { id, pointer: e.pointerId, x: e.clientX, y: e.clientY, left: element.offsetLeft, top: element.offsetTop, width: parseFloat(computed.width), height: parseFloat(computed.height), css: box.css, resize: (e.target as HTMLElement).classList.contains('tf-handle'), scaleX: bounds.width / this.#page!.offsetWidth, scaleY: bounds.height / this.#page!.offsetHeight };
    this.selectedBoxId = id; this.#emitSelection(); element.focus({ preventScroll: true }); this.setPointerCapture(e.pointerId);
  };
  #pointerMove = (e: PointerEvent) => {
    const drag = this.#drag; if (!drag || drag.pointer !== e.pointerId) return;
    const dx = (e.clientX - drag.x) / drag.scaleX, dy = (e.clientY - drag.y) / drag.scaleY;
    const changes: Record<string, string> = drag.resize ? { width: `${Math.max(24, Math.round(drag.width + dx))}px`, height: `${Math.max(24, Math.round(drag.height + dy))}px` } : { left: `${Math.round(drag.left + dx)}px`, top: `${Math.round(drag.top + dy)}px` };
    this.setBoxCss(drag.id, editCssDeclarations(drag.css, changes));
  };
  #pointerEnd = () => { if (this.#drag) { if (this.hasPointerCapture(this.#drag.pointer)) this.releasePointerCapture(this.#drag.pointer); this.#drag = null; } };
  #pointerCancel = () => { if (this.#drag) this.setBoxCss(this.#drag.id, this.#drag.css); this.#pointerEnd(); };
  #keyDown = (e: KeyboardEvent) => {
    if (!this.editable || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
    const element = (e.target as HTMLElement).closest<HTMLElement>('.box');
    const box = this.#template?.boxes.find(b => b.id === element?.dataset.block); if (!box || !element) return;
    e.preventDefault();
    const step = e.altKey ? 10 : 1, dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0, dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
    const computed = getComputedStyle(element);
    const changes: Record<string, string> = e.shiftKey ? { width: `${Math.max(24, parseFloat(computed.width) + dx)}px`, height: `${Math.max(24, parseFloat(computed.height) + dy)}px` } : { left: `${element.offsetLeft + dx}px`, top: `${element.offsetTop + dy}px` };
    try { this.setBoxCss(box.id, editCssDeclarations(box.css, changes)); } catch { return; }
    this.selectedBoxId = box.id; this.#emitSelection();
  };
}
export function registerTextflow(tagName = 'textflow-page') {
  if (!customElements.get(tagName)) customElements.define(tagName, class extends TextflowPage {});
}
declare global { interface HTMLElementTagNameMap { 'textflow-page': TextflowPage } }
