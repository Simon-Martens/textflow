# Project instructions

- Never edit README.md.
- These instructions apply throughout this repository.

## Project purpose and architecture

Textflow is a TypeScript library of native web components for on-screen pages
with positioned Markdown or HTML blocks. Keep the paged-media presentation.
The goal is to provide both paged and unpaged functions: effectively map boxes
with fixed width and height to boxes with flexible width constrained by
`max-width` and automatic height, while retaining their content and styling.
This mapping is a future library capability, not a claim that it already exists.
Dimensions and presentation are defined by CSS. It is intended for embedding in a
CMS. The studio in `demo/` is an example host application. Prioritize the library's
algorithms, public methods, and behavior; reusable convenience UI will come later.

- Keep the core framework independent. React and other framework integrations
  should use the web component's properties, methods, and DOM events. Any adapters
  should remain optional and reuse the existing TypeScript types.
- The current package entry point is browser-only: `TextflowPage` extends
  `HTMLElement`. Server-rendered hosts must load it in the browser. Do not assume
  the current implementation renders page content on the server.
- Keep Monaco, studio controls, browser storage, and application-specific UI in
  the demo. Monaco is not a library runtime dependency.
- Keep custom-element registration explicit through `registerTextflow()`; importing
  the package must not automatically register elements.

## Initial functional scope

The following capabilities define the initial implementation target. Treat these
as requirements, not as a claim that every capability is already implemented.

- A page contains boxes, each with its own placement and dimensions on the page.
- Each box is a text container accepting either HTML or Markdown. Convert Markdown
  to HTML for rendering, and retain the original content format and source for
  editing and export. Sanitize both rendering paths as described below.
- Provide public functions or methods for creating and editing pages and boxes,
  including their content, placement, dimensions, and styles.
- Pages have CSS, and each box can carry its own freely authored CSS. Support
  ordinary CSS rules for the box and its text rather than restricting authors to
  a fixed set of style controls. Placement and dimensions remain CSS declarations.
- Support exporting and importing reusable page layouts. A layout describes a
  page, its boxes, their placement and dimensions, and page and box CSS.
- Layouts may include text in any box as initial or fixed content. A layout may
  mark individual boxes' text as uneditable for users; admins can still edit it.
  Preserve included text, its format, and lock flags across layout round trips.
- Also support exporting and importing the layout together with all current text
  as a complete, self-contained document. Restore the saved layout and text without
  looking up the original template.
- Retain a provided `layoutId` alongside each page's embedded layout and text.
  This lets the host application find pages derived from a layout when an admin
  explicitly chooses to propagate layout changes.
- Layouts are single-page templates (Seitenvorlagen); documents contain multiple
  independently editable pages, which may use different layouts.
- Admins provide a shared layout catalog. Users add pages from layouts, enter text,
  and freely customize the layout of their own document, including CSS, placement,
  dimensions, and adding or removing boxes. Document edits must not mutate the
  shared layout or other documents derived from it.
- Persist `layoutModified` to indicate local layout customization relative to the
  chosen layout. Text edits alone do not set this flag, and saving a document does
  not clear it. This is separate from an unsaved-changes indicator.

In the current model, `PageTemplate` represents a reusable page layout, while
`PageSnapshot` and `TextflowDocument` represent the layout with resolved content.
A reusable layout can use the same saved format as a populated document, with
empty editable text boxes and any preset or locked content. A separate layout file
format or separate import/export controls are not required.

## Code map

- `src/index.ts`: public exports, `TextflowPage`, registration, rendering,
  selection, layout editing, and DOM events.
- `src/model.ts`: public data types, template instantiation, document snapshots,
  cloning, and JSON validation.
- `src/css.ts`: PostCSS-based declaration editing.
- `demo/main.ts`: studio setup, Monaco editors, controls, and document interaction.
- `demo/storage.ts`: saved studio state and migration from earlier storage formats.
- `demo/templates.ts` and `demo/style.css`: example templates and studio styling.
- `tests/document.spec.ts`: document model and validation tests.
- `tests/studio.spec.ts`: browser integration tests for the library and studio.

## Implementation guidelines

- Use strict TypeScript and the existing ESM setup. Relative TypeScript imports
  use `.js` extensions for the emitted modules. Public types ship with the library.
- Match the surrounding code and keep changes focused on the requested behavior.
- Preserve light DOM rendering so host stylesheets can target blocks and content.
  Textflow owns its element's children; host integrations should use the public API.
- CSS is the source of truth for position, dimensions, and presentation. Do not
  introduce parallel geometry or typography fields in the document model.
- Page and block CSS use native `@scope`; `:scope` selects the relevant page or
  block. Preserve scope isolation between page instances, including repeated IDs.
- Controls, dragging, resizing, and keyboard movement must update CSS through the
  existing editing path. Preserve comments and unrelated rules; malformed CSS must
  not be replaced when declaration editing fails.
