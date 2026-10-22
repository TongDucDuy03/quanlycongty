import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Cog, Factory, FileText, Mail, MapPin, Moon, Phone, ShieldCheck, Sun, Wrench, X } from 'lucide-react'
import type { PublicCatalog, PublicProduct } from './commerce'
import { fetchPublicCatalog } from './public-catalog'
import { publicDemo } from './public-demo'
import './public-site.css'

function ProductArt({ product, large = false }: { product?: PublicProduct; large?: boolean }) {
  return <div className={`pub-product-art ${large ? 'pub-art-large' : ''}`}>
    {product?.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none' }} /> : <><div className="pub-art-grid" /><Cog strokeWidth={1.1} aria-hidden="true" /><span className="pub-art-caption">{product?.category || 'GIA CÔNG CƠ KHÍ'}</span></>}
  </div>
}
function ProductDialog({ product, onClose, onInquiry }: { product: PublicProduct; onClose: () => void; onInquiry: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog className="pub-dialog" ref={ref} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }} aria-labelledby="pub-product-title">
    <button className="pub-close" onClick={onClose} aria-label="Đóng chi tiết sản phẩm"><X /></button>
    <ProductArt product={product} />
    <div className="pub-dialog-copy"><span className="pub-eyebrow">{product.category}</span><h2 id="pub-product-title">{product.name}</h2><p>{product.summary}</p><dl><dt>Vật liệu</dt><dd>{product.material || 'Trao đổi theo yêu cầu'}</dd><dt>Đơn vị</dt><dd>{product.unit || 'Theo yêu cầu'}</dd><dt>Thông số & yêu cầu</dt><dd>{product.specification || 'Liên hệ để xác nhận thông số kỹ thuật.'}</dd></dl><strong>{product.priceLabel || 'Liên hệ báo giá'}</strong><button className="pub-button" onClick={onInquiry}>Trao đổi về sản phẩm <ArrowRight size={18} /></button></div>
  </dialog>
}

