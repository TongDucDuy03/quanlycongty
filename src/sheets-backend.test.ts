import { readFileSync } from 'node:fs'
import { createHash, createHmac, pbkdf2Sync, randomUUID } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { createSeedData } from './seed'
import { validateData, type Data } from './domain'
import { ensureCommerce, getWebsiteSettings, issueDocument, voidDocument } from './commerce'

const source = readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8')

function backend() {
  const properties = new Map<string, string>()
  const sheets = new Map<string, Sheet>()
  let held = false
  let busy = false
  let failWrites = false
  let failReports = false
  let lockCount = 0
  let now = Date.now()
  let onLock: (() => void) | undefined
  let privateReads = 0
  let failPublicWrites = false
  let failMediaWrites = false
  let failMediaRegistry = false
  class Sheet {
    values = new Map<string, unknown>()
    rows = 1000
    cols = 26
    constructor(public name: string) {}
    getRange(row: number, col: number, rows = 1, cols = 1) {
      return {
        getValue: () => this.values.get(`${row},${col}`) ?? '',
        setValue: (value: unknown) => { this.values.set(`${row},${col}`, value) },
        getValues: () => { if (/_[AB]$/.test(this.name)) privateReads++; return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => this.values.get(`${row + r},${col + c}`) ?? '')) },
        setValues: (values: unknown[][]) => {
          if (failWrites && /_[AB]$/.test(this.name)) throw new Error('Simulated write failure')
          if (failPublicWrites && /_P[AB]$/.test(this.name)) throw new Error('Simulated public write failure')
          if (failMediaWrites && /_MEDIA$/.test(this.name)) throw new Error('Simulated image write failure')
          if (failMediaRegistry && /_M[AB]$/.test(this.name)) throw new Error('Simulated image registry failure')
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
    Date: class extends Date { static now() { return now } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => properties.get(key) ?? null, setProperty: (key: string, value: string) => properties.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { if (busy) throw new Error('busy'); held = true; lockCount++ }, tryLock: () => { if (busy) return false; const callback = onLock; onLock = undefined; callback?.(); held = true; lockCount++; return true }, hasLock: () => held, releaseLock: () => { held = false } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet, flush: () => {} },
    Utilities: {
      getUuid: randomUUID,
      Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
      base64Encode: (value: string | number[]) => {
        // Apps Script Byte[] uses signed Java bytes, unlike Uint8Array.
        if (Array.isArray(value) && value.some(byte => !Number.isInteger(byte) || byte < -128 || byte > 127)) throw new Error('Unsigned byte passed to Apps Script encoder')
        return Buffer.from(typeof value === 'string' ? value : Uint8Array.from(value)).toString('base64')
      },
      base64Decode: (value: string) => [...Buffer.from(value, 'base64')].map(byte => byte > 127 ? byte - 256 : byte),
      computeDigest: (_algorithm: string, value: string) => [...createHash('sha256').update(value).digest()].map(byte => byte > 127 ? byte - 256 : byte),
      newBlob: (value: string | number[]) => {
        const buffer = Buffer.from(typeof value === 'string' ? value : Uint8Array.from(value))
        return { getBytes: () => [...buffer], getDataAsString: () => buffer.toString('utf8') }
      },
    },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (value: string) => ({ setMimeType: () => value }) },
    console: { log: () => {} },
    setup: undefined as unknown as () => void,
    doPost: undefined as unknown as (event: unknown) => string,
    doGet: undefined as unknown as (event: unknown) => string,
  }
  runInNewContext(source, context)
  context.setup()
  const request = (body: Record<string, unknown>) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ token: properties.get('QLCT_TOKEN'), ...body }) } }))
  return { request, get: (action?: string, id?: string) => JSON.parse(context.doGet({ parameter: { action, id } })), privateReads: () => privateReads, failPublicWrites: () => { failPublicWrites = true }, failMediaWrites: () => { failMediaWrites = true }, failMediaRegistry: (value: boolean) => { failMediaRegistry = value }, properties, sheets, spreadsheet, context, onNextLock: (callback: () => void) => { onLock = callback }, advanceTime: (ms: number) => { now += ms }, setBusy: (v: boolean) => { busy = v }, failWrites: () => { failWrites = true }, failReports: () => { failReports = true }, locks: () => lockCount, held: () => held }
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

