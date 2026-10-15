import { createDocument, createPageSnapshot, parseDocument, type PageTemplate, type PageContent, type TextflowDocument } from '../src/index.js';
import { pageCss } from './templates.js';
export const storageKey = 'textflow-studio-v3';
export interface StudioState { templates: PageTemplate[]; document: TextflowDocument; pageIndex: number; templateId: string | null; mode: 'admin' | 'user' }
interface LegacyBox { id: string; label: string; x: number; y: number; width: number; height: number; fontFamily: string; fontSize: number; lineHeight: number; color: string; padding: number; textAlign: string }
interface LegacyTemplate { id: string; name: string; width: number; height: number; background: string; boxes: LegacyBox[] }
function loadPrevious(): { templates: PageTemplate[]; content: PageContent } | null {
  const current = localStorage.getItem('textflow-studio-v2');
  if (current) return JSON.parse(current);
  const previous = localStorage.getItem('textflow-studio-v1');
  if (!previous) return null;
  const old = JSON.parse(previous) as { templates: LegacyTemplate[]; content: PageContent };
  return {
    content: old.content,
    templates: old.templates.map(template => ({
      id: template.id, name: template.name,
      css: `${pageCss}\n:scope { width: ${template.width}px; height: ${template.height}px; background: ${template.background}; }`,
      boxes: template.boxes.map(box => ({ id: box.id, label: box.label, css: `:scope {
  left: ${box.x}px;
  top: ${box.y}px;
  width: ${box.width}px;
  height: ${box.height}px;
  font-family: ${box.fontFamily};
  font-size: ${box.fontSize}px;
  line-height: ${box.lineHeight};
  color: ${box.color};
  padding: ${box.padding}px;
  text-align: ${box.textAlign};
}` })),
    })),
  };
}

export function loadSaved(): StudioState | null {
  const current = localStorage.getItem(storageKey);
  if (current) {
    const saved = JSON.parse(current) as StudioState;
    saved.document = parseDocument(JSON.stringify(saved.document));
    saved.pageIndex = Math.max(0, Math.min(saved.document.pages.length - 1, saved.pageIndex || 0));
    return saved;
  }
  const previous = loadPrevious();
  if (!previous?.templates.length) return null;
  const templates = previous.templates.map(template => ({ ...template, boxes: template.boxes.map(box => ({ ...box, content: box.content ?? previous.content[box.id] })) }));
  return { templates, document: createDocument([createPageSnapshot(templates[0], previous.content)]), pageIndex: 0, templateId: templates[0].id, mode: 'admin' };
}