export default function PublicSite({ preview }: { preview?: PublicCatalog }) {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(preview || null)
  const [loading, setLoading] = useState(!preview)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('Tất cả')
  const [selected, setSelected] = useState<PublicProduct | null>(null)
  const [inquiry, setInquiry] = useState('')
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('xuong-viet.theme') || 'light' } catch { return 'light' } })
  useEffect(() => {
    if (preview) { setCatalog(preview); setLoading(false); return }
    let active = true
    setError(''); setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    fetchPublicCatalog(controller.signal).then(value => { if (active) { setCatalog(value); setError('') } }).catch(() => { if (active) setError('Chưa tải được bản công khai. Nội dung bên dưới là mẫu minh họa.') }).finally(() => { clearTimeout(timer); if (active) setLoading(false) })
    return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [preview])
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('xuong-viet.theme', theme) } catch { /* Theme remains usable. */ } }, [theme])
  useEffect(() => {
    const scroll = () => { const id = location.hash.slice(1); if (id === 'products' || id === 'contact') document.getElementById(`pub-${id}`)?.scrollIntoView({ behavior: 'smooth' }) }
    scroll(); window.addEventListener('hashchange', scroll); return () => window.removeEventListener('hashchange', scroll)
  }, [loading])
  const sample = !catalog
  const content = catalog || publicDemo
  const { profile } = content
  const categories = ['Tất cả', ...new Set(content.products.map(item => item.category).filter(Boolean))]
  const products = content.products.filter(item => category === 'Tất cả' || item.category === category)
  const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)
  const scrollTo = (section: string) => document.getElementById(`pub-${section}`)?.scrollIntoView({ behavior: 'smooth' })
  return <div className="public-site">
    <div className="pub-demo-strip">{preview ? 'BẢN XEM TRƯỚC — CHƯA XUẤT BẢN' : sample ? 'WEBSITE MẪU · NỘI DUNG DOANH NGHIỆP MINH HỌA' : 'BẢN DEMO WEBSITE DOANH NGHIỆP'}<a href="#admin">Đăng nhập quản lý <ArrowRight size={13} /></a></div>
    <header className="pub-nav"><a href="#home" className="pub-brand"><Factory size={29} /><span>{profile.name}<small>GIA CÔNG & SẢN XUẤT</small></span></a><nav aria-label="Website công ty"><button onClick={() => scrollTo('about')}>Giới thiệu</button><a href="#products" onClick={() => scrollTo('products')}>Sản phẩm</a><a href="#contact" onClick={() => scrollTo('contact')}>Liên hệ</a></nav><button className="pub-theme" aria-label={theme === 'light' ? 'Chuyển sang chế độ tối' : 'Chuyển sang chế độ sáng'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button></header>
    {loading && <p className="pub-status" role="status">Đang tải nội dung website…</p>}{error && <p className="pub-status" role="status">{error}</p>}
    <main>
      <section className="pub-hero"><div className="pub-hero-copy"><span className="pub-eyebrow"><span /> ĐỐI TÁC GIA CÔNG CƠ KHÍ</span><h1>{profile.tagline || 'Gia công theo yêu cầu của bạn.'}</h1><p>{profile.description}</p><div className="pub-actions"><a href="#products" className="pub-button" onClick={() => scrollTo('products')}>Khám phá sản phẩm <ArrowRight size={18} /></a><a href="#contact" className="pub-button pub-button-outline" onClick={() => scrollTo('contact')}>Trao đổi báo giá</a></div><div className="pub-hero-note"><FileText size={18} /> Gửi bản vẽ · Xác nhận yêu cầu · Trao đổi tiến độ</div></div><div className="pub-hero-visual">{profile.heroImage ? <img className="pub-hero-image" src={profile.heroImage} alt={`Năng lực ${profile.name}`} referrerPolicy="no-referrer" /> : <div className="pub-machine-art"><div className="pub-art-grid" /><div className="pub-ring pub-ring-one" /><div className="pub-ring pub-ring-two" /><Cog className="pub-gear" strokeWidth={0.8} /><span className="pub-machine-label">TỪ BẢN VẼ<br /><b>ĐẾN CHI TIẾT</b></span><span className="pub-coordinate">X · Y · Z</span></div>}<div className="pub-visual-tag"><Wrench size={23} /><div><strong>Theo yêu cầu kỹ thuật</strong><span>Vật liệu · Quy cách · Số lượng</span></div></div></div></section>
      <section id="pub-about" className="pub-capabilities"><div><span className="pub-eyebrow">NĂNG LỰC GIA CÔNG</span><h2>Mỗi chi tiết bắt đầu<br />từ một yêu cầu rõ ràng.</h2></div><div className="pub-capability-grid">{profile.capabilities.map((capability, index) => <article key={`${index}-${capability}`}><span className="pub-index">0{index + 1}</span><Wrench size={22} /><h3>{capability}</h3></article>)}{profile.capabilities.length === 0 && <p>Liên hệ để trao đổi phạm vi gia công phù hợp với bản vẽ của bạn.</p>}</div></section>
      <section id="pub-products" className="pub-catalog"><div className="pub-section-head"><div><span className="pub-eyebrow">DANH MỤC GIỚI THIỆU</span><h2>Sản phẩm & dịch vụ</h2></div><p>Chọn nhóm sản phẩm để xem thông tin.<br />Giá và lịch giao được xác nhận theo yêu cầu.</p></div><div className="pub-filters" aria-label="Lọc danh mục">{categories.map(item => <button key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="pub-products-grid">{products.map(product => <article className="pub-product" key={product.id}><button className="pub-product-image-button" onClick={() => setSelected(product)} aria-label={`Xem ${product.name}`}><ProductArt product={product} />{product.featured && <span className="pub-featured">NỔI BẬT</span>}</button><div className="pub-product-copy"><span>{product.category}</span><h3>{product.name}</h3><p>{product.summary}</p><div><strong>{product.priceLabel || 'Liên hệ báo giá'}</strong><button aria-label={`Chi tiết ${product.name}`} onClick={() => setSelected(product)}><ArrowRight size={19} /></button></div></div></article>)}</div>{products.length === 0 && <p className="pub-empty">Chưa có sản phẩm trong nhóm này. Liên hệ để trao đổi yêu cầu gia công.</p>}</section>
      <section className="pub-process"><span className="pub-eyebrow">CÁCH PHỐI HỢP</span><h2>Từ trao đổi đến bàn giao</h2><div>{[['01', 'Trao đổi yêu cầu', 'Bản vẽ, vật liệu, số lượng và thời gian mong muốn.'], ['02', 'Xác nhận báo giá', 'Thống nhất quy cách, giá và điều kiện giao hàng.'], ['03', 'Gia công & bàn giao', 'Theo dõi tiến độ, kiểm tra và bàn giao theo thỏa thuận.']].map(([number, title, description]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
      <section id="pub-contact" className="pub-contact"><div><span className="pub-eyebrow">KẾT NỐI VỚI CHÚNG TÔI</span><h2>Bạn có bản vẽ<br />hoặc ý tưởng cần gia công?</h2><p>Chuẩn bị bản vẽ, số lượng, vật liệu và thời gian cần hàng để trao đổi báo giá.</p><address>{profile.address && <p><MapPin size={19} />{profile.address}</p>}{profile.phone && <p><Phone size={19} /><a href={`tel:${profile.phone.replace(/[^+0-9]/g, '')}`}>{profile.phone}</a></p>}{profile.email && <p><Mail size={19} /><a href={`mailto:${encodeURIComponent(profile.email)}`}>{profile.email}</a></p>}{!profile.address && !profile.phone && !profile.email && <p>Thông tin liên hệ sẽ hiển thị khi doanh nghiệp cập nhật và xuất bản website.</p>}</address>{profile.website && <a href={profile.website} target="_blank" rel="noreferrer" className="pub-external">Website doanh nghiệp <ArrowRight size={16} /></a>}</div><form className="pub-inquiry" onSubmit={event => { event.preventDefault(); if (!emailReady) return; const form = new FormData(event.currentTarget); const body = `Kính gửi ${profile.name},\n\nTôi là: ${form.get('name')}\nLiên hệ: ${form.get('contact')}\n\nYêu cầu gia công:\n${inquiry}\n\nTôi sẽ đính kèm bản vẽ trong email này.`; location.href = `mailto:${encodeURIComponent(profile.email)}?subject=${encodeURIComponent('Yêu cầu báo giá gia công')}&body=${encodeURIComponent(body)}` }}><h3>Chuẩn bị yêu cầu báo giá</h3><label>Họ tên / Công ty<input name="name" autoComplete="organization" required maxLength={200} /></label><label>Email hoặc số điện thoại<input name="contact" autoComplete="email" required maxLength={200} /></label><label>Nội dung yêu cầu<textarea rows={4} value={inquiry} onChange={event => setInquiry(event.target.value)} maxLength={3000} placeholder="Sản phẩm, số lượng, vật liệu, thời gian cần hàng…" required /></label><button type="submit" className="pub-button" disabled={!emailReady}>Soạn email báo giá <ArrowRight size={17} /></button><small>{emailReady ? 'Mở ứng dụng email của bạn. Kiểm tra nội dung, đính kèm bản vẽ rồi tự gửi; website chưa lưu yêu cầu này.' : 'Đây là bản giới thiệu mẫu. Cần cấu hình email doanh nghiệp để soạn yêu cầu.'}</small></form></section>
    </main>
    <footer className="pub-footer"><span><Factory size={22} />{profile.name}</span><p>Website giới thiệu & không gian quản lý doanh nghiệp</p><a href="#admin"><ShieldCheck size={16} /> Khu quản lý</a></footer>
    {selected && <ProductDialog product={selected} onClose={() => setSelected(null)} onInquiry={() => { setInquiry(`Tôi muốn báo giá: ${selected.name}\nSố lượng: \nVật liệu: \nThời gian cần hàng: `); setSelected(null); setTimeout(() => scrollTo('contact'), 0) }} />}
  </div>
}