describe('manager account and signed sessions (mocked Apps Script V8 without TextEncoder)', () => {
  const credentials = { username: 'admin', password: 'Test-only-safe-password-9384' }
  const configured = () => {
    const b = backend()
    const session = b.request({ action: 'configureLogin', ...credentials })
    expect(session.ok).toBe(true)
    return { ...b, session }
  }
  it('requires master for initial setup and does not disclose data when login is not configured', () => {
    const b = backend()
    expect(b.request({ action: 'configureLogin', token: '', ...credentials })).toMatchObject({ ok: false, code: 'AUTH_FAILED' })
    expect(b.request({ action: 'login', ...credentials })).toMatchObject({ ok: false, code: 'LOGIN_NOT_CONFIGURED' })
    expect(b.request({ action: 'exchange' })).toMatchObject({ ok: false, code: 'LOGIN_NOT_CONFIGURED' })
    expect(b.properties.has('QLCT_LOGIN')).toBe(false)
  })
  it('stores standard salted PBKDF2-SHA256 at 600k rounds and never stores/returns password or master', () => {
    const b = configured()
    const account = JSON.parse(b.properties.get('QLCT_LOGIN')!)
    expect(account.hash).toBe(pbkdf2Sync(credentials.password, account.salt, 600000, 32, 'sha256').toString('hex'))
    expect(JSON.stringify(account)).not.toContain(credentials.password)
    expect(JSON.stringify(b.session)).not.toContain(b.properties.get('QLCT_TOKEN'))
    const [prefix, payload, signature] = b.session.token.split('.')
    expect(prefix).toBe('qlct1')
    expect(signature).toBe(createHmac('sha256', b.properties.get('QLCT_TOKEN')!).update('QLCT session v1:' + payload).digest('hex'))
    expect(b.session.token.length).toBeLessThanOrEqual(256)
    expect(b.request({ action: 'configureLogin', ...credentials })).toMatchObject({ ok: false, code: 'LOGIN_ALREADY_CONFIGURED' })
  }, 20000)
  it('logs in on another device, accepts signed sessions, exchanges legacy master and preserves CAS', () => {
    const b = configured(), data = createSeedData()
    const login = b.request({ action: 'login', token: '', ...credentials })
    expect(login).toMatchObject({ ok: true, username: credentials.username, expiresAt: expect.any(Number) })
    expect(login.token).not.toBe(b.session.token)
    expect(b.request({ action: 'save', token: login.token, expectedRevision: 0, data })).toMatchObject({ ok: true, revision: 1 })
    expect(b.request({ action: 'load', token: b.session.token })).toMatchObject({ ok: true, data, revision: 1 })
    expect(b.request({ action: 'save', token: b.session.token, expectedRevision: 0, data })).toMatchObject({ ok: false, code: 'CONFLICT' })
    expect(b.request({ action: 'exchange' })).toMatchObject({ ok: true, username: credentials.username })
    expect(b.request({ action: 'exchange', token: login.token })).toMatchObject({ ok: false, code: 'AUTH_FAILED' })
    expect(b.request({ action: 'load' })).toMatchObject({ ok: true, revision: 1 })
  }, 20000)
  it('rejects forged signatures, expired sessions, changed auth version and changed master without disclosing data', () => {
    const b = configured()
    const token = b.session.token
    const forged = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    expect(b.request({ action: 'load', token: forged })).toMatchObject({ ok: false, code: 'AUTH_FAILED' })
    const account = JSON.parse(b.properties.get('QLCT_LOGIN')!)
    b.properties.set('QLCT_LOGIN', JSON.stringify({ ...account, version: 'a'.repeat(16) }))
    expect(b.request({ action: 'load', token })).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' })
    b.properties.set('QLCT_LOGIN', JSON.stringify(account))
    b.advanceTime(30 * 24 * 60 * 60 * 1000)
    expect(b.request({ action: 'load', token })).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' })
    b.properties.set('QLCT_TOKEN', 'b'.repeat(96))
    expect(b.request({ action: 'load', token })).toMatchObject({ ok: false, code: 'AUTH_FAILED' })
    expect(b.held()).toBe(false)
  }, 20000)
  it('counts wrong and bogus-user attempts together, blocks valid credentials during cooldown, then permits login', () => {
    const b = configured()
    for (let index = 0; index < 5; index++) {
      expect(b.request({ action: 'login', username: index % 2 ? 'admin' : 'bogus', password: 'bad' })).toMatchObject({ ok: false, code: 'AUTH_FAILED' })
    }
    expect(b.request({ action: 'login', ...credentials })).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(b.held()).toBe(false)
    b.advanceTime(15 * 60 * 1000)
    expect(b.request({ action: 'login', ...credentials })).toMatchObject({ ok: true })
    expect(JSON.parse(b.properties.get('QLCT_LOGIN_ATTEMPTS')!).count).toBe(0)
  }, 20000)
  it('rejects a full-length wrong password and a correct password for another username', () => {
    const b = configured()
    expect(b.request({ action: 'login', ...credentials, password: 'Wrong-password-938492' })).toMatchObject({ ok: false, code: 'AUTH_FAILED' })
    expect(b.request({ action: 'login', ...credentials, username: 'other-manager' })).toMatchObject({ ok: false, code: 'AUTH_FAILED' })
    expect(b.properties.has('QLCT_COMMIT')).toBe(false)
    expect(JSON.parse(b.properties.get('QLCT_LOGIN_ATTEMPTS')!).count).toBe(2)
  }, 20000)
  it('validates account inputs, preserves existing snapshot and bounds maximum-length username sessions', () => {
    const b = backend()
    expect(b.request({ action: 'configureLogin', ...credentials, password: 'short' })).toMatchObject({ ok: false, code: 'INVALID_DATA' })
    expect(b.request({ action: 'configureLogin', ...credentials, username: '../no' })).toMatchObject({ ok: false, code: 'INVALID_DATA' })
    const data = createSeedData()
    b.request({ action: 'save', expectedRevision: 0, data })
    const session = b.request({ action: 'configureLogin', ...credentials, username: 'a'.repeat(32) })
    expect(session.ok).toBe(true)
    expect(session.token.length).toBeLessThanOrEqual(256)
    expect(b.request({ action: 'load', token: session.token })).toMatchObject({ ok: true, data, revision: 1 })
  }, 20000)
  it('changes password without changing business data; revokes every old session and requires the new password', () => {
    const b = configured(), data = createSeedData()
    const second = b.request({ action: 'exchange' })
    b.request({ action: 'save', token: b.session.token, expectedRevision: 0, data })
    const previous = JSON.parse(b.properties.get('QLCT_LOGIN')!)
    const commit = b.properties.get('QLCT_COMMIT')
    const newPassword = 'New-test-only-password-9435'
    const result = b.request({ action: 'changePassword', token: b.session.token, currentPassword: credentials.password, newPassword })
    expect(result).toEqual({ ok: true })
    const account = JSON.parse(b.properties.get('QLCT_LOGIN')!)
    expect(account.username).toBe(credentials.username)
    expect(account.salt).not.toBe(previous.salt)
    expect(account.version).not.toBe(previous.version)
    expect(account.hash).toBe(pbkdf2Sync(newPassword, account.salt, 600000, 32, 'sha256').toString('hex'))
    expect(b.properties.get('QLCT_COMMIT')).toBe(commit)
    for (const token of [b.session.token, second.token]) {
      expect(b.request({ action: 'load', token })).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' })
      expect(b.request({ action: 'save', token, expectedRevision: 1, data })).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' })
    }
    expect(b.request({ action: 'login', ...credentials })).toMatchObject({ ok: false, code: 'AUTH_FAILED' })
    const login = b.request({ action: 'login', ...credentials, password: newPassword })
    expect(login.ok).toBe(true)
    expect(b.request({ action: 'load', token: login.token })).toMatchObject({ ok: true, data, revision: 1 })
  }, 30000)
  it('rejects password changes without a current signed session, including with the installation master', () => {
    const b = configured()
    const original = b.properties.get('QLCT_LOGIN')
    const body = { action: 'changePassword', currentPassword: credentials.password, newPassword: 'New-test-only-password-9435' }
    expect(b.request(body)).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    expect(b.request({ ...body, token: '' })).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    const forged = b.session.token.slice(0, -1) + (b.session.token.endsWith('a') ? 'b' : 'a')
    expect(b.request({ ...body, token: forged })).toMatchObject({ ok: false, code: 'AUTH_FAILED' })
    b.advanceTime(30 * 24 * 60 * 60 * 1000)
    expect(b.request({ ...body, token: b.session.token })).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' })
    expect(b.properties.get('QLCT_LOGIN')).toBe(original)
  }, 20000)
  it('rejects invalid new passwords and wrong current password while leaving the current session usable', () => {
    const b = configured()
    const original = b.properties.get('QLCT_LOGIN')
    const body = { action: 'changePassword', token: b.session.token, currentPassword: credentials.password }
    for (const newPassword of [null, 'short', 'x'.repeat(129), credentials.password]) {
      expect(b.request({ ...body, newPassword })).toMatchObject({ ok: false, code: 'INVALID_DATA' })
    }
    expect(b.request({ ...body, currentPassword: 'Wrong-password-9435', newPassword: 'New-test-only-password-9435' })).toMatchObject({ ok: false, code: 'CURRENT_PASSWORD_INVALID' })
    expect(b.properties.get('QLCT_LOGIN')).toBe(original)
    expect(b.request({ action: 'load', token: b.session.token })).toMatchObject({ ok: true, revision: 0 })
    expect(JSON.parse(b.properties.get('QLCT_LOGIN_ATTEMPTS')!).count).toBe(1)
    expect(b.held()).toBe(false)
  }, 20000)
  it('shares password-change attempts with login throttling and does not rotate a rate-limited account', () => {
    const b = configured()
    const original = b.properties.get('QLCT_LOGIN')
    for (let index = 0; index < 4; index++) b.request({ action: 'login', ...credentials, password: 'bad' })
    const body = { action: 'changePassword', token: b.session.token, newPassword: 'New-test-only-password-9435' }
    expect(b.request({ ...body, currentPassword: 'bad' })).toMatchObject({ ok: false, code: 'CURRENT_PASSWORD_INVALID' })
    expect(b.request({ ...body, currentPassword: credentials.password })).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(b.request({ action: 'login', ...credentials })).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(b.properties.get('QLCT_LOGIN')).toBe(original)
  }, 20000)
  it.each(['load', 'save', 'changePassword'])('rechecks %s session after waiting for the script lock', action => {
    const b = configured(), data = createSeedData()
    b.request({ action: 'save', expectedRevision: 0, data })
    const commit = b.properties.get('QLCT_COMMIT')
    // Simulate a password rotation that completed while this request queued.
    b.onNextLock(() => {
      const account = JSON.parse(b.properties.get('QLCT_LOGIN')!)
      b.properties.set('QLCT_LOGIN', JSON.stringify({ ...account, version: 'f'.repeat(16) }))
    })
    const body = action === 'changePassword'
      ? { currentPassword: credentials.password, newPassword: 'New-test-only-password-9435' }
      : { expectedRevision: 1, data }
    expect(b.request({ action, token: b.session.token, ...body })).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' })
    expect(b.properties.get('QLCT_COMMIT')).toBe(commit)
    expect(b.held()).toBe(false)
  }, 20000)
})

