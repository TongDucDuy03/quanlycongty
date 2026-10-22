import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedData } from './seed'
import { clearScopedData, exportCSV, loadData, saveData } from './storage'

const demoKey = 'xuong-viet.data.v1'
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ configured: true })) }))

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  })
})

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('local snapshots', () => {
  it('uses null for an empty store and returns the persisted token for subsequent saves', () => {
    const initial = loadData()
    expect(initial.token).toBeNull()
    const token = saveData(initial.data, initial.token)
    expect(loadData()).toEqual({ data: initial.data, token })
    const changed = { ...initial.data, movements: [] }
    const newToken = saveData(changed, token)
    expect(newToken).not.toBe(token)
    expect(loadData().data.movements).toEqual([])
  })

  it('rejects stale tabs both before the first save and after another tab changes data', () => {
    const firstTab = loadData()
    const secondTab = loadData()
    const token = saveData(firstTab.data, firstTab.token)
    expect(() => saveData(secondTab.data, secondTab.token)).toThrow('tab khác')
    const refreshed = loadData()
    const next = { ...refreshed.data, movements: [] }
    const nextToken = saveData(next, refreshed.token)
    expect(() => saveData(firstTab.data, token)).toThrow('tab khác')
    expect(loadData().token).toBe(nextToken)
  })

  it('isolates each owner and clears only the requested owner cache', () => {
    const demo = createSeedData()
    const demoToken = saveData(demo, null)
    const aliceToken = saveData({ ...demo, movements: [] }, null, 'alice')
    const bobToken = saveData({ ...demo, orders: [] }, null, 'bob')
    expect(loadData('alice').token).toBe(aliceToken)
    expect(loadData('bob').token).toBe(bobToken)
    clearScopedData('alice')
    expect(loadData('alice').token).toBeNull()
    expect(loadData('bob').token).toBe(bobToken)
    expect(loadData().token).toBe(demoToken)
    expect(localStorage.getItem(`${demoKey}.user.alice`)).toBeNull()
  })

  it('retains corrupt raw data until explicitly replaced with the matching token', () => {
    localStorage.setItem(demoKey, '{broken-json')
    const result = loadData()
    expect(result.warning).toContain('Không đọc được')
    expect(result.token).toBe('{broken-json')
    expect(localStorage.getItem(demoKey)).toBe('{broken-json')
    expect(() => saveData(result.data, null)).toThrow('tab khác')
    const token = saveData(result.data, result.token)
    expect(loadData().token).toBe(token)
    expect(loadData().warning).toBeUndefined()
  })

  it('does not overwrite a valid snapshot with invalid data', () => {
    const initial = loadData()
    const token = saveData(initial.data, null)
    expect(() => saveData({ ...initial.data, orders: [{ ...initial.data.orders[0], paid: -1 }] }, token)).toThrow('không hợp lệ')
    expect(loadData().token).toBe(token)
  })
})

describe('CSV export', () => {
  it('exports Vietnamese headers and statuses while neutralizing spreadsheet formulas', async () => {
    vi.useFakeTimers()
    const click = vi.fn()
    vi.stubGlobal('document', { createElement: vi.fn(() => ({ click })) })
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const data = createSeedData()
    data.orders[0].partName = '  =HYPERLINK("https://example.com")'
    exportCSV(data)
    expect(click).toHaveBeenCalledOnce()
    const blob = createUrl.mock.calls[0][0] as Blob
    const csv = await blob.text()
    expect(csv).toContain('"Mã đơn"')
    expect(csv).toContain('"Đang gia công"')
    expect(csv).toContain('"\'  =HYPERLINK(""https://example.com"")"')
    vi.runAllTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})

describe('optional cloud configuration', () => {
  it('keeps GitHub Pages demo local even when cloud variables are provided', async () => {
    vi.resetModules()
    vi.stubGlobal('location', { hostname: 'workshop.github.io' })
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_example')
    const cloud = await import('./storage')
    expect(cloud.cloudAllowed).toBe(false)
    expect(cloud.supabase).toBeNull()
  })

  it('reports invalid URL and incomplete configuration without crashing the application', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'javascript:alert(1)')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_example')
    let cloud = await import('./storage')
    expect(cloud.supabase).toBeNull()
    expect(cloud.cloudConfigError).toContain('HTTPS')
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    cloud = await import('./storage')
    expect(cloud.supabase).toBeNull()
    expect(cloud.cloudConfigError).toContain('đủ URL')
  })

  it('refuses a server secret key in browser configuration', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_secret_do_not_expose')
    const cloud = await import('./storage')
    expect(cloud.supabase).toBeNull()
    expect(cloud.cloudConfigError).toContain('không dùng khóa bí mật')
  })

  it('loads the cloud client when an allowed host has valid public configuration', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_example')
    const cloud = await import('./storage')
    expect(cloud.supabase).toEqual({ configured: true })
    expect(cloud.cloudConfigError).toBe('')
  })
})
