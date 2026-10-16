import { test, expect } from '@playwright/test';
import type { PageSnapshot } from '../src/model.js';
import type { TextflowPage } from '../src/index.js';
async function write(page: import('@playwright/test').Page, value: string, source = 'Editor content') {
  const previousMode = await page.locator('#interaction-mode').inputValue();
  await page.selectOption('#interaction-mode', source === 'CSS source' ? 'layout' : 'content');
  if (source === 'CSS source' && !await page.locator('#css-source').evaluate(element => (element as HTMLDetailsElement).open)) await page.locator('#css-source > summary').click();
  await page.getByRole('textbox', { name: source, exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(text => navigator.clipboard.writeText(text), value);
  await page.keyboard.press('ControlOrMeta+V');
  await page.selectOption('#interaction-mode', previousMode);
}
async function addPage(page: import('@playwright/test').Page, layout: string) {
  await page.click('#add-page');
  await page.getByRole('dialog').getByRole('button', {name:layout, exact:true}).click();
}
async function writeCss(page: import('@playwright/test').Page, value: string) { await write(page, value, 'CSS source'); }
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.locator('#editor .monaco-editor')).toBeVisible(); await page.selectOption('#interaction-mode', 'layout'); });
test('Markdown survives reload and adding a page keeps existing text separate', async ({ page }) => {
  await write(page, '# A new beginning\n\n**Hello** page.');
  await expect(page.locator('textflow-page .box[data-block="title"] h1')).toHaveText('A new beginning');
  await expect(page.locator('textflow-page .box[data-block="title"] strong')).toHaveText('Hello');
  await page.reload();
  await expect(page.locator('textflow-page .box[data-block="title"] h1')).toHaveText('A new beginning');
  await addPage(page, 'Letter');
  await expect(page.locator('#document-page')).toHaveValue('1');
  await expect(page.locator('textflow-page .box')).toHaveCount(4);
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Example heading');
  await page.selectOption('#document-page', '0');
  await expect(page.locator('textflow-page .box[data-block="title"] h1')).toHaveText('A new beginning');
});
test('library editing: drag, resize, typography, keyboard, add and remove', async ({ page }) => {

  const box = page.locator('textflow-page .box[data-block="title"]');
  const before = await box.boundingBox();
  await page.mouse.move(before!.x + 30, before!.y + 30); await page.mouse.down(); await page.mouse.move(before!.x + 60, before!.y + 45); await page.mouse.up();
  await expect(page.locator('[data-property="left"]')).toHaveValue('78px');
  const handle = page.locator('textflow-page .tf-handle'); const h = await handle.boundingBox();
  await page.mouse.move(h!.x + 6, h!.y + 6); await page.mouse.down(); await page.mouse.move(h!.x + 36, h!.y + 21); await page.mouse.up();
  await expect(page.locator('[data-property="width"]')).toHaveValue('560px');
  await page.locator('[data-property="font-size"]').fill('20px'); await page.locator('[data-property="font-size"]').press('Tab');
  await expect(box).toHaveCSS('font-size', '20px');
  await box.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-property="left"]')).toHaveValue('79px');
  await page.click('#add'); await expect(page.locator('textflow-page .box')).toHaveCount(7);

  await page.getByRole('button', { name: 'Remove block' }).click(); await expect(page.locator('textflow-page .box')).toHaveCount(6);
});
test('HTML is sanitized and overflow is reported without expanding page', async ({ page }) => {
  await page.selectOption('#interaction-mode', 'content');
  await page.selectOption('#format', 'html');
  await write(page, '<script>window.hacked=true</script><h1 onclick="alert(1)">Safe</h1><img src="x" onerror="window.hacked=true"><p>' + 'words '.repeat(1000) + '</p>');
  const box = page.locator('textflow-page .box[data-block="title"]');
  await expect(box.locator('script')).toHaveCount(0); await expect(box.locator('[onclick],[onerror]')).toHaveCount(0);
  await expect(page.locator('#overflow-status')).toHaveText('Overflow · content clipped');
  await expect(page.locator('textflow-page .page')).toHaveCSS('overflow', 'hidden');
  await expect(page.locator('textflow-page .page')).toHaveCSS('height', '850px');
});
test('JSON export contains a self-contained document', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download'); await page.click('#export'); const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('textflow-document.json');
  const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString()); expect(exported.pages).toHaveLength(1); expect(exported.pages[0].boxes.find((b: {id: string}) => b.id === 'title').content.format).toBe('markdown'); expect(exported).not.toHaveProperty('templates'); expect(exported.pages[0].css).toContain('width: 640px');
  expect(exported.pages[0].layoutId).toBe('journal');
  expect(exported.pages[0].id).not.toBe('journal');
  expect(exported.pages[0].layoutModified).toBe(false);
});

