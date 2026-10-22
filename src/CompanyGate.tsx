import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Building2, LockKeyhole, LogOut } from 'lucide-react'
import { validateData } from './domain'
import { loadSheets, SheetsError } from './sheets'
import { LEGACY_SHEETS_SYNC_KEY, readSheetsCheckpoint, snapshotDigest, writeSheetsCheckpoint } from './sheets-sync'
import { downloadFile } from './storage'
import { changeCompanyPassword, companyAuthenticate, forgetCompanySession, readCompanySession, saveCompanySession, type CompanySession } from './company-auth'
import { companyEndpoint, companyName, COMPANY_AUTH_EVENT, COMPANY_DATA_KEY, COMPANY_OWNER_KEY, COMPANY_LOGOUT_KEY, COMPANY_SESSION_KEY, COMPANY_SYNC_KEY, setCompanyToken } from './company-config'
import './company.css'

interface Account { username: string; logout: () => void; changePassword: (currentPassword: string, newPassword: string) => Promise<void>; reauthenticate: () => void }
const CompanyContext = createContext<Account | null>(null)
export function useCompanyAccount() { return useContext(CompanyContext) }
export function CompanyAccount() {
  const account = useCompanyAccount()
  const [editing, setEditing] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const currentField = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (editing) currentField.current?.focus() }, [editing])
  function cancel() { setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setError(''); setUncertain(false); setEditing(false) }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!account || busy) return
    setError(''); setUncertain(false)
    if (currentPassword.length < 12 || currentPassword.length > 128 || newPassword.length < 12 || newPassword.length > 128) { setError('Mật khẩu cần có từ 12 đến 128 ký tự.'); return }
    if (newPassword === currentPassword) { setError('Mật khẩu mới phải khác mật khẩu hiện tại.'); return }
    if (newPassword !== confirmation) { setError('Xác nhận mật khẩu mới chưa khớp.'); return }
    setBusy(true)
    try {
      await account.changePassword(currentPassword, newPassword)
      if (mounted.current) cancel()
    } catch (failure) {
      if (!mounted.current) return
      setError(failure instanceof Error ? failure.message : 'Chưa đổi được mật khẩu. Vui lòng thử lại.')
      setUncertain(failure instanceof SheetsError && failure.code === 'PASSWORD_CHANGE_UNCERTAIN')
    } finally { if (mounted.current) setBusy(false) }
  }
  if (!account) return null
  return <section className="card settings-card company-account"><h2>Tài khoản công ty</h2><p>Đang đăng nhập: <strong>{account.username}</strong>. Mở cùng đường link trên điện thoại hoặc máy tính và đăng nhập để dùng chung dữ liệu.</p>
    <div className="button-row"><button className="button secondary" type="button" aria-expanded={editing} aria-controls="company-password-form" disabled={busy} onClick={() => editing ? cancel() : setEditing(true)}><LockKeyhole size={16} />Đổi mật khẩu</button><button className="button secondary" type="button" onClick={account.logout} disabled={busy}><LogOut size={16} />Đăng xuất khỏi thiết bị</button></div>
    {editing && <form id="company-password-form" className="company-password-form" onSubmit={event => { void submit(event) }} aria-busy={busy}>
      <p id="company-password-help">Đặt mật khẩu của riêng bạn, từ 12 đến 128 ký tự. Sau khi đổi, mọi thiết bị cần đăng nhập lại. Dữ liệu và thay đổi chưa đồng bộ vẫn được giữ.</p>
      <input type="text" name="username" value={account.username} autoComplete="username" readOnly hidden />
      <label htmlFor="company-current-password">Mật khẩu hiện tại</label><input ref={currentField} id="company-current-password" name="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required minLength={12} maxLength={128} disabled={busy} aria-describedby="company-password-help company-password-feedback" />
      <label htmlFor="company-new-password">Mật khẩu mới</label><input id="company-new-password" name="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required minLength={12} maxLength={128} disabled={busy} aria-describedby="company-password-help company-password-feedback" />
      <label htmlFor="company-confirm-password">Xác nhận mật khẩu mới</label><input id="company-confirm-password" name="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={12} maxLength={128} disabled={busy} aria-describedby="company-password-feedback" />
      <p id="company-password-feedback" role="status" aria-live="polite" className="company-password-feedback">{busy ? 'Đang đổi mật khẩu…' : error}</p>
      <div className="button-row"><button className="button primary" type="submit" disabled={busy}>Lưu mật khẩu mới</button><button className="button secondary" type="button" onClick={cancel} disabled={busy}>Hủy</button></div>
      {uncertain && <button className="text-button" type="button" onClick={account.reauthenticate}>Đăng nhập lại để kiểm tra</button>}
    </form>}
  </section>
}

