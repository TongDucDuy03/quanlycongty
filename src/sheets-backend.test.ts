import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { createSeedData } from './seed'
import { validateData, type Data } from './domain'

const source = readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8')

function backend() {
  const properties = new Map<string, string>()
  const sheets = new Map<string, Sheet>()
  let held = false
  let busy = false
  let failWrites = false
  let failReports = false
  let lockCount = 0
  class Sheet {
    values = new Map<string, unknown>()
    rows = 1000
    cols = 26
    constructor(public name: string) {}
    getRange(row: number, col: number, rows = 1, cols = 1) {
      return {
        getValue: () => this.values.get(`${row},${col}`) ?? '',
        setValue: (value: unknown) => { this.values.set(`${row},${col}`, value) },
        getValues: () => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => this.values.get(`${row + r},${col + c}`) ?? '')),
        setValues: (values: unknown[][]) => {
          if (failWrites && /_[AB]$/.test(this.name)) throw new Error('Simulated write failure')
          values.forEach((line, r) => line.forEach((v, c) => this.values.set(`${row + r},${col + c}`, v)))
        },
        clearContent: () => { for (let r = row; r < row + rows; r++) for (let c = col; c < col + cols; c++) this.values.delete(`${r},${c}`) },
      }
    }
    getMaxRows() { return this.rows }
    getMaxColumns() { return this.cols }
    getLastRow() { return Math.max(0, ...[...this.values.keys()].map(k => Number(k.split(',')[0]))) }
    insertRowsAfter(_after: number, count: number) { this.rows += count }
    insertColumnsAfter(_after: number, count: number) { this.cols += count }
    setFrozenRows() {}
  }
  const spreadsheet = {
    getId: () => 'test-sheet',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/test-sheet/edit',
    getSheetByName: (name: string) => sheets.get(name) ?? null,
    insertSheet: (name: string) => {
      if (failReports && !/_[AB]$/.test(name)) throw new Error('Projection error')
      const sheet = new Sheet(name); sheets.set(name, sheet); return sheet
    },
  }
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => properties.get(key) ?? null, setProperty: (key: string, value: string) => properties.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { if (busy) throw new Error('busy'); held = true; lockCount++ }, tryLock: () => { if (busy) return false; held = true; lockCount++; return true }, hasLock: () => held, releaseLock: () => { held = false } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet, flush: () => {} },
    Utilities: {
      getUuid: randomUUID,
      Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
      base64Encode: (value: string | number[]) => Buffer.from(typeof value === 'string' ? value : Uint8Array.from(value)).toString('base64'),
      base64Decode: (value: string) => [...Buffer.from(value, 'base64')],
      computeDigest: (_algorithm: string, value: string) => [...createHash('sha256').update(value).digest()],
      newBlob: (value: string | number[]) => {
        const buffer = Buffer.from(typeof value === 'string' ? value : Uint8Array.from(value))
        return { getBytes: () => [...buffer], getDataAsString: () => buffer.toString('utf8') }
      },
    },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (value: string) => ({ setMimeType: () => value }) },
    console: { log: () => {} },
    setup: undefined as unknown as () => void,
    doPost: undefined as unknown as (event: unknown) => string,
  }
  runInNewContext(source, context)
  context.setup()
  const request = (body: Record<string, unknown>) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ token: properties.get('QLCT_TOKEN'), ...body }) } }))
  return { request, properties, sheets, spreadsheet, context, setBusy: (v: boolean) => { busy = v }, failWrites: () => { failWrites = true }, failReports: () => { failReports = true }, locks: () => lockCount, held: () => held }
}

