export interface TextBox {
  id: string;
  label: string;
  /** Admin-authored default content and user editing policy. */
  content?: FieldContent;
  locked?: boolean;
  /** Styles scoped to this block. :scope selects the block; h1, p, etc. select its content. */
  css: string;
}
export interface PageTemplate {
  id: string;
  name: string;
  /** Styles scoped to the page. :scope selects the page; [data-block="id"] selects a block. */
  css: string;
  boxes: TextBox[];
}
export interface FieldContent { format: 'markdown' | 'html'; value: string }
export type PageContent = Record<string, FieldContent>;
export interface OverflowDetail { boxId: string; overflowing: boolean }
export interface SelectionDetail { boxId: string | null }
export const createTextBox = (id: string = crypto.randomUUID()): TextBox => ({
  id, label: 'Text block',
  css: ':scope {\n  left: 48px;\n  top: 48px;\n  width: 260px;\n  height: 160px;\n}',
});

/** A resolved page: CSS, locks, and content are owned by this instance. */
export interface PageSnapshot extends Omit<PageTemplate, 'boxes'> {
  boxes: (TextBox & { locked: boolean; content: FieldContent })[];
}
export interface TextflowDocument {
  version: 1;
  pages: PageSnapshot[];
}

/** Instantiate a template. Locked defaults cannot be replaced by supplied user fields. */
export function createPageSnapshot(template: PageTemplate, content: PageContent = {}): PageSnapshot {
  return {
    id: template.id, name: template.name, css: template.css,
    boxes: template.boxes.map(box => ({
      ...structuredClone(box), locked: box.locked ?? false,
      content: structuredClone((box.locked ? box.content : content[box.id] ?? box.content) ?? { format: 'markdown', value: '' }),
    })),
  };
}
export function createDocument(pages: PageSnapshot[]): TextflowDocument {
  return { version: 1, pages: structuredClone(pages) };
}

/** Validate a JSON document from storage/import before applying it to a page. */
export function parseDocument(json: string): TextflowDocument {
  const value: unknown = JSON.parse(json);
  const record = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item);
  const validField = (item: unknown) => record(item) && (item.format === 'html' || item.format === 'markdown') && typeof item.value === 'string';
  if (!record(value) || value.version !== 1 || !Array.isArray(value.pages) || value.pages.length === 0) throw new Error('Expected a version 1 Textflow document with at least one page.');
  for (const page of value.pages) {
    if (!record(page) || typeof page.id !== 'string' || typeof page.name !== 'string' || typeof page.css !== 'string' || !Array.isArray(page.boxes)) throw new Error('Invalid page in document.');
    const ids = new Set<string>();
    for (const box of page.boxes) {
      if (!record(box) || typeof box.id !== 'string' || !box.id || ids.has(box.id) || typeof box.label !== 'string' || typeof box.css !== 'string' || typeof box.locked !== 'boolean' || !validField(box.content)) throw new Error('Invalid or duplicate block in document.');
      ids.add(box.id);
    }
  }
  return structuredClone(value) as unknown as TextflowDocument;
}
