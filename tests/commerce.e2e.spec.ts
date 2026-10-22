import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createSeedData } from '../src/seed'
import { ensureCommerce, issueDocument } from '../src/commerce'

const KEY = 'xuong-viet.data.v1'
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), KEY)
function fixture() {
  const source = createSeedData()
  source.orders[0] = { ...source.orders[0], code: 'QA-CK-001', partName: 'Trục truyền động thép Ø45', quantity: 10, unitPrice: 100000, paid: 200000, completedQuantity: 2 }
  const data = ensureCommerce(source)
  data.commerce!.company = { name: 'Công ty Cơ khí Kiểm thử', taxCode: 'QA-KHONG-PHAI-MST', address: 'Đường Nguyễn Văn Cừ, thành phố Hồ Chí Minh', phone: '0900000000', email: 'qa@example.com', website: '', bankName: 'Ngân hàng kiểm thử', bankAccount: '0000000000', bankAccountName: 'CONG TY CO KHI KIEM THU' }
  return data
}
async function start(page: Page, data = fixture()) {
  await page.addInitScript(({ key, data }) => {
    if (localStorage.getItem('qa-commerce-seeded')) return
    localStorage.setItem('qa-commerce-seeded', 'true')
    localStorage.setItem(key, JSON.stringify(data))
  }, { key: KEY, data })
  await page.goto('/#commerce')
  return data
}

