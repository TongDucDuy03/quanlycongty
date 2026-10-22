import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Copy, Eye, Globe, Image, Plus, Save, Trash2, X } from 'lucide-react'
import type { Data } from './domain'
import { newId } from './domain'
import { buildPublicCatalog, getCommerce, getWebsiteSettings, type CatalogProduct, type PublicProfile, type WebsiteSettings, type WebsiteImage, type ShowcaseItem } from './commerce'
import { companyManaged, getCompanyToken } from './company-config'
import { readSheetsCheckpoint, snapshotDigest } from './sheets-sync'
import { publishPublicCatalog } from './public-catalog'
import { deleteMedia, listMedia, type MediaAsset, type MediaUsage } from './media'
import ImagePicker from './ImagePicker'
import SiteImage from './SiteImage'
import './site-workspace.css'
const PublicSite = lazy(() => import('./PublicSite'))
const blankProduct = (): CatalogProduct => ({ id: newId(), name: '', category: '', summary: '', specification: '', material: '', unit: '', imageUrl: '', priceLabel: 'Liên hệ báo giá', published: false, featured: false })
const navigation = [['identity', 'Nhận diện'], ['hero', 'Trang đầu'], ['about', 'Giới thiệu'], ['products', 'Sản phẩm'], ['gallery', 'Hình ảnh công việc'], ['contact', 'Liên hệ']] as const
const sectionNames: Record<keyof WebsiteSettings['sections'], string> = { about: 'Giới thiệu doanh nghiệp', capabilities: 'Năng lực gia công', products: 'Sản phẩm & dịch vụ', gallery: 'Hình ảnh công việc', process: 'Quy trình làm việc', contact: 'Liên hệ báo giá' }
const shift = <T,>(items: T[], index: number, by: number) => { const next = [...items]; const target = index + by; if (target >= 0 && target < items.length) [next[index], next[target]] = [next[target], next[index]]; return next }
function Section({ id, title, help, children }: { id: string; title: string; help: string; children: React.ReactNode }) { return <section id={`cms-${id}`} className="card site-section"><div className="card-header"><div><h2>{title}</h2><p>{help}</p></div></div>{children}</section> }
function TextField({ label, value, onChange, required, multiline, max = 1000, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; multiline?: boolean; max?: number; type?: string }) { return <label className={multiline ? 'wide' : ''}><span>{label}{required ? ' *' : ''}</span>{multiline ? <textarea rows={4} value={value} onChange={event => onChange(event.target.value)} maxLength={max} /> : <input type={type} value={value} onChange={event => onChange(event.target.value)} required={required} maxLength={max} />}</label> }

