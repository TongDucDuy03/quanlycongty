import { validateData, type Data } from './domain'

export const SHEETS_ENDPOINT_KEY = 'xuong-viet.sheets.endpoint.v1'
export const SHEETS_TIMEOUT_MS = 45_000
export const SHEETS_MAX_BYTES = 2 * 1024 * 1024

export interface SheetsConnectionConfig { endpoint: string; token: string }
export interface SheetsResult { revision: number; spreadsheetUrl: string; warning?: string }
export interface SheetsLoadResult extends SheetsResult { data: Data | null }

export class SheetsError extends Error {
  readonly code: string
  constructor(code: string, message: string) { super(message); this.name = 'SheetsError'; this.code = code }
}

export function validateSheetsEndpoint(value: string): boolean {
  // Reject URL normalization tricks and secrets in queries/fragments before parsing.
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value)
}

export function validateSpreadsheetUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+(?:\/edit)?$/.test(value)
}

export function validateSheetsConfig(config: SheetsConnectionConfig): void {
  if (!validateSheetsEndpoint(config.endpoint)) throw new SheetsError('INVALID_ENDPOINT', 'URL phải có dạng https://script.google.com/macros/s/…/exec, không kèm tham số.')
  if (config.token.length < 32 || config.token.length > 256 || config.token.trim() !== config.token) throw new SheetsError('INVALID_TOKEN', 'Khóa kết nối phải có từ 32 đến 256 ký tự, không có khoảng trắng ở hai đầu.')
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const validRevision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const messages: Record<string, string> = {
  IMMUTABLE_HISTORY: 'Bản này làm thay đổi lịch sử chứng từ hoặc số dư đầu kỳ. Hãy sao lưu rồi tải bản mới từ Google; hủy chứng từ có lý do thay vì xóa/sửa phiếu đã lập.',
  UNAUTHORIZED: 'Khóa kết nối không đúng hoặc đã được thay đổi.',
  AUTH_FAILED: 'Khóa kết nối không đúng hoặc đã được thay đổi.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để đồng bộ.',
  INVALID_TOKEN: 'Khóa kết nối không đúng hoặc đã được thay đổi.',
  CONFLICT: 'Google Sheets đã có bản mới từ người khác. Hãy tải bản sao JSON rồi tải lại dữ liệu từ Sheet.',
  REVISION_CONFLICT: 'Google Sheets đã có bản mới từ người khác. Hãy tải bản sao JSON rồi tải lại dữ liệu từ Sheet.',
  INVALID_DATA: 'Dữ liệu không hợp lệ. Chưa thể đồng bộ với Google Sheets.',
  BUSY: 'Google Sheets đang bận. Hãy tải lại dữ liệu trước khi lưu tiếp.',
  LOCK_TIMEOUT: 'Google Sheets đang bận. Hãy tải lại dữ liệu trước khi lưu tiếp.',
  TOO_LARGE: 'Dữ liệu vượt giới hạn của kết nối Google Sheets. Hãy tải bản sao JSON để giữ dữ liệu.',
  LIMIT: 'Dữ liệu vượt giới hạn 2 MB của kết nối Google Sheets. Hãy tải bản sao JSON để giữ dữ liệu.',
  CONFIG: 'Cấu hình Apps Script chưa đầy đủ. Hãy kiểm tra hướng dẫn kết nối.',
  INTERNAL: 'Google Sheets chưa xử lý được yêu cầu. Kiểm tra Apps Script và tải lại trước khi lưu tiếp.',
  CONFIG_ERROR: 'Cấu hình Apps Script chưa đầy đủ. Hãy kiểm tra hướng dẫn kết nối.',
}

async function request(config: SheetsConnectionConfig, action: 'load' | 'save', expectedRevision?: number, data?: Data): Promise<SheetsLoadResult | SheetsResult> {
  validateSheetsConfig(config)
  if (action === 'save' && (!validRevision(expectedRevision) || !validateData(data))) throw new SheetsError('INVALID_DATA', messages.INVALID_DATA)
  if (action === 'save' && new TextEncoder().encode(JSON.stringify(data)).byteLength > SHEETS_MAX_BYTES) throw new SheetsError('LIMIT', messages.LIMIT)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SHEETS_TIMEOUT_MS)
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      credentials: 'omit', redirect: 'follow', signal: controller.signal,
      body: JSON.stringify({ action, token: config.token, ...(action === 'save' ? { expectedRevision, data } : {}) }),
    })
    if (!response.ok) throw new SheetsError('HTTP_ERROR', 'Không truy cập được Apps Script. Kiểm tra URL và quyền triển khai ứng dụng web.')
    let payload: unknown
    try { payload = await response.json() } catch {
      if (controller.signal.aborted) throw new SheetsError('TIMEOUT', 'Kết nối quá thời gian chờ. Hãy tải lại từ Sheet để kiểm tra kết quả trước khi lưu tiếp.')
      throw new SheetsError('INVALID_RESPONSE', 'Apps Script không trả về dữ liệu hợp lệ. Kiểm tra phiên bản triển khai và quyền truy cập.')
    }
    if (!record(payload)) throw new SheetsError('INVALID_RESPONSE', 'Phản hồi Google Sheets không hợp lệ.')
    if (payload.ok === false) {
      const code = typeof payload.code === 'string' && Object.hasOwn(messages, payload.code) ? payload.code : 'SERVER_ERROR'
      throw new SheetsError(code, messages[code] ?? 'Google Sheets chưa xử lý được yêu cầu. Kiểm tra Apps Script và tải lại trước khi lưu tiếp.')
    }
    if (payload.ok !== true || !validRevision(payload.revision) || !validateSpreadsheetUrl(payload.spreadsheetUrl)) throw new SheetsError('INVALID_RESPONSE', 'Phiên bản hoặc đường dẫn Sheet trong phản hồi không hợp lệ.')
    // Never echo untrusted server messages (they may contain secrets or HTML).
    const result: SheetsResult = { revision: payload.revision, spreadsheetUrl: payload.spreadsheetUrl, ...(payload.warning ? { warning: 'Dữ liệu đã được xử lý nhưng bảng hiển thị có cảnh báo. Kiểm tra Apps Script trước khi tiếp tục.' } : {}) }
    if (action === 'load') {
      if (payload.data === null && payload.revision === 0) return { ...result, data: null }
      if (!validateData(payload.data) || payload.revision === 0) throw new SheetsError('INVALID_DATA', 'Dữ liệu trong Sheet không đúng định dạng hệ thống. Dữ liệu trên máy vẫn được giữ lại.')
      return { ...result, data: payload.data }
    }
    if (payload.revision !== (expectedRevision as number) + 1) throw new SheetsError('INVALID_RESPONSE', 'Không xác nhận được phiên bản đã lưu. Hãy tải lại từ Sheet trước khi lưu tiếp.')
    return result
  } catch (error) {
    if (error instanceof SheetsError) throw error
    if (controller.signal.aborted) throw new SheetsError('TIMEOUT', 'Kết nối quá thời gian chờ. Hãy tải lại từ Sheet để kiểm tra kết quả trước khi lưu tiếp.')
    throw new SheetsError('NETWORK_ERROR', 'Không nhận được phản hồi Google Sheets. Kiểm tra mạng, URL và quyền Apps Script; tải lại trước khi lưu tiếp.')
  } finally { clearTimeout(timer) }
}

export function loadSheets(config: SheetsConnectionConfig): Promise<SheetsLoadResult> { return request(config, 'load') as Promise<SheetsLoadResult> }
export function saveSheets(config: SheetsConnectionConfig, expectedRevision: number, data: Data): Promise<SheetsResult> { return request(config, 'save', expectedRevision, data) }
