import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Minus, Plus } from 'lucide-react';
import { PageCanvas, usePdf } from './PdfPreview';
import { WorkerTask } from '../lib/worker-task';
import { watermarkAssets } from '../lib/watermark-assets';
import { parsePages } from '../lib/pdf-core';

function OutputPage({ file, width }) {
  const { doc, error } = usePdf(file);
  if (error) return <p className="preview-placeholder" role="alert">{error}</p>;
  if (!doc) return <div className="preview-placeholder"><span className="spinner" />Đang hiển thị bản xem trước…</div>;
  return <PageCanvas doc={doc} number={1} width={width} />;
}

export default function WatermarkPreview({ file, count, options, image, paused }) {
  const { doc, error: sourceError } = usePdf(file);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [paneWidth, setPaneWidth] = useState(280);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const pane = useRef(null);
  const sequence = useRef(0);
  const readBytes = useMemo(() => {
    let promise;
    return () => promise ??= file.arrayBuffer();
  }, [file]);
  let affected = false, rangeError = '';
  try { affected = parsePages(options.pages || '', count).includes(page - 1); }
  catch (e) { rangeError = e.message; }
  const empty = options.kind === 'text' ? !options.text.trim() : !image;
  const ready = result?.page === page && result?.options === options && result?.image === image;

  useEffect(() => {
    const observer = new ResizeObserver(entries => setPaneWidth(Math.max(100, entries[0].contentRect.width - 28)));
    if (pane.current) observer.observe(pane.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const revision = ++sequence.current;
    setError('');
    if (rangeError || empty || paused) return () => abort.abort();
    const timer = setTimeout(async () => {
      try {
        const assets = affected ? await watermarkAssets(options, image, abort.signal) : {};
        const input = await readBytes();
        if (abort.signal.aborted) return;
        const output = await WorkerTask({
          action: 'watermark-preview', inputs: [input], ...assets,
          options: { ...options, imageType: image?.type, previewIndex: page - 1 },
        }, abort.signal);
        if (!abort.signal.aborted) setResult({
          file: new File([output.bytes], 'xem-truoc-watermark.pdf', { type: 'application/pdf' }),
          page, options, image, revision,
        });
      } catch (e) {
        if (!abort.signal.aborted) setError(e.message || 'Không tạo được bản xem trước.');
      }
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [readBytes, page, options, image, affected, rangeError, empty, paused, retry]);

  const width = Math.min(700, paneWidth) * zoom / 100;
  const message = rangeError || error || (empty ? options.kind === 'text' ? 'Nhập nội dung dấu chìm để xem trước.' : 'Chọn ảnh PNG hoặc JPG để xem trước dấu chìm.' : '');
  return <section className="watermark-preview" aria-label="Xem trước watermark trực tiếp">
    <div className="watermark-preview-heading"><div><Eye size={18} /><strong>Xem trước trực tiếp</strong></div><span>Thay đổi tùy chỉnh để cập nhật bản xem trước</span></div>
    <div className="viewer-toolbar watermark-preview-toolbar">
      <div><button className="icon-button" aria-label="Trang xem trước trước đó" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><label>Trang <input aria-label="Trang xem trước watermark" type="number" min="1" max={count} value={page} onChange={e => setPage(Math.max(1, Math.min(count, Number(e.target.value) || 1)))} /> / {count}</label><button className="icon-button" aria-label="Trang xem trước tiếp theo" disabled={page >= count} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></div>
      <div><button className="icon-button" aria-label="Thu nhỏ hai khung" disabled={zoom <= 50} onClick={() => setZoom(zoom - 25)}><Minus size={16} /></button><button className="text-button" onClick={() => setZoom(100)} title="Vừa khung">{zoom}%</button><button className="icon-button" aria-label="Phóng to hai khung" disabled={zoom >= 200} onClick={() => setZoom(zoom + 25)}><Plus size={16} /></button></div>
    </div>
    <div className="watermark-preview-panes">
      <div className="watermark-pane preview-original"><div className="watermark-pane-title"><strong>Tài liệu gốc</strong><span>Trang {page}</span></div><div className="watermark-pane-stage" ref={pane}>{sourceError ? <p className="preview-placeholder" role="alert">{sourceError}</p> : doc ? <PageCanvas doc={doc} number={page} width={width} /> : <div className="preview-placeholder"><span className="spinner" />Đang mở tài liệu…</div>}</div></div>
      <div className="watermark-pane preview-output" aria-busy={!message && !ready}><div className="watermark-pane-title"><strong>Sau khi thêm watermark</strong><span>{!message && ready ? 'Đã cập nhật' : 'Xem trước'}</span></div><div className="watermark-pane-stage">{message ? <div className="preview-placeholder" role="status"><p>{message}</p>{error && <button className="button secondary small" onClick={() => setRetry(value => value + 1)}>Thử lại</button>}</div> : ready ? <OutputPage key={result.revision} file={result.file} width={width} /> : <div className="preview-placeholder" role="status"><span className="spinner" />{paused ? 'Đang tạo file kết quả…' : 'Đang cập nhật dấu chìm…'}</div>}</div></div>
    </div>
    <p className="watermark-preview-note" role="status">{!rangeError && !affected ? `Trang ${page} nằm ngoài phạm vi đã chọn nên được giữ nguyên.` : 'Hai khung hiển thị cùng trang và tỷ lệ. Bấm “Thêm watermark” để tạo file đầy đủ, rồi tải xuống.'}</p>
  </section>;
}