async function issue(page: Page, kind: 'quotation' | 'payment_request' | 'receipt' | 'delivery', amount?: number) {
  await page.getByRole('button', { name: 'Lập chứng từ', exact: true }).click()
  await page.getByRole('combobox', { name: 'Đơn hàng *', exact: true }).selectOption({ label: (await page.getByRole('combobox', { name: 'Đơn hàng *', exact: true }).locator('option').allTextContents()).find(text => text.startsWith('QA-CK-001'))! })
  await page.getByRole('combobox', { name: 'Loại chứng từ *', exact: true }).selectOption(kind)
  if (kind === 'payment_request' && amount !== undefined) await page.getByLabel('Số tiền đề nghị (VNĐ) *', { exact: true }).fill(String(amount))
  if (kind === 'receipt' && amount !== undefined) await page.getByLabel('Số tiền thu (VNĐ) *', { exact: true }).fill(String(amount))
  if (kind === 'delivery' && amount !== undefined) await page.getByLabel('Số lượng giao lần này *', { exact: true }).fill(String(amount))
  await page.getByRole('button', { name: kind === 'receipt' ? 'Lập phiếu thu & ghi nhận tiền' : 'Lưu chứng từ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Lập chứng từ mới', exact: true })).toHaveCount(0)
  return (await stored(page)).commerce.documents.at(-1)
}
async function voidSelected(page: Page, number: string) {
  await page.getByRole('button', { name: `Hủy chứng từ ${number}`, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Lý do hủy *', { exact: true }).fill('Điều chỉnh chứng từ kiểm thử, giữ nguyên lịch sử')
  await dialog.getByRole('button', { name: 'Xác nhận hủy chứng từ', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

test('payment requests do not record money; partial receipts and void preserve the opening balance and payroll', async ({ page }) => {
  const initial = await start(page)
  const opening = initial.orders[0].paid
  const request = await issue(page, 'payment_request', 500000)
  let data = await stored(page)
  expect(data.orders[0].paid).toBe(opening)
  expect(data.commerce.documents.filter((doc: any) => doc.kind === 'receipt')).toHaveLength(0)
  expect(request.balanceAtIssue).toBe(800000)
  const first = await issue(page, 'receipt', 150000)
  const second = await issue(page, 'receipt', 250000)
  data = await stored(page)
  expect(data.orders[0].paid).toBe(600000)
  expect(data.commerce.openingPaid.find((entry: any) => entry.orderId === initial.orders[0].id).amount).toBe(opening)
  await page.getByRole('button', { name: new RegExp(first.number) }).filter({ has: page.locator('.commerce-item-top') }).click()
  await voidSelected(page, first.number)
  data = await stored(page)
  expect(data.orders[0].paid).toBe(450000)
  expect(data.commerce.documents).toHaveLength(3)
  expect(data.commerce.documents.find((doc: any) => doc.id === first.id)).toMatchObject({ status: 'void', amount: 150000 })
  expect(data.commerce.documents.find((doc: any) => doc.id === second.id)).toEqual(second)
  expect(data.payroll).toEqual(initial.payroll)
  await page.reload()
  expect((await stored(page)).orders[0].paid).toBe(450000)
  await expect(page.frameLocator('.commerce-document-frame').getByText('CHỨNG TỪ ĐÃ HỦY')).toHaveCount(0)
})

test('partial deliveries constrain remaining quantity without changing stock, payment or production', async ({ page }) => {
  const initial = await start(page)
  const first = await issue(page, 'delivery', 4)
  await page.getByRole('button', { name: 'Lập chứng từ', exact: true }).click()
  await page.getByRole('combobox', { name: 'Loại chứng từ *', exact: true }).selectOption('delivery')
  await expect(page.getByLabel('Số lượng giao lần này *', { exact: true })).toHaveAttribute('max', '6')
  await page.getByLabel('Số lượng giao lần này *', { exact: true }).fill('7')
  await page.getByRole('button', { name: 'Lưu chứng từ', exact: true }).click()
  expect((await stored(page)).commerce.documents).toHaveLength(1)
  await page.getByLabel('Số lượng giao lần này *', { exact: true }).fill('6')
  await page.getByRole('button', { name: 'Lưu chứng từ', exact: true }).click()
  const data = await stored(page)
  expect(data.commerce.documents).toHaveLength(2)
  expect(data.orders).toEqual(initial.orders)
  expect(data.materials).toEqual(initial.materials)
  expect(data.movements).toEqual(initial.movements)
  await page.getByRole('button', { name: new RegExp(first.number) }).filter({ has: page.locator('.commerce-item-top') }).click()
  await voidSelected(page, first.number)
  await page.getByRole('button', { name: 'Lập chứng từ', exact: true }).click()
  await page.getByRole('combobox', { name: 'Loại chứng từ *', exact: true }).selectOption('delivery')
  await expect(page.getByLabel('Số lượng giao lần này *', { exact: true })).toHaveAttribute('max', '4')
})

test('issued document snapshots keep original company data and HTML exports escape untrusted text', async ({ page }, testInfo) => {
  const source = fixture()
  const marker = '<img src=x onerror="window.qaInjected=1"> Nhà máy kiểm thử'
  source.commerce!.company.name = marker
  source.orders[0].partName = '<script>window.qaInjected=1</script> Chi tiết cơ khí'
  await start(page, source)
  const doc = await issue(page, 'quotation')
  const frame = page.frameLocator('.commerce-document-frame')
  await expect(frame.getByText(marker, { exact: true })).toBeVisible()
  await expect(frame.locator('script, img')).toHaveCount(0)
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tải bản HTML', exact: true }).click()
  const download = await event
  await download.saveAs(testInfo.outputPath('escaped-document.html'))
  const html = await readFile((await download.path())!, 'utf8')
  expect(html).toContain('&lt;script&gt;window.qaInjected=1&lt;/script&gt;')
  expect(html).not.toContain('<img src=x')
  expect(html).not.toContain('<script>')
  await page.getByRole('tab', { name: 'Thông tin xuất chứng từ', exact: true }).click()
  await page.getByLabel('Tên doanh nghiệp trên chứng từ *', { exact: true }).fill('Tên doanh nghiệp sau khi đổi QA')
  await page.getByRole('button', { name: 'Lưu thông tin doanh nghiệp', exact: true }).click()
  expect((await stored(page)).commerce.documents[0]).toEqual(doc)
  await page.getByRole('tab', { name: 'Chứng từ bán hàng', exact: true }).click()
  await expect(frame.getByText(marker, { exact: true })).toBeVisible()
  await expect(frame.getByText('Tên doanh nghiệp sau khi đổi QA', { exact: true })).toHaveCount(0)
})

test('Vietnamese PDF downloads include long document content and keep the mobile preview usable', async ({ page }, testInfo) => {
  const source = fixture()
  const longTerms = 'Gia công cơ khí chính xác, kiểm tra kích thước và chất lượng bề mặt trước khi bàn giao. '.repeat(60).slice(0, 3960)
  const longNote = 'Khách hàng xác nhận bản vẽ; giao hàng từng đợt và đối soát đầy đủ số lượng. '.repeat(60).slice(0, 3960)
  source.orders[0].drawing = 'Bản vẽ chi tiết phiên bản B - '.repeat(25)
  const data = issueDocument(source, { kind: 'quotation', orderId: source.orders[0].id, date: '2026-10-22', terms: longTerms + ' KẾT THÚC ĐIỀU KIỆN QA', note: longNote + ' KẾT THÚC GHI CHÚ QA' })
  await start(page, data)
  await expect(page.frameLocator('.commerce-document-frame').getByRole('heading', { name: 'Báo giá', exact: true })).toBeVisible()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tải PDF', exact: true }).click()
  const download = await event
  expect(download.suggestedFilename()).toMatch(/^BG-2026-\d+\.pdf$/)
  const pdfPath = testInfo.outputPath('vietnamese-long-document.pdf')
  await download.saveAs(pdfPath)
  const bytes = await readFile(pdfPath)
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.byteLength).toBeGreaterThan(30000)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('document-preview.png'), fullPage: true })
})

test('all four document types download standalone PDFs with their own document number', async ({ page }, testInfo) => {
  await start(page)
  for (const kind of ['quotation', 'payment_request', 'delivery', 'receipt'] as const) {
    const doc = await issue(page, kind, kind === 'delivery' ? 2 : 100000)
    const event = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Tải PDF', exact: true }).click()
    const download = await event
    expect(download.suggestedFilename()).toBe(`${doc.number}.pdf`)
    const path = testInfo.outputPath(`${kind}.pdf`)
    await download.saveAs(path)
    expect((await readFile(path)).subarray(0, 5).toString()).toBe('%PDF-')
  }
})
