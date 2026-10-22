import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { createSeedData } from '../src/seed'

const endpoint = 'https://script.google.com/macros/s/test-deployment/exec'
const master = 'qa-legacy-private-key-never-publish-1234567890'
const username = 'quanly'
const password = 'qa-private-password-12345'
const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/test-sheet/edit'
const DATA = 'xuong-viet.company.data.v1'
const SESSION = 'xuong-viet.company.session.v1'
type Body = { action: string; token?: string; username?: string; password?: string; expectedRevision?: number; data?: any }
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), DATA)

function server() {
  const data = createSeedData()
  data.customers[0].name = 'Khách công ty riêng QA'
  data.payroll.employees[0].name = 'Nhân viên công ty riêng QA'
  const state = { data, revision: 7, expire: false, offline: false }
  const requests: Body[] = []
  const tokens = new Set<string>()
  const respond = (body: Body): object | 'offline' => {
    requests.push(structuredClone(body))
    if (state.offline) return 'offline'
    if (body.action === 'login' || body.action === 'exchange') {
      if (body.action === 'login' && (body.username !== username || body.password !== password) || body.action === 'exchange' && body.token !== master) return { ok: false, code: 'AUTH_FAILED' }
      const token = `qlct1.session_${tokens.size}.` + 'a'.repeat(64)
      tokens.add(token)
      state.expire = false
      return { ok: true, token, expiresAt: Date.now() + 30 * 86400000, username }
    }
    if (!tokens.has(body.token ?? '')) return { ok: false, code: 'UNAUTHORIZED' }
    if (state.expire) return { ok: false, code: 'SESSION_EXPIRED' }
    if (body.action === 'load') return { ok: true, data: state.data, revision: state.revision, spreadsheetUrl }
    if (body.action === 'save') {
      if (body.expectedRevision !== state.revision) return { ok: false, code: 'CONFLICT' }
      state.data = structuredClone(body.data)
      return { ok: true, revision: ++state.revision, spreadsheetUrl }
    }
    return { ok: false, code: 'INVALID_DATA' }
  }
  async function install(context: BrowserContext, intercept?: (body: Body) => Promise<void>) {
    await context.route(endpoint, async route => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers()['content-type']).toContain('text/plain')
      expect(request.url()).not.toContain(password)
      expect(request.url()).not.toContain(master)
      const body = request.postDataJSON() as Body
      await intercept?.(body)
      const response = respond(body)
      if (response === 'offline') return route.abort('failed')
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(response) })
    })
  }
  return { state, requests, install }
}

