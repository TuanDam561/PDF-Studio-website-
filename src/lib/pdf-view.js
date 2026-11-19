import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const assetBase = `${import.meta.env.BASE_URL}pdfjs/`;

export function openPdf(bytes) {
  return pdfjs.getDocument({
    data: new Uint8Array(bytes).slice(),
    isEvalSupported: false,
    cMapUrl: `${assetBase}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    wasmUrl: `${assetBase}wasm/`,
  });
}

export function pdfError(error) {
  if (error.name === 'PasswordException') return 'PDF chưa được mở khóa. Hãy chọn lại file và nhập mật khẩu.';
  return 'Không đọc được PDF. Hãy kiểm tra file rồi thử lại.';
}

export async function comparePdfs(fileA, fileB, progress, signal, originalFiles = [fileA, fileB]) {
  const tasks = [];
  const check = () => { if (signal.aborted) throw new DOMException('Đã hủy', 'AbortError'); };
  const stop = () => tasks.forEach(task => task.destroy().catch(() => {}));
  signal.addEventListener('abort', stop, { once: true });
  try {
    const bytes = await Promise.all([fileA.arrayBuffer(), fileB.arrayBuffer()]);
    check();
    const hashes = await Promise.all(originalFiles.map(async file => crypto.subtle.digest('SHA-256', await file.arrayBuffer())));
    const identical = new Uint8Array(hashes[0]).every((v, i) => v === new Uint8Array(hashes[1])[i]);
    tasks.push(...bytes.map(openPdf));
    const [a, b] = await Promise.all(tasks.map(task => task.promise));
    const rows = [];
    const count = Math.max(a.numPages, b.numPages);
    for (let i = 1; i <= count; i++) {
      check();
      if (i > a.numPages || i > b.numPages) rows.push({ page: i, status: 'missing', difference: 100, textSame: false });
      else if (identical) rows.push({ page: i, status: 'same', difference: 0, textSame: true });
      else {
        const pages = await Promise.all([a.getPage(i), b.getPage(i)]);
        const texts = await Promise.all(pages.map(async page => (await page.getTextContent()).items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim()));
        const views = pages.map(page => page.getViewport({ scale: 1 }));
        const sameSize = Math.abs(views[0].width - views[1].width) < 0.5 && Math.abs(views[0].height - views[1].height) < 0.5;
        const scale = Math.min(1.5, 1000 / Math.max(...views.map(v => Math.max(v.width, v.height))));
        const renders = [];
        for (const page of pages) {
          check();
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d', { willReadFrequently: true });
          await page.render({ canvasContext: context, viewport, background: 'white' }).promise;
          renders.push({ data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height });
          canvas.width = 0; canvas.height = 0;
          page.cleanup();
        }
        let difference = 100;
        if (sameSize && renders[0].width === renders[1].width && renders[0].height === renders[1].height) {
          let changed = 0;
          for (let j = 0; j < renders[0].data.length; j += 4) {
            if ([0, 1, 2].some(c => Math.abs(renders[0].data[j + c] - renders[1].data[j + c]) > 20)) changed++;
          }
          difference = changed / (renders[0].width * renders[0].height) * 100;
        }
        rows.push({ page: i, status: sameSize && difference < 0.01 && texts[0] === texts[1] ? 'same' : 'different', difference, textSame: texts[0] === texts[1] });
      }
      progress(Math.round(i / count * 100));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { identical, pagesA: a.numPages, pagesB: b.numPages, rows };
  } finally {
    signal.removeEventListener('abort', stop);
    await Promise.allSettled(tasks.map(task => task.destroy()));
  }
}
