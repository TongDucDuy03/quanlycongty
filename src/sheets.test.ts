import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSeedData } from './seed'
import { loadSheets, saveSheets, SHEETS_TIMEOUT_MS, validateSheetsEndpoint, validateSpreadsheetUrl } from './sheets'

const config = { endpoint: 'https://script.google.com/macros/s/deployment_123-abc/exec', token: 'a-secret-key-with-at-least-32-characters' }
const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/test_sheet_123/edit'
const reply = (payload: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('Google Sheets transport boundary', () => {
  it('sends simple POST with secrets only in the body and no browser credentials', async () => {
    const data = createSeedData()
    const fetchMock = reply({ ok: true, revision: 3, data, spreadsheetUrl })
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadSheets(config)).toEqual({ revision: 3, data, spreadsheetUrl })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(config.endpoint)
    expect(url).not.toContain(config.token)
    expect(options).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', redirect: 'follow' })
    expect(options.mode).not.toBe('no-cors')
    expect(JSON.parse(options.body)).toEqual({ action: 'load', token: config.token })
  })

  it.each([
    'http://script.google.com/macros/s/id/exec',
    'https://script.google.com.attacker.test/macros/s/id/exec',
    'https://secret@script.google.com/macros/s/id/exec',
    'https://script.google.com/macros/s/id/dev',
    'https://script.google.com/macros/s/id/exec?token=secret',
    'https://script.google.com/macros/s/id/exec#secret',
    'https://script.google.com/macros/s/../exec',
  ])('rejects unsafe endpoint %s before sending secrets', async endpoint => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    expect(validateSheetsEndpoint(endpoint)).toBe(false)
    await expect(loadSheets({ ...config, endpoint })).rejects.toMatchObject({ code: 'INVALID_ENDPOINT' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['short', 'x'.repeat(257), ` ${'x'.repeat(32)}`])('rejects invalid key lengths/whitespace', async token => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    await expect(loadSheets({ ...config, token })).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts an uninitialized sheet only with revision zero', async () => {
    vi.stubGlobal('fetch', reply({ ok: true, revision: 0, data: null, spreadsheetUrl }))
    expect(await loadSheets(config)).toMatchObject({ revision: 0, data: null })
    vi.stubGlobal('fetch', reply({ ok: true, revision: 4, data: null, spreadsheetUrl }))
    await expect(loadSheets(config)).rejects.toMatchObject({ code: 'INVALID_DATA' })
  })

  it('validates incoming payroll and relational data before accepting a snapshot', async () => {
    const data = createSeedData()
    data.orders[0].customerId = 'missing-customer'
    vi.stubGlobal('fetch', reply({ ok: true, revision: 2, data, spreadsheetUrl }))
    await expect(loadSheets(config)).rejects.toMatchObject({ code: 'INVALID_DATA' })
    vi.stubGlobal('fetch', reply({ ok: true, revision: 2, data: { ...createSeedData(), payroll: { employees: [] } }, spreadsheetUrl }))
    await expect(loadSheets(config)).rejects.toMatchObject({ code: 'INVALID_DATA' })
  })

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '2'])('rejects unsafe server revision %s', async revision => {
    vi.stubGlobal('fetch', reply({ ok: true, revision, data: createSeedData(), spreadsheetUrl }))
    await expect(loadSheets(config)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('never exposes an untrusted link or server warning/error', async () => {
    expect(validateSpreadsheetUrl('javascript:alert(1)')).toBe(false)
    expect(validateSpreadsheetUrl('https://docs.google.com.attacker.test/spreadsheets/d/id')).toBe(false)
    vi.stubGlobal('fetch', reply({ ok: true, revision: 2, data: createSeedData(), spreadsheetUrl: 'https://evil.test' }))
    await expect(loadSheets(config)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    vi.stubGlobal('fetch', reply({ ok: false, code: 'CONFLICT', message: `token: ${config.token}` }))
    await expect(loadSheets(config)).rejects.toMatchObject({ code: 'CONFLICT' })
    try { await loadSheets(config) } catch (error) { expect((error as Error).message).not.toContain(config.token) }
    vi.stubGlobal('fetch', reply({ ok: true, revision: 2, data: createSeedData(), spreadsheetUrl, warning: config.token }))
    expect((await loadSheets(config)).warning).not.toContain(config.token)
  })

  it('saves the expected revision and confirms exactly one revision increment', async () => {
    const data = createSeedData()
    const fetchMock = reply({ ok: true, revision: 8, spreadsheetUrl })
    vi.stubGlobal('fetch', fetchMock)
    expect(await saveSheets(config, 7, data)).toEqual({ revision: 8, spreadsheetUrl })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'save', token: config.token, expectedRevision: 7, data })
    vi.stubGlobal('fetch', reply({ ok: true, revision: 7, spreadsheetUrl }))
    await expect(saveSheets(config, 7, data)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('rejects invalid local data and oversized snapshots before fetch', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    await expect(saveSheets(config, -1, createSeedData())).rejects.toMatchObject({ code: 'INVALID_DATA' })
    await expect(saveSheets(config, 0, { ...createSeedData(), version: 2 } as never)).rejects.toMatchObject({ code: 'INVALID_DATA' })
    const data = createSeedData()
    const customer = data.customers[0]
    data.customers.push(...Array.from({ length: 250 }, (_, i) => ({ ...customer, id: `big-${i}`, address: 'á'.repeat(10_000) })))
    await expect(saveSheets(config, 0, data)).rejects.toMatchObject({ code: 'LIMIT' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('recognizes a non-JSON Apps Script login page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Sign in</html>')))
    await expect(loadSheets(config)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('sanitizes network failure details and never retries a write', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error(config.token)); vi.stubGlobal('fetch', fetchMock)
    await expect(saveSheets(config, 0, createSeedData())).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('aborts at 45 seconds without retrying an uncertain write', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetchMock)
    const pending = expect(saveSheets(config, 0, createSeedData())).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(SHEETS_TIMEOUT_MS)
    await pending
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true)
  })
})
