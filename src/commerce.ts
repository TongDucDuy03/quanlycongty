import { newId, type Customer, type Data, type Order } from './domain'

export type DocumentKind = 'quotation' | 'payment_request' | 'delivery' | 'receipt'
export type PaymentMethod = 'cash' | 'bank' | 'other'
export interface CompanyProfile {
  name: string; taxCode: string; address: string; phone: string; email: string; website: string
  bankName: string; bankAccount: string; bankAccountName: string
}
export interface PublicProfile {
  name: string; tagline: string; description: string; address: string; phone: string; email: string
  website: string; heroImage: string; capabilities: string[]
  site?: WebsiteSettings
}
export interface WebsiteImage { src: string; alt: string }
export interface ShowcaseItem { id: string; title: string; description: string; image: WebsiteImage }
export interface WebsiteStat { id: string; value: string; label: string; note: string }
export interface CaseStudy { id: string; title: string; challenge: string; solution: string; result: string; image: WebsiteImage }
/** Optional proof points; every item is entered by the owner, none is invented by the site. */
export interface TrustSettings { certifications: string[]; clients: string[]; stats: WebsiteStat[]; equipment: string[]; caseStudies: CaseStudy[] }
export interface WebsiteSettings {
  logo: WebsiteImage; brandColor: string; heroEyebrow: string; heroImageAlt: string
  aboutTitle: string; aboutText: string; aboutImage: WebsiteImage; galleryTitle: string; gallery: ShowcaseItem[]
  businessHours: string; zaloUrl: string; mapUrl: string
  trust?: TrustSettings
  sections: { about: boolean; capabilities: boolean; products: boolean; gallery: boolean; process: boolean; contact: boolean }
}
export interface CatalogProduct {
  id: string; name: string; category: string; summary: string; specification: string; material: string
  unit: string; imageUrl: string; priceLabel: string; published: boolean; featured: boolean
  images?: WebsiteImage[]
}
export interface SalesDocument {
  id: string; number: string; kind: DocumentKind; orderId: string; date: string; createdAt: string
  company: CompanyProfile; customer: Customer
  order: Pick<Order, 'code' | 'partName' | 'quantity' | 'unitPrice' | 'material' | 'drawing' | 'dueDate'>
  amount: number; paidAtIssue: number; balanceAtIssue: number; deliveryQuantity: number
  terms: string; note: string; method: PaymentMethod; reference: string
  status: 'issued' | 'void'; voidedAt: string; voidReason: string
}
export interface CommerceData {
  version: 1; company: CompanyProfile; publicProfile: PublicProfile; products: CatalogProduct[]
  openingPaid: { orderId: string; amount: number }[]; documents: SalesDocument[]
}
export type PublicProduct = Omit<CatalogProduct, 'published'>
export interface PublicCatalog { version: 1; publishedAt: string; profile: PublicProfile; products: PublicProduct[] }
export interface IssueDocumentInput {
  kind: DocumentKind; orderId: string; date: string; amount?: number; deliveryQuantity?: number
  terms?: string; note?: string; method?: PaymentMethod; reference?: string
}

const obj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max
const required = (v: unknown, max = 200): v is string => text(v, max) && v.trim().length > 0
const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER
const integer = (v: unknown): v is number => money(v) && Number.isSafeInteger(v)
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v
const kinds: DocumentKind[] = ['quotation', 'payment_request', 'delivery', 'receipt']
const methods: PaymentMethod[] = ['cash', 'bank', 'other']
const prefixes: Record<DocumentKind, string> = { quotation: 'BG', payment_request: 'DNTT', delivery: 'PGH', receipt: 'PT' }
const equalMoney = (a: number, b: number) => Math.abs(a - b) <= 0.000001
const companyKeys = ['name', 'taxCode', 'address', 'phone', 'email', 'website', 'bankName', 'bankAccount', 'bankAccountName'] as const
const profileKeys = ['name', 'tagline', 'description', 'address', 'phone', 'email', 'website', 'heroImage'] as const
const productKeys = ['id', 'name', 'category', 'summary', 'specification', 'material', 'unit', 'imageUrl', 'priceLabel'] as const

export function getCommerce(data: Data): CommerceData {
  return data.commerce ?? {
    version: 1,
    company: { name: '', taxCode: '', address: '', phone: '', email: '', website: '', bankName: '', bankAccount: '', bankAccountName: '' },
    publicProfile: { name: '', tagline: '', description: '', address: '', phone: '', email: '', website: '', heroImage: '', capabilities: [] },
    products: [], openingPaid: data.orders.filter(order => order.paid > 0).map(order => ({ orderId: order.id, amount: order.paid })), documents: [],
  }
}
export function ensureCommerce(data: Data): Data { return data.commerce ? data : { ...data, commerce: getCommerce(data) } }

