export function WorkerTask(payload, signal, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdf.worker.js', import.meta.url), { type: 'module' });
    const cleanup = () => { signal.removeEventListener('abort', cancel); worker.terminate(); };
    const cancel = () => { cleanup(); reject(new DOMException('Đã hủy', 'AbortError')); };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.value);
      else { cleanup(); data.type === 'error' ? reject(new Error(data.message)) : resolve(data); }
    };
    worker.onerror = () => { cleanup(); reject(new Error('Tác vụ bị gián đoạn. Thử file nhỏ hơn hoặc tải lại trang.')); };
    worker.postMessage(payload);
  });
}
