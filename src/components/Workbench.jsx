import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Download, Eye, FileText, GripVertical, Info, LoaderCircle, Plus, ShieldCheck, Trash2, UploadCloud, X } from 'lucide-react';
import { formatBytes, loadPdf, MAX_FILE_SIZE, MAX_TOTAL_SIZE, stripExtension } from '../lib/pdf-core';
import { comparePdfs } from '../lib/pdf-view';
import { PageOrganizer, PdfPreview } from './PdfPreview';
import WatermarkPreview from './WatermarkPreview';
import { WorkerTask } from '../lib/worker-task';
import { watermarkAssets } from '../lib/watermark-assets';
import { decryptPdf } from '../lib/decrypt-pdf';
import PasswordDialog from './PasswordDialog';

export function Dropzone({ onFiles, multiple = false, image = false, compact = false, disabled = false }) {
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  return <div className={`dropzone ${drag ? 'dragging' : ''} ${compact ? 'compact' : ''}`} onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); if (!disabled) onFiles([...e.dataTransfer.files]); }}>
    <input ref={input} className="visually-hidden" type="file" accept={image ? 'image/png,image/jpeg,image/webp' : '.pdf,application/pdf'} multiple={multiple} onChange={e => { onFiles([...e.target.files]); e.target.value = ''; }} disabled={disabled} aria-label={image ? 'Chọn ảnh chữ ký' : 'Chọn file PDF'} />
    <div className="upload-icon"><UploadCloud size={30} strokeWidth={1.5} /></div><h2>{compact ? 'Thêm tài liệu vào đây' : image ? 'Thả ảnh chữ ký vào đây' : 'Thả tài liệu của bạn vào đây'}</h2><p>hoặc chọn file từ thiết bị của bạn</p><button className="button primary" onClick={() => input.current?.click()} disabled={disabled}><Plus size={17} />{image ? 'Chọn ảnh' : compact ? 'Thêm PDF' : 'Chọn file PDF'}</button><small>{image ? 'PNG, JPG, WEBP · Tối đa 20 MB' : 'PDF · Tối đa 100 MB/file, 200 MB/lần'}</small>
  </div>;
}

export function DownloadResult({ file, description = 'File đã sẵn sàng. Bản gốc của bạn không thay đổi.' }) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const value = URL.createObjectURL(file); setUrl(value); setPreview(false);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return <section className="result-panel" aria-live="polite"><div className="result-heading"><CheckCircle2 size={25} /><div><h3>Xử lý hoàn tất</h3><p>{description}</p></div></div><div className="result-file"><FileText size={21} /><div><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></div><a className="button primary" href={url} download={file.name}><Download size={17} />Tải xuống</a></div>{file.type === 'application/pdf' && <button className="text-button" onClick={() => setPreview(!preview)}><Eye size={16} />{preview ? 'Ẩn xem trước' : 'Xem kết quả'}</button>}{preview && <PdfPreview file={file} />}</section>;
}

const defaults = { mode: 'range', pages: '', kind: 'text', text: 'BẢN NHÁP', size: 48, opacity: 25, angle: 35, color: '#34745d', imageScale: 35 };