test('a supplied layout reference survives editing, reload, export, and import without its template', async ({ page }) => {
  const snapshot = await page.evaluate(() => (document.querySelector('textflow-page') as HTMLElement & {snapshot: PageSnapshot}).snapshot);
  snapshot.id = 'page-instance-17'; snapshot.layoutId = 'cms-layout-article';
  await page.setInputFiles('#import-file', {name:'page.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,pages:[snapshot]}))});
  await expect(page.locator('#template')).toHaveCount(0);
  await write(page, '# Edited document');
  await page.locator('[data-property="left"]').fill('91px'); await page.locator('[data-property="left"]').press('Tab');
  await page.reload();
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Edited document');
  await expect(page.locator('[data-block="title"]')).toHaveCSS('left', '91px');
  const pending = page.waitForEvent('download'); await page.click('#export');
  const download = await pending; const stream = await download.createReadStream(); const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const buffer = Buffer.concat(chunks); const saved = JSON.parse(buffer.toString());
  expect(saved.pages[0].id).toBe('page-instance-17');
  expect(saved.pages[0].layoutId).toBe('cms-layout-article');
  expect(saved.pages[0].layoutModified).toBe(true);
  await write(page, '# Changed after export');
  await page.setInputFiles('#import-file', {name:'saved.json',mimeType:'application/json',buffer});
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Edited document');
  const restored = await page.evaluate(() => (document.querySelector('textflow-page') as HTMLElement & {snapshot: PageSnapshot}).snapshot);
  expect(restored).toEqual(saved.pages[0]);
});
test('CSS source styles block content, controls edit the same source, and undo works', async ({ page }) => {

  await writeCss(page, `/* keep this comment */
:scope {
  left: 3em;
  top: 100px;
  width: 70%;
  height: 200px;
  font-size: 20px;
  --heading-color: rgb(120, 20, 80);
}
h1 { color: var(--heading-color); font-size: 31px; }
@media (min-width: 1px) { p { text-decoration: underline; } }`);
  const title = page.locator('[data-block="title"]');
  await expect(title).toHaveCSS('width', '448px');
  await expect(title.locator('h1')).toHaveCSS('color', 'rgb(120, 20, 80)');
  await expect(title.locator('h1')).toHaveCSS('font-size', '31px');
  await page.locator('[data-property="font-size"]').fill('24px'); await page.locator('[data-property="font-size"]').press('Tab');
  await expect(title).toHaveCSS('font-size', '24px');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('textflow-studio-v3')!).document.pages[0].boxes.find((b: {id: string}) => b.id === 'title'));
  expect(saved.css).toContain('font-size: 24px'); expect(saved.css).toContain('/* keep this comment */'); expect(saved.css).toContain('@media'); expect(saved).not.toHaveProperty('fontSize'); expect(saved).not.toHaveProperty('width');
  await page.getByRole('textbox', { name: 'CSS source', exact: true }).focus(); await page.keyboard.press('ControlOrMeta+Z');
  await expect(title).toHaveCSS('font-size', '20px');
  await page.reload(); await expect(title.locator('h1')).toHaveCSS('font-size', '31px');
});
test('ordinary application CSS can target a block and its descendants', async ({ page }) => {
  await page.addStyleTag({ content: 'textflow-page [data-block="title"] h1 { color: rgb(0, 90, 190); font-size: 42px; }' });
  await expect(page.locator('[data-block="title"] h1')).toHaveCSS('color', 'rgb(0, 90, 190)');
  await expect(page.locator('[data-block="title"] h1')).toHaveCSS('font-size', '42px');
  await expect(page.locator('[data-block="body"] h2').first()).not.toHaveCSS('color', 'rgb(0, 90, 190)');
});
test('block CSS is scoped; page CSS can target blocks; CSS-only sizing drives clipping', async ({ page }) => {

  await writeCss(page, ':scope { left: 40px; top: 50px; width: 300px; height: 30px; } h1 { color: rgb(200, 0, 0); }');
  await expect(page.locator('#overflow-status')).toHaveText('Overflow · content clipped');
  await expect(page.locator('#field-title')).not.toHaveCSS('color', 'rgb(200, 0, 0)');
  await page.click('#page-css');
  await writeCss(page, ':scope { width: 700px; height: 900px; background: ivory; } [data-block="note"] { background: rgb(240, 220, 180); }');
  await expect(page.locator('textflow-page .page')).toHaveCSS('width', '700px');
  await expect(page.locator('#page-wrap')).toHaveCSS('width', '700px');
  await expect(page.locator('[data-block="note"]')).toHaveCSS('background-color', 'rgb(240, 220, 180)');
});
test('malformed CSS is preserved when controls cannot edit it', async ({ page }) => {
   await writeCss(page, ':scope { width: 300px; /* unfinished');
  await page.locator('[data-property="width"]').fill('400px'); await page.locator('[data-property="width"]').press('Tab');
  await expect(page.locator('#css-error')).toHaveText('Fix the CSS syntax before using the controls.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('textflow-studio-v3')!).document.pages[0].boxes.find((b: {id: string}) => b.id === 'title').css);
  expect(saved).toBe(':scope { width: 300px; /* unfinished');
});
test('CSS scopes stay separate across page instances', async ({ page }) => {
  await page.evaluate(() => {
    const first = document.querySelector('textflow-page') as HTMLElement & {template: unknown; content: unknown};
    const second = document.createElement('textflow-page') as typeof first;
    second.template = structuredClone(first.template); second.content = first.content; document.body.append(second);
  });
   await writeCss(page, ':scope { left: 48px; top: 112px; width: 530px; height: 184px; } h1 { color: rgb(12, 34, 56); }');
  await expect(page.locator('textflow-page').first().locator('[data-block="title"] h1')).toHaveCSS('color', 'rgb(12, 34, 56)');
  await expect(page.locator('textflow-page').last().locator('[data-block="title"] h1')).not.toHaveCSS('color', 'rgb(12, 34, 56)');
});
test('saved option-based templates migrate into CSS without losing content', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.removeItem('textflow-studio-v3');
    localStorage.setItem('textflow-studio-v1', JSON.stringify({ templates: [{ id: 'old', name: 'My template', width: 720, height: 900, background: '#eeeeee', boxes: [{ id: 'title', label: 'My heading', x: 80, y: 100, width: 420, height: 200, fontFamily: 'Arial', fontSize: 22, lineHeight: 1.4, color: '#123456', padding: 10, textAlign: 'center' }] }], content: { title: { format: 'markdown', value: '# My saved content' } } }));
  });
  await page.reload();
  await expect(page.locator('[data-block="title"] h1')).toHaveText('My saved content');
  await expect(page.locator('textflow-page .page')).toHaveCSS('width', '720px');
  await expect(page.locator('[data-block="title"]')).toHaveCSS('left', '80px');
  await expect(page.locator('[data-block="title"]')).toHaveCSS('font-size', '22px');

  await page.selectOption('#interaction-mode', 'layout');
  await page.locator('[data-property="font-size"]').fill('23px'); await page.locator('[data-property="font-size"]').press('Tab');
  const saved = await page.evaluate(() => ({ current: JSON.parse(localStorage.getItem('textflow-studio-v3')!), old: localStorage.getItem('textflow-studio-v1') }));
  expect(saved.current.document.pages[0].boxes[0].css).toContain('font-size: 23px');
  expect(saved.current.templates[0].boxes[0].css).toContain('font-size: 22px');
  expect(saved.current.document.pages[0].boxes[0].content.value).toBe('# My saved content');
  expect(saved.old).toContain('fontSize');
});
test('locked content stays protected while users can customize its layout', async ({ page }) => {
  await write(page, '# Fixed heading');
  await page.evaluate(() => {
    const element = document.querySelector('textflow-page') as TextflowPage;
    element.editorMode = 'admin'; element.setBoxLocked('title', true); element.editorMode = 'user';
  });
  await page.selectOption('#interaction-mode', 'content');
  await page.getByRole('button', {name: /Headline/}).click();
  await expect(page.locator('#lock-message')).toBeVisible();
  await expect(page.locator('#format')).toBeDisabled();
  await write(page, '# User replacement');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Fixed heading');
  const result = await page.evaluate(() => {
    const element = document.querySelector('textflow-page') as TextflowPage;
    const edited = element.setFieldContent('title', {format:'markdown', value:'replacement'});
    const unlocked = element.setBoxLocked('title', false);
    element.content = {...element.content, title: {format:'markdown', value:'bulk replacement'}};
    element.setBoxCss('title', element.template!.boxes.find(box => box.id === 'title')!.css + '\n:scope { left: 90px; }');
    return {edited, unlocked, value: element.content.title.value};
  });
  expect(result).toEqual({edited:false, unlocked:false, value:'# Fixed heading'});
  await expect(page.locator('[data-block="title"]')).toHaveCSS('left', '90px');
  await page.getByRole('button', {name: /Main story/}).click(); await write(page, 'User body');
  await page.reload();
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Fixed heading');
  await expect(page.locator('[data-block="body"] .content')).toHaveText('User body');
  await page.evaluate(() => {
    const element = document.querySelector('textflow-page') as TextflowPage;
    element.editorMode = 'admin'; element.setFieldContent('title', {format:'markdown',value:'# Revised by admin'});
    element.setBoxLocked('title', false); element.editorMode = 'user';
  });
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Revised by admin');
  await page.getByRole('button', {name: /Headline/}).click();
  await write(page, '# Now editable'); await expect(page.locator('[data-block="title"] h1')).toHaveText('Now editable');
});

