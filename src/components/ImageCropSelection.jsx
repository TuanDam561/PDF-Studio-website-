import { useRef } from 'react';
import { cropBetween, moveCrop } from '../lib/image-edit';

export default function ImageCropSelection({ crop, setCrop, width, height, onCancel }) {
  const drag = useRef(null);
  const position = event => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(width, (event.clientX - box.left) / box.width * width)), y: Math.max(0, Math.min(height, (event.clientY - box.top) / box.height * height)) };
  };
  const update = event => {
    const active = drag.current;
    if (!active || event.pointerId !== active.id) return;
    const point = position(event);
    if (active.mode === 'move') setCrop(moveCrop(active.rect, { x: point.x - active.start.x, y: point.y - active.start.y }, width, height));
    else setCrop(cropBetween(active.anchor, point, width, height));
  };
  return <div className="crop-overlay" role="group" aria-label="Vùng cắt ảnh: kéo để chọn, kéo khung để di chuyển hoặc nhập tọa độ bên dưới" tabIndex={0}
    onKeyDown={event => { if (event.key === 'Escape') onCancel(); }}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      const start = position(event);
      const handle = event.target.dataset.handle;
      const mode = handle || (event.target.closest('.crop-rectangle') ? 'move' : 'draw');
      let anchor = start;
      if (handle) anchor = { x: handle.includes('w') ? crop.x + crop.width : crop.x, y: handle.includes('n') ? crop.y + crop.height : crop.y };
      drag.current = { id: event.pointerId, mode, start, anchor, rect: crop };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={update}
    onPointerUp={event => {
      if (drag.current?.id !== event.pointerId) return;
      update(event); drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { if (drag.current) setCrop(drag.current.rect); drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }}
  >
    <div className="crop-rectangle" style={{ left: `${crop.x / width * 100}%`, top: `${crop.y / height * 100}%`, width: `${crop.width / width * 100}%`, height: `${crop.height / height * 100}%` }}>
      <div className="crop-grid" aria-hidden="true" />
      {['nw', 'ne', 'sw', 'se'].map(handle => <span key={handle} className={`crop-handle ${handle}`} data-handle={handle} aria-hidden="true" />)}
    </div>
  </div>;
}
