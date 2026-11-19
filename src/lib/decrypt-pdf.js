export function decryptPdf(file, password, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./decrypt.worker.js', import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); reject(new DOMException('Đã hủy mở PDF', 'AbortError')); };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    worker.onmessage = ({ data }) => {
      cleanup();
      if (data.type === 'done') resolve(data);
      else reject(Object.assign(new Error(data.code === 'PASSWORD_REQUIRED'
        ? 'Mật khẩu chưa đúng. Hãy thử lại.'
        : 'Không mở khóa được PDF này. File có thể bị hỏng hoặc dùng kiểu bảo vệ chưa hỗ trợ.'), { code: data.code }));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('Không tải được bộ mở khóa PDF. Hãy tải lại trang hoặc thử file nhỏ hơn.'));
    };
    worker.postMessage({ file, password });
  });
}