describe('commerce history and separately published public catalog', () => {
  function fixture() {
    const b = backend(), data = ensureCommerce(createSeedData())
    // Existing owner-configured account fixture: no passwords or costly login KDF.
    b.properties.set('QLCT_LOGIN', JSON.stringify({ username: 'admin', salt: 'a'.repeat(32), hash: 'b'.repeat(64), version: 'c'.repeat(16) }))
    const session = b.request({ action: 'exchange' })
    data.commerce!.company.name = 'Private legal company'
    data.commerce!.company.bankAccount = 'PRIVATE-BANK-123'
    data.commerce!.publicProfile.name = 'Published workshop'
    data.commerce!.products = [
      { id: 'p1', name: 'Visible shaft', category: 'CNC', summary: 'Made to order', specification: '', material: 'Steel', unit: 'piece', imageUrl: 'assets/shaft.svg', priceLabel: 'Contact', published: true, featured: true },
      { id: 'p2', name: 'UNPUBLISHED-PRODUCT', category: '', summary: '', specification: '', material: '', unit: '', imageUrl: '', priceLabel: '', published: false, featured: false },
    ]
    return { ...b, data, session }
  }
  it('rejects public private-data actions and returns an empty catalog without reading private buffers', () => {
    const b = fixture()
    b.request({ action: 'save', expectedRevision: 0, data: b.data })
    const reads = b.privateReads()
    expect(b.get()).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    expect(b.get('load')).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    expect(b.get('catalog')).toEqual({ ok: true, catalog: null })
    expect(b.privateReads()).toBe(reads)
    expect(b.request({ action: 'load', token: '' })).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
  })
  it('requires a signed session and current saved revision for publication', () => {
    const b = fixture()
    b.request({ action: 'save', expectedRevision: 0, data: b.data })
    expect(b.request({ action: 'publishCatalog', expectedRevision: 1 })).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    expect(b.request({ action: 'publishCatalog', token: '', expectedRevision: 1 })).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    expect(b.request({ action: 'publishCatalog', token: b.session.token, expectedRevision: 0 })).toMatchObject({ ok: false, code: 'CONFLICT' })
    b.onNextLock(() => {
      const account = JSON.parse(b.properties.get('QLCT_LOGIN')!)
      b.properties.set('QLCT_LOGIN', JSON.stringify({ ...account, version: 'f'.repeat(16) }))
    })
    expect(b.request({ action: 'publishCatalog', token: b.session.token, expectedRevision: 1 })).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' })
    expect(b.get('catalog')).toEqual({ ok: true, catalog: null })
  })
  it('publishes only server-allowlisted fields and leaves private revision unchanged', () => {
    const b = fixture()
    Object.assign(b.data.commerce!.publicProfile, { token: 'PRIVATE-TOKEN', payroll: b.data.payroll })
    Object.assign(b.data.commerce!.products[0], { bankAccount: 'PRIVATE-BANK-123', customers: b.data.customers })
    expect(b.request({ action: 'save', expectedRevision: 0, data: b.data })).toMatchObject({ ok: true, revision: 1 })
    const commit = b.properties.get('QLCT_COMMIT')
    expect(b.request({ action: 'publishCatalog', token: b.session.token, expectedRevision: 1, catalog: { token: 'CLIENT-INJECTION' } })).toMatchObject({ ok: true, publishedAt: expect.any(String) })
    expect(b.properties.get('QLCT_COMMIT')).toBe(commit)
    const reads = b.privateReads(), result = b.get('catalog')
    expect(result.ok).toBe(true)
    expect(result.catalog.products).toHaveLength(1)
    expect(result.catalog.profile.name).toBe('Published workshop')
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|UNPUBLISHED|CLIENT-INJECTION|payroll|customers|bankAccount|spreadsheetUrl|revision|orders/)
    expect(b.privateReads()).toBe(reads)
    // Public read remains available even if an unrelated private buffer is corrupt.
    const manifest = JSON.parse(commit!)
    b.sheets.get(`QLCT_${b.properties.get('QLCT_NAMESPACE')}_${manifest.slot}`)!.getRange(2, 1).setValue('bad-private-chunk')
    expect(b.get('catalog')).toEqual(result)
  })
  it('keeps drafts private until explicitly published and preserves last public commit on failed writes', () => {
    const b = fixture()
    b.request({ action: 'save', expectedRevision: 0, data: b.data })
    b.request({ action: 'publishCatalog', token: b.session.token, expectedRevision: 1 })
    const original = b.get('catalog')
    b.data.commerce!.publicProfile.name = 'Draft renamed workshop'
    b.data.commerce!.products[0].published = false
    b.request({ action: 'save', expectedRevision: 1, data: b.data })
    expect(b.get('catalog')).toEqual(original)
    b.failPublicWrites()
    expect(b.request({ action: 'publishCatalog', token: b.session.token, expectedRevision: 2 })).toMatchObject({ ok: false, code: 'INTERNAL' })
    expect(b.get('catalog')).toEqual(original)
    expect(b.request({ action: 'load' })).toMatchObject({ ok: true, revision: 2 })
  })
  it('removes unpublished products on the next successful publication and rejects a private-buffer manifest', () => {
    const b = fixture()
    b.request({ action: 'save', expectedRevision: 0, data: b.data })
    b.request({ action: 'publishCatalog', token: b.session.token, expectedRevision: 1 })
    b.data.commerce!.products[0].published = false
    b.request({ action: 'save', expectedRevision: 1, data: b.data })
    expect(b.get('catalog').catalog.products).toHaveLength(1)
    expect(b.request({ action: 'publishCatalog', token: b.session.token, expectedRevision: 2 })).toMatchObject({ ok: true })
    expect(b.get('catalog').catalog.products).toEqual([])
    const reads = b.privateReads()
    b.properties.set('QLCT_PUBLIC_COMMIT', b.properties.get('QLCT_COMMIT')!)
    expect(b.get('catalog')).toMatchObject({ ok: false, code: 'CONFIG' })
    expect(b.privateReads()).toBe(reads)
  })
  it('rejects oversized publication without replacing the previous public version', () => {
    const b = fixture()
    b.request({ action: 'save', expectedRevision: 0, data: b.data })
    b.request({ action: 'publishCatalog', token: b.session.token, expectedRevision: 1 })
    const original = b.get('catalog')
    b.data.commerce!.products = Array.from({ length: 100 }, (_, index) => ({ ...b.data.commerce!.products[0], id: `p${index}`, specification: 'x'.repeat(3000) }))
    expect(b.request({ action: 'save', expectedRevision: 1, data: b.data })).toMatchObject({ ok: true, revision: 2 })
    expect(b.request({ action: 'publishCatalog', token: b.session.token, expectedRevision: 2 })).toMatchObject({ ok: false, code: 'LIMIT' })
    expect(b.get('catalog')).toEqual(original)
  })
  it('rejects legacy paid substitution and old-client history drops; allows receipt issue and reversal', () => {
    const b = fixture(), legacy = structuredClone(b.data)
    delete legacy.commerce
    b.request({ action: 'save', expectedRevision: 0, data: legacy })
    const falseHistory = structuredClone(b.data)
    falseHistory.commerce!.openingPaid = falseHistory.commerce!.openingPaid.filter(item => item.orderId !== 'o1')
    falseHistory.orders[0].paid = 0
    const fabricated = issueDocument(falseHistory, { kind: 'receipt', orderId: 'o1', date: '2026-10-22', amount: legacy.orders[0].paid })
    expect(b.request({ action: 'save', expectedRevision: 1, data: fabricated })).toMatchObject({ ok: false, code: 'IMMUTABLE_HISTORY' })
    const receipt = issueDocument(b.data, { kind: 'receipt', orderId: 'o1', date: '2026-10-22', amount: 5000 })
    expect(b.request({ action: 'save', expectedRevision: 1, data: receipt })).toMatchObject({ ok: true, revision: 2 })
    expect(b.request({ action: 'save', expectedRevision: 2, data: legacy })).toMatchObject({ ok: false, code: 'IMMUTABLE_HISTORY' })
    const changed = structuredClone(receipt)
    changed.commerce!.documents[0].company.name = 'Tampered snapshot'
    expect(b.request({ action: 'save', expectedRevision: 2, data: changed })).toMatchObject({ ok: false, code: 'IMMUTABLE_HISTORY' })
    const reversed = voidDocument(receipt, receipt.commerce!.documents[0].id, 'Wrong reference')
    expect(b.request({ action: 'save', expectedRevision: 2, data: reversed })).toMatchObject({ ok: true, revision: 3 })
    expect(b.request({ action: 'load' }).data.orders[0].paid).toBe(legacy.orders[0].paid)
    expect(b.request({ action: 'load' }).data.payroll).toEqual(legacy.payroll)
  })
})

