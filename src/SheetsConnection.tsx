import { useEffect, useRef, useState } from 'react'
import { CloudDownload, CloudUpload, Link2, Unplug } from 'lucide-react'
import type { Data } from './domain'
import { loadSheets, saveSheets, SHEETS_ENDPOINT_KEY, validateSheetsConfig, validateSheetsEndpoint, type SheetsConnectionConfig } from './sheets'
import './sheets.css'

interface Props {
  data: Data
  onReplace: (next: Data, expected: Data) => boolean
  onStatus: (text: string) => void
  disabled?: boolean
  beforeSave?: () => boolean
}

function rememberedEndpoint() {
  try { const value = localStorage.getItem(SHEETS_ENDPOINT_KEY) ?? ''; return validateSheetsEndpoint(value) ? value : '' } catch { return '' }
}

export default function SheetsConnection({ data, onReplace, onStatus, disabled = false, beforeSave }: Props) {
  const [endpoint, setEndpoint] = useState(rememberedEndpoint)
  const [token, setToken] = useState('')
  const [connection, setConnection] = useState<SheetsConnectionConfig | null>(null)
  const [revision, setRevision] = useState<number | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Chưa kết nối. Dữ liệu hiện được lưu trên trình duyệt này.')
  const latest = useRef(data)
  latest.current = data
  const locked = useRef(false)
  const generation = useRef(0)
  const disabledNow = useRef(disabled)
  disabledNow.current = disabled
  const statusCallback = useRef(onStatus)
  statusCallback.current = onStatus
  const dirty = baseline !== null && JSON.stringify(data) !== baseline
  const status = busy ? 'Google Sheets: đang đồng bộ' : !connection ? 'Lưu trên trình duyệt' : revision === null ? 'Google Sheets: cần tải lại' : revision === 0 ? 'Google Sheets: chưa khởi tạo' : dirty ? 'Google Sheets: có thay đổi chưa lưu' : `Google Sheets: đã đồng bộ · v${revision}`
  useEffect(() => { statusCallback.current(disabled ? '' : status) }, [status, disabled])
  useEffect(() => {
    if (disabled) {
      generation.current += 1
      locked.current = false
      setBusy(false); setConnection(null); setToken(''); setRevision(null); setBaseline(null); setSheetUrl('')
      setMessage('Kết nối Sheets tạm khóa khi chế độ dữ liệu khác đang hoạt động. Cần kết nối lại để sử dụng.')
    }
  }, [disabled])

  async function load(connect = false) {
    if (locked.current || disabled) return
    const config = connect ? { endpoint: endpoint.trim(), token } : connection
    if (!config) return
    try { validateSheetsConfig(config) } catch (error) { setMessage((error as Error).message); return }
    locked.current = true; setBusy(true); setRevision(null); setBaseline(null)
    setConnection(config); setSheetUrl('')
    try { localStorage.setItem(SHEETS_ENDPOINT_KEY, config.endpoint) } catch { /* Endpoint persistence is optional; the key is never persisted. */ }
    const before = latest.current
    const requestGeneration = generation.current
    setMessage('Đang tải dữ liệu từ Google Sheets…')
    try {
      const result = await loadSheets(config)
      if (disabledNow.current || generation.current !== requestGeneration) return
      setSheetUrl(result.spreadsheetUrl)
      if (latest.current !== before) { setMessage('Dữ liệu trên máy đã đổi trong lúc tải. Chưa thay thế dữ liệu; hãy tải bản sao JSON rồi thử tải lại.'); return }
      if (result.data === null) {
        setRevision(0)
        setMessage('Sheet chưa có dữ liệu. Bấm “Khởi tạo Sheet” nếu muốn đưa dữ liệu hiện tại trên máy lên Sheet; dữ liệu mẫu cũng sẽ được đưa lên nếu còn trên máy.')
        return
      }
      if (!window.confirm('Tải dữ liệu từ Google Sheets sẽ thay thế toàn bộ dữ liệu hiện tại trên trình duyệt, gồm chấm công và lương. Hãy hủy và tải bản sao JSON trước nếu có thay đổi chưa lưu. Tiếp tục?')) {
        setMessage('Đã hủy thay thế dữ liệu. Cần tải thành công từ Sheet trước khi có thể lưu lên.'); return
      }
      if (latest.current !== before || !onReplace(result.data, before)) {
        setMessage('Dữ liệu trên máy đã đổi hoặc chưa lưu được an toàn. Chưa nhận phiên bản Sheet; hãy sao lưu và tải lại.'); return
      }
      setBaseline(JSON.stringify(result.data)); setRevision(result.revision)
      setMessage(result.warning ?? `Đã tải dữ liệu từ Sheet · phiên bản ${result.revision}.`)
    } catch (error) { if (!disabledNow.current && generation.current === requestGeneration) setMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu từ Google Sheets.') }
    finally { if (generation.current === requestGeneration) { locked.current = false; setBusy(false) } }
  }

  async function save() {
    if (locked.current || disabled || !connection || revision === null) return
    if (revision === 0 && !window.confirm('Khởi tạo Google Sheets bằng TOÀN BỘ dữ liệu hiện tại trên máy, gồm dữ liệu mẫu nếu có và thông tin lương? Những người có khóa kết nối sẽ truy cập được toàn bộ dữ liệu này.')) return
    if (beforeSave && !beforeSave()) { setMessage('Chưa thể lưu: dữ liệu trên trình duyệt đã đổi hoặc chưa được lưu an toàn. Hãy tải bản sao JSON và kiểm tra thông báo của ứng dụng.'); return }
    const snapshot = latest.current
    const serialized = JSON.stringify(snapshot)
    const requestGeneration = generation.current
    locked.current = true; setBusy(true)
    setMessage('Đang lưu dữ liệu lên Google Sheets…')
    try {
      const result = await saveSheets(connection, revision, snapshot)
      if (disabledNow.current || generation.current !== requestGeneration) return
      setRevision(result.revision); setBaseline(serialized); setSheetUrl(result.spreadsheetUrl)
      const changed = JSON.stringify(latest.current) !== serialized
      setMessage(result.warning ?? (changed ? 'Đã lưu bản dữ liệu lúc bắt đầu gửi. Các thay đổi mới trên máy vẫn chưa được lưu lên Sheet.' : `Đã lưu lên Sheet · phiên bản ${result.revision}.`))
    } catch (error) {
      if (disabledNow.current || generation.current !== requestGeneration) return
      setRevision(null); setBaseline(null)
      setMessage(`${error instanceof Error ? error.message : 'Không xác nhận được kết quả lưu.'} Dữ liệu trên máy vẫn còn. Hãy tải bản sao JSON rồi tải từ Google Sheets trước khi lưu lại.`)
    } finally { if (generation.current === requestGeneration) { locked.current = false; setBusy(false) } }
  }

  function disconnect() {
    if (locked.current) return
    setConnection(null); setToken(''); setRevision(null); setBaseline(null); setSheetUrl('')
    setMessage('Đã ngắt kết nối và xóa khóa khỏi phiên làm việc. Dữ liệu đã tải vẫn còn trên trình duyệt; bạn có thể sao lưu JSON trong phần Sao lưu dữ liệu.')
  }

  return <section className="sheets-connection" aria-labelledby="sheets-heading">
    <div className="sheets-heading"><Link2 size={22} aria-hidden="true" /><div><h2 id="sheets-heading">Kết nối Google Sheets</h2><p>Đồng bộ thủ công giữa các máy của người quản lý.</p></div></div>
    <div className="sheets-notice"><strong>Bản demo công khai: chỉ dùng dữ liệu giả.</strong><p>Người giữ khóa kết nối có thể đọc và ghi toàn bộ dữ liệu, gồm bảng lương. Khóa chỉ giữ trong phiên làm việc; khi tải lại trang, cần nhập lại. Dữ liệu đã tải được lưu trên trình duyệt này.</p></div>
    <p className="sheets-help">Tạo một Sheet riêng và triển khai Apps Script theo <a href="https://github.com/TongDucDuy03/quanlycongty/blob/main/docs/GOOGLE_SHEETS.md" target="_blank" rel="noopener noreferrer">hướng dẫn kết nối</a>. Chỉ có đường dẫn Google Sheet là chưa đủ.</p>
    <form onSubmit={event => { event.preventDefault(); void load(true) }}>
      <label htmlFor="sheets-endpoint">URL ứng dụng Apps Script</label>
      <input id="sheets-endpoint" type="url" value={endpoint} placeholder="https://script.google.com/macros/s/…/exec" onChange={event => setEndpoint(event.target.value)} disabled={busy || !!connection || disabled} autoComplete="off" spellCheck={false} required />
      <label htmlFor="sheets-token">Khóa kết nối</label>
      <input id="sheets-token" type="password" value={token} onChange={event => setToken(event.target.value)} disabled={busy || !!connection || disabled} autoComplete="off" spellCheck={false} minLength={32} maxLength={256} required aria-describedby="sheets-token-help" />
      <small id="sheets-token-help">Khóa bí mật từ 32–256 ký tự, lấy từ Script Properties. Không gửi khóa qua URL hoặc đưa vào mã nguồn.</small>
      {!connection && <button className="btn primary" type="submit" disabled={busy || disabled}><Link2 size={16} />Kết nối Google Sheets</button>}
    </form>
    {connection && <div className="sheets-actions">
      <button className="btn" type="button" disabled={busy || disabled} onClick={() => void load()}><CloudDownload size={16} />Tải từ Google Sheets</button>
      {revision === 0 ? <button className="btn primary" type="button" disabled={busy || disabled} onClick={() => void save()}><CloudUpload size={16} />Khởi tạo Sheet</button> : <button className="btn primary" type="button" disabled={busy || disabled || revision === null} onClick={() => void save()}><CloudUpload size={16} />Lưu lên Google Sheets</button>}
      <button className="btn" type="button" disabled={busy} onClick={disconnect}><Unplug size={16} />Ngắt kết nối</button>
    </div>}
    <div className="sheets-state" role="status" aria-live="polite" aria-atomic="true"><strong>{status}</strong><p>{message}</p></div>
    {sheetUrl && <a className="sheets-open" href={sheetUrl} target="_blank" rel="noopener noreferrer">Mở Google Sheet ↗</a>}
    <p className="sheets-help">Chỉnh sửa trong ứng dụng rồi bấm lưu; bảng hiển thị trên Sheet không tự nhập ngược vào ứng dụng. Trước khi tải từ Sheet, hãy sao lưu JSON nếu có thay đổi chưa lưu. Ngắt kết nối không xóa dữ liệu đã lưu trên máy.</p>
  </section>
}