export const emptyTrust = (): TrustSettings => ({ certifications: [], clients: [], stats: [], equipment: [], caseStudies: [] })
export const getTrust = (site: WebsiteSettings): TrustSettings => site.trust ?? emptyTrust()

export function getWebsiteSettings(profile: PublicProfile): WebsiteSettings {
  return profile.site ?? { logo: { src: '', alt: '' }, brandColor: '#167363', heroEyebrow: 'ĐỐI TÁC GIA CÔNG CƠ KHÍ', heroImageAlt: '', aboutTitle: 'Về chúng tôi', aboutText: '', aboutImage: { src: '', alt: '' }, galleryTitle: 'Hình ảnh công việc', gallery: [], businessHours: '', zaloUrl: '', mapUrl: '', sections: { about: true, capabilities: true, products: true, gallery: true, process: true, contact: true } }
}

/** URL inputs contain no secrets; relative media paths point to site assets. */
export function safePublicUrl(value: unknown, media = false): value is string {
  if (!text(value, 1000)) return false
  if (value === '') return true
  if (media && /^media:[a-f0-9]{64}$/.test(value)) return true
  if (media && /^(?:\.?\/)?(?:assets|images)\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('..')) return true
  if (!/^https:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/.test(value)) return false
  return !/[<>"'\\]/.test(value)
}
function validCompany(value: unknown): value is CompanyProfile {
  return obj(value) && companyKeys.every(key => text(value[key])) && safePublicUrl(value.website)
}
function validProfile(value: unknown, published = false): value is PublicProfile {
  return obj(value) && profileKeys.every(key => text(value[key], key === 'description' ? 4000 : 1000)) && (!published || required(value.name)) && safePublicUrl(value.website) && safePublicUrl(value.heroImage, true) && Array.isArray(value.capabilities) && value.capabilities.length <= 20 && value.capabilities.every(item => required(item, 300)) && (value.site === undefined || validWebsite(value.site))
}
function validProduct(value: unknown, publicOnly = false): value is CatalogProduct {
  return obj(value) && productKeys.every(key => text(value[key], key === 'specification' ? 3000 : 1000)) && required(value.id) && required(value.name) && safePublicUrl(value.imageUrl, true) && typeof value.featured === 'boolean' && (publicOnly || typeof value.published === 'boolean') && (value.images === undefined || Array.isArray(value.images) && value.images.length <= 6 && value.images.every(validImage))
}
const onlyKeys = (item: object, allowed: readonly string[]) => Object.keys(item).every(key => allowed.includes(key))
function validImage(value: unknown): value is WebsiteImage {
  return obj(value) && onlyKeys(value, ['src', 'alt']) && safePublicUrl(value.src, true) && text(value.alt, 300)
}
function validTrust(value: unknown): value is TrustSettings {
  const list = (items: unknown, max: number, length: number) => Array.isArray(items) && items.length <= max && items.every(item => required(item, length))
  if (!obj(value) || !onlyKeys(value, ['certifications', 'clients', 'stats', 'equipment', 'caseStudies'])) return false
  if (!list(value.certifications, 8, 120) || !list(value.clients, 16, 120) || !list(value.equipment, 16, 200)) return false
  if (!Array.isArray(value.stats) || value.stats.length > 4 || !value.stats.every(item => obj(item) && onlyKeys(item, ['id', 'value', 'label', 'note']) && required(item.id) && required(item.value, 30) && required(item.label, 120) && text(item.note, 300)) || new Set(value.stats.map(item => item.id)).size !== value.stats.length) return false
  return Array.isArray(value.caseStudies) && value.caseStudies.length <= 6 && value.caseStudies.every(item => obj(item) && onlyKeys(item, ['id', 'title', 'challenge', 'solution', 'result', 'image']) && required(item.id) && required(item.title, 200) && text(item.challenge, 800) && text(item.solution, 800) && text(item.result, 800) && validImage(item.image)) && new Set(value.caseStudies.map(item => item.id)).size === value.caseStudies.length
}
function validWebsite(value: unknown): value is WebsiteSettings {
  if (!obj(value) || !onlyKeys(value, ['logo', 'brandColor', 'heroEyebrow', 'heroImageAlt', 'aboutTitle', 'aboutText', 'aboutImage', 'galleryTitle', 'gallery', 'businessHours', 'zaloUrl', 'mapUrl', 'trust', 'sections'])) return false
  if (value.trust !== undefined && !validTrust(value.trust)) return false
  if (!validImage(value.logo) || !validImage(value.aboutImage) || typeof value.brandColor !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value.brandColor)) return false
  if (!['heroEyebrow', 'heroImageAlt', 'aboutTitle', 'galleryTitle', 'businessHours'].every(key => text(value[key], 300)) || !text(value.aboutText, 6000) || !safePublicUrl(value.zaloUrl) || !safePublicUrl(value.mapUrl)) return false
  if (!Array.isArray(value.gallery) || value.gallery.length > 12 || !value.gallery.every(item => obj(item) && onlyKeys(item, ['id', 'title', 'description', 'image']) && required(item.id) && text(item.title, 200) && text(item.description, 1000) && validImage(item.image)) || new Set(value.gallery.map(item => item.id)).size !== value.gallery.length) return false
  return obj(value.sections) && onlyKeys(value.sections, ['about', 'capabilities', 'products', 'gallery', 'process', 'contact']) && ['about', 'capabilities', 'products', 'gallery', 'process', 'contact'].every(key => typeof (value.sections as Record<string, unknown>)[key] === 'boolean')
}
function validDocument(value: unknown): value is SalesDocument {
  if (!obj(value) || !required(value.id) || !required(value.number) || !kinds.includes(value.kind as DocumentKind) || !required(value.orderId) || !date(value.date) || !timestamp(value.createdAt)) return false
  if (!validCompany(value.company) || !required(value.company.name) || !obj(value.customer) || !required(value.customer.id) || !required(value.customer.name) || !['contact', 'phone', 'email', 'address'].every(key => text((value.customer as Record<string, unknown>)[key]))) return false
  const line = value.order
  if (!obj(line) || !required(line.code) || !required(line.partName) || !integer(line.quantity) || line.quantity < 1 || !money(line.unitPrice) || !Number.isSafeInteger(line.quantity * line.unitPrice) || !text(line.material) || !text(line.drawing) || !date(line.dueDate)) return false
  if (![value.amount, value.paidAtIssue, value.balanceAtIssue].every(money) || !integer(value.deliveryQuantity)) return false
  const total = line.quantity * line.unitPrice
  if (!equalMoney(Number(value.paidAtIssue) + Number(value.balanceAtIssue), total)) return false
  if (!text(value.terms, 4000) || !text(value.note, 4000) || !text(value.reference, 300) || !methods.includes(value.method as PaymentMethod)) return false
  if (value.status !== 'issued' && value.status !== 'void') return false
  if (value.status === 'issued' ? value.voidedAt !== '' || value.voidReason !== '' : !timestamp(value.voidedAt) || !required(value.voidReason, 1000)) return false
  if (value.kind === 'receipt' || value.kind === 'payment_request') {
    if (!integer(value.amount) || value.amount <= 0 || value.amount > Number(value.balanceAtIssue)) return false
  } else if (value.amount !== (value.kind === 'quotation' ? total : 0)) return false
  return value.kind === 'delivery' ? value.deliveryQuantity > 0 && value.deliveryQuantity <= line.quantity : value.deliveryQuantity === 0
}