describe('Apps Script backend (mocked Google services; not a live deployment)', () => {
  it('does not bundle unused browser helpers or presentation-only Intl constructors', () => {
    expect(source).not.toMatch(/\bIntl\.|\blocalStorage\b|\bcrypto\.|\bwindow\.|\bstructuredClone\(/)
  })
  it('initializes without overwriting existing sheets and preserves the connection key', () => {
    const b = backend()
    const unrelated = b.spreadsheet.insertSheet('My accounting')
    unrelated.getRange(1, 1).setValue('Keep me')
    const token = b.properties.get('QLCT_TOKEN')
    expect(token).toHaveLength(96)
    b.context.setup()
    expect(b.properties.get('QLCT_TOKEN')).toBe(token)
    expect(unrelated.getRange(1, 1).getValue()).toBe('Keep me')
    expect(b.request({ action: 'load' })).toMatchObject({ ok: true, revision: 0, data: null })
  })
  it('rejects missing/wrong bearer before locking or accessing data', () => {
    const b = backend(), locks = b.locks()
    expect(b.request({ action: 'load', token: '' })).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    expect(b.locks()).toBe(locks)
  })
  it('round trips all workshop and payroll data; rejects stale saves', () => {
    const b = backend(), data = createSeedData()
    const before = b.locks()
    expect(b.request({ action: 'save', expectedRevision: 0, data })).toMatchObject({ ok: true, revision: 1 })
    expect(b.request({ action: 'load' })).toMatchObject({ ok: true, revision: 1, data })
    expect(b.locks()).toBe(before + 2)
    expect(b.request({ action: 'save', expectedRevision: 0, data })).toMatchObject({ ok: false, code: 'CONFLICT' })
    expect(b.held()).toBe(false)
    expect(b.request({ action: 'save', expectedRevision: 1, data })).toMatchObject({ ok: true, revision: 2 })
  })
  it('rejects invalid schemas and missing expected revision without changing the commit', () => {
    const b = backend()
    expect(b.request({ action: 'save', data: createSeedData() })).toMatchObject({ ok: false, code: 'INVALID_DATA' })
    expect(b.request({ action: 'save', expectedRevision: 0, data: { version: 1 } })).toMatchObject({ ok: false, code: 'INVALID_DATA' })
    const invalid = createSeedData(); invalid.orders[0].customerId = 'missing'
    expect(b.request({ action: 'save', expectedRevision: 0, data: invalid })).toMatchObject({ ok: false, code: 'INVALID_DATA' })
    expect(b.properties.has('QLCT_COMMIT')).toBe(false)
  })
  it.each<[string, (data: Data) => void]>([
    ['invalid order date', data => { data.orders[0].dueDate = '2026-02-30' }],
    ['out-of-range payroll settings', data => { data.payroll!.settings.standardDays = 100 }],
    ['duplicate employee/day attendance', data => {
      const attendance = data.payroll!.attendance[0]
      data.payroll!.attendance.push({ ...attendance, id: 'duplicate-attendance-with-distinct-id' })
    }],
    ['invalid closed payroll totals', data => {
      data.payroll!.periods[0].rows[0].grossPay += 1
    }],
  ])('uses frontend validation and preserves the revision for %s', (_name, mutate) => {
    const b = backend(), original = createSeedData()
    expect(b.request({ action: 'save', expectedRevision: 0, data: original })).toMatchObject({ ok: true, revision: 1 })
    const invalid = structuredClone(original)
    mutate(invalid)
    expect(validateData(invalid)).toBe(false)
    expect(b.request({ action: 'save', expectedRevision: 1, data: invalid })).toMatchObject({ ok: false, code: 'INVALID_DATA' })
    expect(b.request({ action: 'load' })).toMatchObject({ ok: true, revision: 1, data: original })
  })
  it('round trips valid closed payroll snapshots through the shared strict validator', () => {
    const b = backend(), data = createSeedData()
    expect(data.payroll!.periods[0].rows.length).toBeGreaterThan(0)
    expect(b.request({ action: 'save', expectedRevision: 0, data })).toMatchObject({ ok: true, revision: 1 })
    expect(b.request({ action: 'load' })).toMatchObject({ ok: true, revision: 1, data })
  })
  it('accepts a manually rotated 32-character token matching the client contract', () => {
    const b = backend()
    b.properties.set('QLCT_TOKEN', 'test-only-not-a-real-key-123456789')
    expect(b.request({ action: 'load' })).toMatchObject({ ok: true, revision: 0, data: null })
  })
  it('keeps committed data readable after an interrupted inactive-buffer write', () => {
    const b = backend(), data = createSeedData()
    b.request({ action: 'save', expectedRevision: 0, data })
    b.failWrites()
    expect(b.request({ action: 'save', expectedRevision: 1, data })).toMatchObject({ ok: false, code: 'INTERNAL' })
    expect(b.request({ action: 'load' })).toMatchObject({ ok: true, revision: 1, data })
  })
  it('detects tampered chunk content and refuses overwrite', () => {
    const b = backend(), data = createSeedData()
    b.request({ action: 'save', expectedRevision: 0, data })
    const manifest = JSON.parse(b.properties.get('QLCT_COMMIT')!)
    const sheet = b.sheets.get(`QLCT_${b.properties.get('QLCT_NAMESPACE')}_${manifest.slot}`)!
    sheet.getRange(2, 1).setValue('b64:ZXZpbA==')
    expect(b.request({ action: 'load' })).toMatchObject({ ok: false, code: 'CONFIG' })
    expect(b.request({ action: 'save', expectedRevision: 1, data })).toMatchObject({ ok: false, code: 'CONFIG' })
  })
  it('saves literal strings in projections, including nested objects', () => {
    const b = backend(), data = createSeedData()
    data.customers[0].name = '=IMPORTXML("https://example.invalid","x")'
    expect(b.request({ action: 'save', expectedRevision: 0, data }).ok).toBe(true)
    const report = b.sheets.get(`QLCT_${b.properties.get('QLCT_NAMESPACE')}_KhachHang`)!
    expect([...report.values.values()]).toContain("'" + data.customers[0].name)
    const payroll = b.sheets.get(`QLCT_${b.properties.get('QLCT_NAMESPACE')}_NhanVien`)!
    expect([...payroll.values.values()].some(v => typeof v === 'string' && v.startsWith("'["))).toBe(true)
    expect(b.request({ action: 'load' }).data.customers[0].name).toBe(data.customers[0].name)
  })
  it('returns warning after projection failure without losing the committed snapshot', () => {
    const b = backend(), data = createSeedData()
    b.failReports()
    expect(b.request({ action: 'save', expectedRevision: 0, data })).toMatchObject({ ok: true, revision: 1, warning: expect.any(String) })
    expect(b.request({ action: 'load' })).toMatchObject({ ok: true, revision: 1, data })
  })
  it('reports busy locks and rejects oversized UTF-8 snapshots', () => {
    const b = backend()
    b.setBusy(true)
    expect(b.request({ action: 'load' })).toMatchObject({ ok: false, code: 'BUSY' })
    b.setBusy(false)
    const data = createSeedData()
    data.customers = Array.from({ length: 100 }, (_, index) => ({ ...data.customers[0], id: `c${index}`, address: 'ệ'.repeat(9000) }))
    data.orders = []
    expect(b.request({ action: 'save', expectedRevision: 0, data })).toMatchObject({ ok: false, code: 'LIMIT' })
    expect(b.properties.has('QLCT_COMMIT')).toBe(false)
  })
})
