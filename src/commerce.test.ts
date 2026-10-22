import { describe, expect, it } from 'vitest'
import { buildPublicCatalog, ensureCommerce, getCommerce, getWebsiteSettings, issueDocument, safePublicUrl, validateCommerceTransition, validatePublicCatalog, voidDocument, type CatalogProduct } from './commerce'
import { publicDemo } from './public-demo'
import { validateData } from './domain'
import { createSeedData } from './seed'

const product: CatalogProduct = { id: 'p1', name: 'Trục gia công', category: 'Tiện CNC', summary: 'Theo yêu cầu', specification: 'Dung sai theo bản vẽ', material: 'Thép', unit: 'cái', imageUrl: 'assets/shaft.svg', priceLabel: 'Liên hệ báo giá', published: true, featured: true }
function ready() {
  const data = ensureCommerce(createSeedData())
  data.commerce!.company.name = 'Doanh nghiệp kiểm thử'
  data.commerce!.publicProfile.name = 'Danh mục công khai'
  data.commerce!.products = [product, { ...product, id: 'p2', name: 'Sản phẩm chưa công bố', published: false }]
  return data
}
const input = { orderId: 'o1', date: '2026-10-22' }

describe('commercial documents and compatible payment ledger', () => {
  it('reads an old snapshot without modifying it or inventing dated receipts', () => {
    const old = createSeedData(), before = JSON.stringify(old)
    const commerce = getCommerce(old)
    expect(JSON.stringify(old)).toBe(before)
    expect(old.commerce).toBeUndefined()
    expect(commerce.documents).toEqual([])
    expect(commerce.openingPaid).toEqual(old.orders.filter(order => order.paid > 0).map(order => ({ orderId: order.id, amount: order.paid })))
    expect(validateData(ensureCommerce(old))).toBe(true)
    expect(validateCommerceTransition(old, ensureCommerce(old))).toBe(true)
  })
  it('issues quotation and payment request snapshots without marking the order paid', () => {
    const data = ready(), oldPaid = data.orders[0].paid
    const quote = issueDocument(data, { ...input, kind: 'quotation' })
    const requested = issueDocument(quote, { ...input, kind: 'payment_request', amount: 3_000_000 })
    expect(validateData(requested)).toBe(true)
    expect(requested.orders[0].paid).toBe(oldPaid)
    expect(requested.commerce!.documents.map(doc => doc.number)).toEqual(['BG-2026-0001', 'DNTT-2026-0001'])
    data.commerce!.company.name = 'Tên mới'
    data.customers[0].name = 'Tên khách mới'
    expect(requested.commerce!.documents[0].company.name).toBe('Doanh nghiệp kiểm thử')
    expect(requested.commerce!.documents[0].customer.name).not.toBe('Tên khách mới')
    expect(() => issueDocument(requested, { ...input, kind: 'payment_request', amount: 1e12 })).toThrow()
  })
  it('records partial and full receipts, reconciles paid, and reverses a void exactly once', () => {
    const data = ready(), oldPaid = data.orders[0].paid
    const partial = issueDocument(data, { ...input, kind: 'receipt', amount: 1_000_000, method: 'cash', reference: 'PT-TEST' })
    const receipt = partial.commerce!.documents.at(-1)!
    expect(receipt.paidAtIssue).toBe(oldPaid)
    expect(partial.orders[0].paid).toBe(oldPaid + receipt.amount)
    expect(validateData(partial)).toBe(true)
    expect(validateCommerceTransition(data, partial)).toBe(true)
    const remaining = partial.orders[0].quantity * partial.orders[0].unitPrice - partial.orders[0].paid
    const full = issueDocument(partial, { ...input, kind: 'receipt', amount: remaining })
    expect(full.orders[0].paid).toBe(full.orders[0].quantity * full.orders[0].unitPrice)
    expect(() => issueDocument(full, { ...input, kind: 'receipt', amount: 1 })).toThrow()
    const reversed = voidDocument(full, receipt.id, 'Ghi nhầm phiếu thu')
    expect(reversed.orders[0].paid).toBe(full.orders[0].paid - receipt.amount)
    expect(validateCommerceTransition(full, reversed)).toBe(true)
    expect(validateData(reversed)).toBe(true)
    expect(() => voidDocument(reversed, receipt.id, 'Hủy lại')).toThrow()
    expect(() => issueDocument(data, { ...input, kind: 'receipt', amount: 0.5 })).toThrow()
    expect(() => issueDocument(data, { ...input, kind: 'receipt', amount: 0 })).toThrow()
  })
  it('caps cumulative delivery documents without altering production or raw material inventory', () => {
    const data = ready(), qty = data.orders[0].quantity
    const first = issueDocument(data, { ...input, kind: 'delivery', deliveryQuantity: qty - 1 })
    const all = issueDocument(first, { ...input, kind: 'delivery', deliveryQuantity: 1 })
    expect(validateData(all)).toBe(true)
    expect(all.orders).toEqual(data.orders)
    expect(all.materials).toEqual(data.materials)
    expect(() => issueDocument(all, { ...input, kind: 'delivery', deliveryQuantity: 1 })).toThrow()
    expect(validateData({ ...all, orders: all.orders.map(order => order.id === 'o1' ? { ...order, quantity: qty - 1 } : order) })).toBe(false)
    const reversed = voidDocument(all, all.commerce!.documents[0].id, 'Hủy giấy giao nhầm')
    expect(() => issueDocument(reversed, { ...input, kind: 'delivery', deliveryQuantity: qty - 1 })).not.toThrow()
  })
  it('rejects corrupted sums, missing order references, dates and duplicate numbers', () => {
    const data = issueDocument(ready(), { ...input, kind: 'receipt', amount: 1000 })
    expect(validateData({ ...data, orders: data.orders.map(order => order.id === 'o1' ? { ...order, paid: order.paid + 1 } : order) })).toBe(false)
    expect(validateData({ ...data, orders: data.orders.filter(order => order.id !== 'o1') })).toBe(false)
    const duplicate = structuredClone(data)
    duplicate.commerce!.documents.push({ ...duplicate.commerce!.documents[0], id: 'new-id' })
    expect(validateData(duplicate)).toBe(false)
    expect(() => issueDocument(ready(), { ...input, date: '2026-02-30', kind: 'quotation' })).toThrow()
    const corrupt = structuredClone(data)
    corrupt.commerce!.documents[0].balanceAtIssue += 1
    expect(validateData(corrupt)).toBe(false)
  })
  it('freezes issued document content and historical openings, including old-client and backup removal', () => {
    const data = issueDocument(ready(), { ...input, kind: 'quotation' })
    const edited = structuredClone(data)
    edited.commerce!.documents[0].company.name = 'Changed after issue'
    expect(validateCommerceTransition(data, edited)).toBe(false)
    expect(validateCommerceTransition(data, { ...data, commerce: undefined })).toBe(false)
    expect(validateCommerceTransition(data, { ...data, commerce: { ...data.commerce!, documents: [] } })).toBe(false)
    const opening = structuredClone(data)
    opening.commerce!.openingPaid[0].amount--
    expect(validateCommerceTransition(data, opening)).toBe(false)
    const reversed = voidDocument(data, data.commerce!.documents[0].id, 'Báo giá cần thay thế')
    expect(validateCommerceTransition(data, reversed)).toBe(true)
    expect(validateCommerceTransition(reversed, data)).toBe(false)
  })
  it('will not replace legacy paid with fabricated receipt history during first migration', () => {
    const old = createSeedData(), fresh = ready()
    const fabricated = issueDocument({ ...fresh, orders: fresh.orders.map(order => order.id === 'o1' ? { ...order, paid: 0 } : order), commerce: { ...fresh.commerce!, openingPaid: fresh.commerce!.openingPaid.filter(item => item.orderId !== 'o1') } }, { ...input, kind: 'receipt', amount: old.orders[0].paid })
    expect(validateData(fabricated)).toBe(true)
    expect(validateCommerceTransition(old, fabricated)).toBe(false)
    const actualNewReceipt = issueDocument(fresh, { ...input, kind: 'receipt', amount: 1000 })
    expect(validateCommerceTransition(old, actualNewReceipt)).toBe(true)
  })
})

