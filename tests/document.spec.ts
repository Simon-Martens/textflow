import { test, expect } from '@playwright/test';
import { createPageFromLayout, createPageSnapshot, createDocument, parseDocument, type PageTemplate } from '../src/model.js';

test('documents snapshot defaults, locks, CSS, and per-page user content without template lookups', () => {
  const template: PageTemplate = {
    id: 'sample', name: 'Original', css: ':scope { width: 600px; height: 800px; }',
    boxes: [
      {id:'fixed',label:'Fixed',css:':scope { color: red; }',locked:true,content:{format:'html',value:'<b>Admin text</b>'}},
      {id:'body',label:'Body',css:':scope { width: 200px; }',content:{format:'markdown',value:'Default'}},
    ],
  };
  const first = createPageSnapshot(template, {fixed:{format:'markdown',value:'User replacement'},body:{format:'markdown',value:'First page'}});
  const second = createPageSnapshot(template, {body:{format:'markdown',value:'Second page'}});
  const document = createDocument([first,second]);
  template.boxes[0].content!.value = 'Changed template'; template.css = 'changed'; first.boxes[1].content.value = 'Changed source';
  const restored = parseDocument(JSON.stringify(document));
  expect(restored.pages[0].boxes[0].content.value).toBe('<b>Admin text</b>');
  expect(restored.pages[0].boxes[0].locked).toBe(true);
  expect(restored.pages[0].css).toContain('600px');
  expect(restored.pages[0].boxes[1].content.value).toBe('First page');
  expect(restored.pages[1].boxes[1].content.value).toBe('Second page');
});
test('document validation rejects incomplete snapshots and duplicate block IDs', () => {
  const page = createPageSnapshot({id:'test',name:'Test',css:'',boxes:[{id:'a',label:'A',css:''}]});
  expect(parseDocument(JSON.stringify(createDocument([page]))).pages[0].boxes[0].content.value).toBe('');
  expect(() => parseDocument(JSON.stringify({version:2,pages:[page]}))).toThrow();
  expect(() => parseDocument(JSON.stringify({version:1,pages:[{...page,boxes:[{id:'a',label:'A',css:''}]}]}))).toThrow();
  expect(() => parseDocument(JSON.stringify({version:1,pages:[{...page,boxes:[page.boxes[0],page.boxes[0]]}]}))).toThrow();
});

test('layout references survive document round trips independently of page IDs and template changes', () => {
  const layout: PageTemplate = {
    id: 'template-page', layoutId: 'cms-article', name: 'Article', css: ':scope { width: 600px; }',
    boxes: [{id:'body',label:'Body',css:':scope { left: 20px; }'}],
  };
  const first = createPageSnapshot(layout, {body:{format:'markdown',value:'First page'}});
  first.layoutModified = true;
  const second = createPageSnapshot(layout, {body:{format:'html',value:'<p>Second page</p>'}});
  first.id = 'page-1'; second.id = 'page-2';
  const other = createPageSnapshot({...layout, id:'page-3', layoutId:'cms-letter'});
  const document = createDocument([first, second, other]);
  layout.layoutId = 'different-layout'; layout.css = 'changed';
  const restored = parseDocument(JSON.stringify(document));
  expect(restored.pages.map(page => ({id:page.id,layoutId:page.layoutId}))).toEqual([
    {id:'page-1',layoutId:'cms-article'},
    {id:'page-2',layoutId:'cms-article'},
    {id:'page-3',layoutId:'cms-letter'},
  ]);
  expect(restored.pages[0].css).toContain('600px');
  expect(restored.pages[0].boxes[0].content.value).toBe('First page');
  expect(restored.pages.map(page => page.layoutModified)).toEqual([true, false, false]);
  expect(restored.pages[1].boxes[0].content).toEqual({format:'html',value:'<p>Second page</p>'});
  expect(createPageSnapshot(restored.pages[0]).layoutId).toBe('cms-article');
});

test('layout identifiers default to the template ID and older documents remain importable', () => {
  const page = createPageSnapshot({id:'article',name:'Article',css:'',boxes:[]});
  expect(page.layoutId).toBe('article');
  expect(page.layoutModified).toBe(false);
  delete page.layoutId; delete page.layoutModified;
  const restored = parseDocument(JSON.stringify(createDocument([page])));
  expect(restored.pages[0]).not.toHaveProperty('layoutId');
  expect(restored.pages[0]).not.toHaveProperty('layoutModified');
  expect(createPageSnapshot(restored.pages[0]).layoutId).toBe('article');
  expect(createPageSnapshot(restored.pages[0]).layoutModified).toBe(false);
});

test('document validation rejects invalid layout identifiers', () => {
  const page = createPageSnapshot({id:'article',name:'Article',css:'',boxes:[]});
  for (const layoutId of [null, 42, {}, '', '   ']) {
    expect(() => parseDocument(JSON.stringify({version:1,pages:[{...page,layoutId}]}))).toThrow('Invalid layout identifier');
  }
});

test('document validation rejects non-boolean layout modified flags', () => {
  const page = createPageSnapshot({id:'article',name:'Article',css:'',boxes:[]});
  for (const layoutModified of [null, 0, 1, 'false', {}]) {
    expect(() => parseDocument(JSON.stringify({version:1,pages:[{...page,layoutModified}]}))).toThrow('Invalid layout modified flag');
  }
});


test('single-page layouts create distinct pages with independent presets and layout references', () => {
  const layout: PageTemplate = {id:'article',layoutId:'cms-article',layoutModified:true,name:'Article',css:':scope { width: 600px; }',boxes:[
    {id:'fixed',label:'Fixed',css:'',locked:true,content:{format:'html',value:'<p>Preset</p>'}},
    {id:'body',label:'Body',css:''},
  ]};
  const first = createPageFromLayout(layout, {body:{format:'markdown',value:'First page'},fixed:{format:'html',value:'Override'}});
  const second = createPageFromLayout(layout);
  expect(new Set([layout.id, first.id, second.id]).size).toBe(3);
  expect(first).toMatchObject({layoutId:'cms-article',layoutModified:false});
  expect(second).toMatchObject({layoutId:'cms-article',layoutModified:false});
  expect(first.boxes[0].content.value).toBe('<p>Preset</p>');
  expect(second.boxes[1].content.value).toBe('');
  first.boxes[0].content.value = 'Changed'; first.boxes[1].css = ':scope { color: red; }';
  expect(second.boxes[0].content.value).toBe('<p>Preset</p>');
  expect(layout.boxes[0].content!.value).toBe('<p>Preset</p>');
  expect(second.boxes[1].css).toBe('');
});
