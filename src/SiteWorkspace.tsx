import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Eye, Globe, Plus, Save, X } from 'lucide-react'
import type { Data } from './domain'
import { newId } from './domain'
import { buildPublicCatalog, getCommerce, type CatalogProduct, type PublicProfile } from './commerce'
import { companyManaged, getCompanyToken } from './company-config'
import { readSheetsCheckpoint, snapshotDigest } from './sheets-sync'
import { publishPublicCatalog } from './public-catalog'
import './site-workspace.css'
const PublicSite = lazy(() => import('./PublicSite'))
const blankProduct = (): CatalogProduct => ({ id: newId(), name: '', category: '', summary: '', specification: '', material: '', unit: '', imageUrl: '', priceLabel: 'Liên hệ báo giá', published: false, featured: false })
const profileFields: { key: Exclude<keyof PublicProfile, 'capabilities' | 'description'>; label: string; type?: string }[] = [
  { key: 'name', label: 'Tên công ty công khai' }, { key: 'tagline', label: 'Tiêu đề giới thiệu' }, { key: 'phone', label: 'Điện thoại công khai', type: 'tel' }, { key: 'email', label: 'Email nhận yêu cầu báo giá', type: 'email' }, { key: 'address', label: 'Địa chỉ công khai' }, { key: 'website', label: 'Website doanh nghiệp (https://)', type: 'url' }, { key: 'heroImage', label: 'URL ảnh giới thiệu (https://)' },
]
export default function SiteWorkspace({ data, onCommit, onDirtyChange }: { data: Data; onCommit: (next: Data, message: string) => boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const [profile, setProfile] = useState<PublicProfile>(() => structuredClone(getCommerce(data).publicProfile))
  const [products, setProducts] = useState<CatalogProduct[]>(() => structuredClone(getCommerce(data).products))
  const [capabilities, setCapabilities] = useState(() => getCommerce(data).publicProfile.capabilities.join('\n'))
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [preview, setPreview] = useState(false)
  const [editing, setEditing] = useState<CatalogProduct | null>(null)
  const mounted = useRef(true)
  const dirtyCallback = useRef(onDirtyChange); dirtyCallback.current = onDirtyChange
  useEffect(() => { dirtyCallback.current?.(dirty || Boolean(editing)) }, [dirty, editing])
  useEffect(() => () => { dirtyCallback.current?.(false) }, [])
  const currentData = useRef(data); currentData.current = data
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (!dirty && !editing) { const c = getCommerce(data); setProfile(structuredClone(c.publicProfile)); setProducts(structuredClone(c.products)); setCapabilities(c.publicProfile.capabilities.join('\n')) } }, [data, dirty, editing])
  const draft = (): Data => ({ ...data, commerce: { ...getCommerce(data), publicProfile: { ...profile, capabilities: capabilities.split('\n').map(s => s.trim()).filter(Boolean) }, products } })
  function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (onCommit(draft(), 'Đã lưu bản nháp website')) { setDirty(false); setMessage('Đã lưu bản nháp. Chờ đồng bộ rồi bấm Xuất bản để khách thấy nội dung mới.') }
    else setError('Chưa lưu được. Kiểm tra đường dẫn ảnh/website HTTPS và giới hạn nội dung.')
  }
  async function publish() {
    setError(''); setMessage('')
    if (dirty || editing) { setError('Hãy lưu bản nháp trước khi xuất bản.'); return }
    if (!companyManaged) { setError('Chế độ cục bộ hỗ trợ xem trước. Xuất bản cần bản công ty đã kết nối Google Sheets.'); return }
    const dataAtStart = data
    setBusy(true)
    try {
      buildPublicCatalog(dataAtStart)
      const digest = await snapshotDigest(JSON.stringify(dataAtStart))
      const checkpoint = readSheetsCheckpoint()
      if (!mounted.current) return
      if (currentData.current !== dataAtStart || !checkpoint || checkpoint.pending || checkpoint.baseline !== digest || !checkpoint.revision) throw new Error('Hãy chờ trạng thái “Đã đồng bộ” rồi xuất bản. Nội dung trên thiết bị phải khớp bản đã lưu trên Google.')
      const date = await publishPublicCatalog(getCompanyToken(), checkpoint.revision)
      if (mounted.current) setMessage(`Đã xuất bản lúc ${new Date(date).toLocaleString('vi-VN')}. Mở trang công khai để xem.`)
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa xuất bản được.') }
    finally { if (mounted.current) setBusy(false) }
  }
  let previewCatalog
  try { if (preview) previewCatalog = buildPublicCatalog(draft()) } catch { /* An inline message below describes missing draft data. */ }
  return <div className="site-workspace">
    <div className="site-publish-bar"><div><Globe size={25} /><p><strong>Nội dung công khai do bạn chọn</strong><span>Lưu bản nháp trước. Chỉ nút Xuất bản mới thay đổi nội dung khách đang xem.</span></p></div><a href="#home" target="_blank" rel="noreferrer" className="button secondary">Mở trang công khai <ArrowUpRight size={16} /></a></div>
    {error && <div className="notice" role="alert">{error}</div>}{message && <p role="status" className="site-message">{message}</p>}
    <form onSubmit={save} onChange={() => setDirty(true)} className="site-editor">
      <section className="card site-section"><div className="card-header"><div><h2>Giới thiệu doanh nghiệp</h2><p>Chỉ điền thông tin doanh nghiệp đồng ý hiển thị cho khách truy cập.</p></div></div><div className="site-fields">{profileFields.map(field => <label key={field.key}><span>{field.label}{field.key === 'name' ? ' *' : ''}</span><input type={field.type || 'text'} required={field.key === 'name'} maxLength={1000} value={profile[field.key]} onChange={e => setProfile(value => ({ ...value, [field.key]: e.target.value }))} /></label>)}<label className="wide"><span>Mô tả doanh nghiệp</span><textarea rows={4} maxLength={4000} value={profile.description} onChange={e => setProfile(value => ({ ...value, description: e.target.value }))} /></label><label className="wide"><span>Năng lực gia công (mỗi dòng một mục)</span><textarea rows={4} value={capabilities} maxLength={6000} onChange={e => setCapabilities(e.target.value)} placeholder="Tiện CNC&#10;Phay CNC&#10;Gia công theo bản vẽ" /></label></div></section>
      <section className="card site-section"><div className="card-header"><div><h2>Sản phẩm & dịch vụ ({products.length})</h2><p>Sản phẩm được chọn hiển thị sẽ xuất hiện sau lần xuất bản tiếp theo.</p></div><button type="button" className="button secondary" disabled={products.length >= 100 || busy} onClick={() => setEditing(blankProduct())}><Plus size={16} />Thêm sản phẩm</button></div><div className="site-product-list">{products.map(product => <article key={product.id}><div className="site-product-symbol"><Globe size={22} /></div><div><strong>{product.name}</strong><p>{product.category || 'Chưa phân nhóm'} · {product.published ? 'Sẽ hiển thị khi xuất bản' : 'Đang ẩn'}</p></div><button type="button" className="button secondary small-button" onClick={() => setEditing({ ...product })} disabled={busy}>Sửa {product.name}</button></article>)}{products.length === 0 && <p className="site-empty">Chưa có sản phẩm. Thêm sản phẩm hoặc dịch vụ gia công để khách tìm hiểu.</p>}</div></section>
      <div className="site-editor-actions"><button type="submit" className="button primary" disabled={busy}><Save size={16} />Lưu bản nháp website</button><button type="button" className="button secondary" disabled={busy} onClick={() => setPreview(!preview)}><Eye size={16} />{preview ? 'Đóng xem trước' : 'Xem trước bản nháp'}</button><button type="button" className="button primary" disabled={busy} onClick={() => { void publish() }}><Check size={16} />{busy ? 'Đang xuất bản…' : 'Xuất bản website'}</button>{dirty && <span>Chưa lưu bản nháp</span>}</div>
      <p className="site-help">Thông tin ngân hàng, nhân sự, khách hàng và công nợ không tự xuất hiện trên website. Chỉ dùng ảnh được phép công khai; ảnh ngoài được tải từ địa chỉ bạn cung cấp. Pages hiện dùng cho demo; vận hành bán hàng thật cần hosting phù hợp.</p>
    </form>
    {preview && <section className="site-preview" aria-label="Xem trước website" onClickCapture={event => {
      const link = (event.target as HTMLElement).closest('a[href^="#"]')
      if (!link) return
      event.preventDefault()
      const destination = link.getAttribute('href')
      const selector = destination === '#products' ? '#pub-products' : destination === '#contact' ? '#pub-contact' : '.pub-nav'
      event.currentTarget.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' })
    }}>{previewCatalog ? <Suspense fallback={<p>Đang mở xem trước…</p>}><PublicSite preview={previewCatalog} /></Suspense> : <p role="alert">Nhập tên công ty và kiểm tra thông tin trước khi xem trước.</p>}</section>}
    {editing && <ProductEditor product={editing} onCancel={() => setEditing(null)} onSave={product => { setProducts(items => items.some(item => item.id === product.id) ? items.map(item => item.id === product.id ? product : item) : [...items, product]); setDirty(true); setEditing(null); setError('') }} />}
  </div>
}

