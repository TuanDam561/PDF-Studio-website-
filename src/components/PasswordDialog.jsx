import { useEffect, useRef } from 'react';
import { LockKeyhole } from 'lucide-react';

export default function PasswordDialog({ request, onAnswer }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="password-dialog" aria-labelledby="password-title" aria-describedby="password-help" onCancel={event => { event.preventDefault(); onAnswer(null); }}>
    <form onSubmit={event => { event.preventDefault(); const password = new FormData(event.currentTarget).get('password'); event.currentTarget.reset(); onAnswer(password); }}>
      <LockKeyhole size={26} /><h2 id="password-title">Mở PDF có mật khẩu</h2>
      <p className="password-filename">{request.name}</p>
      <p id="password-help">Nhập mật khẩu mở file hoặc mật khẩu chủ sở hữu. Mật khẩu chỉ dùng trong phiên xử lý này, không lưu lại hoặc gửi lên máy chủ.</p>
      {request.incorrect && <p className="password-error" role="alert">Mật khẩu chưa đúng. Hãy thử lại.</p>}
      <label className="field-label">Mật khẩu PDF<input name="password" type="password" autoFocus required autoComplete="off" /></label>
      <div className="password-actions"><button type="button" className="button secondary" onClick={() => onAnswer(null)}>Hủy mở file</button><button type="submit" className="button primary">Mở PDF</button></div>
    </form>
  </dialog>;
}
