import { mergePdfs, extractPages, organizePdf, watermarkPdf, parsePages, loadPdf } from './pdf-core';
import { zipSync } from 'fflate';

self.onmessage = async ({ data }) => {
  const { action, inputs, options } = data;
  const progress = value => self.postMessage({ type: 'progress', value });
  try {
    let bytes, mime = 'application/pdf';
    progress(5);
    if (action === 'merge') bytes = await mergePdfs(inputs, progress);
    else if (action === 'organize') bytes = await organizePdf(inputs[0], options.order);
    else if (action === 'watermark') bytes = await watermarkPdf(inputs[0], options, data.fontBytes, data.imageBytes);
    else if (action === 'watermark-preview') bytes = await watermarkPdf(inputs[0], options, data.fontBytes, data.imageBytes, options.previewIndex);
    else if (action === 'split') {
      const doc = await loadPdf(inputs[0]);
      const count = doc.getPageCount();
      if (options.mode === 'range') bytes = await extractPages(inputs[0], parsePages(options.pages, count));
      else {
        const groups = options.mode === 'each'
          ? Array.from({ length: count }, (_, i) => [i])
          : options.pages.split(';').map(value => {
            if (!value.trim()) throw new Error('Không để trống nhóm trang giữa các dấu chấm phẩy.');
            return parsePages(value, count);
          });
        const entries = {};
        for (let i = 0; i < groups.length; i++) {
          entries[`${options.stem}-${String(i + 1).padStart(3, '0')}.pdf`] = await extractPages(inputs[0], groups[i]);
          progress(Math.round(((i + 1) / groups.length) * 90));
        }
        bytes = zipSync(entries, { level: 0 });
        mime = 'application/zip';
      }
    } else throw new Error('Công cụ chưa được hỗ trợ.');
    self.postMessage({ type: 'done', bytes, mime }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || 'Không thể xử lý file này.' });
  }
};
