import type { PageTemplate, PageContent } from '../src/index.js';
export const pageCss = `:scope {
  width: 640px;
  height: 850px;
  background: #ffffff;
  font-family: Georgia, serif;
  font-size: 18px;
  line-height: 1.5;
  color: #242925;
}
p { margin: 0 0 .8em; }
h1, h2, h3 { line-height: 1.12; margin: 0 0 .5em; }
h1 { font-size: 2.4em; }
h2 { font-size: 1.6em; }
h3 { font-size: 1.2em; }
.content > :first-child { margin-top: 0; }
.content > :last-child { margin-bottom: 0; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; }
table { border-collapse: collapse; max-width: 100%; }
td, th { border: 1px solid #ccc; padding: .25em; }
blockquote { margin: 1em 0; padding-left: 1em; border-left: 2px solid currentColor; }`;
export const templates: PageTemplate[] = [
  { id: 'journal', name: 'Article', css: pageCss, boxes: [
    { id: 'eyebrow', label: 'Issue & category', css: ':scope { left: 48px; top: 44px; width: 544px; height: 30px; font-family: Arial, sans-serif; font-size: 11px; color: #687761; }' },
    { id: 'title', label: 'Headline', css: `:scope {
  left: 48px;
  top: 112px;
  width: 530px;
  height: 184px;
  font-size: 27px;
  line-height: 1.1;
}` },
    { id: 'intro', label: 'Introduction', css: ':scope { left: 48px; top: 316px; width: 515px; height: 95px; font-size: 21px; color: #596450; }' },
    { id: 'body', label: 'Main story', css: ':scope { left: 48px; top: 450px; width: 320px; height: 310px; font-size: 15px; line-height: 1.5; }' },
    { id: 'note', label: 'Margin note', css: ':scope { left: 412px; top: 452px; width: 180px; height: 300px; font-size: 13px; line-height: 1.5; color: #65715c; }' },
    { id: 'footer', label: 'Page footer', css: ':scope { left: 48px; top: 790px; width: 544px; height: 25px; font-family: Arial, sans-serif; font-size: 10px; color: #7c8275; }' },
  ] },
  { id: 'letter', name: 'Letter', css: pageCss, boxes: [
    { id: 'eyebrow', label: 'Issue & category', css: ':scope { left: 65px; top: 60px; width: 510px; height: 40px; font-family: Arial, sans-serif; font-size: 11px; }' },
    { id: 'title', label: 'Headline', css: ':scope { left: 65px; top: 165px; width: 510px; height: 175px; font-size: 23px; }' },
    { id: 'body', label: 'Main story', css: ':scope { left: 65px; top: 390px; width: 510px; height: 335px; font-size: 18px; line-height: 1.7; }' },
    { id: 'footer', label: 'Page footer', css: ':scope { left: 65px; top: 785px; width: 510px; height: 25px; font-size: 11px; }' },
  ] },
  { id: 'poster', name: 'Poster', css: pageCss, boxes: [
    { id: 'eyebrow', label: 'Issue & category', css: ':scope { left: 48px; top: 45px; width: 544px; height: 30px; font-family: Arial, sans-serif; font-size: 12px; }' },
    { id: 'title', label: 'Headline', css: ':scope { left: 48px; top: 180px; width: 544px; height: 300px; font-family: Arial, sans-serif; font-size: 33px; line-height: 1.05; }' },
    { id: 'intro', label: 'Introduction', css: ':scope { left: 48px; top: 560px; width: 450px; height: 150px; font-size: 24px; }' },
    { id: 'footer', label: 'Page footer', css: ':scope { left: 48px; top: 790px; width: 544px; height: 25px; font-family: Arial, sans-serif; font-size: 11px; }' },
  ] },
];
export const initialContent: PageContent = Object.fromEntries(Object.entries({
  eyebrow: 'SAMPLE DOCUMENT',
  title: '# Example heading',
  intro: 'This page contains separate blocks for a heading, introduction, body text, margin note, and footer.',
  body: 'Select a block in the sidebar to edit its content. The source editor accepts Markdown or HTML. Changes appear on the page as you type.\n\n## Formatting\n\nText can contain **bold**, *italic*, links, headings, and lists. Each block has its own font, size, line height, and alignment.\n\n## Layout\n\nMove or resize blocks in your document. Content that exceeds a block is clipped.',
  note: '**Margin note**\n\nThis is a separate text block. Its position, dimensions, and typography can be edited independently of the main text.',
  footer: 'Sample document · Page 1',
}).map(([key, value]) => [key, { format: 'markdown', value }]));