function ProductEditor({ product, onSave, onCancel }: { product: CatalogProduct; onSave: (product: CatalogProduct) => void; onCancel: () => void }) {
  const [value, setValue] = useState(product)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
  const fields: { key: 'name' | 'category' | 'material' | 'unit' | 'priceLabel' | 'imageUrl'; label: string }[] = [{ key: 'name', label: 'Tên sản phẩm / dịch vụ' }, { key: 'category', label: 'Nhóm sản phẩm' }, { key: 'material', label: 'Vật liệu' }, { key: 'unit', label: 'Đơn vị' }, { key: 'priceLabel', label: 'Thông tin giá hiển thị' }, { key: 'imageUrl', label: 'URL ảnh sản phẩm (https://)' }]
  return <dialog ref={ref} className="modal site-product-dialog" onCancel={onCancel} aria-labelledby="site-product-title"><div className="modal-head"><h2 id="site-product-title">Sản phẩm giới thiệu</h2><button type="button" className="icon-button" onClick={onCancel} aria-label="Đóng sản phẩm"><X size={20} /></button></div><form onSubmit={event => { event.preventDefault(); onSave(value) }}><div className="modal-body site-fields">{fields.map(field => <label key={field.key}><span>{field.label}{field.key === 'name' ? ' *' : ''}</span><input required={field.key === 'name'} maxLength={1000} value={value[field.key]} onChange={e => setValue(item => ({ ...item, [field.key]: e.target.value }))} /></label>)}<label className="wide"><span>Mô tả ngắn</span><textarea rows={2} maxLength={1000} value={value.summary} onChange={e => setValue(item => ({ ...item, summary: e.target.value }))} /></label><label className="wide"><span>Thông số kỹ thuật</span><textarea rows={3} maxLength={3000} value={value.specification} onChange={e => setValue(item => ({ ...item, specification: e.target.value }))} /></label><label className="site-check"><input type="checkbox" checked={value.published} onChange={e => setValue(item => ({ ...item, published: e.target.checked }))} /><span>Hiển thị trên website</span></label><label className="site-check"><input type="checkbox" checked={value.featured} onChange={e => setValue(item => ({ ...item, featured: e.target.checked }))} /><span>Sản phẩm nổi bật</span></label></div><div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Hủy</button><button type="submit" className="button primary">Lưu sản phẩm vào bản nháp</button></div></form></dialog>
}
