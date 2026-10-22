import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const endpoint = 'https://script.google.com/macros/s/test-deployment/exec'
const secret = 'qa-private-key-that-must-stay-in-memory-1234567890'
const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/test-sheet/edit'
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('xuong-viet.data.v1') || 'null'))
type RequestBody = { action: 'load' | 'save'; token: string; expectedRevision?: number; data?: any }

async function localBackup(page: Page) {
  await page.goto('/#settings')
  const promise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Sao lưu JSON', exact: true }).click()
  const download = await promise
  return JSON.parse(await readFile((await download.path())!, 'utf8'))
}

async function mockSheets(page: Page, respond: (body: RequestBody) => object | 'network-error' | Promise<object | 'network-error'>) {
  const requests: RequestBody[] = []
  await page.route(endpoint, async route => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    expect(request.headers()['content-type']).toContain('text/plain')
    expect(request.url()).not.toContain(secret)
    const body = request.postDataJSON() as RequestBody
    expect(body.token).toBe(secret)
    requests.push(structuredClone(body))
    const response = await respond(body)
    if (response === 'network-error') return route.abort('failed')
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(response) })
  })
  return requests
}

async function connect(page: Page) {
  await page.getByLabel('URL ứng dụng Apps Script', { exact: true }).fill(endpoint)
  await page.getByLabel('Khóa kết nối', { exact: true }).fill(secret)
  await page.getByRole('button', { name: 'Kết nối Google Sheets', exact: true }).click()
}

test('Google Sheets load/save preserves payroll and keeps connection key private across navigation', async ({ page }, testInfo) => {
  const fixture = await localBackup(page)
  const remote = structuredClone(fixture)
  remote.customers[0].name = 'Khách hàng từ Google Sheets QA'
  remote.payroll.employees[0].name = 'Nhân viên Google Sheets QA'
  let saved: any
  const requests = await mockSheets(page, body => {
    if (body.action === 'load') return { ok: true, revision: 7, data: remote, spreadsheetUrl }
    saved = body.data
    return { ok: true, revision: 8, spreadsheetUrl }
  })
  page.on('dialog', dialog => dialog.accept())
  await connect(page)
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeEnabled()
  expect((await stored(page)).customers[0].name).toBe(remote.customers[0].name)
  expect((await stored(page)).payroll).toEqual(remote.payroll)
  await expect(page.getByLabel('Khóa kết nối', { exact: true })).toHaveAttribute('type', 'password')
  await page.evaluate(() => { location.hash = '#payroll' })
  await page.getByRole('button', { name: 'Sửa Nhân viên Google Sheets QA', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/^Mức lương \(/).fill('30000000')
  await dialog.getByRole('button', { name: 'Lưu nhân viên', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.evaluate(() => { location.hash = '#settings' })
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true }).click()
  await expect.poll(() => requests.filter(body => body.action === 'save').length).toBe(1)
  await expect(page.locator('.sheets-state')).toContainText('Đã lưu lên Sheet · phiên bản 8')
  expect(requests[1].expectedRevision).toBe(7)
  expect(saved.payroll.employees.find((employee: any) => employee.id === remote.payroll.employees[0].id).baseSalary).toBe(30000000)
  expect(saved.payroll.periods).toEqual(remote.payroll.periods)
  expect(saved.orders).toEqual(remote.orders)
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }))).not.toContain(secret)
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 6000 })
  await page.screenshot({ path: testInfo.outputPath('sheets-connected-light.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Chuyển chế độ tối', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('sheets-connected-dark.png'), fullPage: true, animations: 'disabled' })
  await page.reload()
  await expect(page.getByLabel('URL ứng dụng Apps Script', { exact: true })).toHaveValue(endpoint)
  await expect(page.getByLabel('Khóa kết nối', { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Kết nối Google Sheets', exact: true })).toBeEnabled()
})

test('an empty Sheet requires explicit initialization and sends the complete local snapshot', async ({ page }) => {
  const fixture = await localBackup(page)
  const requests = await mockSheets(page, body => body.action === 'load'
    ? { ok: true, revision: 0, data: null, spreadsheetUrl }
    : { ok: true, revision: 1, spreadsheetUrl })
  page.on('dialog', dialog => dialog.accept())
  await connect(page)
  const initialize = page.getByRole('button', { name: 'Khởi tạo Sheet', exact: true })
  await expect(initialize).toBeEnabled()
  expect(requests.filter(body => body.action === 'save')).toHaveLength(0)
  await initialize.click()
  await expect.poll(() => requests.filter(body => body.action === 'save').length).toBe(1)
  expect(requests[1]).toMatchObject({ action: 'save', expectedRevision: 0, data: fixture })
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeEnabled()
})

test('a revision conflict keeps local work and blocks another save until a fresh load', async ({ page }) => {
  const fixture = await localBackup(page)
  let loadCount = 0
  let saveCount = 0
  const newer = structuredClone(fixture)
  newer.customers[0].name = 'Dữ liệu mới hơn từ thiết bị khác QA'
  const requests = await mockSheets(page, body => {
    if (body.action === 'load') return { ok: true, revision: ++loadCount === 1 ? 4 : 5, data: loadCount === 1 ? fixture : newer, spreadsheetUrl }
    if (++saveCount === 1) return { ok: false, code: 'CONFLICT', message: 'Another device saved newer data.' }
    return { ok: true, revision: 6, spreadsheetUrl }
  })
  page.on('dialog', dialog => dialog.accept())
  await connect(page)
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeEnabled()
  const before = await stored(page)
  await page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeDisabled()
  expect(await stored(page)).toEqual(before)
  expect(requests.filter(body => body.action === 'save')).toHaveLength(1)
  await page.getByRole('button', { name: 'Tải từ Google Sheets', exact: true }).click()
  await expect.poll(async () => (await stored(page)).customers[0].name).toBe(newer.customers[0].name)
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true }).click()
  await expect.poll(() => requests.filter(body => body.action === 'save').length).toBe(2)
  expect(requests.filter(body => body.action === 'save')[1].expectedRevision).toBe(5)
})

