import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { createSeedData } from '../src/seed'
import { buildPublicCatalog, ensureCommerce, issueDocument, type PublicCatalog } from '../src/commerce'

const endpoint = 'https://script.google.com/macros/s/test-deployment/exec'
const token = 'qlct1.site_cms_qa_session.' + 'c'.repeat(64)
const privateMarker = 'NHAN_SU_LUONG_RIENG_CMS_QA'
const companyName = 'Công ty Cơ khí CMS Kiểm thử'
const legacyImage = 'https://qa-images.invalid/legacy-product.jpg'
interface StoredMedia { id: string; name: string; mime: string; bytes: number; createdAt: string; base64: string }
function fixture() {
  const source = ensureCommerce(createSeedData())
  source.payroll.employees[0].name = privateMarker
  source.commerce!.company.name = 'Tên pháp lý riêng CMS QA'
  source.commerce!.company.bankAccount = 'NGAN_HANG_RIENG_CMS_QA'
  source.commerce!.publicProfile = { name: companyName, tagline: 'Gia công chính xác', description: 'Nội dung CMS kiểm thử.', address: 'Địa chỉ công khai', phone: '0900000000', email: 'qa@example.com', website: '', heroImage: '', capabilities: ['Tiện CNC'] }
  source.commerce!.products = [{ id: 'legacy-product', name: 'Sản phẩm ảnh URL cũ QA', category: 'Chi tiết CNC', summary: 'Chi tiết cơ khí kiểm thử', specification: 'Ø45 mm', material: 'Thép', unit: 'cái', imageUrl: legacyImage, priceLabel: 'Liên hệ', published: true, featured: false }]
  return issueDocument(source, { orderId: source.orders[0].id, kind: 'quotation', date: '2026-10-22' })
}
function server() {
  const data = fixture()
  const state: { data: typeof data; revision: number; catalog: PublicCatalog | null; media: Map<string, StoredMedia>; mediaError: string | null; gates: Map<string, Promise<void>> } = { data, revision: 7, catalog: buildPublicCatalog(data), media: new Map(), mediaError: null, gates: new Map() }
  const requests: { method: string; body: any; url: string }[] = []
  const usage = () => ({ count: state.media.size, bytes: [...state.media.values()].reduce((sum, item) => sum + item.bytes, 0), maxCount: 80, maxBytes: 12 * 1024 * 1024 })
  const metadata = ({ base64: _base64, ...value }: StoredMedia) => value
  const publicMedia = (item: StoredMedia) => ({ id: item.id, mime: item.mime, bytes: item.bytes, base64: item.base64 })
  async function install(context: BrowserContext) {
    await context.route('https://qa-images.invalid/**', route => route.fulfill({ status: 404, body: '' }))
    await context.route('https://script.google.com/**', async route => {
      const request = route.request()
      expect(request.url().startsWith(endpoint)).toBe(true)
      expect(request.url()).not.toContain(token)
      const body = request.method() === 'POST' ? request.postDataJSON() : null
      requests.push({ method: request.method(), body, url: request.url() })
      let response: object
      if (request.method() === 'GET') {
        const url = new URL(request.url())
        if (url.searchParams.get('action') === 'media') {
          const id = url.searchParams.get('id')!, item = state.media.get(id)
          response = item && JSON.stringify(state.catalog).includes(`media:${id}`) ? { ok: true, media: publicMedia(item) } : { ok: false, code: 'NOT_FOUND' }
        } else { expect(url.searchParams.get('action')).toBe('catalog'); response = { ok: true, catalog: state.catalog } }
      } else if (body.action === 'login') response = { ok: true, token, expiresAt: Date.now() + 86400000, username: 'quanly' }
      else if (body.token !== token) response = { ok: false, code: 'UNAUTHORIZED' }
      else if (body.action === 'load') response = { ok: true, data: state.data, revision: state.revision, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/qa-cms/edit' }
      else if (body.action === 'uploadMedia') {
        await state.gates.get(body.name)
        if (state.mediaError) response = { ok: false, code: state.mediaError }
        else {
          const bytes = Buffer.from(body.base64, 'base64')
          const id = createHash('sha256').update(bytes).digest('hex')
          expect(bytes.byteLength).toBeLessThanOrEqual(160 * 1024)
          expect([...bytes.subarray(0, 3)]).toEqual([255, 216, 255])
          if (!state.media.has(id)) state.media.set(id, { id, name: body.name, mime: 'image/jpeg', bytes: bytes.byteLength, base64: body.base64, createdAt: new Date().toISOString() })
          response = { ok: true, media: metadata(state.media.get(id)!), usage: usage() }
        }
      } else if (body.action === 'listMedia') response = { ok: true, media: [...state.media.values()].map(metadata), usage: usage() }
      else if (body.action === 'getMedia') response = state.media.has(body.id) ? { ok: true, media: publicMedia(state.media.get(body.id)!) } : { ok: false, code: 'NOT_FOUND' }
      else if (body.action === 'deleteMedia') {
        if (JSON.stringify(state.data.commerce).includes(`media:${body.id}`) || JSON.stringify(state.catalog).includes(`media:${body.id}`)) response = { ok: false, code: 'MEDIA_IN_USE' }
        else { state.media.delete(body.id); response = { ok: true, usage: usage() } }
      }
      else if (body.expectedRevision !== state.revision) response = { ok: false, code: 'CONFLICT' }
      else if (body.action === 'save') { state.data = structuredClone(body.data); response = { ok: true, revision: ++state.revision, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/qa-cms/edit' } }
      else if (body.action === 'publishCatalog') { state.catalog = buildPublicCatalog(state.data); response = { ok: true, publishedAt: state.catalog.publishedAt } }
      else throw new Error(`Unexpected mocked CMS API action: ${body.action}`)
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(response) })
    })
  }
  return { state, requests, install }
}
async function sourceImage(page: Page, name: string, color: string) {
  const base64 = await page.evaluate(color => {
    const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1200
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]
  }, color)
  return { name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') }
}
const picker = (page: Page, label: string) => page.locator('.image-picker').filter({ has: page.getByLabel(`Tải ${label.toLocaleLowerCase('vi')}`, { exact: true }) })
async function login(page: Page) {
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('quanly')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('qa-cms-password-only')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByLabel('Tên công ty công khai *', { exact: true })).toHaveValue(companyName)
}

