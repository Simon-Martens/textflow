import { test, expect } from '@playwright/test';
import { createPageSnapshot, createDocument, parseDocument, type PageTemplate } from '../src/model.js';

test('documents snapshot defaults, locks, CSS, and per-page user content without references', () => {
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
