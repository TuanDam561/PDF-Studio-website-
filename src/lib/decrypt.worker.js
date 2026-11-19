import createQpdf from '@soulehshaikh99/qpdf-wasm';
import wasmUrl from '@soulehshaikh99/qpdf-wasm/dist/qpdf.wasm?url';

// A fresh worker per attempt: virtual files, password and WASM memory die together.
self.onmessage = async ({ data: { file, password } }) => {
  try {
    const qpdf = await createQpdf({
      locateFile: () => wasmUrl,
    });
    qpdf.FS.writeFile('/input.pdf', new Uint8Array(await file.arrayBuffer()));
    // Use QPDF's documented status API, not locale-dependent stderr text.
    const passwordStatus = qpdf.callMain([`--password=${password}`, '--requires-password', '/input.pdf']);
    if (passwordStatus === 0) {
      self.postMessage({ type: 'error', code: 'PASSWORD_REQUIRED' });
      return;
    }
    const status = qpdf.callMain([`--password=${password}`, '--decrypt', '/input.pdf', '/output.pdf']);
    password = '';
    if (status !== 0 && status !== 3) {
      self.postMessage({ type: 'error', code: 'DECRYPT_FAILED' });
      return;
    }
    const bytes = qpdf.FS.readFile('/output.pdf');
    self.postMessage({ type: 'done', bytes, warning: status === 3 }, [bytes.buffer]);
  } catch {
    // Return a safe message rather than WASM internals.
    self.postMessage({ type: 'error', code: 'DECRYPT_FAILED' });
  }
};