- Keep public DOM events bubbling and preserve their existing detail shapes:
  `content-change`, `template-change`, `selection-change`, and `overflow-change`.
- Clean up observers, scheduled frames, and external event listeners when elements
  disconnect. Preserve reconnect behavior.
- Overflow is clipped and reported. Automatic text continuation and print/PDF
  export are not currently implemented.

## Documents and editing policy

- Saved documents are self-contained `{ version: 1, pages: [...] }` snapshots.
  Each page owns its CSS, blocks, lock flags, and complete content; restoring a
  document must not require its original template catalog.
- `layoutId` identifies the source layout independently of the page's `id`. New
  snapshots use the supplied `layoutId`, defaulting to the template's `id` when
  absent. Preserve this reference through edits, persistence, and import/export.
  Older documents without it remain importable. Layout changes do not implicitly
  replace saved page layouts or text; propagation is an explicit host operation.
- New page snapshots default `layoutModified` to false. Layout edits update it;
  no-op edits and canceled gestures must not mark an otherwise unchanged layout.
  Reverting to a known clean baseline clears it. A customized import retains its
  flag because the original layout may be unavailable. The host can explicitly
  reset the baseline by assigning a snapshot with `layoutModified: false` after
  applying or accepting a source layout. Older files without the flag load as false.
- Preserve deep-copy boundaries on templates, content, snapshots, and documents.
  Repeated block IDs on different pages must not share mutable content.
- Validate imported JSON with `parseDocument()` before applying it. Invalid input
  must leave the current document intact.
- Preserve existing storage migrations and retain legacy storage entries.
- Roles and interaction modes are separate. `editorMode` controls text locks:
  users cannot edit locked text or change lock flags; admins can. Both roles can
  edit their own document layout. Template and snapshot assignment are trusted
  host operations, not server-side authorization.
- `editable` enables layout interaction (selection, dragging, resizing, keyboard
  movement). With it disabled, clicking a box selects it for content input.
- Layout selection supports any rendered HTML descendant, including nested
  elements, lists, headings, tables, and images. Keep selection and declaration
  editing in the library; the studio only connects controls to that API.
- `selectContentElement`, `selectedElement`, `selectedElementSelector`, and
  `setSelectedElementCss` provide element targeting. Emit `element-selection-change`
  with `{ boxId, selector }`, preserving the existing box selection event shape.
  Element CSS lives in the box's CSS. Selection markers must not alter saved text.
  Structural selectors follow the current HTML hierarchy; changing its structure
  can change which element a saved selector matches.
- Keep document edits private. `createPageFromLayout` makes a new page with a
  unique identity, the source `layoutId`, and independent preset content and CSS.
  Adding a page must not replace or copy text from an existing page. Catalog
  publication and propagation are explicit host operations; dedicated admin UI
  is deferred.
- Sanitize rendered content with DOMPurify, including HTML produced from Markdown.
  Preserve restrictions on scripts, inline styles, and form controls. Author CSS is
  trusted input and is handled separately from content sanitization.

## Studio behavior

- Render pages at their actual CSS dimensions. Smaller containers scroll; preserve
  the white preview surface and thin outline without automatic scaling or shadows.
- Provide Content and Layout interaction modes for the user's document. Use a
  single right sidebar: content input controls in Content mode and layout/CSS
  controls in Layout mode. Do not add a left sidebar or dedicated admin mode.
- Keep document page navigation, Add page, and box navigation available in both
  modes. Add page opens a single-page layout chooser and appends the chosen page
  to the document. Do not offer a layout selector that replaces the current page.
  Content mode accepts HTML or Markdown. Layout mode supports box movement, dimensions,
  free CSS, and selecting rendered HTML descendants and their parent elements.
- Place page navigation and Add page in the toolbar above the canvas. Keep the
  sidebar focused on the current selection; place Add block beside its block list.
  Show common layout properties first, with custom properties and full CSS source
  in expandable sections. Keep content input spacious and consistently aligned.
- Adding a block selects it. Persist its content, CSS, and lock state together.

## Development and verification

- `npm ci`: install dependencies from the lockfile.
- `npm run dev`: run the Vite studio, normally at `http://localhost:5173`.
- `npm run check`: type-check library and demo.
- `npm run build`: emit library JavaScript and declarations into `dist/`.
- `npm run build:demo`: build the studio into `demo-dist/`.
- `npm test`: run Playwright tests, starting Vite or reusing an existing dev server.
  The configured browser is `/usr/bin/google-chrome`; set `CHROME_PATH` to override.
- `npm pack --dry-run`: inspect package contents when changing package exports or
  distribution behavior.

Run checks appropriate to the change. For TypeScript changes, run the type check
and relevant build; for behavior changes, run the relevant tests and add regression
coverage where useful. Documentation-only edits do not require builds or browser
tests. Report checks that could not run and why. Do not commit generated output,
dependencies, or test reports.