test('exported snapshot imports independently of changed or missing templates', async ({ page }) => {
  await write(page, '# Archived heading');  await page.evaluate(() => { const element = document.querySelector('textflow-page') as TextflowPage; element.editorMode = 'admin'; element.setBoxLocked('title', true); element.editorMode = 'user'; });
   await page.locator('[data-property="left"]').fill('91px'); await page.locator('[data-property="left"]').press('Tab');
  const pending = page.waitForEvent('download'); await page.click('#export');
  const download = await pending; const stream = await download.createReadStream(); const chunks=[];
  for await (const chunk of stream!) chunks.push(chunk);
  const buffer = Buffer.concat(chunks); const saved = JSON.parse(buffer.toString());
  expect(saved.pages[0].boxes.find((b: {id: string}) => b.id === 'title').locked).toBe(true);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('textflow-studio-v3')!);
    state.templates = []; localStorage.setItem('textflow-studio-v3',JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Archived heading');
  await expect(page.locator('[data-block="title"]')).toHaveCSS('left', '91px');
  await write(page, '# Changed after saving');
  await page.setInputFiles('#import-file', {name:'saved.json',mimeType:'application/json',buffer});
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Archived heading');
  await expect(page.locator('[data-block="title"]')).toHaveCSS('left', '91px');
  await page.selectOption('#interaction-mode', 'content');
  await expect(page.locator('#lock-message')).toBeVisible();
  // Render the same payload using only the library's snapshot API, without a template lookup.
  const independent = await page.evaluate(async json => {
    const {parseDocument} = await import('/src/index.ts');
    const data = parseDocument(json);
    const element = document.createElement('textflow-page') as HTMLElement & {snapshot: unknown};
    element.snapshot = data.pages[0]; document.body.replaceChildren(element);
    const block = element.querySelector('[data-block="title"]')!;
    return {text:block.querySelector('h1')!.textContent, left:getComputedStyle(block).left, locked:block.hasAttribute('data-locked')};
  },buffer.toString());
  expect(independent).toEqual({text:'Archived heading',left:'91px',locked:true});
});
test('import preserves all pages and rejects malformed documents without replacing current data', async ({ page }) => {
  const state = await page.evaluate(() => {
    const element = document.querySelector('textflow-page') as unknown as {snapshot: unknown};
    return element.snapshot;
  });
  const first = state as {name:string;boxes:{id:string;content:{format:string;value:string}}[]};
  first.name = 'First'; first.boxes.find(b=>b.id==='title')!.content.value = '# First page';
  const second = structuredClone(first); second.name = 'Second'; second.boxes.find(b=>b.id==='title')!.content.value = '# Second page';
  await page.setInputFiles('#import-file',{name:'pages.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,pages:[first,second]}))});
  await expect(page.locator('[data-block="title"] h1')).toHaveText('First page');
  await page.selectOption('#document-page','1'); await expect(page.locator('[data-block="title"] h1')).toHaveText('Second page');
  await write(page, '# Edited second page');
  await page.selectOption('#document-page','0'); await expect(page.locator('[data-block="title"] h1')).toHaveText('First page');
  const before = await page.evaluate(()=>localStorage.getItem('textflow-studio-v3'));
  await page.setInputFiles('#import-file',{name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":100,"pages":[]}')});
  await expect(page.locator('#import-error')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('textflow-studio-v3'))).toBe(before);
  const restored = JSON.parse(before!).document;
  expect(restored.pages[1].boxes.find((b:{id:string})=>b.id==='title').content.value).toBe('# Edited second page');
});

test('users customize their document while the shared catalog stays unchanged', async ({ page }) => {
  await page.selectOption('#interaction-mode', 'layout');
  const catalog = await page.evaluate(() => JSON.parse(localStorage.getItem('textflow-studio-v3')!).templates);
  const original = await page.evaluate(() => (document.querySelector('textflow-page') as TextflowPage).snapshot!);
  await addPage(page, 'Letter');
  const id = await page.evaluate(() => (document.querySelector('textflow-page') as TextflowPage).snapshot!.id);
  await write(page, '# My letter');
  await expect(page.locator('#layout-status')).toHaveText('Original layout');
  await writeCss(page, ':scope { left: 91px; top: 165px; width: 400px; height: 175px; }');
  await expect(page.locator('[data-block="title"]')).toHaveCSS('left', '91px');
  await expect(page.locator('#layout-status')).toHaveText('Layout customized');
  await page.click('#add'); await expect(page.locator('textflow-page .box')).toHaveCount(5);
  await write(page, 'My extra box');
  await page.click('#remove'); await expect(page.locator('textflow-page .box')).toHaveCount(4);
  await page.click('#page-css');
  await writeCss(page, ':scope { width: 700px; height: 900px; }');
  await page.reload();
  await expect(page.locator('textflow-page .page')).toHaveCSS('width', '700px');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('My letter');
  await expect(page.locator('#layout-status')).toHaveText('Layout customized');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('textflow-studio-v3')!));
  expect(saved.templates).toEqual(catalog);
  expect(saved.document.pages[0]).toEqual(original);
  expect(saved.document.pages[1]).toMatchObject({id,layoutId:'letter',layoutModified:true});
  await addPage(page, 'Article');
  await expect(page.locator('#layout-status')).toHaveText('Original layout');
  expect(await page.evaluate(() => (document.querySelector('textflow-page') as TextflowPage).snapshot)).toMatchObject({layoutId:'journal',layoutModified:false});
});

test('layout tracking ignores text and no-ops, detects structural changes, and recognizes a clean baseline', async ({ page }) => {
  const result = await page.evaluate(() => {
    const element = document.createElement('textflow-page') as TextflowPage;
    element.template = {id:'instance',layoutId:'source-layout',name:'Test',css:':scope { width: 600px; height: 800px; }',boxes:[{id:'body',label:'Body',css:':scope { left: 20px; }'}]};
    document.body.append(element); element.editable = true;
    const original = element.template!;
    const states: Record<string, boolean> = {initial: element.layoutModified};
    element.setFieldContent('body', {format:'markdown',value:'User text'}); states.text = element.layoutModified;
    element.setBoxCss('body', original.boxes[0].css); element.removeBox('missing'); states.noOps = element.layoutModified;
    element.setBoxCss('body', ':scope { left: 40px; }'); states.boxCss = element.layoutModified;
    element.setBoxCss('body', original.boxes[0].css); states.revertedCss = element.layoutModified;
    element.setPageCss(':scope { width: 700px; }'); states.pageCss = element.layoutModified;
    element.setPageCss(original.css); states.revertedPage = element.layoutModified;
    element.addBox({id:'extra',label:'Extra',css:''}); states.added = element.layoutModified;
    element.removeBox('extra'); states.removedExtra = element.layoutModified;
    element.editorMode = 'admin'; element.setBoxLocked('body', true); states.locked = element.layoutModified;
    element.setBoxLocked('body', false); states.unlocked = element.layoutModified;
    element.snapshot = { ...element.snapshot!, layoutModified: true }; states.customizedImport = element.layoutModified;
    element.setFieldContent('body', {format:'markdown',value:'Updated text'}); states.importedText = element.layoutModified;
    element.snapshot = { ...element.snapshot!, layoutModified: false }; states.acceptedBaseline = element.layoutModified;
    const snapshot = element.snapshot!; element.remove();
    return {states, snapshot};
  });
  expect(result.states).toEqual({initial:false,text:false,noOps:false,boxCss:true,revertedCss:false,pageCss:true,revertedPage:false,added:true,removedExtra:false,locked:true,unlocked:false,customizedImport:true,importedText:true,acceptedBaseline:false});
  expect(result.snapshot).toMatchObject({layoutId:'source-layout',layoutModified:false});
  expect(result.snapshot.boxes[0].content.value).toBe('Updated text');
});

test('canceling a user drag restores CSS and the original layout flag', async ({ page }) => {
  await page.selectOption('#interaction-mode', 'layout');
  const original = await page.evaluate(() => (document.querySelector('textflow-page') as TextflowPage).snapshot);
  const bounds = await page.locator('[data-block="title"]').boundingBox();
  await page.mouse.move(bounds!.x + 30, bounds!.y + 30); await page.mouse.down();
  await page.mouse.move(bounds!.x + 60, bounds!.y + 45);
  await expect(page.locator('#layout-status')).toHaveText('Layout customized');
  await page.mouse.move(bounds!.x + 30, bounds!.y + 30);
  await expect(page.locator('#layout-status')).toHaveText('Original layout');
  await page.mouse.move(bounds!.x + 60, bounds!.y + 45);
  await page.locator('textflow-page').dispatchEvent('pointercancel'); await page.mouse.up();
  await expect(page.locator('#layout-status')).toHaveText('Original layout');
  expect(await page.evaluate(() => (document.querySelector('textflow-page') as TextflowPage).snapshot)).toEqual(original);
});

test('content and layout modes are separate and persist without admin controls', async ({ page }) => {
  await page.selectOption('#interaction-mode', 'content');
  await expect(page.locator('.right-panel #layout-tools')).toBeHidden();
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#role, #save-layout, #new-template, .left-panel')).toHaveCount(0);
  const original = await page.evaluate(() => (document.querySelector('textflow-page') as TextflowPage).snapshot);
  const bounds = await page.locator('[data-block="title"]').boundingBox();
  await page.mouse.move(bounds!.x + 30, bounds!.y + 30); await page.mouse.down();
  await page.mouse.move(bounds!.x + 60, bounds!.y + 45); await page.mouse.up();
  expect(await page.evaluate(() => (document.querySelector('textflow-page') as TextflowPage).snapshot)).toEqual(original);
  await page.locator('[data-block="body"] h2').first().click();
  await expect(page.locator('#field-title')).toHaveText('Main story');
  await page.reload();
  await expect(page.locator('#interaction-mode')).toHaveValue('content');
  await page.selectOption('#interaction-mode', 'layout');
  await expect(page.locator('.right-panel #layout-tools')).toBeVisible();
  await expect(page.locator('#editor')).toBeHidden();
  await page.reload();
  await expect(page.locator('#interaction-mode')).toHaveValue('layout');
  await expect(page.locator('.right-panel #layout-tools')).toBeVisible();
});

test('HTML descendants and their parents can be selected and styled without changing source', async ({ page }) => {
  await page.selectOption('#interaction-mode', 'content');
  await page.selectOption('#format', 'html');
  const html = '<h2>Heading</h2><p>First <strong>nested</strong></p><p>Second paragraph</p><ul><li>List item</li></ul>';
  await write(page, html);
  await page.selectOption('#interaction-mode', 'layout');
  await writeCss(page, ':scope { left: 20px; top: 40px; width: 500px; height: 300px; }');
  // Establish a clean source baseline; selecting descendants alone is not a layout edit.
  await page.evaluate(() => { const element = document.querySelector('textflow-page') as TextflowPage; element.snapshot = {...element.snapshot!, layoutModified:false}; });
  const box = page.locator('[data-block="title"]');
  await box.locator('strong').click();
  await expect(box.locator('strong')).toHaveAttribute('data-tf-selected', '');
  expect(await page.evaluate(() => (document.querySelector('textflow-page') as TextflowPage).layoutModified)).toBe(false);
  await expect(page.locator('#element-target')).toContainText('strong');
  await page.locator('[data-property="color"]').fill('rgb(123, 45, 67)'); await page.locator('[data-property="color"]').press('Tab');
  await expect(box.locator('strong')).toHaveCSS('color', 'rgb(123, 45, 67)');
  await expect(box.locator('p').last()).not.toHaveCSS('color', 'rgb(123, 45, 67)');
  await expect(page.locator('#layout-status')).toHaveText('Layout customized');
  await page.click('#select-parent');
  await expect(box.locator('p').first()).toHaveAttribute('data-tf-selected', '');
  await expect(page.locator('#select-parent')).toBeDisabled();
  await box.locator('li').click(); await page.click('#select-parent');
  await expect(box.locator('ul')).toHaveAttribute('data-tf-selected', '');
  await box.locator('h2').click();
  await expect(box.locator('h2')).toHaveAttribute('data-tf-selected', '');
  await page.click('#block-css');
  await expect(box.locator('[data-tf-selected]')).toHaveCount(0);
  await expect(page.locator('[data-property="left"]')).toBeVisible();
  const saved = await page.evaluate(() => (document.querySelector('textflow-page') as TextflowPage).snapshot!);
  expect(saved.boxes.find(box => box.id === 'title')!.content).toEqual({format:'html',value:html});
  expect(saved.boxes.find(box => box.id === 'title')!.css).toContain(':scope > .content > p:nth-of-type(1) > strong:nth-of-type(1)');
  await page.reload();
  await expect(box.locator('strong')).toHaveCSS('color', 'rgb(123, 45, 67)');
  await box.locator('strong').click();
  await page.selectOption('#interaction-mode', 'content');
  await expect(box.locator('[data-tf-selected]')).toHaveCount(0);
});

test('generic element selection handles all HTML descendants and rejects external nodes', async ({ page }) => {
  const result = await page.evaluate(() => {
    const element = document.querySelector('textflow-page') as TextflowPage;
    element.setFieldContent('title', {format:'html',value:'<div><h3>Heading</h3><p>Words <em>emphasis</em><a href="#target">link</a></p><ol><li>Item</li></ol><table><tbody><tr><td>Cell</td></tr></tbody></table><img alt="Image"><hr></div>'});
    const content = element.getBoxElement('title')!.querySelector<HTMLElement>('.content')!;
    const selected = [...content.querySelectorAll<HTMLElement>('*')].map(node => {
      const success = element.selectContentElement(node);
      return success && element.selectedElement === node && !!element.selectedElementSelector;
    });
    const external = element.selectContentElement(document.body);
    const root = element.selectContentElement(content);
    const image = content.querySelector<HTMLElement>('img')!;
    element.selectContentElement(image); element.setSelectedElementCss({display:'block',width:'64px'});
    const imageWidth = getComputedStyle(image).width;
    element.setFieldContent('title', {format:'markdown',value:'Replacement'});
    const cleared = element.selectedElement === null && element.selectedElementSelector === null;
    element.editable = false;
    const disabled = element.selectContentElement(content.querySelector<HTMLElement>('p'));
    return {selected,external,root,imageWidth,cleared,disabled};
  });
  expect(result.selected.length).toBeGreaterThan(10);
  expect(result.selected.every(Boolean)).toBe(true);
  expect(result).toMatchObject({external:false,root:false,imageWidth:'64px',cleared:true,disabled:false});
});

test('add page chooser appends mixed layouts and the whole document survives export and import', async ({ page }) => {
  await page.selectOption('#interaction-mode', 'content');
  await write(page, '# First article');
  await page.click('#add-page');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', {name:'Cancel'}).click();
  await expect(page.locator('#document-page option')).toHaveCount(1);
  await page.click('#add-page'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await addPage(page, 'Letter'); await write(page, '# My letter');
  await page.selectOption('#interaction-mode', 'layout');
  await addPage(page, 'Article'); await write(page, '# Second article');
  await page.locator('[data-property="left"]').fill('97px'); await page.locator('[data-property="left"]').press('Tab');
  await expect(page.locator('#document-page option')).toHaveText(['1. Article','2. Letter','3. Article']);
  await page.selectOption('#document-page', '0');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('First article');
  await expect(page.locator('[data-block="title"]')).toHaveCSS('left','48px');
  await expect(page.locator('#layout-status')).toHaveText('Original layout');
  await page.selectOption('#document-page', '1');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('My letter');
  await page.reload();
  await expect(page.locator('#document-page')).toHaveValue('1');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('My letter');
  const pending = page.waitForEvent('download'); await page.click('#export');
  const stream = await (await pending).createReadStream(); const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const buffer = Buffer.concat(chunks), document = JSON.parse(buffer.toString());
  expect(document.pages.map((p: PageSnapshot) => p.layoutId)).toEqual(['journal','letter','journal']);
  expect(new Set(document.pages.map((p: PageSnapshot) => p.id)).size).toBe(3);
  expect(document.pages.map((p: PageSnapshot) => p.layoutModified)).toEqual([false,false,true]);
  await write(page, '# Changed since export');
  await page.setInputFiles('#import-file',{name:'document.json',mimeType:'application/json',buffer});
  await expect(page.locator('#document-page')).toHaveValue('0');
  await page.selectOption('#document-page','2');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Second article');
  await expect(page.locator('[data-block="title"]')).toHaveCSS('left','97px');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('textflow-studio-v3')!).document)).toEqual(document);
});