describe('published catalog allowlist', () => {
  it('keeps older profiles unchanged while providing complete optional website defaults', () => {
    const data = ready(), before = JSON.stringify(data)
    const settings = getWebsiteSettings(data.commerce!.publicProfile)
    expect(settings.brandColor).toBe('#167363')
    expect(Object.values(settings.sections).every(Boolean)).toBe(true)
    expect(settings.gallery).toEqual([])
    expect(JSON.stringify(data)).toBe(before)
    expect(validateData(data)).toBe(true)
    expect(buildPublicCatalog(data).profile.site).toBeUndefined()
  })
  it('validates bounded website settings and image references without allowing HTML or CSS configuration', () => {
    const data = ready(), settings = getWebsiteSettings(data.commerce!.publicProfile)
    data.commerce!.publicProfile.site = settings
    settings.logo = { src: 'media:' + 'a'.repeat(64), alt: 'Logo doanh nghiệp' }
    settings.gallery = [{ id: 'g1', title: 'Nhà xưởng', description: 'Năng lực sản xuất', image: { src: 'assets/workshop.svg', alt: 'Nhà xưởng' } }]
    data.commerce!.products[0].images = [{ src: 'media:' + 'b'.repeat(64), alt: 'Mặt trước' }]
    expect(validateData(data)).toBe(true)
    expect(validatePublicCatalog(buildPublicCatalog(data))).toBe(true)
    expect(safePublicUrl(settings.logo.src)).toBe(false)
    const corrupt = structuredClone(data)
    corrupt.commerce!.publicProfile.site!.brandColor = 'red;background:url(evil)'
    expect(validateData(corrupt)).toBe(false)
    corrupt.commerce!.publicProfile.site!.brandColor = '#167363'
    corrupt.commerce!.publicProfile.site!.mapUrl = 'javascript:alert(1)'
    expect(validateData(corrupt)).toBe(false)
    corrupt.commerce!.publicProfile.site!.mapUrl = ''
    corrupt.commerce!.products[0].images = Array.from({ length: 7 }, () => ({ src: '', alt: '' }))
    expect(validateData(corrupt)).toBe(false)
    corrupt.commerce!.products[0].images = []
    corrupt.commerce!.publicProfile.site!.gallery = Array.from({ length: 13 }, (_, index) => ({ ...settings.gallery[0], id: 'g' + index }))
    expect(validateData(corrupt)).toBe(false)
  })
  it('public website projection strips unknown nested private properties', () => {
    const data = ready(), settings = getWebsiteSettings(data.commerce!.publicProfile)
    data.commerce!.publicProfile.site = settings
    settings.gallery = [{ id: 'g1', title: 'Example', description: '', image: { src: '', alt: '' } }]
    Object.assign(settings, { password: 'PRIVATE-SECRET' })
    Object.assign(settings.logo, { payroll: 'PRIVATE-SECRET' })
    Object.assign(settings.gallery[0], { customer: 'PRIVATE-SECRET' })
    Object.assign(settings.sections, { token: 'PRIVATE-SECRET' })
    data.commerce!.products[0].images = [Object.assign({ src: '', alt: '' }, { password: 'PRIVATE-SECRET' })]
    const published = buildPublicCatalog(data)
    expect(validatePublicCatalog(published)).toBe(true)
    expect(JSON.stringify(published)).not.toContain('PRIVATE-SECRET')
    Object.assign(published.profile.site!.logo, { secret: true })
    expect(validatePublicCatalog(published)).toBe(false)
  })
  it('removes disabled section contents from public responses while preserving the editable draft', () => {
    const data = ready(), profile = data.commerce!.publicProfile
    const settings = getWebsiteSettings(profile)
    profile.site = settings
    profile.capabilities = ['PRIVATE-CAPABILITY']; profile.address = 'PRIVATE-ADDRESS'; profile.phone = 'PRIVATE-PHONE'; profile.email = 'PRIVATE-EMAIL'; profile.website = 'https://private.example.com'
    settings.logo = { src: 'media:' + 'a'.repeat(64), alt: 'Logo stays visible' }
    settings.aboutText = 'PRIVATE-ABOUT'; settings.aboutImage = { src: 'media:' + 'b'.repeat(64), alt: 'PRIVATE-IMAGE' }
    settings.businessHours = 'PRIVATE-HOURS'; settings.zaloUrl = 'https://private.example.com'; settings.mapUrl = 'https://private.example.com'
    settings.gallery = [{ id: 'g1', title: 'PRIVATE-GALLERY', description: '', image: { src: 'media:' + 'c'.repeat(64), alt: '' } }]
    settings.sections = { about: false, capabilities: false, products: false, gallery: false, process: false, contact: false }
    const before = JSON.stringify(data), result = buildPublicCatalog(data)
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|private\.example|media:bbbb|media:cccc/)
    expect(result.profile.site!.logo.src).toBe(settings.logo.src)
    expect(result.products).toEqual([])
    expect(result.profile.site!.gallery).toEqual([])
    expect(JSON.stringify(data)).toBe(before)
  })
  it('copies only curated profile and published product fields, never business data or unknown fields', () => {
    const data = ready()
    data.commerce!.company.bankAccount = 'PRIVATE-BANK'
    Object.assign(data.commerce!.publicProfile, { payroll: data.payroll, token: 'PRIVATE-TOKEN' })
    Object.assign(data.commerce!.products[0], { customer: data.customers[0], cost: 987654, bankAccount: 'PRIVATE-BANK' })
    const result = buildPublicCatalog(data, '2026-10-22T00:00:00.000Z')
    expect(validatePublicCatalog(result)).toBe(true)
    expect(result.products).toHaveLength(1)
    expect(result.products[0].name).toBe(product.name)
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|payroll|customers|orders|bankAccount|unitCost|unpublished/)
    expect(result.profile).not.toHaveProperty('token')
    expect(result.products[0]).not.toHaveProperty('cost')
    expect(validatePublicCatalog({ ...result, customers: data.customers })).toBe(false)
    expect(validatePublicCatalog({ ...result, profile: { ...result.profile, bankAccount: 'PRIVATE' } })).toBe(false)
  })
  it('rejects unsafe URLs, inline image blobs and publication with an empty profile', () => {
    for (const url of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '//host/a.png', 'http://example.com', 'https://user:secret@example.com', 'images/../secret']) expect(safePublicUrl(url, true)).toBe(false)
    expect(safePublicUrl('https://example.com/image.png', true)).toBe(true)
    expect(safePublicUrl('assets/shaft.svg', true)).toBe(true)
    expect(() => buildPublicCatalog(createSeedData())).toThrow()
  })
  it('validates public demo catalog and enriched about section', () => {
    expect(validatePublicCatalog(publicDemo)).toBe(true)
    expect(publicDemo.profile.site?.aboutTitle).toContain('Chính xác')
    expect(publicDemo.profile.site?.aboutText).toContain('±0.005mm')
  })
})
