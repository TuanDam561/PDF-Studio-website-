import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, degrees } from 'pdf-lib';
import { parsePages, loadPdf, mergePdfs, extractPages, organizePdf, watermarkPdf, removeLightBackground } from '../src/lib/pdf-core.js';

async function fixture(widths = [300, 400, 500]) {
  const doc = await PDFDocument.create();
  widths.forEach((width, i) => { const page = doc.addPage([width, 600]); page.drawText(`Page ${i + 1}`); });
  doc.getPage(0).setRotation(degrees(90));
  return doc.save();
}

test('page selection preserves user order and removes duplicates', () => {
  assert.deepEqual(parsePages('4, 1-3, 2', 5), [3, 0, 1, 2]);
  assert.deepEqual(parsePages('', 3), [0, 1, 2]);
});
test('page selection rejects invalid and out-of-range input', () => {
  for (const value of ['0', '-1', '1-7', '3-1', '1,,2', '2.5', 'a', '1;', '99999999999999999999']) assert.throws(() => parsePages(value, 5));
});
test('merge preserves file order and page dimensions', async () => {
  const merged = await PDFDocument.load(await mergePdfs([await fixture([300, 400]), await fixture([700])]));
  assert.deepEqual(merged.getPages().map(p => p.getWidth()), [300, 400, 700]);
  assert.equal(merged.getPage(0).getRotation().angle, 90);
});
test('extract keeps chosen pages in requested order', async () => {
  const output = await PDFDocument.load(await extractPages(await fixture(), [2, 0]));
  assert.deepEqual(output.getPages().map(p => p.getWidth()), [500, 300]);
});
test('organize combines original rotation with requested rotation', async () => {
  const output = await PDFDocument.load(await organizePdf(await fixture(), [{ index: 2, rotation: 90 }, { index: 0, rotation: 90 }]));
  assert.deepEqual(output.getPages().map(p => p.getWidth()), [500, 300]);
  assert.deepEqual(output.getPages().map(p => p.getRotation().angle), [90, 180]);
});
test('empty or invalid output selections are rejected', async () => {
  const input = await fixture();
  await assert.rejects(extractPages(input, []));
  await assert.rejects(extractPages(input, [3]));
  await assert.rejects(organizePdf(input, []));
});
test('corrupt input produces a readable error', async () => {
  await assert.rejects(loadPdf(new TextEncoder().encode('not a PDF')), /Không đọc được PDF/);
});
test('Vietnamese watermark creates embedded font and only modifies selected page', async () => {
  const font = await readFile(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url));
  const original = await fixture();
  const before = await PDFDocument.load(original);
  const output = await PDFDocument.load(await watermarkPdf(original, { pages: '2', kind: 'text', text: 'BẢN NHÁP — Tiếng Việt', size: 36, opacity: 30, angle: 35, color: '#226c54' }, font));
  assert.equal(output.getPageCount(), 3);
  assert.equal(output.getPage(0).getRotation().angle, 90);
  assert.equal(output.getPage(0).node.Contents().size(), before.getPage(0).node.Contents().size());
  assert.ok(output.getPage(1).node.Contents().size() > before.getPage(1).node.Contents().size());
});
test('image watermark embeds PNG without removing pages', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
  const output = await PDFDocument.load(await watermarkPdf(await fixture(), { pages: '', kind: 'image', imageType: 'image/png', imageScale: 35, opacity: 25, angle: 0 }, null, png));
  assert.equal(output.getPageCount(), 3);
});

test('watermark preview uses original page numbers and matches export operations', async () => {
  const font = await readFile(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url));
  const source = await fixture();
  const original = await PDFDocument.load(source);
  const options = { pages: '2', kind: 'text', text: 'XEM TRƯỚC', size: 36, opacity: 40, angle: 35, color: '#226c54' };
  const excluded = await PDFDocument.load(await watermarkPdf(source, options, font, null, 0));
  assert.equal(excluded.getPageCount(), 1);
  assert.equal(excluded.getPage(0).getRotation().angle, 90);
  assert.equal(excluded.getPage(0).node.Contents().size(), original.getPage(0).node.Contents().size());
  const selected = await PDFDocument.load(await watermarkPdf(source, options, font, null, 1));
  const exported = await PDFDocument.load(await watermarkPdf(source, options, font));
  assert.equal(selected.getPageCount(), 1);
  assert.equal(selected.getPage(0).getWidth(), 400);
  const streams = page => page.node.Contents().asArray().map(ref => page.doc.context.lookup(ref).getContents());
  assert.deepEqual(streams(selected.getPage(0)), streams(exported.getPage(1)));
  await assert.rejects(watermarkPdf(source, options, font, null, 3), /Trang xem trước/);
});
test('background removal preserves ink and existing transparency', () => {
  const pixels = new Uint8ClampedArray([255,255,255,255, 0,0,0,255, 225,225,225,255, 0,0,0,90]);
  removeLightBackground(pixels, 240, 30);
  assert.deepEqual([...pixels].filter((_, i) => i % 4 === 3), [0,255,128,90]);
});
