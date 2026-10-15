# Textflow

Native web components for fixed-size on-screen regions with positioned HTML blocks, intended for embedding in a CMS. Pages and blocks are styled with CSS. The included studio is an example application with Monaco for Markdown, HTML, and CSS.

## Run the studio

```sh
npm install
npm run dev
```

The demo renders at actual CSS dimensions on a white background with a thin black outline. Its page surface is also forced white, including imported documents; exported CSS is unchanged. Editor view has only the right sidebar. Admin view adds the left sidebar while keeping the same right-hand text editor. There are no zoom controls, automatic scaling, paper shadows, or page-viewer treatment. Smaller containers scroll without shrinking the content. Printing is a future feature.

Select a block on the right and edit its Markdown or HTML. The right-hand text editor is available to both roles.

Choose **Admin** in the header to also show the left sidebar: block creation/removal, page creation, CSS editing, geometry controls, and **Lock text for users**. CSS and text have separate Monaco editors and remain available simultaneously. Selecting **Page CSS** changes only the CSS target; the selected block's text stays editable on the right. Dragging and resizing also update CSS.

A lock is a saved property of the selected block. Admins can edit locked text. In **Editor** view, locked text is read-only and the entire admin sidebar is hidden. Adding a block selects it and focuses the right-hand text editor immediately. Each box's text, CSS, and lock state persist together.

The demo saves the current document in browser storage. **Export JSON** downloads a document snapshot; **Import JSON** restores it without a template lookup. Documents with multiple pages have a page selector. The template catalog is separate from saved document pages. Existing demo data from the earlier geometry/font-options model is converted into CSS on load; the original storage entry is retained.

## Use the library

```ts
import { registerTextflow } from '@simon-martens/textflow';

registerTextflow();
const page = document.createElement('textflow-page');
page.template = {
  id: 'article', name: 'Article',
  css: `:scope {
    width: 640px;
    height: 850px;
    background: white;
    font-family: Georgia, serif;
  }`,
  boxes: [{
    id: 'story', label: 'Story',
    css: `:scope {
      left: 48px;
      top: 48px;
      width: 500px;
      height: 700px;
      font-size: 18px;
      line-height: 1.5;
    }
    h1 { color: navy; }
    p { margin: 0 0 1em; }`,
  }],
};
page.content = { story: { format: 'markdown', value: '# Hello\n\nExample text.' } };
page.editorMode = 'admin';
page.editable = true;
document.body.append(page);
```

### Save and restore documents

```ts
import { createDocument, createPageSnapshot, parseDocument } from '@simon-martens/textflow';

// A new document starts as a copy of a template and supplied field values.
page.snapshot = createPageSnapshot(template, userFields);

// Store this JSON in a database or file. Each page includes its own CSS and blocks.
const json = JSON.stringify(createDocument([page.snapshot!]));

// Later: no template registry, template version, or original template is needed.
const saved = parseDocument(json);
for (const snapshot of saved.pages) {
  const renderedPage = document.createElement('textflow-page');
  renderedPage.snapshot = snapshot;
  document.body.append(renderedPage);
}
```

The versioned document shape is `{ version: 1, pages: [...] }`. Each page contains its name, ID, page CSS, and blocks. Every block contains its ID, label, CSS, lock flag, and complete `{ format, value }` content. Snapshots and returned documents are deep copies; changing a template later does not change a saved document. Page/block IDs identify content, not references that must be resolved against a template.

Template blocks can supply `content` and `locked: true`. Instantiation copies that fixed content even if user field values with the same ID are supplied. Unlocked blocks use supplied values or their template defaults. Each document page owns its content independently, even when block IDs repeat on different pages.

Put persistent styling in page/block CSS. External application stylesheets, fonts, and image URLs are not downloaded or embedded by document export; those resources still need to be available when rendering.

### Editing policy

`editorMode` defaults to `'user'`. User edits go through `setFieldContent(id, field)`, which returns `false` for locked or nonexistent blocks. The bulk `content` setter also preserves locked values in user mode. Admin mode allows changing fixed content, lock flags, CSS, and layout. `snapshot` and `template` assignment are trusted host operations for loading data. The demo's role switch illustrates these views; applications must enforce authorization when accepting changes on their server.

```ts
page.editorMode = 'admin';
page.setFieldContent('story', { format: 'markdown', value: '# Fixed heading' });
page.setBoxLocked('story', true);
page.editorMode = 'user';
page.setFieldContent('story', { format: 'markdown', value: 'Replacement' }); // false
```

### CSS

Blocks render in light DOM, so ordinary application styles can target each block and its descendants:

```css
textflow-page [data-block="story"] {
  border: 1px solid #ccc;
}
textflow-page [data-block="story"] h1 {
  font-family: Arial, sans-serif;
}
```

