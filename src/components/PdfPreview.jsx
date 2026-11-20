import { useEffect, useRef, useState } from 'react';
import { RotateCw, Trash2, GripVertical, ArrowLeft, ArrowRight } from 'lucide-react';
import { PageCanvas, usePdf } from './PdfPage';
export { PageCanvas, usePdf } from './PdfPage';
export { default as PdfPreview } from './PdfReader';

export function PageOrganizer({ file, order, setOrder }) {
  const { doc, error } = usePdf(file);
  const [batch, setBatch] = useState(0);
  const [selected, setSelected] = useState([]);
  const dragged = useRef(null);
  const batchSize = 12;
  const lastBatch = Math.max(0, Math.ceil(order.length / batchSize) - 1);
  useEffect(() => { if (batch > lastBatch) setBatch(lastBatch); }, [lastBatch, batch]);
  const move = (from, to) => {
    if (to < 0 || to >= order.length) return;
    const copy = [...order]; const [item] = copy.splice(from, 1); copy.splice(to, 0, item); setOrder(copy);
  };
  const remove = indices => { setOrder(order.filter(item => !indices.includes(item.index))); setSelected([]); };
  if (error) return <p className="alert error">{error}</p>;
  return <div className="organizer"><div className="organizer-toolbar"><strong>{order.length} trang</strong><div><button className="text-button" onClick={() => setSelected(selected.length === order.length ? [] : order.map(p => p.index))}>{selected.length === order.length && order.length ? 'Bỏ chọn' : 'Chọn tất cả'}</button><button className="text-button danger" disabled={!selected.length || selected.length === order.length} onClick={() => remove(selected)}><Trash2 size={15} />Xóa ({selected.length})</button><button className="text-button" onClick={() => { setOrder(Array.from({ length: doc?.numPages || 0 }, (_, index) => ({ index, rotation: 0 }))); setSelected([]); setBatch(0); }} disabled={!doc}>Đặt lại</button></div></div>
      <div className="page-grid">{order.slice(batch * batchSize, (batch + 1) * batchSize).map((item, offset) => {
        const position = batch * batchSize + offset;
        return <div key={item.index} className={`page-tile ${selected.includes(item.index) ? 'selected' : ''}`} draggable onDragStart={e => { dragged.current = position; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(position)); }} onDragEnd={() => { dragged.current = null; }} onDragOver={e => { if (dragged.current !== null) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (dragged.current !== null) move(dragged.current, position); dragged.current = null; }}><div className="page-tile-head"><label><input type="checkbox" checked={selected.includes(item.index)} onChange={e => setSelected(e.target.checked ? [...selected, item.index] : selected.filter(n => n !== item.index))} />Trang gốc {item.index + 1}</label><GripVertical size={16} /></div><PageCanvas doc={doc} number={item.index + 1} width={180} rotation={item.rotation} /><div className="page-tile-actions"><span>{position + 1}</span><button className="icon-button" disabled={position === 0} aria-label={`Di chuyển trang ${item.index + 1} lên trước`} onClick={() => move(position, position - 1)}><ArrowLeft size={15} /></button><button className="icon-button" disabled={position === order.length - 1} aria-label={`Di chuyển trang ${item.index + 1} ra sau`} onClick={() => move(position, position + 1)}><ArrowRight size={15} /></button><button className="icon-button" aria-label={`Xoay trang ${item.index + 1}`} onClick={() => setOrder(order.map(p => p.index === item.index ? { ...p, rotation: (p.rotation + 90) % 360 } : p))}><RotateCw size={15} /></button><button className="icon-button danger" disabled={order.length <= 1} aria-label={`Xóa trang ${item.index + 1}`} onClick={() => remove([item.index])}><Trash2 size={15} /></button></div></div>;
      })}</div>
      {lastBatch > 0 && <div className="pagination"><button className="button secondary small" disabled={batch <= 0} onClick={() => setBatch(batch - 1)}>Nhóm trước</button><span>{batch + 1} / {lastBatch + 1}</span><button className="button secondary small" disabled={batch >= lastBatch} onClick={() => setBatch(batch + 1)}>Nhóm sau</button></div>}
    </div>;
}