export default function SiteWorkspace({ data, onCommit, onDirtyChange }: { data: Data; onCommit: (next: Data, message: string) => boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const [profile, setProfile] = useState<PublicProfile>(() => structuredClone(getCommerce(data).publicProfile))
  const [settings, setSettings] = useState(() => structuredClone(getWebsiteSettings(getCommerce(data).publicProfile)))
  const [products, setProducts] = useState<CatalogProduct[]>(() => structuredClone(getCommerce(data).products))
  const [capabilities, setCapabilities] = useState(() => getCommerce(data).publicProfile.capabilities.join('\n'))
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [preview, setPreview] = useState(false)
  const [editing, setEditing] = useState<CatalogProduct | null>(null), [showLibrary, setShowLibrary] = useState(false)
  const [uploads, setUploads] = useState<Record<string, boolean>>({})
  const uploading = Object.values(uploads).some(Boolean)
  const mounted = useRef(true), dirtyRef = useRef(dirty); dirtyRef.current = dirty
  const dirtyCallback = useRef(onDirtyChange); dirtyCallback.current = onDirtyChange
  useEffect(() => { dirtyCallback.current?.(dirty || uploading || Boolean(editing)) }, [dirty, uploading, editing])
  useEffect(() => () => { dirtyCallback.current?.(false) }, [])
  const currentData = useRef(data); currentData.current = data
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (!dirty && !editing && !uploading) { const c = getCommerce(data); setProfile(structuredClone(c.publicProfile)); setSettings(structuredClone(getWebsiteSettings(c.publicProfile))); setProducts(structuredClone(c.products)); setCapabilities(c.publicProfile.capabilities.join('\n')) } }, [data, dirty, editing, uploading])
  const changed = () => { setDirty(true); setMessage('') }
  const changeProfile = <K extends keyof PublicProfile>(key: K, value: PublicProfile[K]) => { setProfile(previous => ({ ...previous, [key]: value })); changed() }
  const changeSetting = <K extends keyof WebsiteSettings>(key: K, value: WebsiteSettings[K]) => { setSettings(previous => ({ ...previous, [key]: value })); changed() }
  const imageBusy = (key: string, value: boolean) => setUploads(previous => previous[key] === value ? previous : { ...previous, [key]: value })
  const draft = (): Data => ({ ...data, commerce: { ...getCommerce(data), publicProfile: { ...profile, site: settings, capabilities: capabilities.split('\n').map(s => s.trim()).filter(Boolean) }, products } })
  function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (uploading) { setError('Chờ ảnh tải xong trước khi lưu bản nháp.'); return }
    if (onCommit(draft(), 'Đã lưu bản nháp website')) { setDirty(false); setMessage('Đã lưu bản nháp. Chờ đồng bộ rồi bấm Xuất bản để khách thấy nội dung mới.') }
    else setError('Chưa lưu được. Kiểm tra đường dẫn HTTPS, tên sản phẩm và giới hạn nội dung.')
  }
  async function publish() {
    setError(''); setMessage('')
    if (dirty || editing || uploading) { setError('Hãy lưu bản nháp và chờ tải ảnh xong trước khi xuất bản.'); return }
    if (!companyManaged) { setError('Chế độ cục bộ hỗ trợ xem trước. Xuất bản cần bản công ty đã kết nối Google Sheets.'); return }
    const dataAtStart = data
    setBusy(true)
    try {
      buildPublicCatalog(dataAtStart)
      const digest = await snapshotDigest(JSON.stringify(dataAtStart)), checkpoint = readSheetsCheckpoint()
      if (!mounted.current) return
      if (dirtyRef.current || currentData.current !== dataAtStart || !checkpoint || checkpoint.pending || checkpoint.baseline !== digest || !checkpoint.revision) throw new Error('Hãy chờ trạng thái “Đã đồng bộ” rồi xuất bản. Nội dung trên thiết bị phải khớp bản đã lưu trên Google.')
      const date = await publishPublicCatalog(getCompanyToken(), checkpoint.revision)
      if (mounted.current) setMessage(`Đã xuất bản lúc ${new Date(date).toLocaleString('vi-VN')}. Khách mở website sẽ thấy nội dung mới.`)
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa xuất bản được.') }
    finally { if (mounted.current) setBusy(false) }
  }
  function updateProduct(product: CatalogProduct) { setProducts(items => items.some(item => item.id === product.id) ? items.map(item => item.id === product.id ? product : item) : [...items, product]); changed(); setEditing(null); setError('') }
  function updateGallery(id: string, patch: Partial<ShowcaseItem>) { changeSetting('gallery', settings.gallery.map(item => item.id === id ? { ...item, ...patch } : item)) }
  let previewCatalog
  try { if (preview) previewCatalog = buildPublicCatalog(draft()) } catch { /* Missing draft details shown below. */ }
  return <div className="site-workspace">
    <div className="site-publish-bar"><div><Globe size={25} /><p><strong>Website của bạn, nội dung do bạn cập nhật</strong><span>Thêm ảnh, sửa sản phẩm và giới thiệu. Lưu bản nháp, xem trước rồi xuất bản khi sẵn sàng.</span></p></div><a href="#home" target="_blank" rel="noreferrer" className="button secondary">Mở trang công khai <ArrowUpRight size={16} /></a></div>
    <nav className="site-section-nav" aria-label="Các phần nội dung website">{navigation.map(([id, label]) => <button key={id} type="button" onClick={() => document.getElementById(`cms-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{label}</button>)}<button type="button" onClick={() => setShowLibrary(!showLibrary)}><Image size={15} />Thư viện ảnh</button></nav>
    {error && <div className="notice" role="alert">{error}</div>}{message && <p role="status" className="site-message">{message}</p>}
    {showLibrary && <MediaLibrary usedDraft={draft()} />}
    <form onSubmit={save} className="site-editor">
      <fieldset disabled={busy} className="site-editor-fieldset">
      <Section id="identity" title="Nhận diện doanh nghiệp" help="Logo và màu chủ đạo giúp khách nhận ra thương hiệu của bạn."><div className="site-fields">
        <TextField label="Tên công ty công khai" required value={profile.name} onChange={value => changeProfile('name', value)} max={200} />
        <label><span>Màu chủ đạo</span><div className="site-color-picker"><input aria-label="Màu chủ đạo" type="color" value={settings.brandColor} onChange={event => changeSetting('brandColor', event.target.value)} /><code>{settings.brandColor}</code>{[['#167363', 'Xanh lá'], ['#24446b', 'Xanh đậm'], ['#a85c13', 'Nâu cam']].map(([color, name]) => <button type="button" key={color} aria-label={`Màu ${name}`} style={{ background: color }} onClick={() => changeSetting('brandColor', color)} />)}</div></label>
        <div className="wide"><ImagePicker label="Logo doanh nghiệp" value={settings.logo.src} onChange={src => changeSetting('logo', { ...settings.logo, src })} onBusyChange={value => imageBusy('logo', value)} /></div>
      </div></Section>
      <Section id="hero" title="Trang đầu & ảnh bìa" help="Một tiêu đề ngắn và ảnh xưởng hoặc sản phẩm rõ nét tạo ấn tượng đầu tiên."><div className="site-fields">
        <TextField label="Dòng giới thiệu ngắn trên tiêu đề" value={settings.heroEyebrow} onChange={value => changeSetting('heroEyebrow', value)} max={200} />
        <TextField label="Tiêu đề giới thiệu" value={profile.tagline} onChange={value => changeProfile('tagline', value)} max={300} />
        <TextField label="Mô tả doanh nghiệp" multiline max={4000} value={profile.description} onChange={value => changeProfile('description', value)} />
        <div className="wide"><ImagePicker label="Ảnh bìa" value={profile.heroImage} onChange={src => changeProfile('heroImage', src)} onBusyChange={value => imageBusy('hero', value)} /></div>
        <TextField label="Mô tả ảnh bìa" value={settings.heroImageAlt} onChange={value => changeSetting('heroImageAlt', value)} max={300} />
      </div></Section>
      <Section id="about" title="Giới thiệu & năng lực" help="Giới thiệu công việc bạn nhận gia công, thiết bị và cách làm việc bằng thông tin thực tế."><div className="site-fields">
        <TextField label="Tiêu đề phần giới thiệu" value={settings.aboutTitle} onChange={value => changeSetting('aboutTitle', value)} max={200} />
        <TextField label="Bài giới thiệu công ty" multiline max={6000} value={settings.aboutText} onChange={value => changeSetting('aboutText', value)} />
        <div className="wide"><ImagePicker label="Ảnh giới thiệu" value={settings.aboutImage.src} onChange={src => changeSetting('aboutImage', { ...settings.aboutImage, src })} onBusyChange={value => imageBusy('about', value)} /></div>
        <TextField label="Chú thích ảnh giới thiệu" value={settings.aboutImage.alt} onChange={alt => changeSetting('aboutImage', { ...settings.aboutImage, alt })} max={300} />
        <TextField label="Năng lực gia công (mỗi dòng một mục)" multiline max={6000} value={capabilities} onChange={value => { setCapabilities(value); changed() }} />
      </div></Section>
      <Section id="products" title={`Sản phẩm & dịch vụ (${products.length})`} help="Sắp xếp, thay ảnh và cập nhật sản phẩm theo hoạt động của xưởng. Thứ tự bên dưới là thứ tự trên website.">
        <div className="site-section-tools"><button type="button" className="button secondary" disabled={products.length >= 100} onClick={() => setEditing(blankProduct())}><Plus size={16} />Thêm sản phẩm</button><small>Tối đa 100 sản phẩm · 6 ảnh/sản phẩm</small></div>
        <div className="site-product-list">{products.map((product, index) => <article key={product.id}>
          <SiteImage source={product.imageUrl} alt={product.name} privatePreview className="site-product-thumb" />
          <div className="site-product-summary"><strong>{product.name}</strong><p>{product.category || 'Chưa phân nhóm'} · {product.published ? 'Sẽ hiển thị khi xuất bản' : 'Đang ẩn'}{product.featured ? ' · Nổi bật' : ''}</p></div>
          <div className="site-row-actions"><button type="button" className="button secondary small-button" onClick={() => setEditing(structuredClone(product))}>Sửa {product.name}</button>
          <button type="button" className="icon-button" aria-label={`Đưa lên ${product.name}`} disabled={!index} onClick={() => { setProducts(shift(products, index, -1)); changed() }}><ArrowUp size={16} /></button><button type="button" className="icon-button" aria-label={`Đưa xuống ${product.name}`} disabled={index === products.length - 1} onClick={() => { setProducts(shift(products, index, 1)); changed() }}><ArrowDown size={16} /></button>
          <button type="button" className="icon-button" aria-label={`Nhân bản ${product.name}`} disabled={products.length >= 100} onClick={() => setEditing({ ...structuredClone(product), id: newId(), name: `${product.name} (bản sao)`.slice(0, 200), published: false })}><Copy size={16} /></button>
          <button type="button" className="text-button" onClick={() => { setProducts(products.map(item => item.id === product.id ? { ...item, published: !item.published } : item)); changed() }}>{product.published ? 'Ẩn' : 'Hiển thị'}</button>
          <button type="button" className="icon-button" aria-label={`Xóa sản phẩm ${product.name}`} onClick={() => { if (window.confirm(`Xóa “${product.name}” khỏi bản nháp? Website chỉ thay đổi sau khi xuất bản.`)) { setProducts(products.filter(item => item.id !== product.id)); changed() } }}><Trash2 size={16} /></button></div>
        </article>)}{products.length === 0 && <p className="site-empty">Chưa có sản phẩm. Thêm sản phẩm hoặc dịch vụ gia công để khách tìm hiểu.</p>}</div>
      </Section>
      <Section id="gallery" title="Hình ảnh công việc" help="Cập nhật ảnh máy móc, không gian xưởng hoặc công việc đã hoàn thành. Không tự thêm số liệu hay chứng nhận."><div className="site-fields">
        <TextField label="Tiêu đề thư viện công việc" value={settings.galleryTitle} onChange={value => changeSetting('galleryTitle', value)} max={200} />
      </div><div className="site-gallery-editor">{settings.gallery.map((item, index) => <article key={item.id}>
        <div className="site-gallery-editor-head"><strong>Hình ảnh {index + 1}</strong><div><button type="button" className="icon-button" aria-label={`Đưa hình ${index + 1} lên`} disabled={!index} onClick={() => changeSetting('gallery', shift(settings.gallery, index, -1))}><ArrowUp size={16} /></button><button type="button" className="icon-button" aria-label={`Đưa hình ${index + 1} xuống`} disabled={index === settings.gallery.length - 1} onClick={() => changeSetting('gallery', shift(settings.gallery, index, 1))}><ArrowDown size={16} /></button><button type="button" className="icon-button" aria-label={`Xóa hình công việc ${index + 1}`} onClick={() => { if (window.confirm('Bỏ hình này khỏi bản nháp?')) changeSetting('gallery', settings.gallery.filter(row => row.id !== item.id)) }}><Trash2 size={16} /></button></div></div>
        <ImagePicker label={`Ảnh công việc ${index + 1}`} value={item.image.src} onChange={src => updateGallery(item.id, { image: { ...item.image, src } })} onBusyChange={value => imageBusy(item.id, value)} />
        <TextField label={`Tên công việc ${index + 1}`} value={item.title} required max={200} onChange={title => updateGallery(item.id, { title })} /><TextField label={`Mô tả công việc ${index + 1}`} multiline max={1000} value={item.description} onChange={description => updateGallery(item.id, { description })} />
      </article>)}</div><div className="site-section-tools"><button type="button" className="button secondary" disabled={settings.gallery.length >= 12} onClick={() => changeSetting('gallery', [...settings.gallery, { id: newId(), title: '', description: '', image: { src: '', alt: '' } }])}><Plus size={16} />Thêm hình công việc</button><small>Tối đa 12 hình</small></div></Section>
      <Section id="contact" title="Liên hệ & bố cục" help="Chọn thông tin khách được xem và bật các phần phù hợp với doanh nghiệp."><div className="site-fields">
        <TextField label="Điện thoại công khai" type="tel" value={profile.phone} onChange={value => changeProfile('phone', value)} />
        <TextField label="Email nhận yêu cầu báo giá" type="email" value={profile.email} onChange={value => changeProfile('email', value)} />
        <TextField label="Địa chỉ công khai" value={profile.address} onChange={value => changeProfile('address', value)} />
        <TextField label="Website doanh nghiệp (https://)" type="url" value={profile.website} onChange={value => changeProfile('website', value)} />
        <TextField label="Giờ làm việc" value={settings.businessHours} onChange={value => changeSetting('businessHours', value)} max={300} />
        <TextField label="Liên kết Zalo (https://)" type="url" value={settings.zaloUrl} onChange={value => changeSetting('zaloUrl', value)} />
        <TextField label="Liên kết bản đồ (https://)" type="url" value={settings.mapUrl} onChange={value => changeSetting('mapUrl', value)} />
        <div className="site-section-toggles wide">{Object.entries(sectionNames).map(([key, label]) => <label className="site-check" key={key}><input type="checkbox" checked={settings.sections[key as keyof typeof settings.sections]} onChange={event => changeSetting('sections', { ...settings.sections, [key]: event.target.checked })} /><span>Hiển thị {label.toLocaleLowerCase('vi')}</span></label>)}</div>
      </div></Section>
      </fieldset>
      <div className="site-editor-actions"><div className="site-draft-state"><span className={dirty ? 'unsaved' : ''} /><strong>{uploading ? 'Đang tải ảnh' : dirty ? 'Bản nháp chưa lưu' : 'Nội dung trên thiết bị'}</strong><small>Chỉ Xuất bản mới đổi website khách đang xem</small></div><button type="submit" className="button primary" disabled={busy || uploading}><Save size={16} />Lưu bản nháp website</button><button type="button" className="button secondary" disabled={busy || uploading} onClick={() => setPreview(!preview)}><Eye size={16} />{preview ? 'Đóng xem trước' : 'Xem trước bản nháp'}</button><button type="button" className="button primary" disabled={busy || uploading} onClick={() => { void publish() }}><Check size={16} />{busy ? 'Đang xuất bản…' : 'Xuất bản website'}</button></div>
      <p className="site-help">Ảnh được lưu riêng trong thư viện, chưa công khai cho đến khi có trong bản xuất bản. Bản sao JSON chứa tham chiếu ảnh; hãy giữ ảnh gốc để sao lưu khi chuyển hệ thống. Dữ liệu nhân sự, khách hàng, ngân hàng và công nợ không tự xuất hiện ở đây.</p>
    </form>
    {preview && <section className="site-preview" aria-label="Xem trước website" onClickCapture={event => { const link = (event.target as HTMLElement).closest('a[href="#admin"]'); if (link) event.preventDefault() }}>{previewCatalog ? <Suspense fallback={<p>Đang mở xem trước…</p>}><PublicSite preview={previewCatalog} /></Suspense> : <p role="alert">Nhập tên công ty và kiểm tra thông tin trước khi xem trước.</p>}</section>}
    {editing && <ProductEditor product={editing} onCancel={() => setEditing(null)} onSave={updateProduct} />}
  </div>
}

function ProductEditor({ product, onSave, onCancel }: { product: CatalogProduct; onSave: (product: CatalogProduct) => void; onCancel: () => void }) {
  const [value, setValue] = useState(product), [dirty, setDirty] = useState(false), [uploads, setUploads] = useState<Record<number, boolean>>({})
  const ref = useRef<HTMLDialogElement>(null), uploading = Object.values(uploads).some(Boolean)
  const images = value.images ?? (value.imageUrl ? [{ src: value.imageUrl, alt: value.name }] : [])
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
  const cancel = () => { if ((!dirty && !uploading) || window.confirm('Bỏ các thay đổi sản phẩm chưa lưu?')) onCancel() }
  const update = <K extends keyof CatalogProduct>(key: K, field: CatalogProduct[K]) => { setValue(previous => ({ ...previous, [key]: field })); setDirty(true) }
  const updateImages = (next: WebsiteImage[]) => { setValue(previous => ({ ...previous, images: next, imageUrl: next[0]?.src || '' })); setDirty(true) }
  const fields = [['name', 'Tên sản phẩm / dịch vụ'], ['category', 'Nhóm sản phẩm'], ['material', 'Vật liệu'], ['unit', 'Đơn vị'], ['priceLabel', 'Thông tin giá hiển thị']] as const
  return <dialog ref={ref} className="modal site-product-dialog" onCancel={event => { event.preventDefault(); cancel() }} aria-labelledby="site-product-title"><div className="modal-head"><h2 id="site-product-title">Sản phẩm giới thiệu</h2><button type="button" className="icon-button" onClick={cancel} aria-label="Đóng sản phẩm"><X size={20} /></button></div><form onSubmit={event => { event.preventDefault(); if (!uploading) onSave({ ...value, images: images.filter(image => image.src), imageUrl: images.find(image => image.src)?.src || '' }) }}><div className="modal-body site-fields">{fields.map(([key, label]) => <TextField key={key} label={label} required={key === 'name'} max={key === 'name' ? 200 : 1000} value={value[key]} onChange={field => update(key, field)} />)}<TextField label="Mô tả ngắn" multiline max={1000} value={value.summary} onChange={field => update('summary', field)} /><TextField label="Thông số kỹ thuật" multiline max={3000} value={value.specification} onChange={field => update('specification', field)} />
      <div className="site-product-images wide"><h3>Ảnh sản phẩm</h3><p>Ảnh đầu tiên là ảnh bìa. Có thể thêm tối đa 6 ảnh.</p>{[...images, ...(images.length < 6 ? [{ src: '', alt: '' }] : [])].map((item, index) => <div key={index} className="site-product-image-row"><ImagePicker label={`Ảnh sản phẩm ${index + 1}`} value={item.src} onChange={src => { const next = [...images]; if (index < images.length) next[index] = { ...item, src }; else if (src) next.push({ src, alt: value.name }); updateImages(next) }} onBusyChange={busy => setUploads(previous => previous[index] === busy ? previous : { ...previous, [index]: busy })} />{index > 0 && item.src && <button type="button" className="text-button" disabled={uploading} onClick={() => updateImages([images[index], ...images.filter((_, i) => i !== index)])}>Đặt làm ảnh bìa {index + 1}</button>}</div>)}</div>
      <label className="site-check"><input type="checkbox" checked={value.published} onChange={event => update('published', event.target.checked)} /><span>Hiển thị trên website</span></label><label className="site-check"><input type="checkbox" checked={value.featured} onChange={event => update('featured', event.target.checked)} /><span>Sản phẩm nổi bật</span></label>
    </div><div className="modal-actions"><button type="button" className="button secondary" onClick={cancel}>Hủy</button><button type="submit" className="button primary" disabled={uploading}>{uploading ? 'Đang tải ảnh…' : 'Lưu sản phẩm vào bản nháp'}</button></div></form></dialog>
}

function MediaLibrary({ usedDraft }: { usedDraft: Data }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]), [usage, setUsage] = useState<MediaUsage>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  async function refresh() { setBusy(true); setError(''); try { const result = await listMedia(); if (mounted.current) { setAssets(result.media); setUsage(result.usage) } } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa mở được thư viện ảnh.') } finally { if (mounted.current) setBusy(false) } }
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false } }, [])
  const draftText = JSON.stringify({ profile: usedDraft.commerce?.publicProfile, products: usedDraft.commerce?.products })
  return <section className="card site-media-library"><div className="card-header"><div><h2>Thư viện ảnh</h2><p>{usage ? `${usage.count}/${usage.maxCount} ảnh · ${(usage.bytes / 1024 / 1024).toFixed(1)} / ${(usage.maxBytes / 1024 / 1024).toFixed(0)} MB` : 'Đang đọc thư viện…'}</p></div><button className="button secondary" disabled={busy} onClick={() => { void refresh() }}>Làm mới thư viện</button></div><p className="site-help">Chỉ xóa được ảnh không còn dùng. Nếu ảnh vẫn xuất hiện trên website, bỏ khỏi nội dung rồi lưu và xuất bản trước. Tải lại cùng ảnh không tạo thêm bản trùng.</p>{error && <p className="notice" role="alert">{error}</p>}<div className="site-media-grid">{assets.map(asset => { const used = draftText.includes(`media:${asset.id}`); return <article key={asset.id}><SiteImage source={`media:${asset.id}`} alt={asset.name} privatePreview /><strong>{asset.name}</strong><small>{Math.ceil(asset.bytes / 1024)} KB{used ? ' · Đang dùng trong bản nháp' : ''}</small><button type="button" className="text-button danger" disabled={used || busy} onClick={async () => { if (!window.confirm(`Xóa ảnh “${asset.name}” khỏi thư viện? Giữ bản gốc trên thiết bị nếu cần sử dụng lại.`)) return; setBusy(true); setError(''); try { await deleteMedia(asset.id); if (mounted.current) await refresh() } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa xóa được ảnh.') } finally { if (mounted.current) setBusy(false) } }}>Xóa ảnh {asset.name}</button></article> })}</div>{!busy && assets.length === 0 && <p className="site-empty">Chưa có ảnh. Tải ảnh tại logo, ảnh bìa hoặc sản phẩm để bắt đầu.</p>}</section>
}