describe('bounded private image library and explicitly published images', () => {
  // Generated 2x2 red JPEG fixture. Actual JPEG markers/scan rather than spoofed MIME.
  const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z'
  function fixture() {
    const b = backend(), data = ensureCommerce(createSeedData())
    b.properties.set('QLCT_LOGIN', JSON.stringify({ username: 'admin', salt: 'a'.repeat(32), hash: 'b'.repeat(64), version: 'c'.repeat(16) }))
    const session = b.request({ action: 'exchange' })
    data.commerce!.publicProfile.name = 'Media demo'
    return { ...b, data, token: session.token }
  }
  it('requires signed sessions, canonical JPEG and strict dimensions, names and byte bounds', () => {
    const b = fixture()
    expect(b.request({ action: 'uploadMedia', name: 'photo.jpg', base64: jpeg })).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    for (const base64 of [Buffer.from('<svg onload="evil()"/>').toString('base64'), 'data:image/jpeg;base64,' + jpeg, jpeg + '\n', jpeg.slice(0, -4), Buffer.alloc(165000).toString('base64')]) {
      expect(b.request({ action: 'uploadMedia', token: b.token, name: 'photo.jpg', base64 }).ok).toBe(false)
    }
    const huge = Buffer.from(jpeg, 'base64'), frame = huge.indexOf(Buffer.from([255, 192]))
    huge.writeUInt16BE(1601, frame + 5)
    expect(b.request({ action: 'uploadMedia', token: b.token, name: 'photo.jpg', base64: huge.toString('base64') })).toMatchObject({ ok: false, code: 'INVALID_MEDIA' })
    expect(b.request({ action: 'uploadMedia', token: b.token, name: '\nname', base64: jpeg })).toMatchObject({ ok: false, code: 'INVALID_MEDIA' })
    expect(b.request({ action: 'listMedia', token: b.token })).toMatchObject({ ok: true, media: [], usage: { count: 0 } })
    b.onNextLock(() => b.properties.set('QLCT_LOGIN', JSON.stringify({ username: 'admin', salt: 'a'.repeat(32), hash: 'b'.repeat(64), version: 'd'.repeat(16) })))
    expect(b.request({ action: 'uploadMedia', token: b.token, name: 'photo.jpg', base64: jpeg })).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' })
  })
  it('uploads idempotently, preserves business revision, permits private preview but denies anonymous draft access', () => {
    const b = fixture(), before = b.properties.get('QLCT_COMMIT')
    const upload = b.request({ action: 'uploadMedia', token: b.token, name: 'photo.jpg', base64: jpeg })
    expect(upload).toMatchObject({ ok: true, media: { id: createHash('sha256').update(Buffer.from(jpeg, 'base64')).digest('hex'), mime: 'image/jpeg', name: 'photo.jpg' }, usage: { count: 1, maxCount: 80, maxBytes: 12 * 1024 * 1024 } })
    expect(b.request({ action: 'uploadMedia', token: b.token, name: 'renamed.jpg', base64: jpeg })).toEqual(upload)
    expect(b.properties.get('QLCT_COMMIT')).toBe(before)
    expect(b.request({ action: 'getMedia', token: b.token, id: upload.media.id })).toMatchObject({ ok: true, media: { base64: jpeg } })
    expect(b.get('media', upload.media.id)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(b.request({ action: 'getMedia', token: '', id: upload.media.id })).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
  })
  it('exposes only current published image refs and deletion requires both private and public references removed', () => {
    const b = fixture()
    const upload = b.request({ action: 'uploadMedia', token: b.token, name: 'photo.jpg', base64: jpeg }), id = upload.media.id
    b.data.commerce!.publicProfile.heroImage = 'media:' + id
    b.request({ action: 'save', expectedRevision: 0, data: b.data })
    expect(b.request({ action: 'deleteMedia', token: b.token, id })).toMatchObject({ ok: false, code: 'MEDIA_IN_USE' })
    expect(b.request({ action: 'publishCatalog', token: b.token, expectedRevision: 1 })).toMatchObject({ ok: true })
    const reads = b.privateReads()
    expect(b.get('media', id)).toEqual({ ok: true, media: { id, mime: 'image/jpeg', bytes: Buffer.from(jpeg, 'base64').length, base64: jpeg } })
    expect(b.privateReads()).toBe(reads)
    b.data.commerce!.publicProfile.heroImage = ''
    b.request({ action: 'save', expectedRevision: 1, data: b.data })
    expect(b.request({ action: 'deleteMedia', token: b.token, id })).toMatchObject({ ok: false, code: 'MEDIA_IN_USE' })
    b.request({ action: 'publishCatalog', token: b.token, expectedRevision: 2 })
    expect(b.get('media', id)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(b.request({ action: 'deleteMedia', token: b.token, id })).toMatchObject({ ok: true, usage: { count: 0 } })
    expect(b.request({ action: 'getMedia', token: b.token, id })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })
  it('withdraws disabled section images from public access on republish while keeping private previews', () => {
    const b = fixture(), upload = b.request({ action: 'uploadMedia', token: b.token, name: 'about.jpg', base64: jpeg }), id = upload.media.id
    const settings = getWebsiteSettings(b.data.commerce!.publicProfile)
    b.data.commerce!.publicProfile.site = settings
    settings.aboutImage = { src: 'media:' + id, alt: 'Private about image' }
    settings.aboutText = 'About content'
    b.request({ action: 'save', expectedRevision: 0, data: b.data })
    b.request({ action: 'publishCatalog', token: b.token, expectedRevision: 1 })
    expect(b.get('media', id).ok).toBe(true)
    settings.sections.about = false
    b.request({ action: 'save', expectedRevision: 1, data: b.data })
    expect(b.get('media', id).ok).toBe(true)
    expect(b.request({ action: 'publishCatalog', token: b.token, expectedRevision: 2 }).ok).toBe(true)
    const reads = b.privateReads()
    expect(b.get('media', id)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(b.privateReads()).toBe(reads)
    expect(b.get('catalog').catalog.profile.site.aboutImage).toEqual({ src: '', alt: '' })
    expect(b.request({ action: 'getMedia', token: b.token, id }).ok).toBe(true)
    expect(b.request({ action: 'deleteMedia', token: b.token, id })).toMatchObject({ ok: false, code: 'MEDIA_IN_USE' })
  })
  it('does not expose interrupted uploads; retry recovers safely and missing assets cannot replace public catalog', () => {
    const b = fixture()
    b.failMediaRegistry(true)
    expect(b.request({ action: 'uploadMedia', token: b.token, name: 'photo.jpg', base64: jpeg })).toMatchObject({ ok: false, code: 'INTERNAL' })
    expect(b.request({ action: 'listMedia', token: b.token }).media).toEqual([])
    b.failMediaRegistry(false)
    expect(b.request({ action: 'uploadMedia', token: b.token, name: 'photo.jpg', base64: jpeg })).toMatchObject({ ok: true, usage: { count: 1 } })
    b.request({ action: 'save', expectedRevision: 0, data: b.data })
    b.request({ action: 'publishCatalog', token: b.token, expectedRevision: 1 })
    const published = b.get('catalog')
    b.data.commerce!.publicProfile.heroImage = 'media:' + 'f'.repeat(64)
    b.request({ action: 'save', expectedRevision: 1, data: b.data })
    expect(b.request({ action: 'publishCatalog', token: b.token, expectedRevision: 2 })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(b.get('catalog')).toEqual(published)
  })
  it('enforces the 80-image quota while allowing an idempotent retry at quota', () => {
    const b = fixture(), original = Buffer.from(jpeg, 'base64')
    const variant = (index: number) => Buffer.concat([original.subarray(0, 2), Buffer.from([255, 254, 0, 4, index, 0]), original.subarray(2)]).toString('base64')
    for (let index = 0; index < 80; index++) expect(b.request({ action: 'uploadMedia', token: b.token, name: 'image.jpg', base64: variant(index) })).toMatchObject({ ok: true, usage: { count: index + 1 } })
    expect(b.request({ action: 'uploadMedia', token: b.token, name: 'image.jpg', base64: variant(80) })).toMatchObject({ ok: false, code: 'MEDIA_QUOTA' })
    expect(b.request({ action: 'uploadMedia', token: b.token, name: 'retry.jpg', base64: variant(0) })).toMatchObject({ ok: true, usage: { count: 80 } })
    const list = b.request({ action: 'listMedia', token: b.token })
    expect(list.media).toHaveLength(80)
    expect(list.usage.bytes).toBe(80 * (original.length + 6))
    expect(JSON.stringify(list)).not.toMatch(/base64|"row"|"chunks"/)
  })
  it('stores multi-chunk images, detects tampering and never overwrites committed media on upload failure', () => {
    const b = fixture(), original = Buffer.from(jpeg, 'base64')
    const comment = Buffer.concat([Buffer.from([255, 254, 255, 255]), Buffer.alloc(65533, 42)])
    const large = Buffer.concat([original.subarray(0, 2), comment, original.subarray(2)]).toString('base64')
    const uploaded = b.request({ action: 'uploadMedia', token: b.token, name: 'large.jpg', base64: large })
    expect(uploaded.ok).toBe(true)
    expect(b.request({ action: 'getMedia', token: b.token, id: uploaded.media.id }).media.base64).toBe(large)
    b.failMediaWrites()
    expect(b.request({ action: 'uploadMedia', token: b.token, name: 'other.jpg', base64: jpeg })).toMatchObject({ ok: false, code: 'INTERNAL' })
    expect(b.request({ action: 'listMedia', token: b.token }).media).toHaveLength(1)
    expect(b.request({ action: 'getMedia', token: b.token, id: uploaded.media.id }).media.base64).toBe(large)
    b.sheets.get(`QLCT_${b.properties.get('QLCT_NAMESPACE')}_MEDIA`)!.getRange(2, 1).setValue('b64:' + jpeg)
    expect(b.request({ action: 'getMedia', token: b.token, id: uploaded.media.id }).ok).toBe(false)
  })
  it('enforces total 12 MiB storage before the 80-asset count limit', () => {
    const b = fixture(), original = Buffer.from(jpeg, 'base64')
    const maxSize = 160 * 1024
    const segments: Buffer[] = []
    let padding = maxSize - original.length
    while (padding) {
      const size = Math.min(65537, padding)
      const segment = Buffer.alloc(size, 42)
      segment[0] = 255; segment[1] = 254; segment.writeUInt16BE(size - 2, 2)
      segments.push(segment); padding -= size
    }
    const image = Buffer.concat([original.subarray(0, 2), ...segments, original.subarray(2)])
    for (let index = 0; index < 76; index++) {
      image[6] = index
      expect(b.request({ action: 'uploadMedia', token: b.token, name: 'photo.jpg', base64: image.toString('base64') })).toMatchObject({ ok: true, usage: { count: index + 1, bytes: (index + 1) * maxSize } })
    }
    image[6] = 76
    expect(b.request({ action: 'uploadMedia', token: b.token, name: 'photo.jpg', base64: image.toString('base64') })).toMatchObject({ ok: false, code: 'MEDIA_QUOTA' })
    expect(b.request({ action: 'listMedia', token: b.token }).usage).toEqual({ count: 76, bytes: 76 * maxSize, maxCount: 80, maxBytes: 12 * 1024 * 1024 })
  }, 20000)
})
