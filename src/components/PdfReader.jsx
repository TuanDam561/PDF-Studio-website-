import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { PageCanvas, usePdf } from './PdfPage';
import './pdf-reader.css';

function ScrollPage({ doc, number, width, ratio, stage }) {
  const frame = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: stage.current, rootMargin: '500px 0px',
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [stage]);
  return <figure ref={frame} className="pdf-reader-page" data-pdf-page={number} style={{ width }}>
    <figcaption>Trang {number}</figcaption>
    <div className="pdf-reader-sheet" style={{ height: width * ratio }}>
      {visible ? <PageCanvas doc={doc} number={number} width={width} /> : <span className="pdf-reader-placeholder">Trang {number}</span>}
    </div>
  </figure>;
}

function Reader({ doc }) {
  const [mode, setMode] = useState('scroll');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [availableWidth, setAvailableWidth] = useState(560);
  const [ratios, setRatios] = useState(null);
  const stage = useRef(null);
  const currentPage = useRef(1);
  const width = Math.max(100, Math.min(760, availableWidth)) * zoom / 100;

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let alive = true, next = 1;
    const sizes = Array(doc.numPages);
    // Read dimensions without rendering canvases, so rotated/mixed-size pages
    // have stable placeholders and jumping to a distant page is accurate.
    const read = async () => {
      while (alive && next <= doc.numPages) {
        const number = next++;
        try {
          const pdfPage = await doc.getPage(number);
          const viewport = pdfPage.getViewport({ scale: 1 });
          sizes[number - 1] = viewport.height / viewport.width;
        } catch { sizes[number - 1] = Math.SQRT2; }
      }
    };
    Promise.all(Array.from({ length: Math.min(4, doc.numPages) }, read)).then(() => { if (alive) setRatios(sizes); });
    return () => { alive = false; };
  }, [doc]);

  const scrollToPage = number => {
    const container = stage.current;
    const target = container?.querySelector(`[data-pdf-page="${number}"]`);
    if (target) container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top - 18;
  };
  const goTo = number => {
    const next = Math.max(1, Math.min(doc.numPages, Math.trunc(Number(number)) || 1));
    currentPage.current = next;
    setPage(next);
    if (mode === 'scroll') scrollToPage(next);
    else if (stage.current) stage.current.scrollTop = 0;
  };

  useLayoutEffect(() => {
    if (mode === 'scroll') scrollToPage(currentPage.current);
    else if (stage.current) stage.current.scrollTop = 0;
  }, [mode, width, ratios]);

  useEffect(() => {
    if (mode !== 'scroll' || !ratios) return;
    const container = stage.current;
    const pages = [...container.querySelectorAll('[data-pdf-page]')];
    let frame;
    const update = () => {
      // Select the page crossing the upper third of the reading viewport.
      const anchor = container.getBoundingClientRect().top + container.clientHeight * .3;
      let low = 0, high = pages.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (pages[middle].getBoundingClientRect().top <= anchor) low = middle;
        else high = middle - 1;
      }
      let number = low + 1;
      if (container.scrollTop <= 1) number = 1;
      else if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) number = doc.numPages;
      currentPage.current = number;
      setPage(number);
    };
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); container.removeEventListener('scroll', onScroll); };
  }, [mode, ratios, doc]);

  return <div className="pdf-viewer pdf-reader">
    <div className="viewer-toolbar">
      <div className="pdf-reader-modes" role="group" aria-label="Chế độ xem PDF">
        <button type="button" aria-pressed={mode === 'scroll'} onClick={() => setMode('scroll')}>Cuộn dọc</button>
        <button type="button" aria-pressed={mode === 'paged'} onClick={() => setMode('paged')}>Từng trang</button>
      </div>
      <div><button className="icon-button" disabled={page <= 1} onClick={() => goTo(page - 1)} aria-label="Trang trước"><ChevronLeft size={18} /></button><label>Trang <input type="number" aria-label="Trang đang xem" min="1" max={doc.numPages} value={page} onChange={e => goTo(e.target.value)} /> / {doc.numPages}</label><button className="icon-button" disabled={page >= doc.numPages} onClick={() => goTo(page + 1)} aria-label="Trang sau"><ChevronRight size={18} /></button></div>
      <div><button className="icon-button" disabled={zoom <= 50} onClick={() => setZoom(zoom - 25)} aria-label="Thu nhỏ"><Minus size={16} /></button><span>{zoom}%</span><button className="icon-button" disabled={zoom >= 200} onClick={() => setZoom(zoom + 25)} aria-label="Phóng to"><Plus size={16} /></button></div>
    </div>
    <p className="pdf-reader-hint">{mode === 'scroll' ? 'Cuộn xuống để đọc liên tục. Nhập số trang để chuyển nhanh.' : 'Bấm nửa trái trang để lùi, nửa phải để sang trang. Có thể dùng phím ← →.'}</p>
    <div className="viewer-stage pdf-reader-stage" ref={stage} tabIndex={0} role="region" aria-label="Nội dung PDF" onKeyDown={event => {
      if (mode !== 'paged' || !['ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.closest('input, textarea, select')) return;
      event.preventDefault(); goTo(page + (event.key === 'ArrowRight' ? 1 : -1));
    }}>
      {!ratios ? <div className="loading-panel"><span className="spinner" />Đang chuẩn bị các trang…</div> : <div className="pdf-reader-pages">
        {mode === 'scroll' ? ratios.map((ratio, index) => <ScrollPage key={index} doc={doc} number={index + 1} ratio={ratio} width={width} stage={stage} />) : <figure className="pdf-reader-page" style={{ width }}>
          <figcaption>Trang {page} / {doc.numPages}</figcaption>
          <div className="pdf-reader-sheet pdf-reader-click-page" style={{ height: width * ratios[page - 1] }}>
            <PageCanvas doc={doc} number={page} width={width} />
            <button type="button" className="pdf-reader-side previous" disabled={page <= 1} aria-label="Bấm bên trái để về trang trước" onClick={() => goTo(page - 1)}><ChevronLeft size={24} /></button>
            <button type="button" className="pdf-reader-side next" disabled={page >= doc.numPages} aria-label="Bấm bên phải để sang trang sau" onClick={() => goTo(page + 1)}><ChevronRight size={24} /></button>
          </div>
        </figure>}
      </div>}
    </div>
  </div>;
}

export default function PdfPreview({ file }) {
  const { doc, error } = usePdf(file);
  if (error) return <p className="alert error">{error}</p>;
  if (!doc) return <div className="loading-panel"><span className="spinner" />Đang mở tài liệu…</div>;
  return <Reader key={doc.loadingTask.docId} doc={doc} />;
}
