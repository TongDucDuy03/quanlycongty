import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ token: 'qlct1.media_unit_qa.' + 'a'.repeat(64) }))
vi.mock('./company-config', () => ({ companyEndpoint: 'https://script.google.com/macros/s/media-unit-only/exec', companyManaged: true, getCompanyToken: () => auth.token, COMPANY_AUTH_EVENT: 'company-auth-expired' }))

const envelope = Uint8Array.from([255, 216, 255, 224, 0, 2, 255, 217])
const base64 = Buffer.from(envelope).toString('base64')
const id = 'b'.repeat(64)
const mediaResponse = () => ({ id, mime: 'image/jpeg', bytes: envelope.length, base64 })
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => { vi.resetModules(); auth.token = 'qlct1.media_unit_qa.' + 'a'.repeat(64) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('media parsing and normalized image preparation', () => {
  it('accepts only exact immutable media refs and rejects ambiguous schemes or paths', async () => {
    const { mediaId } = await import('./media')
    expect(mediaId(`media:${id}`)).toBe(id)
    for (const source of [id, `media:${id}/other`, `media:${id.toUpperCase()}`, 'media:short', 'javascript:alert(1)', 'data:image/svg+xml,evil', `https://example.com/${id}`]) expect(mediaId(source)).toBeNull()
  })
  it('checks response MIME, canonical encoding, byte length and JPEG envelope before creating an image Blob', async () => {
    const { imageBlob, MAX_IMAGE_BYTES } = await import('./media')
    const blob = imageBlob(mediaResponse())
    expect(blob.type).toBe('image/jpeg')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(envelope)
    for (const input of [null, {}, { ...mediaResponse(), mime: 'image/svg+xml' }, { ...mediaResponse(), bytes: 0 }, { ...mediaResponse(), bytes: envelope.length + 1 }, { ...mediaResponse(), bytes: MAX_IMAGE_BYTES + 1 }, { ...mediaResponse(), base64: base64 + '\n' }, { ...mediaResponse(), base64: base64.replace(/=$/, '') }, { ...mediaResponse(), base64: Buffer.from('<svg/>').toString('base64'), bytes: 6 }]) expect(() => imageBlob(input)).toThrow()
  })
  it('rejects oversized, empty and unsupported source files before allocating a decoded bitmap', async () => {
    const { prepareImage, MAX_SOURCE_BYTES } = await import('./media')
    const decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode)
    for (const file of [{ size: 0, type: 'image/jpeg' }, { size: MAX_SOURCE_BYTES + 1, type: 'image/jpeg' }, { size: 10, type: 'image/svg+xml' }, { size: 10, type: 'image/heic' }, { size: 10, type: 'image/gif' }]) await expect(prepareImage(file as File)).rejects.toThrow()
    expect(decode).not.toHaveBeenCalled()
  })
  it('rasterizes a camera image to bounded dimensions with a white background and releases the decoded bitmap', async () => {
    const { prepareImage, MAX_IMAGE_EDGE } = await import('./media')
    const bitmap = { width: 4000, height: 2000, close: vi.fn() }
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
    const canvas = { width: 0, height: 0, getContext: () => context, toBlob: (done: BlobCallback, mime: string) => done(new Blob([envelope], { type: mime })) }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.stubGlobal('document', { createElement: () => canvas })
    const result = await prepareImage({ size: 100, type: 'image/png', name: 'Ảnh nhà xưởng.PNG' } as File)
    expect(canvas.width).toBe(MAX_IMAGE_EDGE)
    expect(canvas.height).toBe(MAX_IMAGE_EDGE / 2)
    expect(context.fillStyle).toBe('#ffffff')
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, MAX_IMAGE_EDGE, MAX_IMAGE_EDGE / 2)
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, MAX_IMAGE_EDGE, MAX_IMAGE_EDGE / 2)
    expect(result).toEqual({ name: 'Ảnh nhà xưởng.jpg', base64, bytes: envelope.length })
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
  it('releases failed or oversized bitmap decodes and never returns original input bytes', async () => {
    const { prepareImage } = await import('./media')
    const file = { size: 100, type: 'image/jpeg', name: 'photo.jpg' } as File
    const huge = { width: 10000, height: 10000, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(huge))
    await expect(prepareImage(file)).rejects.toThrow('megapixel')
    expect(huge.close).toHaveBeenCalledOnce()
    const bitmap = { width: 10, height: 10, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: (done: BlobCallback) => done(null) }) })
    await expect(prepareImage(file)).rejects.toThrow()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
})

