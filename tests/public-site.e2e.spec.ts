import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createSeedData } from '../src/seed'
import { buildPublicCatalog, ensureCommerce, type PublicCatalog } from '../src/commerce'

const endpoint = 'https://script.google.com/macros/s/test-deployment/exec'
const token = 'qlct1.public_site_qa_session.' + 'a'.repeat(64)
const privateMarker = 'NHAN_SU_VA_LUONG_RIENG_QA'
function fixture() {
  const source = createSeedData()
  source.payroll!.employees[0].name = privateMarker
  source.customers[0].name = 'KHACH_HANG_NOI_BO_KHONG_CONG_KHAI_QA'
  const data = ensureCommerce(source)
  data.commerce!.company.name = 'Tên pháp lý riêng QA'
  data.commerce!.company.bankAccount = 'TAI_KHOAN_NGAN_HANG_RIENG_QA'
  data.commerce!.publicProfile = { name: 'Công ty Cơ khí Công khai QA', tagline: 'Gia công chính xác theo bản vẽ', description: 'Tiện CNC, phay và gia công chi tiết theo yêu cầu.', address: 'Địa chỉ công khai QA', phone: '0900000000', email: 'qa@example.com', website: '', heroImage: '', capabilities: ['Tiện CNC', 'Phay chi tiết'] }
  data.commerce!.products = [
    { id: 'public-product', name: 'Trục cơ khí được xuất bản QA', category: 'Chi tiết CNC', summary: 'Thép gia công chính xác', specification: 'Ø45 mm', material: 'S45C', unit: 'cái', imageUrl: '', priceLabel: 'Liên hệ báo giá', published: true, featured: true },
    { id: 'private-product', name: 'SAN_PHAM_NHAP_CHUA_XUAT_BAN_QA', category: 'Bản nháp', summary: 'Chưa công khai', specification: '', material: '', unit: 'cái', imageUrl: '', priceLabel: '', published: false, featured: false },
  ]
  return data
}
function server() {
  const data = fixture()
  const state: { data: typeof data; revision: number; catalog: PublicCatalog | null; badCatalog: object | null; offline: boolean } = { data, revision: 7, catalog: buildPublicCatalog(data), badCatalog: null, offline: false }
  const requests: { method: string; body: any; url: string }[] = []
  async function install(context: BrowserContext) {
    await context.route(`${endpoint}**`, async route => {
      const request = route.request()
      const body = request.method() === 'POST' ? request.postDataJSON() : null
      requests.push({ method: request.method(), body, url: request.url() })
      if (state.offline) return route.abort('failed')
      let response: object
      if (request.method() === 'GET') {
        expect(new URL(request.url()).searchParams.get('action')).toBe('catalog')
        expect(request.url()).not.toContain(token)
        response = { ok: true, catalog: state.badCatalog ?? state.catalog }
      } else if (body.action === 'login') {
        response = body.username === 'quanly' && body.password === 'qa-public-site-password' ? { ok: true, token, expiresAt: Date.now() + 86400000, username: 'quanly' } : { ok: false, code: 'AUTH_FAILED' }
      } else if (body.token !== token) response = { ok: false, code: 'UNAUTHORIZED' }
      else if (body.action === 'load') response = { ok: true, data: state.data, revision: state.revision, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/qa-public-site/edit' }
      else if (body.expectedRevision !== state.revision) response = { ok: false, code: 'CONFLICT' }
      else if (body.action === 'save') { state.data = body.data; state.revision++; response = { ok: true, revision: state.revision, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/qa-public-site/edit' } }
      else if (body.action === 'publishCatalog') { state.catalog = buildPublicCatalog(state.data); response = { ok: true, publishedAt: state.catalog.publishedAt } }
      else response = { ok: false, code: 'INVALID_DATA' }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(response) })
    })
  }
  return { state, requests, install }
}
async function login(page: Page) {
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('quanly')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('qa-public-site-password')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.locator('.company-entry')).toHaveCount(0)
}

