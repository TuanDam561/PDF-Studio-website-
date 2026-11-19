import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Plus, ChevronRight, FileText, FolderOpen, Grid2X2, HardDrive, Menu, Search, ShieldCheck, X } from 'lucide-react';
import { tools } from './data/tools';

const Workbench = lazy(() => import('./components/Workbench'));
const Signature = lazy(() => import('./components/Signature'));
const readRoute = () => location.hash.replace(/^#\/?/, '') || 'home';

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const search = useRef(null);
  useEffect(() => {
    const changed = () => { setRoute(readRoute()); setMenu(false); window.scrollTo(0, 0); };
    const shortcut = e => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); search.current?.focus(); } };
    window.addEventListener('hashchange', changed); window.addEventListener('keydown', shortcut);
    return () => { window.removeEventListener('hashchange', changed); window.removeEventListener('keydown', shortcut); };
  }, []);
  const active = tools.find(tool => tool.id === route);
  const navigate = id => { location.hash = id === 'home' ? '#/' : `#/${id}`; setMenu(false); };
  const filtered = tools.filter(tool => (category === 'Tất cả' || tool.category === category) && `${tool.name} ${tool.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
  useEffect(() => { document.title = `${active?.name || 'Công cụ của bạn'} — PDF Studio`; }, [active]);

  return <div className="app-shell">
    <a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Đến nội dung chính</a>
    {menu && <button className="sidebar-scrim" aria-label="Đóng menu" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
      <a className="brand" href="#/" onClick={() => setMenu(false)}><span className="brand-mark"><FileText size={24} /></span><span>PDF<span className="brand-light">Studio</span><small>BỘ CÔNG CỤ PDF CỦA BẠN</small></span></a>
      <button className={`nav-item nav-home ${!active ? 'active' : ''}`} onClick={() => navigate('home')}><Grid2X2 size={18} />Tất cả công cụ<span className="nav-count">10</span></button>
      <p className="nav-label">CÔNG CỤ PDF</p>
      <nav aria-label="Công cụ PDF">{tools.filter(t => !t.soon).map(tool => <button key={tool.id} className={`nav-item ${active?.id === tool.id ? 'active' : ''}`} onClick={() => navigate(tool.id)} aria-current={active?.id === tool.id ? 'page' : undefined}><tool.icon size={18} />{tool.name}</button>)}</nav>
      <p className="nav-label roadmap-label">SẮP RA MẮT</p>
      <nav aria-label="Công cụ sắp ra mắt">{tools.filter(t => t.soon).map(tool => <button key={tool.id} className={`nav-item future-nav ${active?.id === tool.id ? 'active' : ''}`} onClick={() => navigate(tool.id)}><tool.icon size={18} />{tool.name}<span className="tiny-dot" /></button>)}</nav>
      <div className="sidebar-bottom"><div className="privacy-mini"><ShieldCheck size={22} /><strong>File của bạn, trên máy bạn.</strong><p>Không tải tài liệu lên máy chủ.<br />Không cần tài khoản.</p></div><span className="version">BẢN WEB <span>v1.0</span></span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Mở menu" onClick={() => setMenu(true)}><Menu size={21} /></button><FolderOpen size={17} /><button onClick={() => navigate('home')}>Không gian làm việc</button><ChevronRight size={14} /><span>{active?.name || 'Tất cả công cụ'}</span></div><span className="local-badge"><ShieldCheck size={15} />Xử lý trên thiết bị</span></header>
      <main id="main" tabIndex={-1}>
        {!active ? <>
          <section className="tool-section" aria-labelledby="tools-title"><div className="section-top"><div><h2 id="tools-title">Bạn muốn làm gì hôm nay?</h2><p>Chọn một công cụ để bắt đầu với tài liệu của bạn.</p></div><label className="search-box"><Search size={18} /><input ref={search} value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm công cụ…" aria-label="Tìm công cụ" />{query ? <button onClick={() => setQuery('')} aria-label="Xóa tìm kiếm"><X size={15} /></button> : <kbd>Ctrl K</kbd>}</label></div>
            <div className="filter-row"><div className="tabs" role="group" aria-label="Lọc công cụ">{['Tất cả', 'Sắp xếp', 'Chỉnh sửa', 'Tiện ích', 'Chuyển đổi'].map(item => <button key={item} className={category === item ? 'selected' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}{item === 'Tất cả' && <span>10</span>}</button>)}</div><span className="tool-counter">{filtered.length} công cụ</span></div>
            <div className="tool-grid">{filtered.map(tool => <button key={tool.id} className={`tool-card ${tool.soon ? 'future-card' : ''}`} onClick={() => navigate(tool.id)}><div className="card-top"><span className={`tool-icon ${tool.color}`}><tool.icon size={25} strokeWidth={1.7} /></span>{tool.soon ? <span className="soon-tag">Sắp ra mắt</span> : <Plus className="card-open" size={19} />}</div><h3>{tool.name}</h3><p>{tool.description}</p><div className="card-bottom"><span>{tool.category}</span>{!tool.soon && <span className="card-action">Mở công cụ</span>}</div></button>)}</div>
            {!filtered.length && <div className="empty-search"><Search size={30} /><h3>Chưa tìm thấy công cụ</h3><p>Thử từ khóa khác hoặc chọn “Tất cả”.</p><button className="button secondary" onClick={() => { setQuery(''); setCategory('Tất cả'); }}>Hiện tất cả công cụ</button></div>}
          </section>
          <div className="privacy-banner"><div className="privacy-banner-icon"><HardDrive size={25} /></div><div><strong>Tài liệu riêng tư. Luôn trong tầm tay.</strong><p>File được xử lý trong trình duyệt và không được lưu lại khi bạn đóng trang.</p></div><span><ShieldCheck size={17} />100% tại thiết bị</span></div>
        </> : <>
          <div className="tool-heading"><span className={`tool-icon ${active.color}`}><active.icon size={28} /></span><div><div className="eyebrow">{active.category.toUpperCase()}</div><h1>{active.name}</h1><p>{active.hint || active.description}</p></div></div>
          {active.soon ? <section className="coming-soon"><div className={`coming-icon tool-icon ${active.color}`}><active.icon size={42} /></div><span className="soon-tag">Phát triển sau</span><h2>Công cụ này đang được chuẩn bị</h2><p>{active.reason}</p><p className="muted">Hiện chưa nhận hoặc xử lý file cho chức năng này.</p><button className="button primary" onClick={() => navigate('home')}>Khám phá công cụ đang có</button></section> : <Suspense fallback={<div className="loading-panel"><span className="spinner" />Đang mở công cụ…</div>}>{active.id === 'signature' ? <Signature /> : <Workbench key={active.id} tool={active} />}</Suspense>}
        </>}
        <footer><span>PDF Studio <span className="footer-dot">·</span> Gọn hơn mỗi ngày.</span><span>Được tạo để công việc nhẹ nhàng hơn.</span></footer>
      </main>
    </div>
  </div>;
}