describe('media transport authentication and cache isolation', () => {
  it('uses signed POST for private preview and a separate credential-free GET for public media', async () => {
    const { fetchMediaBlob } = await import('./media')
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ ok: true, media: mediaResponse() })))
    vi.stubGlobal('fetch', fetch)
    await fetchMediaBlob(id, true)
    await fetchMediaBlob(id, false)
    expect(fetch).toHaveBeenCalledTimes(2)
    const [privateUrl, privateOptions] = fetch.mock.calls[0]
    expect(privateUrl).not.toContain(auth.token)
    expect(privateOptions.method).toBe('POST')
    expect(JSON.parse(privateOptions.body)).toEqual({ action: 'getMedia', token: auth.token, id })
    const [publicUrl, publicOptions] = fetch.mock.calls[1]
    expect(publicUrl).toContain(`?action=media&id=${id}`)
    expect(publicUrl).not.toContain(auth.token)
    expect(publicOptions.credentials).toBe('omit')
    expect(publicOptions.body).toBeUndefined()
  })
  it('deduplicates concurrent requests but does not let failed downloads poison later retries', async () => {
    const { fetchMediaBlob } = await import('./media')
    let resolve!: (value: Response) => void
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done })).mockResolvedValueOnce(json({ ok: true, media: mediaResponse() }))
    vi.stubGlobal('fetch', fetch)
    const one = fetchMediaBlob(id), two = fetchMediaBlob(id)
    expect(fetch).toHaveBeenCalledOnce()
    resolve(json({ ok: false, code: 'NOT_FOUND' }))
    const failed = await Promise.allSettled([one, two])
    expect(failed.every(result => result.status === 'rejected')).toBe(true)
    expect((await fetchMediaBlob(id)).size).toBe(envelope.length)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('rejects media with a mismatching ID and refuses invalid IDs before network access', async () => {
    const { fetchMediaBlob } = await import('./media')
    const fetch = vi.fn().mockResolvedValue(json({ ok: true, media: { ...mediaResponse(), id: 'c'.repeat(64) } }))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchMediaBlob('bad/id')).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
    await expect(fetchMediaBlob(id)).rejects.toThrow('khớp')
  })
  it('does not apply an upload response after the active session changes', async () => {
    const { uploadMedia } = await import('./media')
    let resolve!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>(done => { resolve = done })))
    const pending = uploadMedia({ name: 'photo.jpg', base64, bytes: envelope.length })
    auth.token = ''
    resolve(json({ ok: true, media: mediaResponse() }))
    await expect(pending).rejects.toThrow('Phiên đăng nhập đã thay đổi')
  })
  it('reports expired authorization through the login gate and explains media quota without retrying', async () => {
    const { listMedia, uploadMedia } = await import('./media')
    const dispatchEvent = vi.fn(); vi.stubGlobal('window', { dispatchEvent })
    const fetch = vi.fn().mockResolvedValueOnce(json({ ok: false, code: 'SESSION_EXPIRED' })).mockResolvedValueOnce(json({ ok: false, code: 'MEDIA_QUOTA' }))
    vi.stubGlobal('fetch', fetch)
    await expect(listMedia()).rejects.toThrow('hết hạn')
    expect(dispatchEvent.mock.calls[0][0].type).toBe('company-auth-expired')
    await expect(uploadMedia({ name: 'photo.jpg', base64, bytes: envelope.length })).rejects.toThrow('giới hạn')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