The page's `css` is scoped to its `.page` element. A block's `css` is scoped to its `[data-block]` element. Inside either stylesheet, `:scope` selects that element. Normal selectors target its descendants. Page CSS can also target individual blocks using `[data-block="story"]`. Each stylesheet uses native `@scope`, keeping its selectors inside that page or block even when multiple pages share block IDs. This requires a browser with `@scope` support. Application styles still participate in the normal cascade.

CSS is the source of truth for dimensions, positioning and presentation. There are no separate `x`, `width`, `fontSize`, or other rendering options. The library supplies only structural defaults: relative page positioning, absolute block positioning, border-box sizing, and clipping. The demo supplies its own typography styles.

Template CSS is trusted application/author code and is not sanitized. Content HTML is sanitized with DOMPurify; scripts, inline styles and form controls are removed. Put styling in the stylesheet, not the content. Monaco and its CSS language worker are demo dependencies, not library dependencies.

### Controls that edit CSS

```ts
import { editCssDeclarations } from '@simon-martens/textflow';

const box = page.template!.boxes.find(box => box.id === 'story')!;
page.setBoxCss('story', editCssDeclarations(box.css, {
  'font-size': '20px',
  width: 'calc(100% - 96px)',
}));
```

`editCssDeclarations` edits the last top-level `:scope` rule, or appends one if absent. It preserves comments and unrelated rules. An empty value removes that declaration from the target rule. Malformed CSS throws without replacing the source. Controls write ordinary CSS declarations; they do not bypass the cascade. More specific rules or `!important` declarations can still win.

Dragging writes `left` and `top`; resizing writes `width` and `height` in pixels, based on the current computed layout. Arrow keys move a focused block; Shift + arrows resize it; Alt increases the step to 10 px. Pointer cancellation restores the original CSS. Direct manipulation assumes absolute positioning and axis-aligned blocks. Rotations, transforms on individual blocks, and competing inset/margin constraints should be edited in CSS. Display scaling on the page element is supported.

### API

`PageTemplate` contains `id`, `name`, `css`, and `boxes`. Each `TextBox` contains `id`, `label`, `css`, and optional default `content` and `locked` fields. `PageContent` maps block IDs to `{ format: 'markdown' | 'html', value: string }`. Shared IDs can reuse content across templates. Use multiple `<textflow-page>` elements for multiple pages; the application owns their order and template selection.

| Property / method | Purpose |
| --- | --- |
| `template` | Assign or read a cloned template. |
| `content` | Assign or read a cloned field map; user assignments preserve locked values. |
| `snapshot` | Load or read a complete, cloned page with its content and lock state. |
| `editorMode` | `admin` or `user` (default); controls editing permissions. |
| `setFieldContent(id, field)` | Edit content, returning false when a user tries to change locked text. |
| `setBoxLocked(id, locked)` | Admin-only lock update, returning whether it succeeded. |
| `editable` | Enable admin layout selection, dragging, resizing and keyboard editing. Also a boolean HTML attribute. |
| `selectedBoxId` | Select a block, or clear with `null`. |
| `setBoxCss(id, css)` | Replace a block's CSS and emit a template update. |
| `setPageCss(css)` | Replace page CSS and emit a template update. |
| `getBoxElement(id)` | Get the block DOM element to inspect computed styles. |
| `pageElement` | Get the page DOM element to inspect its computed size. |
| `addBox(box?)` | Add a supplied block or a default block with a UUID. |
| `removeBox(id)` | Remove a block; host-owned content is retained. |
| `createTextBox(id?)` | Create a block with default positioning CSS. |

| Event | Detail |
| --- | --- |
| `content-change` | `{ boxId, content }`, after a successful field edit. |
| `template-change` | `{ template }`, including CSS updates during dragging. |
| `selection-change` | `{ boxId }`, nullable. |
| `overflow-change` | `{ boxId, overflowing }`, when a block's fit state changes. |

CSS setters and block add/remove methods require admin mode. Events bubble. `--tf-accent` sets the selection color. Textflow owns the element's children; reassigning a template rebuilds them. Keep custom content in the field map and styles in application CSS or template CSS.

## Limits and validation

This is a browser-only ESM package with TypeScript declarations. Overflow is clipped and reported; text does not continue automatically into another block or page. There is no print/PDF exporter. Image and font loading can change fit. Overflow detection measures scrollable bounds, not glyph ink. CSS that deliberately overrides the structural defaults can change clipping and layout.

```sh
npm run check
npm run build       # dist: library JS and declarations
npm run build:demo  # demo-dist: runnable studio
npm test           # browser integration tests
npm pack --dry-run
```

Tests use installed Chrome on Linux; `CHROME_PATH` overrides its executable. They reuse a running dev server if available. Tests cover content editing and persistence, HTML sanitization, CSS source/control round trips, CSS undo, application selectors, scope isolation, overflow, dragging/resizing at actual CSS dimensions, keyboard movement, page creation, locked text, standalone JSON import/export, multi-page persistence, and saved-data migration.

The npm package name is provisional; the library has not been published.
