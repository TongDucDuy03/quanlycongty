import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Building2, LockKeyhole, LogOut } from 'lucide-react'
import { validateData } from './domain'
import { loadSheets, SheetsError } from './sheets'
import { LEGACY_SHEETS_SYNC_KEY, readSheetsCheckpoint, snapshotDigest, writeSheetsCheckpoint } from './sheets-sync'
import { downloadFile } from './storage'
import { companyAuthenticate, forgetCompanySession, readCompanySession, saveCompanySession, type CompanySession } from './company-auth'
import { companyEndpoint, companyName, COMPANY_AUTH_EVENT, COMPANY_DATA_KEY, COMPANY_OWNER_KEY, COMPANY_LOGOUT_KEY, COMPANY_SESSION_KEY, COMPANY_SYNC_KEY, setCompanyToken } from './company-config'
import './company.css'

interface Account { username: string; logout: () => void }
const CompanyContext = createContext<Account | null>(null)
export function useCompanyAccount() { return useContext(CompanyContext) }
export function CompanyAccount() {
  const account = useCompanyAccount()
  if (!account) return null
  return <section className="card settings-card"><h2>Tài khoản công ty</h2><p>Đang đăng nhập: <strong>{account.username}</strong>. Mở cùng đường link trên điện thoại hoặc máy tính và đăng nhập để dùng chung dữ liệu.</p><button className="button secondary" onClick={account.logout}><LogOut size={16} />Đăng xuất khỏi thiết bị</button></section>
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

  if (session) return <CompanyContext.Provider value={{ username: session.username, logout: () => { void logout() } }}>{children}</CompanyContext.Provider>
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
