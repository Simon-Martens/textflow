import { test, expect } from '@playwright/test';
async function write(page: import('@playwright/test').Page, value: string, source = 'Editor content') {
  await page.getByRole('textbox', { name: source, exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(text => navigator.clipboard.writeText(text), value);
  await page.keyboard.press('ControlOrMeta+V');
}
async function writeCss(page: import('@playwright/test').Page, value: string) { await write(page, value, 'CSS source'); }
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.locator('#editor .monaco-editor')).toBeVisible(); });
test('Markdown updates live, survives reload, and switches templates', async ({ page }) => {
  await write(page, '# A new beginning\n\n**Hello** page.');
  await expect(page.locator('textflow-page .box[data-block="title"] h1')).toHaveText('A new beginning');
  await expect(page.locator('textflow-page .box[data-block="title"] strong')).toHaveText('Hello');
  await page.reload();
  await expect(page.locator('textflow-page .box[data-block="title"] h1')).toHaveText('A new beginning');
  await page.selectOption('#template', 'letter');
  await expect(page.locator('textflow-page .box')).toHaveCount(4);
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
});
test('authors can create a page template, set dimensions and add content', async ({ page }) => {
   await page.click('#new-template');
  await expect(page.locator('textflow-page .box')).toHaveCount(0);
  await page.locator('[data-property=width]').fill('720px'); await page.locator('[data-property=width]').press('Tab');
  await expect(page.locator('textflow-page .page')).toHaveCSS('width', '720px');
  await page.click('#add'); await expect(page.locator('textflow-page .box')).toHaveCount(1);
   await write(page, '# First words');
  await expect(page.locator('textflow-page h1')).toHaveText('First words');
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
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('textflow-studio-v3')!).templates[0].boxes.find((b: {id: string}) => b.id === 'title'));
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
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('textflow-studio-v3')!).templates[0].boxes.find((b: {id: string}) => b.id === 'title').css);
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

  await page.locator('[data-property="font-size"]').fill('23px'); await page.locator('[data-property="font-size"]').press('Tab');
  const saved = await page.evaluate(() => ({ current: JSON.parse(localStorage.getItem('textflow-studio-v3')!), old: localStorage.getItem('textflow-studio-v1') }));
  expect(saved.current.templates[0].boxes[0].css).toContain('font-size: 23px');
  expect(saved.current.document.pages[0].boxes[0].content.value).toBe('# My saved content');
  expect(saved.old).toContain('fontSize');
});
test('admins can set and lock text; users can edit only unlocked fields', async ({ page }) => {
  await write(page, '# Fixed heading');  await page.check('#locked');
  await page.selectOption('#role', 'user');
  await expect(page.locator('.left-panel')).toBeHidden();
  await expect(page.locator('#lock-message')).toBeVisible();
  await expect(page.locator('#format')).toBeDisabled();
  await write(page, '# User replacement');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Fixed heading');
  const result = await page.evaluate(() => {
    const element = document.querySelector('textflow-page') as unknown as {
      setFieldContent: (id: string, field: {format: string; value: string}) => boolean;
      setBoxLocked: (id: string, locked: boolean) => boolean;
      setBoxCss: (id: string, css: string) => void;
      content: Record<string, {format: string; value: string}>;
      snapshot: {boxes: {id: string; css: string}[]};
    };
    const before = element.snapshot.boxes.find(b => b.id === 'title')!.css;
    const edited = element.setFieldContent('title', {format:'markdown', value:'replacement'});
    const unlocked = element.setBoxLocked('title', false);
    element.content = {...element.content, title: {format:'markdown', value:'bulk replacement'}};
    element.setBoxCss('title', ':scope { display: none; }');
    return {edited, unlocked, value: element.content.title.value, sameCss: before === element.snapshot.boxes.find(b => b.id === 'title')!.css};
  });
  expect(result).toEqual({edited:false, unlocked:false, value:'# Fixed heading', sameCss:true});
  await page.getByRole('button', {name: /Main story/}).click(); await write(page, 'User body');
  await expect(page.locator('[data-block="body"] .content')).toHaveText('User body');
  await page.reload();
  await expect(page.locator('#role')).toHaveValue('user');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Fixed heading');
  await expect(page.locator('[data-block="body"] .content')).toHaveText('User body');
  await page.selectOption('#role', 'admin'); await page.getByRole('button', {name: /Headline/}).click();
  await write(page, '# Revised by admin');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Revised by admin');
   await page.uncheck('#locked'); await page.selectOption('#role','user');
  await write(page, '# Now editable'); await expect(page.locator('[data-block="title"] h1')).toHaveText('Now editable');
});
test('exported snapshot imports independently of changed or missing templates', async ({ page }) => {
  await write(page, '# Archived heading');  await page.check('#locked');
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
  await page.selectOption('#role','user');
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

test('admin can add custom text directly from content view and lock it for users', async ({ page }) => {
  await expect(page.locator('#add')).toBeVisible();
  await page.click('#add');
  await expect(page.locator('.left-panel #lock-row')).toBeVisible();
  await expect(page.locator('.right-panel #editor')).toBeVisible();
  await write(page, 'Fixed admin notice');
   await page.check('#locked');
  await expect(page.locator('#lock-row')).toBeVisible();

  await expect(page.locator('#lock-row')).toBeVisible();

  await expect(page.locator('#locked')).toBeChecked();
  const id = await page.evaluate(() => (document.querySelector('textflow-page') as unknown as {selectedBoxId:string}).selectedBoxId);
  const block = page.locator(`[data-block="${id}"]`);
  await expect(block.locator('.content')).toHaveText('Fixed admin notice');
  await page.selectOption('#role','user');
  await expect(page.locator('#add')).toBeHidden();
  await expect(page.locator('#lock-message')).toBeVisible();
  await write(page, 'User replacement');
  await expect(block.locator('.content')).toHaveText('Fixed admin notice');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('textflow-studio-v3')!).document);
  const savedBlock = saved.pages[0].boxes.find((box:{id:string})=>box.id===id);
  expect(savedBlock.locked).toBe(true);
  expect(savedBlock.content.value).toBe('Fixed admin notice');
  await page.selectOption('#role','admin');
  await expect(page.locator('.left-panel #add')).toBeVisible();
});

