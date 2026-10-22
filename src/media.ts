import { companyEndpoint, companyManaged, getCompanyToken, COMPANY_AUTH_EVENT } from './company-config'

export const MAX_IMAGE_BYTES = 160 * 1024
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_EDGE = 1600
export interface MediaAsset { id: string; name: string; mime: string; bytes: number; createdAt: string }
export interface MediaUsage { count: number; bytes: number; maxCount: number; maxBytes: number }
export interface PreparedImage { name: string; base64: string; bytes: number }
export const mediaId = (source: string) => /^media:([a-f0-9]{64})$/.exec(source)?.[1] ?? null
const validId = (id: string) => /^[a-f0-9]{64}$/.test(id)
const toBase64 = (bytes: Uint8Array) => { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary) }

/** Always rasterize locally: camera metadata and original filenames never go to the public response. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error('Chọn ảnh tối đa 10 MB. Hãy thu nhỏ ảnh rồi thử lại.')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Hỗ trợ JPG, PNG hoặc WebP. Với ảnh HEIC, hãy xuất sang JPG trước.')
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Không đọc được ảnh. Hãy thử ảnh JPG hoặc PNG khác.') })
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error('Ảnh quá lớn. Hãy chọn ảnh dưới 40 megapixel.')
    let scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Trình duyệt chưa hỗ trợ xử lý ảnh. Hãy dùng Chrome hoặc Safari mới.')
    for (let pass = 0; pass < 5; pass++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.86, 0.72, 0.55]) {
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Không xử lý được ảnh.')), 'image/jpeg', quality))
        if (blob.type !== 'image/jpeg' || !blob.size) throw new Error('Trình duyệt chưa xuất được ảnh JPG.')
        if (blob.size <= MAX_IMAGE_BYTES) return { name: file.name.replace(/\.[^.]+$/, '').slice(0, 100) + '.jpg', base64: toBase64(new Uint8Array(await blob.arrayBuffer())), bytes: blob.size }
      }
      scale *= 0.75
    }
    throw new Error('Ảnh vẫn quá lớn sau khi thu nhỏ. Hãy chọn ảnh khác.')
  } finally { bitmap.close() }
}

async function post(action: string, extra: Record<string, unknown> = {}) {
  const token = getCompanyToken()
  if (!token) throw new Error('Vui lòng đăng nhập lại để quản lý ảnh.')
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000)
  try {
    const response = await fetch(companyEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', body: JSON.stringify({ action, token, ...extra }), signal: controller.signal })
    const result = await response.json()
    if (token !== getCompanyToken()) throw new Error('Phiên đăng nhập đã thay đổi. Hãy mở lại thư viện ảnh.')
    if (!response.ok || result?.ok !== true) {
      if (['UNAUTHORIZED', 'AUTH_FAILED', 'SESSION_EXPIRED'].includes(result?.code)) window.dispatchEvent(new Event(COMPANY_AUTH_EVENT))
      const messages: Record<string, string> = { LIMIT: 'Thư viện ảnh đã đạt giới hạn. Xóa ảnh không dùng hoặc chọn ảnh nhỏ hơn.', MEDIA_IN_USE: 'Ảnh còn được dùng trong bản nháp đã lưu hoặc website đang xuất bản. Bỏ ảnh khỏi nội dung, lưu và xuất bản trước khi xóa.', NOT_FOUND: 'Không tìm thấy ảnh. Hãy tải ảnh lên lại.', INVALID_DATA: 'Ảnh không hợp lệ. Hãy chọn JPG, PNG hoặc WebP khác.', BUSY: 'Dịch vụ đang bận. Vui lòng thử lại.', SESSION_EXPIRED: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' }
      messages.MEDIA_QUOTA = messages.LIMIT; messages.INVALID_MEDIA = messages.INVALID_DATA
      throw new Error(messages[result?.code] || 'Chưa xử lý được ảnh. Hãy kiểm tra kết nối và thử lại.')
    }
    return result
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Chưa xác nhận được kết quả. Kiểm tra thư viện trước khi thử lại; tải lại cùng ảnh sẽ không tạo bản trùng.')
    throw error
  } finally { clearTimeout(timer) }
}

interface StoredImage { media: MediaAsset; base64: string }
async function localDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('xuong-viet.demo-media.v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'media.id' })
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('Không mở được kho ảnh trên thiết bị.'))
  })
}
async function localOperation<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await localDB()
  try { return await new Promise<T>((resolve, reject) => { const tx = db.transaction('images', mode); const request = operation(tx.objectStore('images')); tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(new Error('Không lưu được ảnh trên thiết bị.')); tx.onabort = () => reject(new Error('Kho ảnh trên thiết bị đã đầy hoặc không khả dụng.')) }) }
  finally { db.close() }
}
export async function listMedia(): Promise<{ media: MediaAsset[]; usage: MediaUsage }> {
  if (companyManaged) return post('listMedia')
  const images = await localOperation<StoredImage[]>('readonly', store => store.getAll())
  return { media: images.map(image => image.media), usage: { count: images.length, bytes: images.reduce((sum, image) => sum + image.media.bytes, 0), maxCount: 80, maxBytes: 12 * 1024 * 1024 } }
}
export async function uploadMedia(image: PreparedImage): Promise<{ media: MediaAsset; usage: MediaUsage }> {
  if (companyManaged) return post('uploadMedia', { name: image.name, base64: image.base64 })
  const raw = Uint8Array.from(atob(image.base64), char => char.charCodeAt(0))
  const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), byte => byte.toString(16).padStart(2, '0')).join('')
  const existing = await localOperation<StoredImage | undefined>('readonly', store => store.get(id))
  const library = await listMedia()
  if (existing) return { media: existing.media, usage: library.usage }
  if (library.usage.count >= 80 || library.usage.bytes + raw.length > library.usage.maxBytes) throw new Error('Thư viện demo đã đầy. Xóa ảnh không dùng trước khi tải thêm.')
  const media = { id, name: image.name, mime: 'image/jpeg', bytes: raw.length, createdAt: new Date().toISOString() }
  await localOperation('readwrite', store => store.put({ media, base64: image.base64 }))
  return { media, usage: { ...library.usage, count: library.usage.count + 1, bytes: library.usage.bytes + media.bytes } }
}
export async function deleteMedia(id: string): Promise<void> {
  if (!validId(id)) throw new Error('Mã ảnh không hợp lệ.')
  if (companyManaged) await post('deleteMedia', { id })
  else await localOperation('readwrite', store => store.delete(id))
}
export function imageBlob(value: unknown): Blob {
  const item = value as { id?: unknown; mime?: unknown; bytes?: unknown; base64?: unknown }
  if (!item || item.mime !== 'image/jpeg' || typeof item.base64 !== 'string' || item.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || typeof item.bytes !== 'number' || item.bytes > MAX_IMAGE_BYTES || item.bytes < 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.base64)) throw new Error('Dữ liệu ảnh không hợp lệ.')
  const raw = Uint8Array.from(atob(item.base64), char => char.charCodeAt(0))
  if (toBase64(raw) !== item.base64) throw new Error('Dữ liệu ảnh không hợp lệ.')
  if (raw.length !== item.bytes || raw[0] !== 255 || raw[1] !== 216 || raw[2] !== 255 || raw.at(-2) !== 255 || raw.at(-1) !== 217) throw new Error('Ảnh không đúng định dạng JPG.')
  return new Blob([raw], { type: 'image/jpeg' })
}
const cache = new Map<string, Promise<Blob>>()
export async function fetchMediaBlob(id: string, privatePreview = false): Promise<Blob> {
  if (!validId(id)) throw new Error('Mã ảnh không hợp lệ.')
  const key = `${privatePreview ? getCompanyToken() : 'public'}:${id}`
  const cached = cache.get(key); if (cached) return cached
  const pending = (async () => {
    let value
    if (!companyManaged) {
      const stored = await localOperation<StoredImage | undefined>('readonly', store => store.get(id))
      if (!stored) throw new Error('Không tìm thấy ảnh trên thiết bị.')
      value = { ...stored.media, base64: stored.base64 }
    } else if (privatePreview) value = (await post('getMedia', { id })).media
    else {
      const response = await fetch(`${companyEndpoint}?action=media&id=${id}`, { credentials: 'omit', signal: AbortSignal.timeout(30000) })
      const body = await response.json()
      if (!response.ok || body?.ok !== true) throw new Error('Ảnh chưa được xuất bản hoặc không tải được.')
      value = body.media
    }
    if (value?.id !== id) throw new Error('Ảnh trả về không khớp yêu cầu.')
    return imageBlob(value)
  })()
  cache.set(key, pending)
  if (cache.size > 80) cache.delete(cache.keys().next().value!)
  pending.catch(() => cache.delete(key))
  return pending
}