test('legacy CMS data opens without auto-saving defaults and a profile edit preserves payroll, issued records and URL images', async ({ page, context }) => {
  const cloud = server()
  const original = structuredClone(cloud.state.data)
  await cloud.install(context)
  await page.goto('/#website')
  await login(page)
  expect(cloud.requests.filter(request => request.body?.action === 'save')).toHaveLength(0)
  await page.getByLabel('Tiêu đề giới thiệu', { exact: true }).fill('Năng lực gia công được cập nhật QA')
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.publicProfile.tagline).toBe('Năng lực gia công được cập nhật QA')
  expect(cloud.state.data.payroll).toEqual(original.payroll)
  expect(cloud.state.data.orders).toEqual(original.orders)
  expect(cloud.state.data.commerce!.documents).toEqual(original.commerce!.documents)
  expect(cloud.state.data.commerce!.openingPaid).toEqual(original.commerce!.openingPaid)
  expect(cloud.state.data.commerce!.products[0].imageUrl).toBe(legacyImage)
  expect(cloud.state.catalog!.profile.tagline).toBe(original.commerce!.publicProfile.tagline)
  await page.reload()
  await expect(page.getByLabel('Tiêu đề giới thiệu', { exact: true })).toHaveValue('Năng lực gia công được cập nhật QA')
})

