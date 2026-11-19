import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="fatal"><h1>Phiên làm việc cần khởi động lại</h1><p>Hãy tải lại trang rồi chọn lại file của bạn.</p><button onClick={() => location.reload()}>Tải lại trang</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
