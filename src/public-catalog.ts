import { validatePublicCatalog, type PublicCatalog } from './commerce'
import { companyEndpoint, COMPANY_AUTH_EVENT } from './company-config'
import { SheetsError, SHEETS_TIMEOUT_MS } from './sheets'

export async function fetchPublicCatalog(signal?: AbortSignal): Promise<PublicCatalog | null> {
  if (!companyEndpoint) return null
  const response = await fetch(`${companyEndpoint}?action=catalog`, { credentials: 'omit', signal, redirect: 'follow' })
  if (!response.ok) throw new Error('Không tải được thông tin công khai.')
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || !('ok' in payload) || payload.ok !== true || !('catalog' in payload)) throw new Error('Thông tin công khai chưa sẵn sàng.')
  if (payload.catalog === null) return null
  if (!validatePublicCatalog(payload.catalog)) throw new Error('Nội dung website chưa hợp lệ.')
  return payload.catalog
}

export async function publishPublicCatalog(token: string, expectedRevision: number): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SHEETS_TIMEOUT_MS)
  try {
    const response = await fetch(companyEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', signal: controller.signal, body: JSON.stringify({ action: 'publishCatalog', token, expectedRevision }) })
    const result = await response.json()
    if (!response.ok) throw new Error('Dịch vụ đang bận. Hãy kiểm tra trang công khai rồi thử lại.')
    if (result?.ok !== true) {
      if (['UNAUTHORIZED', 'AUTH_FAILED', 'SESSION_EXPIRED'].includes(result?.code)) window.dispatchEvent(new Event(COMPANY_AUTH_EVENT))
      const messages: Record<string, string> = { CONFLICT: 'Bản trên Google vừa thay đổi. Đồng bộ lại trước khi xuất bản.', BUSY: 'Dịch vụ đang bận, vui lòng thử lại.', INVALID_DATA: 'Kiểm tra tên doanh nghiệp và nội dung website.', LIMIT: 'Nội dung công khai vượt giới hạn. Hãy rút gọn mô tả.', SESSION_EXPIRED: 'Vui lòng đăng nhập lại.' }
      throw new SheetsError(result?.code || 'SERVER_ERROR', messages[result?.code] || 'Chưa xuất bản được. Kiểm tra kết nối và thử lại.')
    }
    if (typeof result.publishedAt !== 'string' || Number.isNaN(Date.parse(result.publishedAt))) throw new Error('Chưa xác nhận được thời gian xuất bản. Hãy mở trang công khai để kiểm tra.')
    return result.publishedAt
  } catch (error) {
    if (error instanceof SheetsError) throw error
    throw new Error('Chưa xác nhận được kết quả xuất bản. Hãy mở trang công khai để kiểm tra trước khi thử lại.')
  } finally { clearTimeout(timeout) }
}
