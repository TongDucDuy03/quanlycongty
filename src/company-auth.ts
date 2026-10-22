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