export function validateCommerce(value: unknown, orders: Order[]): value is CommerceData {
  if (!obj(value) || value.version !== 1 || !validCompany(value.company) || !validProfile(value.publicProfile)) return false
  if (!Array.isArray(value.products) || value.products.length > 100 || !value.products.every(product => validProduct(product)) || new Set(value.products.map(product => product.id)).size !== value.products.length) return false
  if (!Array.isArray(value.documents) || value.documents.length > 2000 || !value.documents.every(validDocument) || new Set(value.documents.map(doc => doc.id)).size !== value.documents.length || new Set(value.documents.map(doc => doc.number)).size !== value.documents.length) return false
  if (!Array.isArray(value.openingPaid) || value.openingPaid.length > 50000) return false
  const orderMap = new Map(orders.map(order => [order.id, order]))
  const paid = new Map<string, number>(), delivered = new Map<string, number>()
  for (const opening of value.openingPaid) {
    if (!obj(opening) || !required(opening.orderId) || !orderMap.has(opening.orderId) || !money(opening.amount) || opening.amount <= 0 || paid.has(opening.orderId)) return false
    paid.set(opening.orderId, opening.amount)
  }
  for (const doc of value.documents) {
    if (!orderMap.has(doc.orderId)) return false
    if (doc.status === 'void') continue
    if (doc.kind === 'receipt') paid.set(doc.orderId, (paid.get(doc.orderId) ?? 0) + doc.amount)
    if (doc.kind === 'delivery') delivered.set(doc.orderId, (delivered.get(doc.orderId) ?? 0) + doc.deliveryQuantity)
  }
  return orders.every(order => equalMoney(order.paid, paid.get(order.id) ?? 0) && (delivered.get(order.id) ?? 0) <= order.quantity)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (obj(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return JSON.stringify(value)
}
/** Older clients/backups must never erase issued records or rewrite opening cash. */
export function validateCommerceTransition(previous: Data | null, next: Data): boolean {
  if (!previous?.commerce) {
    if (!next.commerce || !previous) return true
    const opening = new Map(next.commerce.openingPaid.map(item => [item.orderId, item.amount]))
    return opening.size === previous.orders.filter(order => order.paid > 0).length && previous.orders.every(order => (opening.get(order.id) ?? 0) === order.paid)
  }
  if (!next.commerce || canonical(previous.commerce.openingPaid) !== canonical(next.commerce.openingPaid)) return false
  const nextDocuments = new Map(next.commerce.documents.map(doc => [doc.id, doc]))
  for (const old of previous.commerce.documents) {
    const current = nextDocuments.get(old.id)
    if (!current) return false
    if (canonical(old) === canonical(current)) continue
    if (old.status !== 'issued' || current.status !== 'void' || !required(current.voidReason, 1000) || !timestamp(current.voidedAt)) return false
    if (canonical({ ...current, status: old.status, voidedAt: old.voidedAt, voidReason: old.voidReason }) !== canonical(old)) return false
  }
  return true
}

export function issueDocument(data: Data, input: IssueDocumentInput): Data {
  const commerce = getCommerce(data), order = data.orders.find(item => item.id === input.orderId)
  const customer = order && data.customers.find(item => item.id === order.customerId)
  if (!order || !customer) throw new Error('Không tìm thấy đơn hàng hoặc khách hàng.')
  if (!kinds.includes(input.kind) || !date(input.date)) throw new Error('Loại chứng từ hoặc ngày lập không hợp lệ.')
  if (!required(commerce.company.name)) throw new Error('Hãy nhập tên doanh nghiệp trong hồ sơ trước khi lập chứng từ.')
  const total = order.quantity * order.unitPrice, balance = total - order.paid
  const prefix = `${prefixes[input.kind]}-${input.date.slice(0, 4)}-`
  const nextNumber = Math.max(0, ...commerce.documents.filter(doc => doc.number.startsWith(prefix)).map(doc => Number(doc.number.slice(prefix.length)) || 0)) + 1
  const document: SalesDocument = {
    id: newId(), number: prefix + String(nextNumber).padStart(4, '0'), kind: input.kind, orderId: order.id,
    date: input.date, createdAt: new Date().toISOString(), company: { ...commerce.company }, customer: { ...customer },
    order: { code: order.code, partName: order.partName, quantity: order.quantity, unitPrice: order.unitPrice, material: order.material, drawing: order.drawing, dueDate: order.dueDate },
    amount: input.kind === 'quotation' ? total : input.kind === 'delivery' ? 0 : input.amount ?? (input.kind === 'payment_request' ? balance : NaN),
    paidAtIssue: order.paid, balanceAtIssue: balance, deliveryQuantity: input.kind === 'delivery' ? input.deliveryQuantity ?? order.quantity : 0,
    terms: input.terms?.trim() ?? '', note: input.note?.trim() ?? '', method: input.method ?? 'bank', reference: input.reference?.trim() ?? '', status: 'issued', voidedAt: '', voidReason: '',
  }
  if (!validDocument(document)) throw new Error('Kiểm tra số tiền, số lượng giao và thông tin chứng từ; không thu vượt công nợ.')
  const next: Data = { ...data, orders: input.kind === 'receipt' ? data.orders.map(item => item.id === order.id ? { ...item, paid: item.paid + document.amount } : item) : data.orders, commerce: { ...commerce, documents: [...commerce.documents, document] } }
  if (!validateCommerce(next.commerce, next.orders)) throw new Error('Số tiền hoặc tổng số lượng giao vượt giới hạn của đơn hàng.')
  return next
}
export function voidDocument(data: Data, id: string, reason: string): Data {
  const commerce = getCommerce(data), document = commerce.documents.find(item => item.id === id)
  if (!document || document.status !== 'issued' || !required(reason.trim(), 1000)) throw new Error('Chọn chứng từ còn hiệu lực và nhập lý do hủy.')
  const next: Data = { ...data, orders: document.kind === 'receipt' ? data.orders.map(order => order.id === document.orderId ? { ...order, paid: order.paid - document.amount } : order) : data.orders, commerce: { ...commerce, documents: commerce.documents.map(item => item.id === id ? { ...item, status: 'void', voidedAt: new Date().toISOString(), voidReason: reason.trim() } : item) } }
  if (!validateCommerce(next.commerce, next.orders)) throw new Error('Không thể đối soát số tiền sau khi hủy phiếu thu.')
  return next
}

/** Explicit allowlists only: never spread private company/product/source objects. */
export function buildPublicCatalog(data: Data, publishedAt = new Date().toISOString()): PublicCatalog {
  const draft = getCommerce(data), source = draft.publicProfile
  const profile: PublicProfile = { name: source.name, tagline: source.tagline, description: source.description, address: source.address, phone: source.phone, email: source.email, website: source.website, heroImage: source.heroImage, capabilities: source.capabilities.map(item => item) }
  const image = (item: WebsiteImage): WebsiteImage => ({ src: item.src, alt: item.alt })
  if (source.site) {
    const site = source.site
    profile.site = { logo: image(site.logo), brandColor: site.brandColor, heroEyebrow: site.heroEyebrow, heroImageAlt: site.heroImageAlt, aboutTitle: site.aboutTitle, aboutText: site.aboutText, aboutImage: image(site.aboutImage), galleryTitle: site.galleryTitle, gallery: site.gallery.map(item => ({ id: item.id, title: item.title, description: item.description, image: image(item.image) })), businessHours: site.businessHours, zaloUrl: site.zaloUrl, mapUrl: site.mapUrl, ...(site.trust ? { trust: { certifications: [...site.trust.certifications], clients: [...site.trust.clients], stats: site.trust.stats.map(item => ({ id: item.id, value: item.value, label: item.label, note: item.note })), equipment: [...site.trust.equipment], caseStudies: site.trust.caseStudies.map(item => ({ id: item.id, title: item.title, challenge: item.challenge, solution: item.solution, result: item.result, image: image(item.image) })) } } : {}), sections: { about: site.sections.about, capabilities: site.sections.capabilities, products: site.sections.products, gallery: site.sections.gallery, process: site.sections.process, contact: site.sections.contact } }
  }
  const products: PublicProduct[] = draft.products.filter(item => item.published).map(item => ({ id: item.id, name: item.name, category: item.category, summary: item.summary, specification: item.specification, material: item.material, unit: item.unit, imageUrl: item.imageUrl, priceLabel: item.priceLabel, featured: item.featured, ...(item.images ? { images: item.images.map(image) } : {}) }))
  if (profile.site) {
    const site = profile.site
    if (!site.sections.about) { site.aboutTitle = ''; site.aboutText = ''; site.aboutImage = { src: '', alt: '' } }
    if (!site.sections.gallery) { site.galleryTitle = ''; site.gallery = [] }
    if (!site.sections.capabilities) profile.capabilities = []
    if (!site.sections.products) products.length = 0
    if (!site.sections.contact) { profile.address = ''; profile.phone = ''; profile.email = ''; profile.website = ''; site.businessHours = ''; site.zaloUrl = ''; site.mapUrl = '' }
  }
  const result: PublicCatalog = { version: 1, publishedAt, profile, products }
  if (!validatePublicCatalog(result)) throw new Error('Nhập tên doanh nghiệp và kiểm tra nội dung công khai trước khi xuất bản.')
  return result
}
export function validatePublicCatalog(value: unknown): value is PublicCatalog {
  const keys = (item: object, allowed: readonly string[]) => Object.keys(item).every(key => allowed.includes(key))
  return obj(value) && keys(value, ['version', 'publishedAt', 'profile', 'products']) && value.version === 1 && timestamp(value.publishedAt) && validProfile(value.profile, true) && keys(value.profile as unknown as Record<string, unknown>, [...profileKeys, 'capabilities', 'site']) && Array.isArray(value.products) && value.products.length <= 100 && value.products.every(product => validProduct(product, true) && keys(product, [...productKeys, 'featured', 'images'])) && new Set(value.products.map(product => product.id)).size === value.products.length
}