export default function CompanyGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CompanySession | null>(null)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('Đang mở dữ liệu công ty…')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const sequence = useRef(0)
  const sessionRef = useRef<CompanySession | null>(null)

  function lock(messageText: string) {
    sequence.current++
    setCompanyToken('')
    sessionRef.current = null
    setSession(null)
    setPassword('')
    setBusy(false)
    setMessage(messageText)
  }

  function requireLogin(messageText: string) {
    lock(messageText)
    try { forgetCompanySession() } catch { /* Server also enforces revoked sessions. */ }
    // Also notify tabs whose session lives only in sessionStorage.
    try { localStorage.setItem(COMPANY_LOGOUT_KEY, `${Date.now()}-${Math.random()}`) } catch { /* Other tabs will learn of revocation on their next request. */ }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const current = sessionRef.current
    if (!current) throw new SheetsError('SESSION_EXPIRED', 'Vui lòng đăng nhập lại để đổi mật khẩu.')
    const run = sequence.current
    try {
      await changeCompanyPassword(current.token, currentPassword, newPassword)
      if (run !== sequence.current || sessionRef.current?.token !== current.token) return
      requireLogin('Đã đổi mật khẩu. Đăng nhập bằng mật khẩu mới để tiếp tục. Các thiết bị khác cũng cần đăng nhập lại; dữ liệu chưa đồng bộ vẫn được giữ.')
    } catch (error) {
      if (run === sequence.current && sessionRef.current?.token === current.token && error instanceof SheetsError && ['AUTH_FAILED', 'SESSION_EXPIRED', 'UNAUTHORIZED'].includes(error.code)) window.dispatchEvent(new Event(COMPANY_AUTH_EVENT))
      throw error
    }
  }

  async function activate(next: CompanySession, run: number, shouldRemember: boolean, migrate = false) {
    // Verify authorization remotely before exposing any cached company data.
    const remote = await loadSheets({ endpoint: companyEndpoint, token: next.token })
    if (run !== sequence.current) return
    setCompanyToken(next.token)
    let cached = localStorage.getItem(COMPANY_DATA_KEY)
    const ownerText = localStorage.getItem(COMPANY_OWNER_KEY)
    let owner: { endpoint?: string; username?: string } | null = null
    try { owner = JSON.parse(ownerText ?? 'null') } catch { /* Fail closed below. */ }
    if (cached !== null && (owner?.endpoint !== companyEndpoint || owner?.username !== next.username)) {
      throw new Error('Bản lưu trên thiết bị thuộc một kết nối hoặc tài khoản khác. Hãy dùng cửa sổ riêng tư để đăng nhập; giữ nguyên bản lưu cũ để tránh mất thay đổi.')
    }
    localStorage.setItem(COMPANY_OWNER_KEY, JSON.stringify({ endpoint: companyEndpoint, username: next.username }))
    const legacy = migrate ? readSheetsCheckpoint(true) : null
    if (cached === null && legacy && legacy.config.endpoint === companyEndpoint) {
      const oldData = localStorage.getItem('xuong-viet.data.v1')
      if (oldData !== null) {
        let parsed: unknown
        try { parsed = JSON.parse(oldData) } catch { throw new Error('Bản lưu cũ trên thiết bị bị lỗi. Hãy giữ bản sao trước khi tiếp tục.') }
        if (!validateData(parsed)) throw new Error('Bản lưu cũ trên thiết bị chưa hợp lệ. Hãy giữ bản sao trước khi tiếp tục.')
        localStorage.setItem(COMPANY_DATA_KEY, oldData)
        writeSheetsCheckpoint({ ...legacy, config: { endpoint: companyEndpoint, token: next.token } })
        cached = oldData
      }
    }
    if (cached !== null) {
      let parsed: unknown
      try { parsed = JSON.parse(cached) } catch { throw new Error('Không đọc được bản lưu trên thiết bị. Hãy sao lưu bản này trước khi khôi phục.') }
      if (!validateData(parsed)) throw new Error('Bản lưu trên thiết bị chưa hợp lệ. Hãy sao lưu bản này trước khi khôi phục.')
      // Preserve pending changes and the old baseline across reauthentication.
      // With no valid journal, the sync engine asks before replacing anything.
      if (!readSheetsCheckpoint()) writeSheetsCheckpoint({ config: { endpoint: companyEndpoint, token: next.token }, baseline: null, revision: null, pending: null })
    } else {
      if (remote.data === null) throw new Error('Dữ liệu công ty chưa được khởi tạo. Vui lòng liên hệ người quản lý.')
      const text = JSON.stringify(remote.data)
      const digest = await snapshotDigest(text)
      if (run !== sequence.current) return
      // A second tab may have created a local snapshot while the digest ran.
      if (localStorage.getItem(COMPANY_DATA_KEY) !== null) throw new Error('Dữ liệu vừa được mở ở tab khác. Vui lòng thử lại.')
      localStorage.setItem(COMPANY_DATA_KEY, text)
      writeSheetsCheckpoint({ config: { endpoint: companyEndpoint, token: next.token }, baseline: digest, revision: remote.revision, pending: null })
    }
    if (run !== sequence.current) return
    saveCompanySession(next, shouldRemember)
    if (legacy && legacy.config.endpoint === companyEndpoint) {
      // Drop the old master credential only after the session/cache are durable.
      localStorage.removeItem(LEGACY_SHEETS_SYNC_KEY)
      localStorage.removeItem('xuong-viet.sheets.endpoint.v1')
      localStorage.removeItem('xuong-viet.data.v1')
    }
    sessionRef.current = next
    setSession(next)
    setPassword('')
    setBusy(false)
    setMessage('')
  }

  async function resume() {
    const run = ++sequence.current
    setBusy(true)
    setMessage('Đang mở dữ liệu công ty…')
    try {
      const saved = readCompanySession()
      const legacy = readSheetsCheckpoint(true)
      if (saved) await activate(saved, run, localStorage.getItem(COMPANY_SESSION_KEY) !== null)
      else if (legacy && legacy.config.endpoint === companyEndpoint) {
        const next = await companyAuthenticate({ action: 'exchange', token: legacy.config.token })
        if (run === sequence.current) await activate(next, run, true, true)
      } else if (run === sequence.current) { setBusy(false); setMessage('Đăng nhập để mở dữ liệu công ty trên mọi thiết bị.') }
    } catch (error) {
      if (run !== sequence.current) return
      setCompanyToken('')
      if (error instanceof SheetsError && ['AUTH_FAILED', 'SESSION_EXPIRED', 'UNAUTHORIZED', 'INVALID_TOKEN'].includes(error.code)) forgetCompanySession()
      setBusy(false)
      setMessage(error instanceof Error ? error.message : 'Chưa mở được dữ liệu công ty. Vui lòng thử lại.')
    }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault()
    const run = ++sequence.current
    setBusy(true)
    setMessage('Đang đăng nhập và tải dữ liệu…')
    try {
      const next = await companyAuthenticate({ action: 'login', username: username.trim(), password })
      if (run === sequence.current) await activate(next, run, remember, true)
    } catch (error) {
      if (run !== sequence.current) return
      setCompanyToken('')
      setBusy(false)
      setMessage(error instanceof Error ? error.message : 'Chưa đăng nhập được. Vui lòng thử lại.')
    }
  }

  async function logout() {
    try {
      const cached = localStorage.getItem(COMPANY_DATA_KEY)
      const cp = readSheetsCheckpoint()
      const digest = cached === null ? null : await snapshotDigest(cached)
      if (!sessionRef.current) return
      const currentCache = localStorage.getItem(COMPANY_DATA_KEY)
      if (currentCache !== null && (currentCache !== cached || cp?.pending || !cp?.baseline || cp.baseline !== digest)) {
        if (!window.confirm('Có dữ liệu chưa đồng bộ. Đăng xuất sẽ tải bản sao JSON rồi xóa dữ liệu công ty trên thiết bị này. Tiếp tục?')) return
        const latest = localStorage.getItem(COMPANY_DATA_KEY)
        if (latest) downloadFile(`cong-ty-chua-dong-bo-${new Date().toISOString().slice(0, 10)}.json`, latest)
      }
      lock('Đã đăng xuất. Đăng nhập để tiếp tục.')
      forgetCompanySession()
      localStorage.removeItem(COMPANY_DATA_KEY)
      localStorage.removeItem(COMPANY_OWNER_KEY)
      localStorage.removeItem(COMPANY_SYNC_KEY)
      localStorage.setItem(COMPANY_LOGOUT_KEY, `${Date.now()}-${Math.random()}`)
    } catch { lock('Không xóa được bản lưu trên thiết bị. Vui lòng kiểm tra quyền lưu trữ của trình duyệt.') }
  }

  useEffect(() => {
    try { document.documentElement.dataset.theme = localStorage.getItem('xuong-viet.theme') || 'light' } catch { /* Default light theme. */ }
    void resume()
    const expired = () => {
      lock('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục; dữ liệu chưa đồng bộ vẫn được giữ.')
      try { forgetCompanySession() } catch { /* Server still enforces expiry. */ }
    }
    const changed = (event: StorageEvent) => {
      if (event.key === COMPANY_LOGOUT_KEY || event.key === COMPANY_SESSION_KEY && event.newValue === null) {
        try { sessionStorage.removeItem(COMPANY_SESSION_KEY) } catch { /* UI is locked below. */ }
        lock('Tài khoản đã đăng xuất hoặc thay đổi ở tab khác. Vui lòng đăng nhập lại.')
      }
    }
    window.addEventListener(COMPANY_AUTH_EVENT, expired)
    window.addEventListener('storage', changed)
    return () => { sequence.current++; setCompanyToken(''); window.removeEventListener(COMPANY_AUTH_EVENT, expired); window.removeEventListener('storage', changed) }
  }, [])

  useEffect(() => {
    if (!session) return
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      const remaining = session.expiresAt - Date.now()
      if (remaining <= 0) window.dispatchEvent(new Event(COMPANY_AUTH_EVENT))
      else timer = setTimeout(arm, Math.min(remaining, 2_147_483_647))
    }
    arm()
    return () => clearTimeout(timer)
  }, [session])

  if (session) return <CompanyContext.Provider value={{ username: session.username, logout: () => { void logout() }, changePassword, reauthenticate: () => requireLogin('Đăng nhập lại và thử mật khẩu mới trước để kiểm tra kết quả đổi mật khẩu. Dữ liệu chưa đồng bộ vẫn được giữ.') }}>{children}</CompanyContext.Provider>
  return <main className="company-entry"><section className="company-login" aria-labelledby="company-title">
    <div className="company-emblem"><Building2 size={30} aria-hidden="true" /></div>
    <p className="company-eyebrow">KHÔNG GIAN LÀM VIỆC CHUNG</p><h1 id="company-title">{companyName}</h1>
    <p>Cùng một dữ liệu trên điện thoại và máy tính. Mọi thay đổi được tự động lưu.</p>
    <form onSubmit={event => { void login(event) }}>
      <label htmlFor="company-username">Tên đăng nhập</label><input id="company-username" name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required maxLength={64} disabled={busy} />
      <label htmlFor="company-password">Mật khẩu</label><input id="company-password" name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={256} disabled={busy} />
      <label className="company-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={busy} />Ghi nhớ đăng nhập trên thiết bị cá nhân</label>
      <button className="button primary" type="submit" disabled={busy}><LockKeyhole size={17} />{busy ? 'Đang kết nối…' : 'Đăng nhập'}</button>
    </form>
    <p role="status" aria-live="polite" className="company-message">{message}</p>
    {!busy && <button type="button" className="text-button" onClick={() => { void resume() }}>Thử kết nối lại</button>}
    <small>Dùng tài khoản quản lý công ty. Không cần nhập đường dẫn Google Sheet hay khóa kết nối.</small>
  </section></main>
}