test('public landing loads only published catalog even when private data and a remembered session exist', async ({ page, context }, testInfo) => {
  const cloud = server()
  await cloud.install(context)
  await context.addInitScript(({ data, endpoint, token }) => {
    localStorage.setItem('xuong-viet.company.data.v1', JSON.stringify(data))
    localStorage.setItem('xuong-viet.data.v1', JSON.stringify(data))
    localStorage.setItem('xuong-viet.company.owner.v1', JSON.stringify({ endpoint, username: 'quanly' }))
    localStorage.setItem('xuong-viet.company.session.v1', JSON.stringify({ endpoint, username: 'quanly', token, expiresAt: Date.now() + 86400000 }))
  }, { data: cloud.state.data, endpoint, token })
  await page.goto('/')
  await expect(page.getByText('Công ty Cơ khí Công khai QA', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Trục cơ khí được xuất bản QA', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Chưa tải được bản công khai. Nội dung bên dưới là mẫu minh họa.', { exact: true })).toHaveCount(0)
  const body = await page.locator('body').innerText()
  for (const forbidden of [privateMarker, 'KHACH_HANG_NOI_BO_KHONG_CONG_KHAI_QA', 'TAI_KHOAN_NGAN_HANG_RIENG_QA', 'SAN_PHAM_NHAP_CHUA_XUAT_BAN_QA']) expect(body).not.toContain(forbidden)
  expect(cloud.requests.length).toBeGreaterThan(0)
  expect(cloud.requests.every(request => request.method === 'GET')).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('public-site-light.png'), fullPage: true })
  await page.getByRole('button', { name: 'Xem Trục cơ khí được xuất bản QA', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Ø45 mm', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Trao đổi về sản phẩm', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Nội dung yêu cầu', exact: true })).toHaveValue(/Trục cơ khí được xuất bản QA/)
  await page.getByRole('button', { name: 'Chuyển sang chế độ tối', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('public-site-dark.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})

test('unpublished or malformed public catalog never falls back to private browser cache', async ({ page, context }) => {
  const cloud = server()
  cloud.state.catalog = null
  await cloud.install(context)
  await context.addInitScript(data => localStorage.setItem('xuong-viet.company.data.v1', JSON.stringify(data)), cloud.state.data)
  await page.goto('/')
  await expect.poll(() => cloud.requests.length).toBeGreaterThan(0)
  await expect(page.getByText('Công ty Cơ khí Công khai QA', { exact: true })).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toContain(privateMarker)
  cloud.state.badCatalog = { ...buildPublicCatalog(cloud.state.data), payroll: cloud.state.data.payroll }
  await page.reload()
  await expect.poll(() => cloud.requests.length).toBeGreaterThan(1)
  await expect(page.getByText('Công ty Cơ khí Công khai QA', { exact: true })).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toContain(privateMarker)
  expect(cloud.requests.every(request => request.method === 'GET')).toBe(true)
})

test('public manager link opens the private login gate without exposing company data', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#products')
  await expect(page.getByText('Trục cơ khí được xuất bản QA', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Đăng nhập quản lý', exact: false }).click()
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toBeVisible()
  await expect(page.locator('.public-site')).toHaveCount(0)
  expect(cloud.requests.filter(request => request.method === 'POST')).toHaveLength(0)
  expect(await page.locator('body').innerText()).not.toContain(privateMarker)
})

test('saving a private website draft does not change public content until explicit publication', async ({ page, context, browser }, testInfo) => {
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#website')
  await login(page)
  const companyName = page.getByLabel('Tên công ty công khai *', { exact: true })
  await expect(companyName).toHaveValue('Công ty Cơ khí Công khai QA')
  const changedName = 'Công ty Cơ khí Sau Xuất Bản QA'
  await companyName.fill(changedName)
  await page.getByRole('button', { name: 'Xuất bản website', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Hãy lưu bản nháp và chờ tải ảnh xong trước khi xuất bản.')
  expect(cloud.requests.filter(request => request.body?.action === 'publishCatalog')).toHaveLength(0)
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.publicProfile.name).toBe(changedName)
  expect(cloud.state.catalog!.profile.name).toBe('Công ty Cơ khí Công khai QA')
  await page.screenshot({ path: testInfo.outputPath('website-draft-editor.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  const visitor = await browser.newContext()
  await cloud.install(visitor)
  const publicPage = await visitor.newPage()
  await publicPage.goto(new URL('/', page.url()).href)
  await expect(publicPage.getByText('Công ty Cơ khí Công khai QA', { exact: true }).first()).toBeVisible()
  await expect(publicPage.getByText(changedName, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Xuất bản website', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã xuất bản lúc' })).toBeVisible()
  const publications = cloud.requests.filter(request => request.body?.action === 'publishCatalog')
  expect(publications).toHaveLength(1)
  expect(publications[0].body).toEqual({ action: 'publishCatalog', token, expectedRevision: cloud.state.revision })
  expect(JSON.stringify(cloud.state.catalog)).not.toContain(privateMarker)
  expect(JSON.stringify(cloud.state.catalog)).not.toContain('TAI_KHOAN_NGAN_HANG_RIENG_QA')
  await publicPage.reload()
  await expect(publicPage.getByText(changedName, { exact: true }).first()).toBeVisible()
  await visitor.close()
})

test('explicit conflict recovery can replace an uncommitted local receipt with the authoritative Sheet', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#commerce')
  await login(page)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('xuong-viet.company.data.v1') || 'null')?.commerce?.company.name)).toBe('Tên pháp lý riêng QA')
  const originalPaid = cloud.state.data.orders[0].paid
  cloud.state.data.customers[0].name = 'Khách hàng thay đổi ở thiết bị thứ hai QA'
  cloud.state.revision++
  await page.getByRole('button', { name: 'Lập chứng từ', exact: true }).click()
  await page.getByRole('combobox', { name: 'Loại chứng từ *', exact: true }).selectOption('receipt')
  await page.getByLabel('Số tiền thu (VNĐ) *', { exact: true }).fill('100000')
  await page.getByRole('button', { name: 'Lập phiếu thu & ghi nhận tiền', exact: true }).click()
  await expect.poll(() => cloud.requests.filter(request => request.body?.action === 'save').length, { timeout: 10000 }).toBeGreaterThan(0)
  await page.evaluate(() => { location.hash = '#settings' })
  await page.getByRole('button', { name: 'Tải từ Google Sheets', exact: true }).click()
  await page.getByRole('button', { name: 'Dùng dữ liệu trên Sheet', exact: true }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('xuong-viet.company.data.v1') || 'null'))).toEqual(cloud.state.data)
  expect(cloud.state.data.orders[0].paid).toBe(originalPaid)
  expect(cloud.state.data.commerce!.documents).toHaveLength(0)
})

test('unsaved website draft survives preview navigation and a cancelled workspace navigation', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#website')
  await login(page)
  const companyName = page.getByLabel('Tên công ty công khai *', { exact: true })
  await expect(companyName).toHaveValue('Công ty Cơ khí Công khai QA')
  await companyName.fill('Tên đang soạn chưa lưu QA')
  await page.getByRole('button', { name: 'Xem trước bản nháp', exact: true }).click()
  const preview = page.getByRole('region', { name: 'Xem trước website', exact: true })
  await preview.locator('a.pub-brand[href="#home"]').click()
  await expect(page).toHaveURL(/#website$/)
  await preview.getByRole('link', { name: 'Đăng nhập quản lý', exact: false }).click()
  await expect(page).toHaveURL(/#website$/)
  await preview.getByRole('link', { name: 'Sản phẩm', exact: true }).click()
  await expect(page).toHaveURL(/#website$/)
  await expect(companyName).toHaveValue('Tên đang soạn chưa lưu QA')
  const menu = page.getByRole('button', { name: 'Mở menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('a.brand').click()
  await expect(page).toHaveURL(/#website$/)
  await expect(companyName).toHaveValue('Tên đang soạn chưa lưu QA')
  expect(cloud.requests.filter(request => ['save', 'publishCatalog'].includes(request.body?.action))).toHaveLength(0)
})