test('uploaded photo stays private through draft saving, survives reload and appears for an independent visitor only after publishing', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(60000)
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#website'); await login(page)
  const source = await sourceImage(page, 'Nha-xuong-CMS-QA.png', '#247b6e')
  await page.getByLabel('Tải ảnh bìa', { exact: true }).setInputFiles(source)
  await expect.poll(() => cloud.state.media.size).toBe(1)
  const asset = [...cloud.state.media.values()][0]
  const imagePicker = picker(page, 'Ảnh bìa')
  await imagePicker.scrollIntoViewIfNeeded()
  await expect(imagePicker.locator('img')).toBeVisible()
  expect(await imagePicker.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeLessThanOrEqual(1600)
  expect(cloud.state.data.commerce!.publicProfile.heroImage).toBe('')
  expect(cloud.state.catalog!.profile.heroImage).toBe('')
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.publicProfile.heroImage).toBe(`media:${asset.id}`)
  await page.reload()
  await picker(page, 'Ảnh bìa').scrollIntoViewIfNeeded()
  await expect(picker(page, 'Ảnh bìa').locator('img')).toBeVisible()
  const visitor = await browser.newContext({ viewport: page.viewportSize()! })
  await cloud.install(visitor)
  const publicPage = await visitor.newPage()
  await publicPage.goto(new URL('/', page.url()).href)
  await expect(publicPage.getByText(companyName, { exact: true }).first()).toBeVisible()
  expect(cloud.requests.some(request => request.method === 'GET' && request.url.includes(`action=media&id=${asset.id}`))).toBe(false)
  await page.getByRole('button', { name: 'Xuất bản website', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã xuất bản lúc' })).toBeVisible()
  await publicPage.reload()
  await expect(publicPage.locator('.pub-hero-visual img')).toBeVisible()
  await expect.poll(() => publicPage.locator('.pub-hero-visual img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  expect(JSON.stringify(cloud.state.catalog)).not.toContain(asset.base64)
  expect(JSON.stringify(cloud.state.catalog)).not.toContain(asset.name)
  expect(await publicPage.locator('body').innerText()).not.toContain(privateMarker)
  expect(cloud.requests.some(request => request.method === 'GET' && request.url.includes(`action=media&id=${asset.id}`))).toBe(true)
  await publicPage.screenshot({ path: testInfo.outputPath('cms-published-photo-light.png'), fullPage: true })
  await publicPage.getByRole('button', { name: 'Chuyển sang chế độ tối', exact: true }).click()
  await publicPage.screenshot({ path: testInfo.outputPath('cms-published-photo-dark.png'), fullPage: true })
  expect(await publicPage.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await picker(page, 'Ảnh bìa').getByRole('button', { name: 'Bỏ ảnh', exact: true }).click()
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.publicProfile.heroImage).toBe('')
  await page.getByRole('button', { name: 'Thư viện ảnh', exact: true }).click()
  const deleteImage = page.getByRole('button', { name: `Xóa ảnh ${asset.name}`, exact: true })
  page.once('dialog', dialog => dialog.accept())
  await deleteImage.click()
  await expect(page.locator('.site-media-library').getByRole('alert')).toContainText('còn được dùng')
  expect(cloud.state.media.size).toBe(1)
  await page.getByRole('button', { name: 'Xuất bản website', exact: true }).click()
  await expect.poll(() => cloud.state.catalog!.profile.heroImage).toBe('')
  page.once('dialog', dialog => dialog.accept())
  await deleteImage.click()
  await expect.poll(() => cloud.state.media.size).toBe(0)
  await visitor.close()
})

test('late uploads cannot replace a newer photo or restore a removed photo', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  let finishFirst!: () => void, finishRemoved!: () => void
  cloud.state.gates.set('first-delayed.jpg', new Promise<void>(resolve => { finishFirst = resolve }))
  cloud.state.gates.set('removed-delayed.jpg', new Promise<void>(resolve => { finishRemoved = resolve }))
  await page.goto('/#website'); await login(page)
  const input = page.getByLabel('Tải ảnh bìa', { exact: true })
  const imagePicker = picker(page, 'Ảnh bìa')
  await input.setInputFiles(await sourceImage(page, 'first-delayed.png', '#b22222'))
  await expect.poll(() => cloud.requests.filter(request => request.body?.action === 'uploadMedia').length).toBe(1)
  await input.setInputFiles(await sourceImage(page, 'second-latest.png', '#2222b2'))
  await expect.poll(() => cloud.state.media.size).toBe(1)
  const second = [...cloud.state.media.values()][0]
  await imagePicker.scrollIntoViewIfNeeded()
  await expect(imagePicker.locator('img')).toBeVisible()
  finishFirst()
  await expect.poll(() => cloud.state.media.size).toBe(2)
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.publicProfile.heroImage).toBe(`media:${second.id}`)
  await input.setInputFiles(await sourceImage(page, 'removed-delayed.png', '#dddd22'))
  await expect.poll(() => cloud.requests.filter(request => request.body?.action === 'uploadMedia').length).toBe(3)
  await imagePicker.getByRole('button', { name: 'Bỏ ảnh', exact: true }).click()
  finishRemoved()
  await expect.poll(() => cloud.state.media.size).toBe(3)
  await expect(imagePicker.locator('img')).toHaveCount(0)
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.publicProfile.heroImage).toBe('')
  expect(cloud.state.catalog!.profile.heroImage).toBe('')
})

