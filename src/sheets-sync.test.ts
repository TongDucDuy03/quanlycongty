import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSheetsCheckpoint, reconcileSnapshots, SHEETS_SYNC_KEY, snapshotDigest } from './sheets-sync'

const baseline = 'a'.repeat(64)
const local = 'b'.repeat(64)
const remote = 'c'.repeat(64)
const config = { endpoint: 'https://script.google.com/macros/s/test-id/exec', token: 'private-connection-key-32-chars-minimum' }
afterEach(() => vi.unstubAllGlobals())

describe('sync reconciliation preserves offline and concurrent work', () => {
  it.each([
    [baseline, baseline, baseline, null, 'same'],
    [local, baseline, baseline, null, 'upload'],
    [baseline, remote, baseline, null, 'download'],
    [local, remote, baseline, null, 'conflict'],
    [local, remote, baseline, remote, 'acknowledge'],
    [remote, remote, baseline, remote, 'same'],
    [local, null, null, null, 'initial'],
    [local, remote, null, null, 'conflict'],
    [local, null, baseline, local, 'conflict'],
  ] as const)('local=%s remote=%s baseline=%s pending=%s => %s', (current, cloud, ack, pending, result) => {
    expect(reconcileSnapshots(current, cloud, ack, pending)).toBe(result)
  })

  it('uses a reproducible SHA-256 journal digest and distinguishes snapshot edits', async () => {
    expect(await snapshotDigest('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await snapshotDigest('{"payroll":1}')).not.toBe(await snapshotDigest('{"payroll":2}'))
  })
})

describe('remembered connection validation', () => {
  const read = (value: unknown) => {
    const getItem = vi.fn(() => typeof value === 'string' ? value : JSON.stringify(value))
    vi.stubGlobal('localStorage', { getItem })
    const result = readSheetsCheckpoint()
    expect(getItem).toHaveBeenCalledWith(SHEETS_SYNC_KEY)
    return result
  }

  it('accepts valid established and initialized-but-unacknowledged checkpoints', () => {
    const saved = { config, baseline, revision: 5, pending: local }
    expect(read(saved)).toEqual(saved)
    const initializing = { config, baseline: null, revision: 0, pending: local }
    expect(read(initializing)).toEqual(initializing)
  })

  it.each([
    null,
    '{',
    { config, baseline, revision: -1, pending: null },
    { config, baseline, revision: 0.5, pending: null },
    { config, baseline, revision: Number.MAX_SAFE_INTEGER + 1, pending: null },
    { config, baseline: null, revision: 5, pending: null },
    { config, baseline, revision: 0, pending: null },
    { config, baseline: 'invalid', revision: 5, pending: null },
    { config, baseline, revision: 5, pending: 'invalid' },
    { config: { ...config, token: 'short' }, baseline, revision: 5, pending: null },
    { config: { ...config, endpoint: 'https://evil.test/exec' }, baseline, revision: 5, pending: null },
  ])('rejects damaged or untrusted checkpoint %#', value => {
    expect(read(value)).toBeNull()
  })

  it('allows startup when browser storage throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage disabled') } })
    expect(readSheetsCheckpoint()).toBeNull()
  })
})