test('admin sees simultaneous CSS and text editors; user has only the right sidebar', async ({ page }) => {
  await expect(page.locator('.left-panel')).toBeVisible();
  await expect(page.locator('.left-panel #css-editor')).toBeVisible();
  await expect(page.locator('.left-panel #locked')).toBeVisible();
  await expect(page.locator('.right-panel #navigation')).toBeVisible();
  await expect(page.locator('.right-panel #editor')).toBeVisible();
  await write(page, '# Admin writes text');
  await page.check('#locked');
  await write(page, '# Admin edits locked text');
  await writeCss(page, ':scope { left: 60px; top: 100px; width: 500px; height: 200px; color: rgb(50, 60, 70); }');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Admin edits locked text');
  await expect(page.locator('[data-block="title"]')).toHaveCSS('left', '60px');
  await expect(page.locator('#locked')).toBeChecked();
  await page.click('#page-css');
  await write(page, '# Still editing the same box');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Still editing the same box');
  await page.selectOption('#role', 'user');
  await expect(page.locator('.left-panel')).toBeHidden();
  await expect(page.locator('.right-panel #navigation')).toBeVisible();
  await expect(page.locator('.right-panel #editor')).toBeVisible();
  await write(page, '# User must not change this');
  await expect(page.locator('[data-block="title"] h1')).toHaveText('Still editing the same box');
  await page.reload();
  await expect(page.locator('.left-panel')).toBeHidden();
  await page.selectOption('#role', 'admin');
  await expect(page.locator('.left-panel #css-editor')).toBeVisible();
  await expect(page.locator('.right-panel #editor')).toBeVisible();
  await expect(page.locator('#locked')).toBeChecked();
});