test('invalid files and library quota explain failure while preserving unsaved content', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#website'); await login(page)
  const title = page.getByLabel('Tiêu đề giới thiệu', { exact: true })
  await title.fill('Bản nháp còn nguyên sau lỗi ảnh QA')
  const input = page.getByLabel('Tải ảnh bìa', { exact: true })
  await input.setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') })
  await expect(picker(page, 'Ảnh bìa').getByRole('alert')).toContainText('JPG')
  expect(cloud.requests.filter(request => request.body?.action === 'uploadMedia')).toHaveLength(0)
  cloud.state.mediaError = 'MEDIA_QUOTA'
  await input.setInputFiles(await sourceImage(page, 'quota-test.png', '#555555'))
  await expect(picker(page, 'Ảnh bìa').getByRole('alert')).toContainText('giới hạn')
  await expect(title).toHaveValue('Bản nháp còn nguyên sau lỗi ảnh QA')
  expect(cloud.state.media.size).toBe(0)
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.publicProfile.tagline).toBe('Bản nháp còn nguyên sau lỗi ảnh QA')
  expect(cloud.state.data.commerce!.publicProfile.heroImage).toBe('')
})

test('CMS edits brand, gallery, contact visibility and product order without changing live content before publication', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(60000)
  const cloud = server()
  const originalOrders = structuredClone(cloud.state.data.orders)
  await cloud.install(context)
  await page.goto('/#website'); await login(page)
  await page.getByLabel('Màu chủ đạo', { exact: true }).fill('#f6e000')
  await page.getByLabel('Bài giới thiệu công ty', { exact: true }).fill('Gia công theo bản vẽ khách hàng. Nội dung giới thiệu QA.')
  await page.getByLabel('Giờ làm việc', { exact: true }).fill('Thứ hai – thứ bảy, 07:30–17:00')
  await page.getByRole('button', { name: 'Nhân bản Sản phẩm ảnh URL cũ QA', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Tên sản phẩm / dịch vụ *', { exact: true }).fill('Sản phẩm đặt trước QA')
  await expect(dialog.getByRole('checkbox', { name: 'Hiển thị trên website', exact: true })).not.toBeChecked()
  await dialog.getByRole('checkbox', { name: 'Hiển thị trên website', exact: true }).check()
  await dialog.getByRole('button', { name: 'Lưu sản phẩm vào bản nháp', exact: true }).click()
  await page.getByRole('button', { name: 'Đưa lên Sản phẩm đặt trước QA', exact: true }).click()
  await page.getByRole('button', { name: 'Thêm hình công việc', exact: true }).click()
  await page.getByLabel('Tên công việc 1 *', { exact: true }).fill('Không gian xưởng QA')
  await page.getByLabel('Mô tả công việc 1', { exact: true }).fill('Ảnh công việc do người quản lý chọn.')
  await page.getByLabel('Tải ảnh công việc 1', { exact: true }).setInputFiles(await sourceImage(page, 'gallery-workshop.png', '#6a548e'))
  await expect.poll(() => cloud.state.media.size).toBe(1)
  await page.getByRole('checkbox', { name: 'Hiển thị liên hệ báo giá', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: 'Hiển thị quy trình làm việc', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.products[0].name).toBe('Sản phẩm đặt trước QA')
  expect(cloud.state.catalog!.products).toHaveLength(1)
  expect(cloud.state.catalog!.profile.email).toBe('qa@example.com')
  await page.getByRole('button', { name: 'Xuất bản website', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã xuất bản lúc' })).toBeVisible()
  expect(cloud.state.catalog!.profile.email).toBe('')
  const visitor = await browser.newContext({ viewport: page.viewportSize()! })
  await cloud.install(visitor)
  const publicPage = await visitor.newPage()
  await publicPage.goto(new URL('/', page.url()).href)
  await expect(publicPage.locator('.pub-product h3')).toHaveText(['Sản phẩm đặt trước QA', 'Sản phẩm ảnh URL cũ QA'])
  await expect(publicPage.locator('#pub-contact, .pub-process')).toHaveCount(0)
  await expect(publicPage.getByText('Không gian xưởng QA', { exact: true })).toBeVisible()
  await publicPage.locator('#pub-gallery').scrollIntoViewIfNeeded()
  await expect(publicPage.locator('#pub-gallery img')).toBeVisible()
  await publicPage.screenshot({ path: testInfo.outputPath('cms-rich-site-light.png'), fullPage: true })
  await publicPage.getByRole('button', { name: 'Chuyển sang chế độ tối', exact: true }).click()
  await publicPage.screenshot({ path: testInfo.outputPath('cms-rich-site-dark.png'), fullPage: true })
  expect(await publicPage.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Xóa sản phẩm Sản phẩm đặt trước QA', exact: true }).click()
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.products.length).toBe(1)
  expect(cloud.state.catalog!.products).toHaveLength(2)
  await page.getByRole('button', { name: 'Xuất bản website', exact: true }).click()
  await expect.poll(() => cloud.state.catalog!.products.length).toBe(1)
  expect(cloud.state.data.orders).toEqual(originalOrders)
  await visitor.close()
})

test('closing a product during upload prevents the late response from changing another product draft', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  let finish!: () => void
  cloud.state.gates.set('closed-product.jpg', new Promise<void>(resolve => { finish = resolve }))
  await page.goto('/#website'); await login(page)
  const source = await sourceImage(page, 'closed-product.png', '#2468a4')
  await page.getByRole('button', { name: 'Sửa Sản phẩm ảnh URL cũ QA', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Tải ảnh sản phẩm 1', { exact: true }).setInputFiles(source)
  await expect.poll(() => cloud.requests.filter(request => request.body?.action === 'uploadMedia').length).toBe(1)
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Đang tải ảnh…', exact: true })).toBeDisabled()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Đóng sản phẩm', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Tên sản phẩm / dịch vụ *', { exact: true }).fill('Sản phẩm mới không nhận ảnh cũ QA')
  finish()
  await expect.poll(() => cloud.state.media.size).toBe(1)
  await expect(page.getByRole('dialog').locator('.image-picker-preview')).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu sản phẩm vào bản nháp', exact: true }).click()
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.products.length).toBe(2)
  expect(cloud.state.data.commerce!.products[0].imageUrl).toBe(legacyImage)
  expect(cloud.state.data.commerce!.products[1].imageUrl).toBe('')
})

test('leaving during upload keeps the saved draft unchanged and completed media can be chosen from the library later', async ({ page, context }) => {
  const cloud = server()
  await cloud.install(context)
  let finish!: () => void
  cloud.state.gates.set('navigation-delayed.jpg', new Promise<void>(resolve => { finish = resolve }))
  await page.goto('/#website'); await login(page)
  await page.getByLabel('Tải ảnh bìa', { exact: true }).setInputFiles(await sourceImage(page, 'navigation-delayed.png', '#557744'))
  await expect.poll(() => cloud.requests.filter(request => request.body?.action === 'uploadMedia').length).toBe(1)
  await expect(page.getByRole('button', { name: 'Lưu bản nháp website', exact: true })).toBeDisabled()
  const menu = page.getByRole('button', { name: 'Mở menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  page.once('dialog', dialog => dialog.accept())
  await page.locator('a.brand').click()
  await expect(page).toHaveURL(/#overview$/)
  finish()
  await expect.poll(() => cloud.state.media.size).toBe(1)
  expect(cloud.state.data.commerce!.publicProfile.heroImage).toBe('')
  expect(cloud.requests.filter(request => request.body?.action === 'save')).toHaveLength(0)
  await page.goto('/#website')
  const imagePicker = picker(page, 'Ảnh bìa')
  await imagePicker.getByRole('button', { name: 'Chọn từ thư viện', exact: true }).click()
  await imagePicker.getByRole('button', { name: 'navigation-delayed.jpg', exact: false }).click()
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  const asset = [...cloud.state.media.values()][0]
  await expect.poll(() => cloud.state.data.commerce!.publicProfile.heroImage).toBe(`media:${asset.id}`)
  expect(cloud.requests.filter(request => request.body?.action === 'uploadMedia')).toHaveLength(1)
})

test('a product with two uploaded photos keeps the selected cover and visitors can switch detail images', async ({ page, context, browser }) => {
  const cloud = server()
  await cloud.install(context)
  await page.goto('/#website'); await login(page)
  const first = await sourceImage(page, 'product-detail-red.png', '#ac3636')
  const second = await sourceImage(page, 'product-cover-blue.png', '#3656ac')
  await page.getByRole('button', { name: 'Sửa Sản phẩm ảnh URL cũ QA', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Tải ảnh sản phẩm 1', { exact: true }).setInputFiles(first)
  await expect.poll(() => cloud.state.media.size).toBe(1)
  const firstAsset = [...cloud.state.media.values()][0]
  await dialog.getByLabel('Tải ảnh sản phẩm 2', { exact: true }).setInputFiles(second)
  await expect.poll(() => cloud.state.media.size).toBe(2)
  const secondAsset = [...cloud.state.media.values()].find(item => item.id !== firstAsset.id)!
  await dialog.getByRole('button', { name: 'Đặt làm ảnh bìa 2', exact: true }).click()
  await dialog.getByRole('button', { name: 'Lưu sản phẩm vào bản nháp', exact: true }).click()
  await page.getByRole('button', { name: 'Lưu bản nháp website', exact: true }).click()
  await expect.poll(() => cloud.state.data.commerce!.products[0].imageUrl).toBe(`media:${secondAsset.id}`)
  expect(cloud.state.data.commerce!.products[0].images?.map(item => item.src)).toEqual([`media:${secondAsset.id}`, `media:${firstAsset.id}`])
  await page.getByRole('button', { name: 'Xuất bản website', exact: true }).click()
  await expect.poll(() => cloud.state.catalog!.products[0].imageUrl).toBe(`media:${secondAsset.id}`)
  const visitor = await browser.newContext({ viewport: page.viewportSize()! })
  await cloud.install(visitor)
  const publicPage = await visitor.newPage()
  await publicPage.goto(new URL('/', page.url()).href)
  await publicPage.getByRole('button', { name: 'Xem Sản phẩm ảnh URL cũ QA', exact: true }).click()
  const detail = publicPage.getByRole('dialog')
  const cover = detail.getByRole('button', { name: 'Xem ảnh 1 của Sản phẩm ảnh URL cũ QA', exact: true })
  const other = detail.getByRole('button', { name: 'Xem ảnh 2 của Sản phẩm ảnh URL cũ QA', exact: true })
  await expect(cover).toHaveAttribute('aria-pressed', 'true')
  await expect(other).toHaveAttribute('aria-pressed', 'false')
  const activeImage = detail.locator('.pub-product-art .site-image img')
  await expect(activeImage).toBeVisible()
  const initialSource = await activeImage.getAttribute('src')
  await other.click()
  await expect(other).toHaveAttribute('aria-pressed', 'true')
  await expect(cover).toHaveAttribute('aria-pressed', 'false')
  await expect(activeImage).not.toHaveAttribute('src', initialSource!)
  await expect.poll(() => activeImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  expect(cloud.requests.some(request => request.method === 'GET' && request.url.includes(`action=media&id=${firstAsset.id}`))).toBe(true)
  expect(cloud.requests.some(request => request.method === 'GET' && request.url.includes(`action=media&id=${secondAsset.id}`))).toBe(true)
  await visitor.close()
})
