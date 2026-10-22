import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const endpoint = 'https://script.google.com/macros/s/test-deployment/exec'
const secret = 'qa-device-private-key-never-export-1234567890'
const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/test-sheet/edit'
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('xuong-viet.data.v1') || 'null'))
type RequestBody = { action: 'load' | 'save'; token: string; expectedRevision?: number; data?: any }

async function backup(page: Page) {
  await page.evaluate(() => { location.hash = '#settings' })
  const promise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Sao lưu JSON', exact: true }).click()
  const download = await promise
  return JSON.parse(await readFile((await download.path())!, 'utf8'))
}

async function fixture(page: Page) {
  await page.goto('/#settings')
  return backup(page)
}

async function mockSheets(context: BrowserContext, respond: (body: RequestBody) => object | 'network-error' | Promise<object | 'network-error'>) {
  const requests: RequestBody[] = []
  await context.route(endpoint, async route => {
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

function server(initial: any, initialRevision = 7) {
  const state = { data: structuredClone(initial), revision: initialRevision, offline: false }
  const respond = (body: RequestBody): object | 'network-error' => {
    if (state.offline) return 'network-error'
    if (body.action === 'load') return { ok: true, ...state, spreadsheetUrl }
    if (body.expectedRevision !== state.revision) return { ok: false, code: 'CONFLICT' }
    state.data = structuredClone(body.data)
    state.revision++
    return { ok: true, revision: state.revision, spreadsheetUrl }
  }
  return { state, respond }
}

async function connect(page: Page, remote?: any) {
  await page.getByLabel('URL ứng dụng Apps Script', { exact: true }).fill(endpoint)
  await page.getByLabel('Khóa kết nối', { exact: true }).fill(secret)
  await page.getByRole('button', { name: 'Kết nối Google Sheets', exact: true }).click()
  const confirm = page.getByRole('button', { name: 'Dùng dữ liệu trên Sheet', exact: true })
  await expect.poll(async () => await confirm.isVisible() || /đã đồng bộ|chưa khởi tạo/.test(await page.locator('.sheets-state').innerText())).toBe(true)
  if (await confirm.isVisible()) await confirm.click()
  if (remote) await expect.poll(() => stored(page)).toEqual(remote)
  await expect(page.getByRole('button', { name: 'Ngắt kết nối', exact: true })).toBeEnabled()
}

async function addCustomer(page: Page, name: string, mayRejectStale = false) {
  await page.evaluate(() => { location.hash = '#customers' })
  await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Tên công ty / khách hàng *').fill(name)
  await dialog.getByLabel('Người liên hệ *').fill('Nhân viên QA')
  await dialog.getByLabel('Điện thoại *').fill('0900000000')
  await dialog.getByRole('button', { name: 'Lưu khách hàng', exact: true }).click()
  if (mayRejectStale && await dialog.count()) {
    await expect(dialog.getByRole('alert')).toContainText(/tab khác|dữ liệu.*đổi/i)
    await dialog.getByRole('button', { name: 'Hủy', exact: true }).click()
    return false
  }
  await expect(dialog).toHaveCount(0)
  return true
}

test('one setup persists on this device, automatically saves payroll away from settings, and reconnects without prompts', async ({ page, context }, testInfo) => {
  const remote = await fixture(page)
  remote.customers[0].name = 'Khách hàng Google Sheets QA'
  remote.payroll.employees[0].name = 'Nhân viên Google Sheets QA'
  const cloud = server(remote)
  const requests = await mockSheets(context, cloud.respond)
  let dialogs = 0
  page.on('dialog', async dialog => { dialogs++; await dialog.accept() })
  await expect(page.getByLabel('Ghi nhớ kết nối trên thiết bị này', { exact: true })).toBeChecked()
  await connect(page, remote)
  await expect(page.getByLabel('Khóa kết nối', { exact: true })).toHaveAttribute('type', 'password')
  await page.evaluate(() => { location.hash = '#payroll' })
  await page.getByRole('button', { name: 'Sửa Nhân viên Google Sheets QA', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/^Mức lương \(/).fill('30000000')
  await dialog.getByRole('button', { name: 'Lưu nhân viên', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => cloud.state.data.payroll.employees.find((employee: any) => employee.id === remote.payroll.employees[0].id).baseSalary, { timeout: 10000 }).toBe(30000000)
  expect(requests.filter(body => body.action === 'save')[0].expectedRevision).toBe(7)
  expect(cloud.state.data.orders).toEqual(remote.orders)
  expect(cloud.state.data.payroll.periods).toEqual(remote.payroll.periods)
  const exported = await backup(page)
  expect(JSON.stringify(exported)).not.toContain(secret)
  expect(page.url()).not.toContain(secret)
  const beforeReload = dialogs
  const loads = requests.filter(body => body.action === 'load').length
  await page.reload()
  await expect.poll(() => requests.filter(body => body.action === 'load').length).toBeGreaterThan(loads)
  await expect(page.getByRole('button', { name: 'Ngắt kết nối', exact: true })).toBeEnabled()
  expect(dialogs).toBe(beforeReload)
  expect((await stored(page)).payroll.employees.find((employee: any) => employee.id === remote.payroll.employees[0].id).baseSalary).toBe(30000000)
  await expect(page.locator('.sheets-state')).toContainText(/đã đồng bộ/i)
  await page.screenshot({ path: testInfo.outputPath('sheets-auto-light.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Chuyển chế độ tối', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('sheets-auto-dark.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Ngắt kết nối', exact: true }).click()
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(secret)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Kết nối Google Sheets', exact: true })).toBeVisible()
  await expect(page.getByLabel('Khóa kết nối', { exact: true })).toHaveValue('')
})

test('an empty Sheet requires one explicit initialization with the complete local snapshot', async ({ page, context }) => {
  const local = await fixture(page)
  const cloud = server(null, 0)
  const requests = await mockSheets(context, cloud.respond)
  page.on('dialog', dialog => dialog.accept())
  await connect(page)
  const initialize = page.getByRole('button', { name: 'Khởi tạo Sheet', exact: true })
  await expect(initialize).toBeEnabled()
  expect(requests.filter(body => body.action === 'save')).toHaveLength(0)
  await initialize.click()
  await page.getByRole('button', { name: 'Bắt đầu tự động lưu', exact: true }).click()
  await expect.poll(() => cloud.state.revision).toBe(1)
  expect(cloud.state.data).toEqual(local)
  await expect(page.locator('.sheets-state')).toContainText(/đã đồng bộ/i)
})

test('edits made while a save is in flight are automatically sent in the following revision', async ({ page, context }) => {
  const remote = await fixture(page)
  const cloud = server(remote)
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  let saves = 0
  const requests = await mockSheets(context, async body => {
    if (body.action === 'save' && ++saves === 1) await gate
    return cloud.respond(body)
  })
  page.on('dialog', dialog => dialog.accept())
  await connect(page, remote)
  await addCustomer(page, 'Khách trước khi gửi QA')
  await expect.poll(() => requests.filter(body => body.action === 'save').length).toBe(1)
  await addCustomer(page, 'Khách thêm khi đang gửi QA')
  finish()
  await expect.poll(() => cloud.state.data.customers.some((row: any) => row.name === 'Khách thêm khi đang gửi QA'), { timeout: 10000 }).toBe(true)
  expect(cloud.state.data.customers.some((row: any) => row.name === 'Khách trước khi gửi QA')).toBe(true)
  expect(requests.filter(body => body.action === 'save').map(body => body.expectedRevision)).toEqual([7, 8])
})

test('unsaved offline work survives a reload and resumes automatically when the network returns', async ({ page, context }) => {
  const remote = await fixture(page)
  const cloud = server(remote)
  const requests = await mockSheets(context, cloud.respond)
  page.on('dialog', dialog => dialog.accept())
  await connect(page, remote)
  cloud.state.offline = true
  await addCustomer(page, 'Khách nhập ngoại tuyến QA')
  await expect.poll(() => requests.filter(body => body.action === 'save').length, { timeout: 10000 }).toBeGreaterThan(0)
  const pending = await stored(page)
  await page.reload()
  expect(await stored(page)).toEqual(pending)
  cloud.state.offline = false
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')) })
  await expect.poll(() => cloud.state.data.customers.some((row: any) => row.name === 'Khách nhập ngoại tuyến QA'), { timeout: 15000 }).toBe(true)
  expect(await stored(page)).toEqual(cloud.state.data)
})

test('a lost save response reconciles an already committed snapshot without losing newer local edits', async ({ page, context }) => {
  const remote = await fixture(page)
  const cloud = server(remote)
  let loseResponse = true
  await mockSheets(context, body => {
    const result = cloud.respond(body)
    if (body.action === 'save' && loseResponse) { loseResponse = false; return 'network-error' }
    return result
  })
  page.on('dialog', dialog => dialog.accept())
  await connect(page, remote)
  await addCustomer(page, 'Khách đã lưu nhưng mất phản hồi QA')
  await expect.poll(() => cloud.state.revision, { timeout: 10000 }).toBe(8)
  await addCustomer(page, 'Khách sau phản hồi thất lạc QA')
  await page.reload()
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')) })
  await expect.poll(() => cloud.state.data.customers.some((row: any) => row.name === 'Khách sau phản hồi thất lạc QA'), { timeout: 15000 }).toBe(true)
  expect(cloud.state.data.customers.some((row: any) => row.name === 'Khách đã lưu nhưng mất phản hồi QA')).toBe(true)
})

test('a concurrent remote revision keeps both copies safe and requires explicit conflict recovery', async ({ page, context }) => {
  const remote = await fixture(page)
  const cloud = server(remote)
  const requests = await mockSheets(context, cloud.respond)
  page.on('dialog', dialog => dialog.accept())
  await connect(page, remote)
  cloud.state.data.customers[0].name = 'Bản mới từ thiết bị khác QA'
  cloud.state.revision++
  const newer = structuredClone(cloud.state.data)
  await addCustomer(page, 'Khách chưa đồng bộ do xung đột QA')
  await expect.poll(() => requests.filter(body => body.action === 'save').length, { timeout: 10000 }).toBe(1)
  await page.evaluate(() => { location.hash = '#settings' })
  await expect(page.locator('.sheets-state')).toContainText(/xung đột|bản mới|thiết bị khác|thay đổi trên cả/i)
  expect(cloud.state.data).toEqual(newer)
  const local = await backup(page)
  expect(local.customers.some((row: any) => row.name === 'Khách chưa đồng bộ do xung đột QA')).toBe(true)
  await page.reload()
  await expect(page.locator('.sheets-state')).toContainText(/xung đột|bản mới|thiết bị khác|thay đổi trên cả/i)
  expect(await stored(page)).toEqual(local)
  expect(cloud.state.data).toEqual(newer)
  await page.getByRole('button', { name: 'Tải từ Google Sheets', exact: true }).click()
  await page.getByRole('button', { name: 'Hủy', exact: true }).click()
  expect(await stored(page)).toEqual(local)
  expect(cloud.state.data).toEqual(newer)
  await page.getByRole('button', { name: 'Tải từ Google Sheets', exact: true }).click()
  await page.getByRole('button', { name: 'Dùng dữ liệu trên Sheet', exact: true }).click()
  await expect.poll(() => stored(page)).toEqual(newer)
  await addCustomer(page, 'Khách sau xử lý xung đột QA')
  await expect.poll(() => cloud.state.data.customers.some((row: any) => row.name === 'Khách sau xử lý xung đột QA'), { timeout: 10000 }).toBe(true)
  expect(requests.filter(body => body.action === 'save').at(-1)?.expectedRevision).toBe(8)
})

test('a clean device automatically receives a newer remote snapshot when it regains focus', async ({ page, context }) => {
  const remote = await fixture(page)
  const cloud = server(remote)
  await mockSheets(context, cloud.respond)
  let dialogs = 0
  page.on('dialog', async dialog => { dialogs++; await dialog.accept() })
  await connect(page, remote)
  const before = dialogs
  cloud.state.data.customers[0].name = 'Đã cập nhật từ điện thoại QA'
  cloud.state.revision++
  await page.evaluate(() => { location.hash = '#customers'; window.dispatchEvent(new Event('focus')) })
  await expect.poll(() => stored(page), { timeout: 10000 }).toEqual(cloud.state.data)
  await expect(page.getByText('Đã cập nhật từ điện thoại QA', { exact: true })).toBeVisible()
  expect(dialogs).toBe(before)
})

test('a stale same-origin tab cannot upload over another tab saved work', async ({ page, context }) => {
  const remote = await fixture(page)
  const cloud = server(remote)
  const requests = await mockSheets(context, cloud.respond)
  page.on('dialog', dialog => dialog.accept())
  await connect(page, remote)
  const second = await context.newPage()
  second.on('dialog', dialog => dialog.accept())
  await second.goto('/#customers')
  await addCustomer(second, 'Khách mới từ tab thứ hai QA')
  await expect.poll(() => cloud.state.data.customers.some((row: any) => row.name === 'Khách mới từ tab thứ hai QA'), { timeout: 10000 }).toBe(true)
  const saveCount = requests.filter(body => body.action === 'save').length
  const accepted = await addCustomer(page, 'Thử sửa từ tab cũ QA', true)
  if (accepted) await expect.poll(() => cloud.state.data.customers.some((row: any) => row.name === 'Thử sửa từ tab cũ QA'), { timeout: 10000 }).toBe(true)
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')) })
  await expect.poll(async () => (await stored(page)).customers.some((row: any) => row.name === 'Khách mới từ tab thứ hai QA')).toBe(true)
  // A stale tab may block or refresh, but cannot publish the old snapshot.
  for (const request of requests.filter(body => body.action === 'save').slice(saveCount)) {
    expect(request.data.customers.some((row: any) => row.name === 'Khách mới từ tab thứ hai QA')).toBe(true)
  }
  expect(cloud.state.data.customers.some((row: any) => row.name === 'Khách mới từ tab thứ hai QA')).toBe(true)
  await second.close()
})

test('remembering the connection can be disabled on a shared device', async ({ page, context }) => {
  const remote = await fixture(page)
  const cloud = server(remote)
  const requests = await mockSheets(context, cloud.respond)
  page.on('dialog', dialog => dialog.accept())
  await page.getByLabel('Ghi nhớ kết nối trên thiết bị này', { exact: true }).uncheck()
  await connect(page, remote)
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(secret)
  const loads = requests.length
  await page.reload()
  await expect(page.getByRole('button', { name: 'Kết nối Google Sheets', exact: true })).toBeVisible()
  await expect(page.getByLabel('Khóa kết nối', { exact: true })).toHaveValue('')
  expect(requests).toHaveLength(loads)
  expect(await stored(page)).toEqual(remote)
})

test('a remote response started before a local edit cannot silently replace that edit', async ({ page, context }) => {
  const remote = await fixture(page)
  const cloud = server(remote)
  let delay = false
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const requests = await mockSheets(context, async body => {
    if (body.action === 'load' && delay) await gate
    return cloud.respond(body)
  })
  page.on('dialog', dialog => dialog.accept())
  await connect(page, remote)
  cloud.state.data.customers[0].name = 'Bản từ điện thoại trong lúc đang tải QA'
  cloud.state.revision++
  delay = true
  const loads = requests.length
  await page.reload()
  await expect.poll(() => requests.length).toBeGreaterThan(loads)
  await addCustomer(page, 'Khách được thêm trong lúc đang tải QA')
  finish()
  await page.evaluate(() => { location.hash = '#settings' })
  await expect(page.locator('.sheets-state')).toContainText(/xung đột|bản mới|thiết bị khác|đã đổi|thay đổi trên cả/i)
  expect((await stored(page)).customers.some((row: any) => row.name === 'Khách được thêm trong lúc đang tải QA')).toBe(true)
  expect(cloud.state.data.customers[0].name).toBe('Bản từ điện thoại trong lúc đang tải QA')
  expect(requests.filter(body => body.action === 'save')).toHaveLength(0)
})

test('a blurred payroll settings draft survives a background refresh until the user saves it', async ({ page, context }) => {
  const remote = await fixture(page)
  const cloud = server(remote)
  const requests = await mockSheets(context, cloud.respond)
  await connect(page, remote)
  await page.evaluate(() => { location.hash = '#payroll' })
  await page.getByRole('tab', { name: 'Cấu hình lương', exact: true }).click()
  const insurance = page.getByLabel(/^Bảo hiểm người lao động/)
  await insurance.fill('17')
  await insurance.blur()
  cloud.state.data.payroll.settings.employeeInsuranceRate = 19
  cloud.state.revision++
  const loads = requests.filter(body => body.action === 'load').length
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')) })
  await expect.poll(() => requests.filter(body => body.action === 'load').length).toBeGreaterThan(loads)
  await expect(page.locator('.sheets-state')).toContainText('biểu mẫu đang sửa')
  await expect(insurance).toHaveValue('17')
  expect((await stored(page)).payroll.settings.employeeInsuranceRate).toBe(remote.payroll.settings.employeeInsuranceRate)
  await page.getByRole('button', { name: 'Lưu cấu hình', exact: true }).click()
  await expect.poll(async () => (await stored(page)).payroll.settings.employeeInsuranceRate).toBe(17)
  await page.evaluate(() => { location.hash = '#settings'; window.dispatchEvent(new Event('focus')) })
  await expect(page.locator('.sheets-state')).toContainText(/xung đột|bản mới|thiết bị khác|thay đổi trên cả/i)
  expect(cloud.state.data.payroll.settings.employeeInsuranceRate).toBe(19)
})

test('a corrupt local cache never uploads fallback demo data and can recover from the remembered Sheet', async ({ page, context }) => {
  const remote = await fixture(page)
  remote.customers[0].name = 'Bản an toàn để khôi phục QA'
  const cloud = server(remote)
  const requests = await mockSheets(context, cloud.respond)
  await connect(page, remote)
  await page.evaluate(() => localStorage.setItem('xuong-viet.data.v1', '{invalid-json'))
  await page.reload()
  await expect(page.getByRole('alert').first()).toContainText(/không đọc được|bản lưu|sao lưu/i)
  await expect(page.locator('.sheets-state')).toContainText(/cần xử lý|không đọc|không hợp lệ|chưa an toàn/i)
  expect(requests.filter(body => body.action === 'save')).toHaveLength(0)
  expect(cloud.state.data).toEqual(remote)
  await page.getByRole('button', { name: 'Tải từ Google Sheets', exact: true }).click()
  await page.getByRole('button', { name: 'Dùng dữ liệu trên Sheet', exact: true }).click()
  await expect.poll(() => stored(page)).toEqual(remote)
  await addCustomer(page, 'Khách sau khi sửa bộ nhớ lỗi QA')
  await expect.poll(() => cloud.state.data.customers.some((row: any) => row.name === 'Khách sau khi sửa bộ nhớ lỗi QA'), { timeout: 10000 }).toBe(true)
})

test('retrying a failed initialization keeps one active writer even when the device wakes again', async ({ page, context }) => {
  const local = await fixture(page)
  const cloud = server(null, 0)
  let saves = 0
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const requests = await mockSheets(context, async body => {
    if (body.action === 'save') {
      saves++
      if (saves === 1) return 'network-error'
      if (saves === 2) await gate
    }
    return cloud.respond(body)
  })
  await connect(page)
  await page.getByRole('button', { name: 'Khởi tạo Sheet', exact: true }).click()
  await page.getByRole('button', { name: 'Bắt đầu tự động lưu', exact: true }).click()
  await expect.poll(() => saves, { timeout: 10000 }).toBe(2)
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')) })
  await expect(page.locator('.sheets-state')).toContainText('đang đồng bộ')
  finish()
  await expect.poll(() => cloud.state.revision).toBe(1)
  await expect(page.locator('.sheets-state')).toContainText('đã đồng bộ')
  expect(requests.filter(body => body.action === 'save')).toHaveLength(2)
  expect(cloud.state.data).toEqual(local)
})
