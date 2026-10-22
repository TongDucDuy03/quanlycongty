import { companyEndpoint, COMPANY_SESSION_KEY } from './company-config'
import { SheetsError, validateSheetsEndpoint, SHEETS_TIMEOUT_MS } from './sheets'

export interface CompanySession { token: string; expiresAt: number; username: string; endpoint: string }
function validSession(value: unknown): value is CompanySession {
  if (!value || typeof value !== 'object') return false
  const s = value as CompanySession
  return typeof s.token === 'string' && s.token.length >= 32 && s.token.length <= 256 && typeof s.username === 'string' && s.username.length > 0 && typeof s.expiresAt === 'number' && Number.isFinite(s.expiresAt) && s.endpoint === companyEndpoint
}
export function readCompanySession(): CompanySession | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(COMPANY_SESSION_KEY) ?? sessionStorage.getItem(COMPANY_SESSION_KEY) ?? 'null')
    return validSession(value) && value.expiresAt > Date.now() ? value : null
  } catch { return null }
}
export function saveCompanySession(session: CompanySession, remember: boolean) {
  if (remember) sessionStorage.removeItem(COMPANY_SESSION_KEY)
  else localStorage.removeItem(COMPANY_SESSION_KEY)
  ;(remember ? localStorage : sessionStorage).setItem(COMPANY_SESSION_KEY, JSON.stringify(session))
}
export function forgetCompanySession() {
  localStorage.removeItem(COMPANY_SESSION_KEY)
  sessionStorage.removeItem(COMPANY_SESSION_KEY)
}
export async function companyAuthenticate(body: { action: 'login'; username: string; password: string } | { action: 'exchange'; token: string }): Promise<CompanySession> {
  if (!validateSheetsEndpoint(companyEndpoint)) throw new Error('Địa chỉ dịch vụ chưa được cấu hình đúng. Vui lòng liên hệ người quản lý.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SHEETS_TIMEOUT_MS)
  try {
    const response = await fetch(companyEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', redirect: 'follow', signal: controller.signal, body: JSON.stringify(body) })
    if (!response.ok) throw new Error('Dịch vụ đang bận. Vui lòng thử lại.')
    const result = await response.json()
    if (result?.ok !== true) {
      const messages: Record<string, string> = { AUTH_FAILED: 'Tên đăng nhập hoặc mật khẩu không đúng.', RATE_LIMITED: 'Bạn đã thử nhiều lần. Vui lòng chờ ít phút rồi đăng nhập lại.', LOGIN_NOT_CONFIGURED: 'Tài khoản công ty chưa được thiết lập. Vui lòng liên hệ người quản lý.' }
      const code = typeof result?.code === 'string' && Object.hasOwn(messages, result.code) ? result.code : 'AUTH_FAILED'
      throw new SheetsError(code, messages[code])
    }
    const session = { token: result.token, expiresAt: result.expiresAt, username: result.username, endpoint: companyEndpoint }
    if (!validSession(session) || session.expiresAt <= Date.now()) throw new Error('Phản hồi đăng nhập chưa hợp lệ. Vui lòng thử lại.')
    return session
  } catch (error) {
    if (error instanceof SheetsError) throw error
    throw new Error(controller.signal.aborted ? 'Kết nối quá thời gian chờ. Vui lòng thử lại.' : 'Chưa kết nối được dịch vụ công ty. Kiểm tra mạng rồi thử lại.')
  } finally { clearTimeout(timeout) }
}

/** A lost response may follow a committed password rotation; never retry it automatically. */
export async function changeCompanyPassword(token: string, currentPassword: string, newPassword: string): Promise<void> {
  if (!validateSheetsEndpoint(companyEndpoint)) throw new SheetsError('CONFIG', 'Địa chỉ dịch vụ chưa được cấu hình đúng.')
  if (currentPassword.length < 12 || currentPassword.length > 128 || newPassword.length < 12 || newPassword.length > 128 || currentPassword === newPassword) {
    throw new SheetsError('INVALID_DATA', 'Mật khẩu cần có từ 12 đến 128 ký tự. Mật khẩu mới phải khác mật khẩu hiện tại.')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SHEETS_TIMEOUT_MS)
  try {
    const response = await fetch(companyEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', redirect: 'follow', signal: controller.signal, body: JSON.stringify({ action: 'changePassword', token, currentPassword, newPassword }) })
    if (!response.ok) throw new Error('http')
    const result = await response.json()
    if (result?.ok === true) return
    const messages: Record<string, string> = {
      CURRENT_PASSWORD_INVALID: 'Mật khẩu hiện tại chưa đúng. Vui lòng kiểm tra lại.',
      INVALID_DATA: 'Mật khẩu cần có từ 12 đến 128 ký tự. Mật khẩu mới phải khác mật khẩu hiện tại.',
      RATE_LIMITED: 'Bạn đã thử nhiều lần. Vui lòng chờ ít phút rồi thử lại.',
      AUTH_FAILED: 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.',
      SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      UNAUTHORIZED: 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.',
      BUSY: 'Dịch vụ đang bận. Vui lòng thử lại sau ít phút.',
      LOCK_TIMEOUT: 'Dịch vụ đang bận. Vui lòng thử lại sau ít phút.',
    }
    const code = typeof result?.code === 'string' && Object.hasOwn(messages, result.code) ? result.code : null
    if (result?.ok === false && code) throw new SheetsError(code, messages[code])
    throw new Error('unknown outcome')
  } catch (error) {
    if (error instanceof SheetsError) throw error
    throw new SheetsError('PASSWORD_CHANGE_UNCERTAIN', 'Chưa xác nhận được kết quả đổi mật khẩu. Mật khẩu có thể đã đổi: hãy đăng nhập lại và thử mật khẩu mới trước. Dữ liệu chưa đồng bộ vẫn được giữ trên thiết bị.')
  } finally { clearTimeout(timeout) }
}