export default function Workbench({ tool }) {
  const [items, setItems] = useState([]);
  const [order, setOrder] = useState([]);
  const [options, setOptions] = useState(defaults);
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(false);
  const [passwordRequest, setPasswordRequest] = useState(null);
  const passwordAnswer = useRef(null);
  const importController = useRef(null);
  const alive = useRef(true);
  const reading = useRef(false);
  const controller = useRef(null);
  const dragged = useRef(null);
  const first = items[0];
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); importController.current?.abort(); }; }, []);
  useEffect(() => { setResult(null); setReport(null); }, [items, order, options, image]);
  const option = (key, value) => setOptions(current => ({ ...current, [key]: value }));

  const askPassword = (name, incorrect, signal) => new Promise(resolve => {
    const answer = value => {
      signal.removeEventListener('abort', cancel);
      passwordAnswer.current = null;
      if (alive.current) setPasswordRequest(null);
      resolve(value);
    };
    const cancel = () => answer(null);
    passwordAnswer.current = answer;
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    setPasswordRequest({ name, incorrect });
  });

  const addFiles = async files => {
    if (busy || reading.current || !files.length) return;
    reading.current = true; setLoading(true); setError(''); setNotice(''); setResult(null); setReport(null);
    const abort = new AbortController(); importController.current = abort;
    try {
      const existing = tool.multiple ? items : [];
      if (!tool.multiple && files.length > 1) throw new Error('Công cụ này nhận một PDF mỗi lần. Hãy chọn một file.');
      if (tool.id === 'compare' && existing.length + files.length > 2) throw new Error('So sánh cần đúng 2 file. Hãy xóa file cũ nếu muốn thay thế.');
      if (existing.length + files.length > 100) throw new Error('Mỗi lần xử lý tối đa 100 file.');
      if (files.reduce((sum, f) => sum + f.size, existing.reduce((sum, item) => sum + item.file.size, 0)) > MAX_TOTAL_SIZE) throw new Error('Tổng dung lượng vượt 200 MB. Hãy xử lý ít file hơn mỗi lần.');
      const additions = [];
      let unlocked = 0, repaired = false;
      for (const file of files) {
        abort.signal.throwIfAborted();
        if (!file.size) throw new Error(`“${file.name}” là file rỗng.`);
        if (file.size > MAX_FILE_SIZE) throw new Error(`“${file.name}” vượt giới hạn 100 MB.`);
        const signature = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer());
        if (!signature.includes('%PDF-')) throw new Error(`“${file.name}” không phải file PDF hợp lệ.`);
        let doc, workingFile = file;
        try { doc = await loadPdf(await file.arrayBuffer()); }
        catch (e) {
          if (e.code !== 'ENCRYPTED_PDF') throw new Error(`${file.name}: ${e.message}`);
          let password = '', attempts = 0;
          while (!doc) {
            abort.signal.throwIfAborted();
            try {
              const output = await decryptPdf(file, password, abort.signal);
              password = '';
              if (output.bytes.byteLength > MAX_FILE_SIZE) throw new Error('PDF sau mở khóa vượt giới hạn 100 MB.');
              doc = await loadPdf(output.bytes);
              workingFile = new File([output.bytes], file.name, { type: 'application/pdf', lastModified: file.lastModified });
              repaired ||= output.warning;
              unlocked++;
            } catch (failure) {
              password = '';
              if (failure.code !== 'PASSWORD_REQUIRED') throw failure;
              password = await askPassword(file.name, attempts++ > 0, abort.signal);
              if (password === null) throw new DOMException('Đã hủy mở PDF', 'AbortError');
            }
          }
        }
        additions.push({ file: workingFile, originalFile: file, count: doc.getPageCount(), id: crypto.randomUUID() });
        if ([...existing, ...additions].reduce((sum, item) => sum + item.file.size, 0) > MAX_TOTAL_SIZE) throw new Error('Tổng dung lượng sau mở khóa vượt 200 MB. Hãy chọn ít file hơn.');
      }
      abort.signal.throwIfAborted();
      if (!alive.current) return;
      setItems([...existing, ...additions]); setPreview(false);
      if (unlocked) setNotice(`Đã mở khóa ${unlocked} PDF trên thiết bị. Bản xuất sau chỉnh sửa không có mật khẩu hoặc giới hạn quyền; file gốc vẫn được giữ nguyên.${repaired ? ' PDF có cảnh báo cấu trúc; hãy kiểm tra nội dung xem trước và bản xuất.' : ''}`);
      if (!tool.multiple) { setOrder(Array.from({ length: additions[0].count }, (_, index) => ({ index, rotation: 0 }))); option('pages', ''); }
    } catch (e) { if (alive.current) { if (e.name === 'AbortError') setNotice('Đã hủy thêm file. Các tài liệu đã có được giữ nguyên.'); else setError(e.message); } }
    finally { reading.current = false; importController.current = null; if (alive.current) setLoading(false); }
  };

  const move = (from, to) => {
    if (to < 0 || to >= items.length) return;
    const copy = [...items]; const [item] = copy.splice(from, 1); copy.splice(to, 0, item); setItems(copy);
  };

  const run = async () => {
    if (busy || loading || !first) return;
    setError(''); setNotice(''); setResult(null); setReport(null); setProgress(0); setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      if (tool.id === 'compare') {
        if (items.length !== 2) throw new Error('Chọn đúng 2 file để so sánh.');
        const value = await comparePdfs(items[0].file, items[1].file, setProgress, abort.signal, items.map(item => item.originalFile));
        if (!abort.signal.aborted && alive.current) setReport(value);
      } else {
        if (tool.id === 'merge' && items.length < 2) throw new Error('Thêm ít nhất 2 file để ghép.');
        const payload = { action: tool.id, inputs: await Promise.all(items.map(item => item.file.arrayBuffer())), options: { ...options, order, stem: stripExtension(first.file.name).replace(/[\\/:*?"<>|]/g, '_') } };
        if (tool.id === 'watermark') {
          Object.assign(payload, await watermarkAssets(options, image, abort.signal));
          payload.options.imageType = image?.type;
        }
        const output = await WorkerTask(payload, abort.signal, setProgress);
        const suffix = { merge: 'da-ghep', split: 'da-tach', organize: 'da-sap-xep', watermark: 'watermark' }[tool.id];
        const name = `${tool.id === 'merge' ? 'tai-lieu' : stripExtension(first.file.name)}-${suffix}.${output.mime === 'application/zip' ? 'zip' : 'pdf'}`;
        if (alive.current && !abort.signal.aborted) { setResult(new File([output.bytes], name, { type: output.mime })); setProgress(100); }
      }
    } catch (e) {
      if (alive.current) {
        if (abort.signal.aborted || e.name === 'AbortError') setNotice('Đã hủy tác vụ. File gốc không thay đổi.');
        else setError(e.name === 'PasswordException' ? 'PDF chưa được mở khóa. Hãy chọn lại file và nhập mật khẩu.' : e.message || 'Không thể xử lý file.');
      }
    } finally { if (alive.current) setBusy(false); controller.current = null; }
  };

  const watermarkImage = async file => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 20 * 1024 * 1024) { setError('Chọn ảnh PNG hoặc JPG nhỏ hơn 20 MB.'); return; }
    try { const bitmap = await createImageBitmap(file); bitmap.close(); setImage(file); setError(''); }
    catch { setError('Không đọc được ảnh dấu chìm.'); }
  };

  return <div className="workbench">
    {passwordRequest && <PasswordDialog request={passwordRequest} onAnswer={value => passwordAnswer.current?.(value)} />}
    {error && <div className="alert error" role="alert"><Info size={18} /><span>{error}</span><button aria-label="Đóng thông báo" onClick={() => setError('')}><X size={17} /></button></div>}
    {notice && <div className="alert" role="status">{notice}</div>}
    {loading && <div className="progress-panel" role="status"><LoaderCircle className="spin" size={22} /><strong>Đang đọc hoặc mở khóa PDF…</strong><button className="button secondary small" onClick={() => importController.current?.abort()}>Hủy thêm file</button></div>}
    {busy && <div className="progress-panel" role="status"><LoaderCircle className="spin" size={22} /><div><strong>Đang xử lý trên thiết bị… {progress}%</strong><progress value={progress} max="100" /></div><button className="button secondary small" onClick={() => controller.current?.abort()}>Hủy tác vụ</button></div>}
    <fieldset disabled={busy || loading} className="workbench-fields"><div className={`workspace-grid ${tool.id === 'preview' || tool.id === 'compare' ? 'full-width' : ''}`}>
      <section className="workspace-main panel"><div className="panel-heading"><h2>{tool.id === 'compare' ? 'Hai tài liệu cần đối chiếu' : 'Tài liệu của bạn'}</h2><span>{items.length ? `${items.length} file · ${formatBytes(items.reduce((sum, i) => sum + i.file.size, 0))}` : 'Bắt đầu tại đây'}</span></div>
        {(!items.length || tool.multiple && (tool.id !== 'compare' || items.length < 2)) && <Dropzone onFiles={addFiles} multiple={tool.multiple} compact={items.length > 0} disabled={busy || loading} />}
        {!!items.length && <div className="file-list">{items.map((item, i) => <div className="file-row" key={item.id} draggable={tool.id === 'merge' && !busy && !loading} onDragStart={e => { dragged.current = i; e.dataTransfer.setData('text/plain', String(i)); }} onDragEnd={() => { dragged.current = null; }} onDragOver={e => { if (tool.id === 'merge' && dragged.current !== null) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (tool.id === 'merge' && dragged.current !== null && !busy && !loading) move(dragged.current, i); dragged.current = null; }}>
          {tool.id === 'merge' && <GripVertical className="grip" size={17} />}<div className="file-symbol"><FileText size={23} /></div><div className="file-info"><strong>{tool.id === 'compare' && <span className="file-letter">{i === 0 ? 'A' : 'B'}</span>}{item.file.name}</strong><small>{item.count} trang <span>·</span> {formatBytes(item.file.size)}</small></div>{tool.id === 'merge' && <><button className="icon-button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Đưa ${item.file.name} lên trước`}><ArrowUp size={16} /></button><button className="icon-button" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} aria-label={`Đưa ${item.file.name} ra sau`}><ArrowDown size={16} /></button></>}<button className="icon-button danger" onClick={() => setItems(items.filter(v => v.id !== item.id))} aria-label={`Bỏ ${item.file.name}`}><Trash2 size={17} /></button>
        </div>)}</div>}
        {first && tool.id === 'organize' && <PageOrganizer file={first.file} order={order} setOrder={setOrder} />}
        {first && tool.id === 'preview' && <PdfPreview file={first.file} />}
        {first && tool.id === 'watermark' && <WatermarkPreview key={first.id} file={first.file} count={first.count} options={options} image={image} paused={busy} />}
        {first && tool.id === 'split' && <><button className="text-button preview-toggle" onClick={() => setPreview(!preview)}><Eye size={16} />{preview ? 'Ẩn tài liệu gốc' : 'Xem tài liệu gốc'}</button>{preview && <PdfPreview file={first.file} />}</>}
        {tool.id === 'compare' && <div className="compare-start"><p>So sánh hình ảnh hiển thị và văn bản theo từng trang. Không OCR ảnh scan, không kiểm tra chữ ký số hay trường dữ liệu ẩn.</p><button className="button primary" disabled={items.length !== 2} onClick={run}><tool.icon size={18} />So sánh PDF</button></div>}
        {!items.length && <div className="empty-help"><ShieldCheck size={16} />Tài liệu không rời khỏi thiết bị của bạn.</div>}
      </section>
      {!['preview', 'compare'].includes(tool.id) && <aside className="settings panel"><h2>Tùy chỉnh</h2>
        {tool.id === 'merge' && <><p>File sẽ được ghép theo thứ tự từ trên xuống dưới.</p><div className="summary-box"><span>Tài liệu đã chọn<strong>{items.length} file</strong></span><span>Tổng số trang<strong>{items.reduce((sum, item) => sum + item.count, 0)} trang</strong></span></div><div className="tip"><GripVertical size={18} /><span>Kéo file hoặc dùng nút lên/xuống để đổi thứ tự.</span></div></>}
        {tool.id === 'split' && <><label className="field-label">Cách tách<select value={options.mode} onChange={e => { option('mode', e.target.value); option('pages', ''); }}><option value="range">Lấy các trang thành một PDF</option><option value="each">Mỗi trang thành một PDF (ZIP)</option><option value="groups">Chia theo nhóm trang (ZIP)</option></select></label>{options.mode !== 'each' && <label className="field-label">{options.mode === 'groups' ? 'Các nhóm trang' : 'Trang cần lấy'}<input value={options.pages} onChange={e => option('pages', e.target.value)} placeholder={options.mode === 'groups' ? '1-3; 4-6; 7,9' : '1-3, 5, 8-10'} /><small>{options.mode === 'groups' ? 'Ngăn cách các file bằng dấu ;. Ví dụ: 1-3; 4-6' : 'Để trống để lấy tất cả. Số trang tính từ 1.'}</small></label>}<div className="tip"><Info size={18} /><span>{options.mode === 'range' ? 'Trang được xuất theo thứ tự bạn nhập. Trang lặp chỉ được lấy một lần.' : 'Các file PDF được gom trong một file ZIP để tải xuống.'}</span></div></>}
        {tool.id === 'organize' && <><p>Chọn trang để xóa, dùng nút xoay hoặc kéo để thay đổi vị trí.</p><div className="summary-box"><span>Trang gốc<strong>{first?.count || 0}</strong></span><span>Trang giữ lại<strong>{order.length}</strong></span></div><div className="tip"><Info size={18} /><span>Đây là chỉnh sửa thứ tự và hướng trang, chưa hỗ trợ sửa chữ có sẵn trong PDF.</span></div></>}
        {tool.id === 'watermark' && <><div className="segmented"><button className={options.kind === 'text' ? 'selected' : ''} onClick={() => option('kind', 'text')}>Văn bản</button><button className={options.kind === 'image' ? 'selected' : ''} onClick={() => option('kind', 'image')}>Hình ảnh</button></div>{options.kind === 'text' ? <><label className="field-label">Nội dung dấu chìm<input maxLength={150} value={options.text} onChange={e => option('text', e.target.value)} placeholder="Ví dụ: BẢN NHÁP" /></label><div className="fields-pair"><label className="field-label">Cỡ chữ<input type="number" min="8" max="200" value={options.size} onChange={e => option('size', e.target.value)} /></label><label className="field-label">Màu chữ<input type="color" value={options.color} onChange={e => option('color', e.target.value)} /></label></div></> : <><label className="field-label">Ảnh PNG hoặc JPG<input className="image-input" type="file" accept="image/png,image/jpeg" onChange={e => watermarkImage(e.target.files[0])} /><small>{image?.name || 'PNG trong suốt giúp dấu chìm tự nhiên hơn.'}</small></label><label className="field-label">Chiều rộng ảnh: {options.imageScale}% trang<input type="range" min="5" max="80" value={options.imageScale} onChange={e => option('imageScale', e.target.value)} /></label></>}
          <label className="field-label">Độ đậm: {options.opacity}%<input type="range" min="5" max="100" value={options.opacity} onChange={e => option('opacity', e.target.value)} /></label><label className="field-label">Góc xoay: {options.angle}°<input type="range" min="-90" max="90" step="5" value={options.angle} onChange={e => option('angle', e.target.value)} /></label><label className="field-label">Áp dụng cho trang<input value={options.pages} onChange={e => option('pages', e.target.value)} placeholder="Tất cả trang" /><small>Ví dụ: 1-3, 5. Để trống để áp dụng toàn bộ.</small></label><p className="small-note">Dấu chìm nằm trên nội dung trang. Hỗ trợ chữ tiếng Việt; chữ quá dài được thu nhỏ để vừa trang.</p></>}
        <button className="button primary run-button" onClick={run} disabled={!items.length || tool.id === 'merge' && items.length < 2 || tool.id === 'organize' && !order.length}><tool.icon size={18} />{tool.action}</button><p className="settings-footnote"><ShieldCheck size={13} />Giữ nguyên file gốc</p>
      </aside>}
    </div></fieldset>
    {result && <DownloadResult file={result} />}
    {report && <CompareReport report={report} />}
    <p className="workspace-note"><Info size={15} />Nhận PDF hạn chế quyền và PDF có mật khẩu khi nhập đúng mật khẩu. Bản xuất sau chỉnh sửa không giữ mật khẩu hoặc giới hạn quyền. Việc chỉnh sửa có thể làm mất chữ ký số, bookmark hoặc tính tương tác của biểu mẫu; hãy kiểm tra bản xuất trước khi sử dụng.</p>
  </div>;
}

function CompareReport({ report }) {
  const different = report.rows.filter(row => row.status !== 'same').length;
  return <section className="panel compare-report" aria-live="polite"><div className="result-heading"><CheckCircle2 size={25} /><div><h2>{report.identical ? 'Hai file giống nhau hoàn toàn' : different ? `Có ${different} trang khác biệt` : 'Các trang hiển thị tương đương'}</h2><p>{report.identical ? 'Mã SHA-256 của hai file trùng khớp.' : 'Hai file có dữ liệu nhị phân khác nhau. Bảng dưới đối chiếu nội dung hiển thị.'}</p></div></div><div className="report-stats"><span>Tài liệu A <strong>{report.pagesA} trang</strong></span><span>Tài liệu B <strong>{report.pagesB} trang</strong></span><span>Trang giống <strong>{report.rows.length - different}</strong></span><span>Trang khác/thiếu <strong>{different}</strong></span></div><div className="table-scroll"><table><thead><tr><th>Trang</th><th>Kết quả</th><th>Văn bản trích xuất</th><th>Điểm ảnh khác</th></tr></thead><tbody>{report.rows.map(row => <tr key={row.page}><td>{row.page}</td><td><span className={`report-status ${row.status}`}>{row.status === 'same' ? 'Tương đương' : row.status === 'missing' ? 'Thiếu ở một file' : 'Khác biệt'}</span></td><td>{row.status === 'missing' ? '—' : row.textSame ? 'Giống nhau' : 'Khác nhau'}</td><td>{row.status === 'missing' ? '—' : `${row.difference.toFixed(2)}%`}</td></tr>)}</tbody></table></div><p className="small-note">So ảnh ở độ phân giải giới hạn, có dung sai khử răng cưa. “Tương đương” không chứng minh mọi dữ liệu trong PDF giống nhau. Ảnh scan chỉ được so hình ảnh.</p></section>;
}
