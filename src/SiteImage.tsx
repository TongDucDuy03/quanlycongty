import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { fetchMediaBlob, mediaId } from './media'

export default function SiteImage({ source, alt, className = '', loading = 'lazy', privatePreview = false }: { source: string; alt: string; className?: string; loading?: 'lazy' | 'eager'; privatePreview?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(loading === 'eager')
  const [url, setUrl] = useState(''), [error, setError] = useState(false)
  useEffect(() => {
    if (loading === 'eager' || !('IntersectionObserver' in window)) { setVisible(true); return }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '200px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [loading])
  useEffect(() => {
    let active = true, objectUrl = ''
    setUrl(''); setError(false)
    const id = mediaId(source)
    if (!id || !visible) return
    fetchMediaBlob(id, privatePreview).then(blob => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }
    }).catch(() => { if (active) setError(true) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [source, privatePreview, visible])
  const src = mediaId(source) ? url : source
  return <span ref={ref} className={`site-image ${className}`} aria-busy={Boolean(source && !src && !error)}>
    {src && !error ? <img src={src} alt={alt} loading={loading} referrerPolicy="no-referrer" onError={() => setError(true)} /> : <span className="site-image-fallback" role="img" aria-label={error ? `Không tải được ảnh: ${alt}` : alt}><ImageOff size={24} /><small>{error ? 'Chưa tải được ảnh' : source ? 'Đang tải ảnh…' : 'Chưa có ảnh'}</small></span>}
  </span>
}
