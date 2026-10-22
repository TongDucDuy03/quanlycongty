import { useEffect, useRef, useState } from 'react'
import { CloudDownload, CloudUpload, Link2, RefreshCw, Unplug } from 'lucide-react'
import type { Data } from './domain'
import { SHEETS_ENDPOINT_KEY, validateSheetsEndpoint } from './sheets'
import { useSheetsSync } from './useSheetsSync'
import './sheets.css'
import { companyManaged } from './company-config'

interface Props {
  data: Data
  onReplace: (next: Data, expected: Data) => boolean
  onStatus: (text: string) => void
  disabled?: boolean
  beforeSave?: () => boolean
  beforeUpload?: () => boolean
}
function rememberedEndpoint() {
  try { const value = localStorage.getItem(SHEETS_ENDPOINT_KEY) ?? ''; return validateSheetsEndpoint(value) ? value : '' } catch { return '' }
}

export default function SheetsConnection({ data, onReplace, onStatus, disabled = false, beforeSave, beforeUpload }: Props) {
  const sync = useSheetsSync({ data, onReplace, disabled, beforeSave, beforeUpload })
  const [endpoint, setEndpoint] = useState(() => sync.connection?.endpoint ?? rememberedEndpoint())
  const [token, setToken] = useState(() => sync.connection?.token ?? '')
  const [remember, setRemember] = useState(true)
  const status = sync.busy ? 'Google Sheets: đang đồng bộ' : !sync.connection ? 'Lưu trên trình duyệt' : sync.blocked ? 'Google Sheets: cần xử lý thay đổi' : sync.waiting ? 'Google Sheets: đang chờ kết nối' : sync.revision === 0 ? 'Google Sheets: chưa khởi tạo' : sync.pending ? 'Google Sheets: đang chờ lưu' : sync.revision === null ? 'Google Sheets: đang chờ kết nối' : `Google Sheets: đã đồng bộ · v${sync.revision}`
  const callback = useRef(onStatus)
  callback.current = onStatus
  useEffect(() => { callback.current(disabled ? '' : status) }, [status, disabled])
  useEffect(() => { if (!sync.connection) setToken('') }, [sync.connection])

  return <section className="sheets-connection" aria-labelledby="sheets-heading">
    <div className="sheets-heading"><Link2 size={22} aria-hidden="true" /><div><h2 id="sheets-heading">{companyManaged ? 'Dữ liệu công ty' : 'Kết nối Google Sheets'}</h2><p>{companyManaged ? 'Google Sheet đã được cấu hình cho công ty. Dữ liệu tự động đồng bộ trên các thiết bị đã đăng nhập.' : 'Cấu hình một lần trên mỗi thiết bị. Sau đó dữ liệu tự động lưu.'}</p></div></div>
    {!companyManaged && <>
    {!sync.connection && <p className="sheets-help">Dán URL Apps Script và khóa kết nối đã tạo theo <a href="https://github.com/TongDucDuy03/quanlycongty/blob/main/docs/GOOGLE_SHEETS.md" target="_blank" rel="noopener noreferrer">hướng dẫn kết nối</a>.</p>}
    <form onSubmit={event => { event.preventDefault(); void sync.connect({ endpoint: endpoint.trim(), token }, remember) }}>
      <label htmlFor="sheets-endpoint">URL ứng dụng Apps Script</label>
      <input id="sheets-endpoint" type="url" value={endpoint} placeholder="https://script.google.com/macros/s/…/exec" onChange={event => setEndpoint(event.target.value)} disabled={sync.busy || !!sync.connection || disabled} autoComplete="off" spellCheck={false} required />
      <label htmlFor="sheets-token">Khóa kết nối</label>
      <input id="sheets-token" type="password" value={token} onChange={event => setToken(event.target.value)} disabled={sync.busy || !!sync.connection || disabled} autoComplete="off" spellCheck={false} minLength={32} maxLength={256} required aria-describedby="sheets-token-help" />
      <small id="sheets-token-help">Chọn ghi nhớ để tự kết nối khi mở lại ứng dụng. Khóa chỉ lưu trên thiết bị, không đưa vào bản sao lưu JSON. Người dùng chung trình duyệt này có thể truy cập dữ liệu, gồm bảng lương.</small>
      {!sync.connection && <><label className="sheets-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={sync.busy || disabled} />Ghi nhớ kết nối trên thiết bị này</label><button className="btn primary" type="submit" disabled={sync.busy || disabled}><Link2 size={16} />Kết nối Google Sheets</button></>}
    </form>
    </>}
    {sync.confirmation && <div className="sheets-confirm" role="alert">
      <p>{sync.confirmation === 'replace' ? 'Dùng dữ liệu trên Google Sheets thay cho dữ liệu trên thiết bị này? Nếu có thay đổi cần giữ, hãy hủy và chọn Sao lưu JSON trước.' : 'Đưa dữ liệu hiện có trên thiết bị này lên Google Sheets, gồm dữ liệu mẫu nếu có và bảng lương? Sau đó các thay đổi sẽ tự động lưu.'}</p>
      <div className="sheets-actions"><button className="btn primary" type="button" onClick={() => sync.confirm(true)}>{sync.confirmation === 'replace' ? 'Dùng dữ liệu trên Sheet' : 'Bắt đầu tự động lưu'}</button><button className="btn" type="button" onClick={() => sync.confirm(false)}>Hủy</button></div>
    </div>}
    {sync.connection && <div className="sheets-actions">
      {sync.revision === 0 && !sync.blocked ? <button className="btn primary" type="button" disabled={sync.busy || disabled || !!sync.confirmation} onClick={() => void sync.initialize()}><CloudUpload size={16} />Khởi tạo Sheet</button> : <button className="btn primary" type="button" disabled={sync.busy || disabled || sync.blocked || !!sync.confirmation} onClick={sync.syncNow}><RefreshCw size={16} />Đồng bộ ngay</button>}
      {sync.blocked && <button className="btn" type="button" disabled={sync.busy || disabled} onClick={sync.replace}><CloudDownload size={16} />Tải từ Google Sheets</button>}
      {!companyManaged && <button className="btn" type="button" onClick={sync.disconnect} disabled={disabled}><Unplug size={16} />Ngắt kết nối</button>}
    </div>}
    <div className="sheets-state" role="status" aria-live="polite" aria-atomic="true"><strong>{disabled ? 'Google Sheets đang tạm dừng' : status}</strong><p>{disabled ? 'Đang dùng chế độ dữ liệu khác.' : sync.message}</p></div>
    {sync.sheetUrl && <a className="sheets-open" href={sync.sheetUrl} target="_blank" rel="noopener noreferrer">Mở Google Sheet ↗</a>}
    <p className="sheets-help">Sau khi lưu biểu mẫu, dữ liệu tự đồng bộ lên Sheet. Khi mất mạng trong lúc đang làm việc, thay đổi được giữ trên thiết bị và tự đồng bộ khi có mạng trở lại. Chờ “Đã đồng bộ” trước khi chuyển thiết bị. Bảng trên Sheet dùng để xem, không nhập ngược vào ứng dụng.{!companyManaged && ' Ngắt kết nối sẽ quên khóa trên thiết bị.'}</p>
  </section>
}
