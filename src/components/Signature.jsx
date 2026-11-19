import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop, Download, Info, PencilLine, Redo2, RotateCcw, RotateCw, Trash2, Undo2, X } from 'lucide-react';
import { Dropzone, DownloadResult } from './Workbench';
import { removeLightBackground, stripExtension } from '../lib/pdf-core';
import { constrainCrop, renderImageEdits } from '../lib/image-edit';
import ImageCropSelection from './ImageCropSelection';
import './image-editor.css';

const emptyHistory = () => ({ steps: [], position: 0 });

export default function Signature() {
  const [file, setFile] = useState(null);
  const [bitmap, setBitmap] = useState(null);
  const [threshold, setThreshold] = useState(240);
  const [softness, setSoftness] = useState(25);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editor, setEditor] = useState(false);
  const [history, setHistory] = useState(emptyHistory);
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState(null);
  const canvas = useRef(null);
  const original = useRef(null);
  const request = useRef(0);
  const edited = useMemo(() => bitmap ? renderImageEdits(bitmap, history.steps.slice(0, history.position)) : null, [bitmap, history]);
  const outputSize = cropping && crop ? crop : edited;

  useEffect(() => () => { request.current++; }, []);
  useEffect(() => () => { bitmap?.close(); }, [bitmap]);
  useEffect(() => () => { if (edited) { edited.width = 0; edited.height = 0; } }, [edited]);
  useEffect(() => {
    if (!edited || !original.current) return;
    original.current.width = edited.width; original.current.height = edited.height;
    original.current.getContext('2d').drawImage(edited, 0, 0);
  }, [edited]);
  useEffect(() => {
    setResult(null);
    if (!edited || !canvas.current) return;
    const rect = cropping && crop ? crop : { x: 0, y: 0, width: edited.width, height: edited.height };
    canvas.current.width = rect.width; canvas.current.height = rect.height;
    const context = canvas.current.getContext('2d', { willReadFrequently: true });
    context.drawImage(edited, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    const image = context.getImageData(0, 0, rect.width, rect.height);
    removeLightBackground(image.data, Number(threshold), Number(softness));
    context.putImageData(image, 0, 0);
  }, [edited, threshold, softness, cropping, crop]);

  const select = async files => {
    if (loading || !files.length) return;
    const id = ++request.current;
    setError(''); setLoading(true);
    try {
      if (files.length !== 1) throw new Error('Hãy chọn một ảnh mỗi lần.');
      const value = files[0];
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(value.type) || value.size > 20 * 1024 * 1024) throw new Error('Chọn ảnh PNG, JPG hoặc WEBP nhỏ hơn 20 MB.');
      const image = await createImageBitmap(value);
      if (image.width * image.height > 16_000_000) { image.close(); throw new Error('Ảnh vượt 16 triệu điểm ảnh. Hãy giảm kích thước ảnh trước khi xử lý.'); }
      if (id !== request.current) { image.close(); return; }
      setBitmap(image); setFile(value); setThreshold(240); setSoftness(25); setResult(null);
      setHistory(emptyHistory()); setCropping(false); setCrop(null); setEditor(false);
    } catch (e) { if (id === request.current) setError(e.message || 'Không đọc được ảnh.'); }
    finally { if (id === request.current) setLoading(false); }
  };

  const apply = operation => {
    setHistory(current => ({ steps: [...current.steps.slice(0, current.position), operation], position: current.position + 1 }));
    setCropping(false); setCrop(null); setError('');
  };
  const startCrop = () => {
    setCrop(constrainCrop({ x: edited.width * .08, y: edited.height * .08, width: edited.width * .84, height: edited.height * .84 }, edited.width, edited.height));
    setCropping(true);
  };
  const cancelCrop = () => { setCropping(false); setCrop(null); };
  const cropField = (key, value) => setCrop(current => constrainCrop({ ...current, [key]: value }, edited.width, edited.height));
  const save = () => {
    if (!canvas.current || cropping) return;
    setExporting(true);
    const id = request.current;
    canvas.current.toBlob(blob => {
      if (id !== request.current) return;
      setExporting(false);
      if (!blob) { setError('Không thể tạo PNG. Thử ảnh nhỏ hơn.'); return; }
      setResult(new File([blob], `${stripExtension(file.name)}-trong-suot.png`, { type: 'image/png' }));
    }, 'image/png');
  };

  return <div className="workbench">
    {error && <p className="alert error" role="alert">{error}</p>}
    <div className="workspace-grid">
      <section className="panel workspace-main">
        <div className="panel-heading"><h2>Ảnh chữ ký</h2><span>Xuất PNG trong suốt</span></div>
        {!bitmap ? <Dropzone image onFiles={select} disabled={loading} /> : <>
          <div className="signature-file"><strong>{file.name}</strong><div className="signature-file-actions">
            <button className={`button secondary small ${editor ? 'editing-active' : ''}`} disabled={exporting} aria-expanded={editor} onClick={() => { setEditor(!editor); cancelCrop(); }}><PencilLine size={16} />{editor ? 'Đóng chỉnh ảnh' : 'Chỉnh ảnh'}</button>
            <button className="icon-button danger" disabled={exporting} onClick={() => { setBitmap(null); setFile(null); setResult(null); setCropping(false); setCrop(null); setHistory(emptyHistory()); }} aria-label="Bỏ ảnh"><Trash2 size={18} /></button>
          </div></div>
          {editor && <fieldset disabled={exporting} className="image-editor-controls">
            <div className="image-edit-toolbar" role="group" aria-label="Chỉnh sửa ảnh chữ ký">
              <button className={`button secondary small ${cropping ? 'editing-active' : ''}`} onClick={() => cropping ? cancelCrop() : startCrop()} aria-pressed={cropping}><Crop size={16} />Cắt ảnh</button>
              <button className="button secondary small" disabled={cropping} onClick={() => apply({ type: 'rotate', direction: -1 })}><RotateCcw size={16} />Xoay trái 90°</button>
              <button className="button secondary small" disabled={cropping} onClick={() => apply({ type: 'rotate', direction: 1 })}><RotateCw size={16} />Xoay phải 90°</button>
              <button className="icon-button" aria-label="Hoàn tác chỉnh ảnh" title="Hoàn tác" disabled={cropping || history.position === 0} onClick={() => setHistory(current => ({ ...current, position: current.position - 1 }))}><Undo2 size={17} /></button>
              <button className="icon-button" aria-label="Làm lại chỉnh ảnh" title="Làm lại" disabled={cropping || history.position === history.steps.length} onClick={() => setHistory(current => ({ ...current, position: current.position + 1 }))}><Redo2 size={17} /></button>
              <button className="text-button" disabled={!history.position && !cropping} onClick={() => { setHistory(emptyHistory()); cancelCrop(); }}>Đặt lại ảnh gốc</button>
            </div>
            {cropping ? <div className="crop-instructions" role="status">Kéo trên ảnh bên trái để chọn vùng giữ lại. Kéo khung để di chuyển hoặc kéo các góc để đổi kích thước.</div> : <p className="crop-instructions">Cắt bỏ phần thừa và xoay ảnh trước khi xuất. Bạn luôn có thể hoàn tác hoặc trở về ảnh gốc.</p>}
          </fieldset>}
          <div className="signature-preview">
            <div><div className="signature-preview-label"><span>{cropping ? 'Chọn vùng cần giữ' : history.position ? 'Ảnh đã chỉnh' : 'Ảnh gốc'}</span><small>{edited.width} × {edited.height} px</small></div>
              <div className="image-stage signature-source-stage"><div className="crop-frame"><canvas ref={original} />{cropping && crop && <ImageCropSelection crop={crop} setCrop={setCrop} width={edited.width} height={edited.height} onCancel={cancelCrop} />}</div></div>
            </div>
            <div><div className="signature-preview-label"><span>{cropping ? 'Xem trước vùng cắt' : 'Sau khi xóa nền'}</span><small>{outputSize.width} × {outputSize.height} px</small></div><div className="image-stage checkerboard"><canvas ref={canvas} /></div></div>
          </div>
          {cropping && crop && <fieldset className="crop-settings" disabled={exporting}>
            <div className="crop-fields">
              {[['x', 'Cách trái'], ['y', 'Cách trên'], ['width', 'Chiều rộng'], ['height', 'Chiều cao']].map(([key, label]) => <label key={key} className="field-label">{label} (px)<input aria-label={`${label} vùng cắt`} type="number" step="1" min={key === 'x' || key === 'y' ? 0 : 1} max={key === 'x' ? edited.width - 1 : key === 'y' ? edited.height - 1 : key === 'width' ? edited.width - crop.x : edited.height - crop.y} value={crop[key]} onChange={event => cropField(key, event.target.value)} /></label>)}
            </div>
            <div className="crop-actions"><button className="text-button" onClick={() => setCrop({ x: 0, y: 0, width: edited.width, height: edited.height })}>Chọn toàn ảnh</button><button className="button secondary small" onClick={cancelCrop}><X size={15} />Hủy cắt</button><button className="button primary small" onClick={() => apply({ type: 'crop', rect: crop })}><Check size={15} />Áp dụng cắt</button></div>
          </fieldset>}
        </>}
        {loading && <p className="loading-panel">Đang đọc ảnh…</p>}
      </section>
      <aside className="settings panel"><h2>Tùy chỉnh nền</h2><fieldset disabled={exporting}>
        <label className="field-label">Ngưỡng nền sáng: {threshold}<input type="range" min="120" max="255" value={threshold} onChange={e => setThreshold(e.target.value)} /><small>Giảm ngưỡng để xóa thêm nền xám. Mực nhạt cũng có thể bị mất.</small></label>
        <label className="field-label">Làm mềm viền: {softness}<input type="range" min="0" max="80" value={softness} onChange={e => setSoftness(e.target.value)} /></label>
        <button className="text-button" onClick={() => { setThreshold(240); setSoftness(25); }}><RotateCcw size={15} />Đặt lại</button>
        <div className="tip"><Info size={18} /><span>Dùng ảnh chữ ký trên nền sáng, ánh sáng đều. Công cụ không tự tách nền phức tạp.</span></div>
        <button className="button primary run-button" onClick={save} disabled={!bitmap || exporting || cropping}><Download size={17} />{exporting ? 'Đang tạo PNG…' : 'Tạo PNG trong suốt'}</button>
        {cropping && <p className="small-note crop-save-note">Áp dụng hoặc hủy vùng cắt trước khi tạo PNG.</p>}
      </fieldset></aside>
    </div>
    {result && <DownloadResult file={result} description={`PNG trong suốt theo ảnh đã chỉnh (${canvas.current?.width} × ${canvas.current?.height} px). File gốc được giữ nguyên.`} />}
  </div>;
}
