import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { unzipSync } from 'fflate';
import createQpdf from '@soulehshaikh99/qpdf-wasm';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const results = join(root, 'test-results');
await mkdir(results, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!pathname.startsWith('/pdf-tool/')) { res.writeHead(404).end(); return; }
  const path = resolve(dist, pathname.slice('/pdf-tool/'.length) || 'index.html');
  if (!path.startsWith(dist)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.PDF_TOOL_BROWSER || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/chromium');
let context;
const errors = [];
const external = [];
const missing = [];
try {
  context = await chromium.launchPersistentContext(join(root, '.cache/browser-test-profile'), {
    executablePath, headless: true, viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce',
    acceptDownloads: true, downloadsPath: join(results, 'downloads'),
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin)) external.push(request.url()); if (request.method() !== 'GET') external.push(`${request.method()} ${request.url()}`); });
  page.on('response', response => { if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`); });
  let visit = 0;
  async function route(name = '') { await page.goto(`${origin}/pdf-tool/?test=${++visit}#/${name}`); }
  async function fixture(label, widths) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < widths.length; i++) {
      const p = doc.addPage([widths[i], 600]);
      p.drawText(`${label} / Page ${i + 1}`, { x: 24, y: 540, size: 20 });
      p.drawRectangle({ x: 25, y: 80, width: 100, height: 100, color: rgb(.2, .5, .35) });
    }
    doc.getPage(0).setRotation(degrees(90));
    return Buffer.from(await doc.save());
  }
  const a = { name: 'Tai lieu A.pdf', mimeType: 'application/pdf', buffer: await fixture('A', [300,400,500]) };
  const b = { name: 'Tai lieu B.pdf', mimeType: 'application/pdf', buffer: await fixture('B', [600,700]) };
  async function encryptedFixture(name, password, bits = '256') {
    const qpdf = await createQpdf({ print: () => {}, printErr: () => {} });
    qpdf.FS.writeFile('/plain.pdf', a.buffer);
    assert.equal(qpdf.callMain(['/plain.pdf', '--encrypt', password, 'owner-test', bits, ...(bits === '128' ? ['--use-aes=y'] : []), '--print=none', '--modify=none', '--extract=n', '--', '/locked.pdf']), 0);
    const buffer = Buffer.from(qpdf.FS.readFile('/locked.pdf'));
    await assert.rejects(PDFDocument.load(buffer), /encrypted/i);
    return { name, mimeType: 'application/pdf', buffer };
  }
  const input = () => page.locator('input[type=file]').first();
  async function download(name) {
    await page.getByRole('heading', { name: 'Xử lý hoàn tất', exact: true }).waitFor();
    const promise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Tải xuống', exact: true }).click();
    const item = await promise;
    const path = join(results, name); await item.saveAs(path); return readFile(path);
  }
  if (!process.env.PDF_TOOL_ENCRYPT_ONLY) {
  await route();
  assert.equal(await page.locator('.tool-card').count(), 10);
  await page.screenshot({ path: join(results, 'home-desktop.png'), fullPage: true });
  await page.getByRole('textbox', { name: 'Tìm công cụ' }).fill('watermark');
  assert.equal(await page.locator('.tool-card').count(), 1);
  await page.getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(results, 'home-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Ghép PDF', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  console.log('PASS: dashboard, search, mobile navigation and no horizontal overflow');

  await input().setInputFiles([a,b]);
  await page.locator('.file-row').nth(1).waitFor();
  await page.getByRole('button', { name: 'Ghép PDF', exact: true }).last().click();
  const merged = await PDFDocument.load(await download('merged.pdf'));
  assert.deepEqual(merged.getPages().map(p => p.getWidth()), [300,400,500,600,700]);
  console.log('PASS: merge worker, downloadable PDF and page order');

  await route('split'); await input().setInputFiles(a); await page.locator('.file-row').waitFor();
  await page.getByLabel(/^Trang cần lấy/).fill('3, 1');
  await page.getByRole('button', { name: 'Tách PDF', exact: true }).last().click();
  const extracted = await PDFDocument.load(await download('extracted.pdf'));
  assert.deepEqual(extracted.getPages().map(p => p.getWidth()), [500,300]);
  await page.getByLabel(/^Cách tách/).selectOption('groups');
  await page.getByLabel(/^Các nhóm trang/).fill('1-2; 3');
  await page.getByRole('button', { name: 'Tách PDF', exact: true }).last().click();
  const entries = unzipSync(new Uint8Array(await download('split.zip')));
  assert.equal(Object.keys(entries).length, 2);
  const sizes = await Promise.all(Object.values(entries).map(async bytes => (await PDFDocument.load(bytes)).getPageCount()));
  assert.deepEqual(sizes, [2,1]);
  await page.getByLabel(/^Các nhóm trang/).fill('0-9');
  await page.getByRole('button', { name: 'Tách PDF', exact: true }).last().click();
  await page.getByRole('alert').filter({ hasText: 'Chọn trang từ 1' }).waitFor();
  console.log('PASS: extract, ZIP groups and invalid page ranges');

  await route('organize'); await input().setInputFiles(a); await page.locator('.page-tile').nth(2).waitFor();
  await page.getByRole('heading', { name: 'Chỉnh sửa & sắp xếp trang', exact: true }).waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.waitForFunction(() => document.querySelectorAll('.page-canvas.ready').length === 3);
    const buttons = page.locator('.page-tile-actions');
    const before = await buttons.first().boundingBox();
    assert.equal(Math.round(before.y), Math.round((await buttons.nth(1).boundingBox()).y));
    for (let turn = 0; turn < 4; turn++) {
      await page.getByRole('button', { name: 'Xoay trang 1', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.page-canvas.ready').length === 3);
      assert.equal(Math.round((await buttons.first().boundingBox()).y), Math.round(before.y), 'Toolbar must stay fixed after rotation');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(results, `organize-stable-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Xoay trang 1', exact: true }).click();
  await page.getByRole('button', { name: 'Di chuyển trang 3 lên trước', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa trang 2', exact: true }).click();
  await page.locator('.page-canvas.ready').first().waitFor();
  await page.screenshot({ path: join(results, 'organize-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Lưu PDF', exact: true }).click();
  const edited = await PDFDocument.load(await download('organized.pdf'));
  assert.deepEqual(edited.getPages().map(p => p.getWidth()), [300,500]);
  assert.equal(edited.getPage(0).getRotation().angle, 180);
  console.log('PASS: PDF.js thumbnails, page rotation, reordering and deletion');

  await route('preview');
  await input().setInputFiles({ ...a, name: 'Long reading.pdf', buffer: await fixture('Read', Array(40).fill(400)) });
  const reader = page.locator('.pdf-reader');
  const readingStage = reader.getByRole('region', { name: 'Nội dung PDF' });
  const currentPage = reader.getByLabel('Trang đang xem');
  await reader.locator('.page-canvas.ready').first().waitFor();
  assert.equal(await reader.getByRole('button', { name: 'Cuộn dọc', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await reader.locator('[data-pdf-page]').count(), 40);
  assert.ok(await reader.locator('canvas').count() < 8, 'Only nearby pages should allocate canvases');
  await readingStage.hover(); await page.mouse.wheel(0, 1500);
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Trang đang xem"]').value) > 1);
  await currentPage.fill('10');
  await reader.locator('[data-pdf-page="10"] .page-canvas.ready').waitFor();
  assert.equal(await currentPage.inputValue(), '10');
  await reader.getByRole('button', { name: 'Phóng to', exact: true }).click();
  await reader.locator('[data-pdf-page="10"] .page-canvas.ready').waitFor();
  assert.equal(await currentPage.inputValue(), '10');
  await reader.getByRole('button', { name: 'Thu nhỏ', exact: true }).click();
  await reader.getByRole('button', { name: 'Từng trang', exact: true }).click();
  await reader.locator('canvas[aria-label="Trang 10"]').waitFor();
  await reader.getByRole('button', { name: 'Bấm bên phải để sang trang sau', exact: true }).click();
  assert.equal(await currentPage.inputValue(), '11');
  await reader.getByRole('button', { name: 'Bấm bên trái để về trang trước', exact: true }).click();
  assert.equal(await currentPage.inputValue(), '10');
  await readingStage.focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await currentPage.inputValue(), '9');
  await page.keyboard.press('ArrowRight');
  assert.equal(await currentPage.inputValue(), '10');
  await currentPage.fill('40');
  assert.ok(await reader.getByRole('button', { name: 'Bấm bên phải để sang trang sau', exact: true }).isDisabled());
  await currentPage.fill('1');
  assert.ok(await reader.getByRole('button', { name: 'Bấm bên trái để về trang trước', exact: true }).isDisabled());
  await reader.screenshot({ path: join(results, 'pdf-reader-paged-desktop.png') });
  await reader.getByRole('button', { name: 'Trang sau', exact: true }).click();
  assert.equal(await currentPage.inputValue(), '2');
  await reader.getByRole('button', { name: 'Cuộn dọc', exact: true }).click();
  await reader.locator('[data-pdf-page="2"] .page-canvas.ready').waitFor();
  assert.equal(await currentPage.inputValue(), '2');
  await currentPage.fill('35');
  await reader.locator('[data-pdf-page="35"] .page-canvas.ready').waitFor();
  await page.waitForFunction(() => !document.querySelector('.pdf-reader [data-pdf-page="1"] canvas'));
  assert.ok(await reader.locator('canvas').count() < 8);
  await reader.screenshot({ path: join(results, 'pdf-reader-scroll-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await reader.locator('[data-pdf-page="35"] .page-canvas.ready').waitFor();
  assert.equal(await currentPage.inputValue(), '35');
  assert.ok(await readingStage.evaluate(el => el.scrollWidth <= el.clientWidth + 1), '100% zoom fits the mobile reading area');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await reader.screenshot({ path: join(results, 'pdf-reader-scroll-mobile.png') });
  await reader.getByRole('button', { name: 'Từng trang', exact: true }).click();
  await reader.getByRole('button', { name: 'Bấm bên phải để sang trang sau', exact: true }).click();
  assert.equal(await currentPage.inputValue(), '36');
  await reader.screenshot({ path: join(results, 'pdf-reader-paged-mobile.png') });
  // A different file starts at page 1, with vertical scrolling again.
  await page.getByRole('button', { name: 'Bỏ Long reading.pdf', exact: true }).click();
  await input().setInputFiles(b); await reader.locator('.page-canvas.ready').first().waitFor();
  assert.equal(await currentPage.inputValue(), '1');
  assert.equal(await reader.getByRole('button', { name: 'Cuộn dọc', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.setViewportSize({ width: 1440, height: 1100 });
  console.log('PASS: default continuous PDF reading, scroll/page sync, lazy canvases, side clicks, keyboard, boundaries, zoom, mobile and file reset');

  await route('watermark'); await input().setInputFiles(a); await page.locator('.file-row').waitFor();
  const live = page.locator('.watermark-preview');
  const originalCanvas = live.locator('.preview-original canvas');
  const outputCanvas = live.locator('.preview-output canvas');
  const waitLive = () => live.locator('.preview-output .page-canvas.ready').waitFor();
  const pixels = locator => locator.evaluate(canvas => canvas.toDataURL());
  await waitLive();
  const sourcePixels = await pixels(originalCanvas);
  const firstWatermark = await pixels(outputCanvas);
  assert.notEqual(firstWatermark, sourcePixels);
  await page.getByLabel('Nội dung dấu chìm', { exact: true }).fill('THỬ NHANH');
  await page.getByLabel('Nội dung dấu chìm', { exact: true }).fill('BẢN NHÁP - Tiếng Việt');
  await waitLive();
  assert.notEqual(await pixels(outputCanvas), firstWatermark);
  assert.equal(await pixels(originalCanvas), sourcePixels);
  await page.getByLabel(/^Áp dụng cho trang/).fill('2');
  await waitLive();
  await live.getByText('Trang 1 nằm ngoài phạm vi đã chọn nên được giữ nguyên.').waitFor();
  assert.equal(await pixels(outputCanvas), await pixels(originalCanvas));
  await page.getByRole('button', { name: 'Trang xem trước tiếp theo', exact: true }).click();
  await waitLive();
  assert.notEqual(await pixels(outputCanvas), await pixels(originalCanvas));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(results, 'watermark-live-text.png'), fullPage: true });
  await page.getByLabel(/^Áp dụng cho trang/).fill('');
  await waitLive();
  await page.getByRole('button', { name: 'Thêm watermark', exact: true }).last().click();
  const marked = await download('watermark.pdf');
  assert.equal((await PDFDocument.load(marked)).getPageCount(), 3);
  await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
  await page.locator('.result-panel .page-canvas.ready').first().waitFor();
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: join(results, 'watermark-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByRole('button', { name: 'Phóng to', exact: true }).click();
  await page.locator('.result-panel .page-canvas.ready').first().waitFor();
  console.log('PASS: Vietnamese font, watermark worker, result preview and viewer controls');

  await page.getByRole('button', { name: 'Hình ảnh', exact: true }).click();
  await live.getByText('Chọn ảnh PNG hoặc JPG để xem trước dấu chìm.', { exact: true }).waitFor();
  const markPng = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 60; const c = canvas.getContext('2d'); c.fillStyle = '#bd2168'; c.fillRect(0, 0, 160, 60); return canvas.toDataURL().split(',')[1]; });
  await page.locator('.image-input').setInputFiles({ name: 'stamp.png', mimeType: 'image/png', buffer: Buffer.from(markPng, 'base64') });
  await waitLive();
  const firstImagePixels = await pixels(outputCanvas);
  assert.notEqual(firstImagePixels, await pixels(originalCanvas));
  await page.getByLabel(/^Độ đậm:/).fill('80');
  await page.getByLabel(/^Góc xoay:/).fill('0');
  await waitLive();
  assert.notEqual(await pixels(outputCanvas), firstImagePixels);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(results, 'watermark-live-image.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(results, 'watermark-live-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Thêm watermark', exact: true }).last().click();
  assert.equal((await PDFDocument.load(await download('watermark-image.pdf'))).getPageCount(), 3);
  console.log('PASS: live text/image preview, rapid edits, original unchanged, page ranges and responsive panes');

  await route('compare'); await input().setInputFiles([a,a]); await page.locator('.file-row').nth(1).waitFor();
  await page.getByRole('button', { name: 'So sánh PDF', exact: true }).last().click();
  await page.getByRole('heading', { name: 'Hai file giống nhau hoàn toàn', exact: true }).waitFor();
  await route('compare'); await input().setInputFiles([a,b]); await page.locator('.file-row').nth(1).waitFor();
  await page.getByRole('button', { name: 'So sánh PDF', exact: true }).last().click();
  await page.locator('.compare-report').waitFor();
  assert.equal(await page.locator('.report-status.missing').count(), 1);
  assert.ok(await page.locator('.report-status.different').count() >= 1);
  console.log('PASS: exact hash and visual/text comparison with missing pages');

  const longA = { ...a, buffer: await fixture('A', Array(100).fill(400)) };
  const longB = { ...b, buffer: await fixture('B', Array(100).fill(400)) };
  await route('compare'); await input().setInputFiles([longA, longB]); await page.locator('.file-row').nth(1).waitFor();
  await page.getByRole('button', { name: 'So sánh PDF', exact: true }).last().click();
  await page.getByRole('button', { name: 'Hủy tác vụ', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Đã hủy tác vụ' }).waitFor();
  assert.equal(await page.locator('.file-row').count(), 2);
  console.log('PASS: cancellation keeps original selected files');

  await route('signature');
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 120; const c = canvas.getContext('2d'); c.fillStyle = 'white'; c.fillRect(0,0,300,120); c.fillStyle = '#222'; c.font = 'italic 36px serif'; c.fillText('Signature', 35, 70); return canvas.toDataURL().split(',')[1]; });
  await input().setInputFiles({ name: 'signature.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('.checkerboard canvas').waitFor();
  assert.equal(await page.locator('.checkerboard canvas').evaluate(c => c.getContext('2d').getImageData(0,0,1,1).data[3]), 0);
  await page.getByRole('button', { name: 'Tạo PNG trong suốt', exact: true }).click();
  const image = await download('signature.png'); assert.ok(image.length > 100);
  console.log('PASS: signature background removal and transparent PNG download');

  const sourceImage = page.locator('.crop-frame canvas');
  const processedImage = page.locator('.checkerboard canvas');
  const sizeOf = locator => locator.evaluate(c => [c.width, c.height]);
  const originalPixels = await sourceImage.evaluate(c => [...c.getContext('2d').getImageData(0,0,c.width,c.height).data]);
  const originalImage = await pixels(sourceImage);
  await page.getByRole('button', { name: 'Chỉnh ảnh', exact: true }).click();
  await page.getByRole('button', { name: 'Xoay phải 90°', exact: true }).click();
  assert.deepEqual(await sizeOf(sourceImage), [120,300]);
  assert.ok(await sourceImage.evaluate((c, before) => {
    const after = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    for (let y = 0; y < 120; y++) for (let x = 0; x < 300; x++) for (let channel = 0; channel < 4; channel++) {
      if (before[(y * 300 + x) * 4 + channel] !== after[(x * 120 + (119-y)) * 4 + channel]) return false;
    }
    return true;
  }, originalPixels));
  await page.getByRole('button', { name: 'Hoàn tác chỉnh ảnh', exact: true }).click();
  assert.equal(await pixels(sourceImage), originalImage);
  await page.getByRole('button', { name: 'Làm lại chỉnh ảnh', exact: true }).click();
  assert.deepEqual(await sizeOf(sourceImage), [120,300]);
  await page.getByRole('button', { name: 'Xoay trái 90°', exact: true }).click();
  assert.equal(await pixels(sourceImage), originalImage);
  await page.getByRole('button', { name: 'Cắt ảnh', exact: true }).click();
  assert.ok(await page.getByRole('button', { name: 'Tạo PNG trong suốt', exact: true }).isDisabled());
  const overlay = await page.locator('.crop-overlay').boundingBox();
  await page.mouse.move(overlay.x + overlay.width * .02, overlay.y + overlay.height * .02);
  await page.mouse.down();
  await page.mouse.move(overlay.x + overlay.width * .85, overlay.y + overlay.height * .85, { steps: 6 });
  await page.mouse.up();
  assert.ok(Number(await page.getByLabel('Chiều rộng vùng cắt', { exact: true }).inputValue()) > 200);
  assert.ok(Number(await page.getByLabel('Chiều rộng vùng cắt', { exact: true }).inputValue()) < 270);
  const previousWidth = Number(await page.getByLabel('Chiều rộng vùng cắt', { exact: true }).inputValue());
  const handle = await page.locator('.crop-handle.se').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down(); await page.mouse.move(handle.x - 15, handle.y - 8, { steps: 4 }); await page.mouse.up();
  assert.ok(Number(await page.getByLabel('Chiều rộng vùng cắt', { exact: true }).inputValue()) < previousWidth);
  await page.getByRole('button', { name: 'Hủy cắt', exact: true }).click();
  assert.equal(await pixels(sourceImage), originalImage);
  assert.deepEqual(await sizeOf(processedImage), [300,120]);

  await page.getByRole('button', { name: 'Cắt ảnh', exact: true }).click();
  for (const [label, value] of [['Cách trái',30], ['Cách trên',20], ['Chiều rộng',200], ['Chiều cao',80]]) {
    await page.getByLabel(`${label} vùng cắt`, { exact: true }).fill(String(value));
  }
  assert.deepEqual(await sizeOf(processedImage), [200,80]);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: join(results, 'signature-crop-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(results, 'signature-crop-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Áp dụng cắt', exact: true }).click();
  assert.deepEqual(await sizeOf(sourceImage), [200,80]);
  await page.getByRole('button', { name: 'Xoay phải 90°', exact: true }).click();
  assert.deepEqual(await sizeOf(processedImage), [80,200]);
  await page.getByRole('button', { name: 'Tạo PNG trong suốt', exact: true }).click();
  const editedImage = await download('signature-cropped-rotated.png');
  assert.deepEqual([editedImage.readUInt32BE(16), editedImage.readUInt32BE(20)], [80,200]);
  assert.ok(await processedImage.evaluate(c => {
    const pixels = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let clear = 0, ink = 0;
    for (let i = 3; i < pixels.length; i += 4) { if (!pixels[i]) clear++; else ink++; }
    return clear > 0 && ink > 0;
  }));
  await page.getByRole('button', { name: 'Đặt lại ảnh gốc', exact: true }).click();
  assert.equal(await pixels(sourceImage), originalImage);
  assert.deepEqual(await sizeOf(processedImage), [300,120]);
  assert.equal(await page.locator('.result-panel').count(), 0);
  console.log('PASS: crop drag/resize/cancel, exact dimensions, rotation pixels, undo/redo, reset and edited PNG export');

  await route('merge'); await input().setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await page.getByRole('alert').filter({ hasText: 'không phải file PDF' }).waitFor();
  }
  const restricted = await encryptedFixture('restricted.pdf', '');
  const encrypted = await encryptedFixture('password.pdf', 'test-user');
  await route('organize'); await input().setInputFiles(restricted);
  await page.locator('.page-tile').nth(2).waitFor();
  assert.equal(await page.locator('dialog').count(), 0);
  await page.getByRole('status').filter({ hasText: 'Đã mở khóa 1 PDF' }).waitFor();
  await page.getByRole('button', { name: 'Xoay trang 1', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu PDF', exact: true }).click();
  const unlocked = await PDFDocument.load(await download('unlocked-restricted.pdf'));
  assert.equal(unlocked.isEncrypted, false);
  assert.equal(unlocked.getPageCount(), 3);
  assert.equal(unlocked.getPage(0).getRotation().angle, 180);
  await route('organize'); await input().setInputFiles(encrypted);
  const dialog = page.getByRole('dialog');
  await dialog.waitFor().catch(async error => { console.log('Password import state:', await page.locator('.workbench').innerText(), errors, missing); throw error; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(results, 'pdf-password-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await dialog.getByLabel('Mật khẩu PDF').fill('wrong');
  await dialog.getByRole('button', { name: 'Mở PDF', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Mật khẩu chưa đúng' }).waitFor();
  assert.equal(await dialog.getByLabel('Mật khẩu PDF').inputValue(), '');
  await dialog.getByLabel('Mật khẩu PDF').fill('test-user');
  await dialog.getByRole('button', { name: 'Mở PDF', exact: true }).click();
  await page.locator('.page-tile').nth(2).waitFor();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Lưu PDF', exact: true }).click();
  const passwordOutput = await PDFDocument.load(await download('unlocked-password.pdf'));
  assert.equal(passwordOutput.getPageCount(), 3);
  assert.deepEqual(passwordOutput.getPages().map(p => p.getWidth()), [300,400,500]);
  // Content survives decryption: compare text and rendered pixels against the plain source.
  await route('compare'); await input().setInputFiles([a, restricted]);
  await page.locator('.file-row').nth(1).waitFor();
  await page.getByRole('button', { name: 'So sánh PDF', exact: true }).last().click();
  await page.locator('.compare-report').waitFor();
  assert.equal(await page.locator('.report-status.same').count(), 3);
  await page.getByText('Hai file có dữ liệu nhị phân khác nhau. Bảng dưới đối chiếu nội dung hiển thị.', { exact: true }).waitFor();
  // Password cancel is recoverable, keeps prior selections; owner password and AES-128 work too.
  await route('merge'); await input().setInputFiles(a); await page.locator('.file-row').waitFor();
  await input().setInputFiles(encrypted); await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Hủy mở file', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Đã hủy thêm file' }).waitFor();
  assert.equal(await page.locator('.file-row').count(), 1);
  const encrypted128 = await encryptedFixture('aes128.pdf', 'test-128', '128');
  await input().setInputFiles(encrypted128); await dialog.waitFor();
  await dialog.getByLabel('Mật khẩu PDF').fill('owner-test');
  await dialog.getByRole('button', { name: 'Mở PDF', exact: true }).click();
  await page.locator('.file-row').nth(1).waitFor();
  await page.getByRole('button', { name: 'Ghép PDF', exact: true }).last().click();
  assert.equal((await PDFDocument.load(await download('merged-unlocked.pdf'))).getPageCount(), 6);
  // Navigating away while waiting for a password must not leak a dialog or block the next tool.
  await route('organize'); await input().setInputFiles(encrypted); await dialog.waitFor();
  await page.evaluate(() => { location.hash = '#/split'; });
  await dialog.waitFor({ state: 'detached' });
  await input().setInputFiles(a); await page.locator('.file-row').waitFor();
  console.log('PASS: restricted PDF, AES-256/128, incorrect/correct/owner passwords, cancel, navigation, decrypted export and preserved text/pixels');
  for (const id of ['word','excel','encrypt']) { await route(id); await page.getByText('Phát triển sau', { exact: true }).waitFor(); assert.equal(await page.locator('input[type=file]').count(), 0); }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  assert.deepEqual(missing, [], `Missing static resources: ${missing.join('\n')}`);
  assert.deepEqual(external, [], `Unexpected outbound requests: ${external.join('\n')}`);
  console.log('PASS: invalid files, future tools, static subpath hosting, no external requests or browser exceptions');
  console.log(`Screenshots and downloaded outputs: ${results}`);
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
}