async function login(page: Page) {
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toHaveCount(0)
}
async function ready(page: Page) {
  await expect.poll(async () => (await stored(page))?.customers[0]?.name).toBe('Khách công ty riêng QA')
}
async function addCustomer(page: Page, name: string) {
  await page.evaluate(() => { location.hash = '#customers' })
  await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Tên công ty / khách hàng *').fill(name)
  await dialog.getByLabel('Người liên hệ *').fill('Nhân viên QA')
  await dialog.getByLabel('Điện thoại *').fill('0900000000')
  await dialog.getByRole('button', { name: 'Lưu khách hàng', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

test('fresh browsers show login only; independent devices share company data without Sheet setup', async ({ page, context, browser }, testInfo) => {
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#payroll')
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toBeVisible()
  await expect(page.getByText('Nhân viên công ty riêng QA', { exact: true })).toHaveCount(0)
  expect(cloud.requests).toHaveLength(0)
  expect(await stored(page)).toBeNull()
  await page.screenshot({ path: testInfo.outputPath('company-login.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await login(page)
  await ready(page)
  await expect(page.getByText('Nhân viên công ty riêng QA', { exact: true })).toBeVisible()
  await page.evaluate(() => { location.hash = '#settings' })
  await expect(page.getByLabel('URL ứng dụng Apps Script', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Khóa kết nối', { exact: true })).toHaveCount(0)
  await addCustomer(page, 'Khách đồng bộ giữa thiết bị QA')
  await expect.poll(() => cloud.state.data.customers.some(row => row.name === 'Khách đồng bộ giữa thiết bị QA'), { timeout: 10000 }).toBe(true)
  const otherContext = await browser.newContext({ viewport: testInfo.project.use.viewport })
  try {
    await cloud.install(otherContext)
    const other = await otherContext.newPage()
    await other.goto('http://127.0.0.1:4175/#customers')
    await login(other)
    await expect(other.getByText('Khách đồng bộ giữa thiết bị QA', { exact: true })).toBeVisible()
    expect(await stored(other)).toEqual(cloud.state.data)
    const logins = cloud.requests.filter(body => body.action === 'login').length
    await other.reload()
    await expect(other.getByText('Khách đồng bộ giữa thiết bị QA', { exact: true })).toBeVisible()
    expect(cloud.requests.filter(body => body.action === 'login')).toHaveLength(logins)
  } finally { await otherContext.close() }
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(storage).not.toContain(password)
  expect(storage).not.toContain(master)
})

test('bad login never exposes cached company records or makes data requests', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  await context.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: DATA, data: cloud.state.data })
  await page.goto('/#customers')
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('incorrect-password-123')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.locator('.company-message')).toContainText('không đúng')
  await expect(page.getByText('Khách công ty riêng QA', { exact: true })).toHaveCount(0)
  expect(cloud.requests.map(body => body.action)).toEqual(['login'])
  expect(await page.evaluate(key => localStorage.getItem(key), SESSION)).toBeNull()
})

test('legacy trusted device migrates automatically and removes the installation key', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  const baseline = createHash('sha256').update(JSON.stringify(cloud.state.data)).digest('hex')
  await context.addInitScript(({ data, master, endpoint, baseline }) => {
    if (localStorage.getItem('qa-seeded')) return
    localStorage.setItem('qa-seeded', 'true')
    localStorage.setItem('xuong-viet.data.v1', JSON.stringify(data))
    localStorage.setItem('xuong-viet.sheets.sync.v1', JSON.stringify({ config: { endpoint, token: master }, baseline, revision: 7, pending: null }))
  }, { data: cloud.state.data, master, endpoint, baseline })
  await page.goto('/#customers')
  await ready(page)
  await expect(page.getByText('Khách công ty riêng QA', { exact: true })).toBeVisible()
  const exchanges = cloud.requests.filter(body => body.action === 'exchange').length
  expect(exchanges).toBeGreaterThan(0)
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(master)
  const loads = cloud.requests.filter(body => body.action === 'load').length
  await page.reload()
  await expect.poll(() => cloud.requests.filter(body => body.action === 'load').length).toBeGreaterThan(loads)
  expect(cloud.requests.filter(body => body.action === 'exchange')).toHaveLength(exchanges)
})

test('expired session returns to login and reauthentication preserves unsaved edits', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#customers')
  await login(page)
  await ready(page)
  cloud.state.expire = true
  await addCustomer(page, 'Khách cần giữ khi hết phiên QA')
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Khách công ty riêng QA', { exact: true })).toHaveCount(0)
  await login(page)
  await expect.poll(() => cloud.state.data.customers.some(row => row.name === 'Khách cần giữ khi hết phiên QA'), { timeout: 10000 }).toBe(true)
  expect(cloud.requests.filter(body => body.action === 'save').at(-1)?.expectedRevision).toBe(7)
})

test('logout clears company data and credentials and locks other tabs', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#settings')
  await login(page)
  await ready(page)
  const other = await context.newPage()
  await other.goto('/#customers')
  await expect(other.getByText('Khách công ty riêng QA', { exact: true })).toBeVisible()
  page.on('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Đăng xuất khỏi thiết bị', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible()
  await expect(other.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible()
  expect(await stored(page)).toBeNull()
  expect(await page.evaluate(key => localStorage.getItem(key), SESSION)).toBeNull()
  await other.close()
})

test('logout backs up pending edits and a late save response cannot restore the cleared cache', async ({ page, context }) => {
  const cloud = server()
  let saveStarted = false
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  await cloud.install(context, async body => {
    if (body.action === 'save') { saveStarted = true; await gate }
  })
  await page.goto('/#customers')
  await login(page)
  await ready(page)
  await addCustomer(page, 'Khách chờ lưu khi đăng xuất QA')
  await expect.poll(() => saveStarted, { timeout: 10000 }).toBe(true)
  await page.evaluate(() => { location.hash = '#settings' })
  page.on('dialog', dialog => dialog.accept())
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Đăng xuất khỏi thiết bị', exact: true }).click()
  await download
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible()
  finish()
  await expect.poll(() => cloud.state.revision).toBe(8)
  expect(await stored(page)).toBeNull()
  expect(await page.evaluate(key => localStorage.getItem(key), 'xuong-viet.company.sync.v1')).toBeNull()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible()
  expect(await stored(page)).toBeNull()
})

test('offline pending edits survive reload behind login and synchronize once service returns', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#customers')
  await login(page)
  await ready(page)
  cloud.state.offline = true
  await addCustomer(page, 'Khách mất mạng cần giữ QA')
  await expect.poll(() => cloud.requests.filter(body => body.action === 'save').length, { timeout: 10000 }).toBeGreaterThan(0)
  const pending = await stored(page)
  page.on('dialog', dialog => dialog.accept())
  await page.reload()
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible()
  expect(await stored(page)).toEqual(pending)
  cloud.state.offline = false
  await page.getByRole('button', { name: 'Thử kết nối lại', exact: true }).click()
  await expect.poll(() => cloud.state.data.customers.some(row => row.name === 'Khách mất mạng cần giữ QA'), { timeout: 10000 }).toBe(true)
})

test('another company cache is never exposed or uploaded after successful login', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  const other = structuredClone(cloud.state.data)
  other.customers[0].name = 'Dữ liệu riêng công ty khác QA'
  await context.addInitScript(({ key, data }) => {
    localStorage.setItem(key, JSON.stringify(data))
    localStorage.setItem('xuong-viet.company.owner.v1', JSON.stringify({ endpoint: 'https://script.google.com/macros/s/other-company/exec', username: 'someoneelse' }))
  }, { key: DATA, data: other })
  await page.goto('/#customers')
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.locator('.company-message')).toContainText(/khác|riêng tư/)
  await expect(page.getByText('Dữ liệu riêng công ty khác QA', { exact: true })).toHaveCount(0)
  expect(cloud.requests.filter(body => body.action === 'save')).toHaveLength(0)
  expect(await stored(page)).toEqual(other)
})
