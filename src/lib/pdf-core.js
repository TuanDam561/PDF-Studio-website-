import { PDFDocument, degrees, rgb } from 'pdf-lib';

export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const MAX_TOTAL_SIZE = 200 * 1024 * 1024;

export function parsePages(value, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('PDF không có trang hợp lệ.');
  if (!value.trim()) return Array.from({ length: count }, (_, i) => i);
  const result = [];
  for (const token of value.split(',')) {
    const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Khoảng trang chưa đúng. Ví dụ: 1-3, 5, 8-10.');
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from < 1 || to > count || from > to) throw new Error(`Chọn trang từ 1 đến ${count}, theo thứ tự tăng dần trong mỗi khoảng.`);
    for (let p = from; p <= to; p++) result.push(p - 1);
  }
  return [...new Set(result)];
}

export async function loadPdf(bytes) {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    if (!doc.getPageCount()) throw new Error('PDF không có trang.');
    return doc;
  } catch (error) {
    if (/encrypt|password/i.test(error.message)) throw Object.assign(new Error('PDF cần được mở khóa trước khi xử lý.'), { code: 'ENCRYPTED_PDF' });
    throw new Error(`Không đọc được PDF. File có thể bị hỏng hoặc không đúng định dạng. ${error.message === 'PDF không có trang.' ? error.message : ''}`);
  }
}

export async function mergePdfs(inputs, progress = () => {}) {
  const output = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    const doc = await loadPdf(inputs[i]);
    for (const page of await output.copyPages(doc, doc.getPageIndices())) output.addPage(page);
    progress(Math.round(((i + 1) / inputs.length) * 85));
  }
  return output.save();
}

export async function extractPages(input, indices) {
  const doc = await loadPdf(input);
  if (!indices.length || indices.some(i => !Number.isInteger(i) || i < 0 || i >= doc.getPageCount())) throw new Error('Danh sách trang không hợp lệ.');
  const output = await PDFDocument.create();
  for (const page of await output.copyPages(doc, indices)) output.addPage(page);
  return output.save();
}

export async function organizePdf(input, order) {
  const doc = await loadPdf(input);
  if (!order.length) throw new Error('Cần giữ lại ít nhất một trang.');
  const output = await PDFDocument.create();
  for (const item of order) {
    if (!Number.isInteger(item.index) || item.index < 0 || item.index >= doc.getPageCount()) throw new Error('Trang không hợp lệ.');
    const [page] = await output.copyPages(doc, [item.index]);
    page.setRotation(degrees(((page.getRotation().angle + item.rotation) % 360 + 360) % 360));
    output.addPage(page);
  }
  return output.save();
}

export async function watermarkPdf(input, options, fontBytes, imageBytes, previewIndex) {
  let doc = await loadPdf(input);
  let indices = parsePages(options.pages || '', doc.getPageCount());
  // Preview uses the very same PDF renderer as export, but produces only the visible page.
  if (previewIndex !== undefined) {
    if (!Number.isInteger(previewIndex) || previewIndex < 0 || previewIndex >= doc.getPageCount()) throw new Error('Trang xem trước không hợp lệ.');
    const preview = await PDFDocument.create();
    const [page] = await preview.copyPages(doc, [previewIndex]);
    preview.addPage(page);
    doc = preview;
    if (!indices.includes(previewIndex)) return doc.save();
    indices = [0];
  }
  const opacity = Number(options.opacity) / 100;
  const angle = Number(options.angle);
  if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1 || !Number.isFinite(angle)) throw new Error('Thông số dấu chìm không hợp lệ.');
  let font, image;
  if (options.kind === 'text') {
    if (!options.text.trim()) throw new Error('Nhập nội dung dấu chìm.');
    const { default: fontkit } = await import('@pdf-lib/fontkit');
    doc.registerFontkit(fontkit);
    font = await doc.embedFont(fontBytes, { subset: true });
    const supported = new Set(font.getCharacterSet());
    if ([...options.text].some(char => !supported.has(char.codePointAt(0)))) throw new Error('Dấu chìm có ký tự chưa được font hỗ trợ. Hãy dùng chữ Latin/tiếng Việt, số và dấu câu thông thường.');
  } else {
    if (!imageBytes) throw new Error('Chọn ảnh PNG hoặc JPG cho dấu chìm.');
    image = options.imageType === 'image/png' ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
  }
  for (const index of indices) {
    const page = doc.getPage(index);
    // Work in the visible CropBox, accounting for the page's existing rotation.
    const box = page.getCropBox();
    const pageRotation = ((page.getRotation().angle % 360) + 360) % 360;
    const visibleWidth = pageRotation % 180 ? box.height : box.width;
    const visibleHeight = pageRotation % 180 ? box.width : box.height;
    let w, h, size;
    if (font) {
      size = Number(options.size);
      if (!Number.isFinite(size) || size < 8 || size > 200) throw new Error('Cỡ chữ phải từ 8 đến 200.');
      const rawWidth = font.widthOfTextAtSize(options.text, size);
      if (rawWidth > visibleWidth * 0.88) size *= visibleWidth * 0.88 / rawWidth;
      w = font.widthOfTextAtSize(options.text, size);
      h = font.heightAtSize(size, { descender: false });
    } else {
      const scale = Math.min(visibleWidth * Number(options.imageScale) / 100 / image.width, visibleHeight * 0.65 / image.height);
      w = image.width * scale;
      h = image.height * scale;
    }
    // Fit the rotated bounds, not only text width (especially on landscape pages).
    const relativeRadians = angle * Math.PI / 180;
    const boundsWidth = Math.abs(w * Math.cos(relativeRadians)) + Math.abs(h * Math.sin(relativeRadians));
    const boundsHeight = Math.abs(w * Math.sin(relativeRadians)) + Math.abs(h * Math.cos(relativeRadians));
    const fit = Math.min(1, visibleWidth * 0.88 / boundsWidth, visibleHeight * 0.88 / boundsHeight);
    w *= fit; h *= fit;
    if (font) size *= fit;
    const totalAngle = angle + pageRotation;
    const rad = totalAngle * Math.PI / 180;
    const x = box.x + box.width / 2 - (w * Math.cos(rad) - h * Math.sin(rad)) / 2;
    const y = box.y + box.height / 2 - (w * Math.sin(rad) + h * Math.cos(rad)) / 2;
    const drawOptions = { x, y, rotate: degrees(totalAngle), opacity };
    if (font) {
      if (!/^#[0-9a-f]{6}$/i.test(options.color)) throw new Error('Màu dấu chìm không hợp lệ.');
      const color = options.color.slice(1).match(/.{2}/g).map(v => parseInt(v, 16) / 255);
      page.drawText(options.text, { ...drawOptions, font, size, color: rgb(...color) });
    } else page.drawImage(image, { ...drawOptions, width: w, height: h });
  }
  return doc.save();
}

export function stripExtension(name) { return name.replace(/\.[^.]+$/, ''); }
export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function removeLightBackground(data, threshold, softness) {
  for (let i = 0; i < data.length; i += 4) {
    const brightness = Math.min(data[i], data[i + 1], data[i + 2]);
    const alpha = softness ? Math.max(0, Math.min(1, (threshold - brightness) / softness)) : (brightness < threshold ? 1 : 0);
    data[i + 3] = Math.round(data[i + 3] * alpha);
  }
  return data;
}
