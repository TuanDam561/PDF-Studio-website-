import { useEffect, useRef, useState } from 'react';
import { openPdf, pdfError } from '../lib/pdf-view';

export function usePdf(file) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true, task;
    setDoc(null); setError('');
    if (!file) return;
    file.arrayBuffer().then(bytes => {
      if (!alive) return;
      task = openPdf(bytes);
      return task.promise.then(result => { if (alive) setDoc(result); });
    }).catch(e => { if (alive) setError(pdfError(e)); });
    return () => { alive = false; task?.destroy().catch(() => {}); };
  }, [file]);
  return { doc, error };
}

export function PageCanvas({ doc, number, width = 240, rotation = 0 }) {
  const ref = useRef(null);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let render, alive = true;
    setReady(false); setError(false);
    if (!doc) return;
    doc.getPage(number).then(page => {
      if (!alive || !ref.current) return;
      const rotate = ((page.rotate + rotation) % 360 + 360) % 360;
      const original = page.getViewport({ scale: 1, rotation: rotate });
      const viewport = page.getViewport({ scale: width / original.width * Math.min(devicePixelRatio || 1, 2), rotation: rotate });
      const canvas = ref.current;
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${width * original.height / original.width}px`;
      render = page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' });
      return render.promise.then(() => { if (alive) setReady(true); });
    }).catch(e => { if (alive && e.name !== 'RenderingCancelledException') setError(true); });
    return () => { alive = false; render?.cancel(); };
  }, [doc, number, width, rotation]);
  return <div className={`page-canvas ${ready ? 'ready' : ''}`}><canvas ref={ref} aria-label={`Trang ${number}`} />{!ready && <span className="canvas-status">{error ? 'Không thể hiển thị trang' : 'Đang tải trang…'}</span>}</div>;
}