test('an uncertain network save preserves local data and requires reload before retry', async ({ page }) => {
  const fixture = await localBackup(page)
  let loadCount = 0
  const requests = await mockSheets(page, body => body.action === 'load'
    ? { ok: true, revision: ++loadCount === 1 ? 2 : 3, data: fixture, spreadsheetUrl }
    : 'network-error')
  page.on('dialog', dialog => dialog.accept())
  await connect(page)
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeEnabled()
  const before = await stored(page)
  await page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeDisabled()
  expect(await stored(page)).toEqual(before)
  expect(requests.filter(body => body.action === 'save')).toHaveLength(1)
  await page.getByRole('button', { name: 'Tải từ Google Sheets', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeEnabled()
  expect(loadCount).toBe(2)
  await page.getByRole('button', { name: 'Ngắt kết nối', exact: true }).click()
  await expect(page.getByLabel('Khóa kết nối', { exact: true })).toHaveValue('')
})

test('cancelled or stale loads cannot replace local work or authorize a save', async ({ page }) => {
  const fixture = await localBackup(page)
  const remote = structuredClone(fixture)
  remote.customers[0].name = 'Bản từ Sheet chưa được chấp nhận QA'
  let finishLoad!: (response: object) => void
  const delayed = new Promise<object>(resolve => { finishLoad = resolve })
  let loadCount = 0
  const requests = await mockSheets(page, () => ++loadCount === 1
    ? { ok: true, revision: 9, data: remote, spreadsheetUrl }
    : delayed)
  const before = await stored(page)
  page.once('dialog', dialog => dialog.dismiss())
  await connect(page)
  await expect(page.locator('.sheets-state')).toContainText('Đã hủy')
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeDisabled()
  expect(await stored(page)).toEqual(before)
  await page.getByRole('button', { name: 'Tải từ Google Sheets', exact: true }).click()
  await expect.poll(() => requests.length).toBe(2)
  await page.evaluate(() => { location.hash = '#customers' })
  await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Tên công ty / khách hàng *').fill('Khách được thêm khi đang tải Sheet QA')
  await dialog.getByLabel('Người liên hệ *').fill('Nhân viên QA')
  await dialog.getByLabel('Điện thoại *').fill('0900000000')
  await dialog.getByRole('button', { name: 'Lưu khách hàng', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.evaluate(() => { location.hash = '#settings' })
  finishLoad({ ok: true, revision: 9, data: remote, spreadsheetUrl })
  await expect(page.locator('.sheets-state')).toContainText('Dữ liệu trên máy đã đổi trong lúc tải')
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeDisabled()
  expect((await stored(page)).customers.some((row: any) => row.name === 'Khách được thêm khi đang tải Sheet QA')).toBe(true)
  expect((await stored(page)).customers[0].name).not.toBe(remote.customers[0].name)
})

test('a stale local tab cannot upload over another tab saved work', async ({ page, context }) => {
  const fixture = await localBackup(page)
  const requests = await mockSheets(page, body => body.action === 'load'
    ? { ok: true, revision: 3, data: fixture, spreadsheetUrl }
    : { ok: true, revision: 4, spreadsheetUrl })
  page.on('dialog', dialog => dialog.accept())
  await connect(page)
  await expect(page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true })).toBeEnabled()
  const second = await context.newPage()
  await second.goto('/#customers')
  await second.getByRole('button', { name: 'Thêm khách hàng', exact: true }).click()
  const dialog = second.getByRole('dialog')
  await dialog.getByLabel('Tên công ty / khách hàng *').fill('Khách mới từ tab thứ hai QA')
  await dialog.getByLabel('Người liên hệ *').fill('Nhân viên QA')
  await dialog.getByLabel('Điện thoại *').fill('0900000000')
  await dialog.getByRole('button', { name: 'Lưu khách hàng', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Lưu lên Google Sheets', exact: true }).click()
  await expect(page.locator('.sheets-state')).toContainText('Chưa thể lưu')
  expect(requests.filter(request => request.action === 'save')).toHaveLength(0)
  expect((await stored(page)).customers.some((customer: any) => customer.name === 'Khách mới từ tab thứ hai QA')).toBe(true)
  await second.close()
})
