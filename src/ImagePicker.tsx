import { useEffect, useRef, useState } from 'react'
import { ImagePlus, FolderOpen, X } from 'lucide-react'
import { companyManaged, getCompanyToken } from './company-config'
import { listMedia, prepareImage, uploadMedia, type MediaAsset } from './media'
import SiteImage from './SiteImage'

interface Props { label: string; value: string; onChange: (value: string) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean }
export default function ImagePicker({ label, value, onChange, onBusyChange, disabled = false }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [library, setLibrary] = useState<MediaAsset[] | null>(null)
  const generation = useRef(0), input = useRef<HTMLInputElement>(null)
  const callbacks = useRef({ onChange, onBusyChange }); callbacks.current = { onChange, onBusyChange }
  useEffect(() => () => { generation.current++; callbacks.current.onBusyChange?.(false) }, [])
  function stopBusy() { setBusy(false); callbacks.current.onBusyChange?.(false) }
  async function upload(file: File) {
    const run = ++generation.current, token = getCompanyToken()
    setBusy(true); setError(''); setLibrary(null); callbacks.current.onBusyChange?.(true)
    try {
      const prepared = await prepareImage(file)
      if (run !== generation.current || companyManaged && token !== getCompanyToken()) return
      const result = await uploadMedia(prepared)
      if (run === generation.current && (!companyManaged || token === getCompanyToken())) callbacks.current.onChange(`media:${result.media.id}`)
    } catch (failure) { if (run === generation.current) setError(failure instanceof Error ? failure.message : 'Chưa tải được ảnh.') }
    finally { if (run === generation.current) stopBusy() }
  }
  async function openLibrary() {
    const run = ++generation.current
    setError(''); setBusy(true); callbacks.current.onBusyChange?.(true)
    try { const result = await listMedia(); if (run === generation.current) setLibrary(result.media) }
    catch (failure) { if (run === generation.current) setError(failure instanceof Error ? failure.message : 'Chưa tải được thư viện.') }
    finally { if (run === generation.current) stopBusy() }
  }
  return <div className="image-picker">
    <span className="image-picker-label">{label}</span>
    {value && <SiteImage source={value} alt={label} privatePreview className="image-picker-preview" />}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Tải ${label.toLocaleLowerCase('vi')}`} hidden disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} />
    <div className="image-picker-actions"><button type="button" className="button secondary small-button" disabled={disabled} onClick={() => input.current?.click()}><ImagePlus size={16} />{busy ? 'Chọn ảnh khác' : value ? 'Thay ảnh' : 'Tải ảnh lên'}</button><button type="button" className="button secondary small-button" disabled={disabled || busy} onClick={() => { void openLibrary() }}><FolderOpen size={16} />Chọn từ thư viện</button>{(value || busy) && <button type="button" className="text-button danger" disabled={disabled} onClick={() => { generation.current++; stopBusy(); setError(''); setLibrary(null); callbacks.current.onChange('') }}><X size={14} />Bỏ ảnh</button>}</div>
    {busy && <p role="status">Đang xử lý ảnh… Bạn có thể chọn ảnh khác hoặc bỏ ảnh.</p>}
    {error && <p role="alert" className="image-error">{error}</p>}
    {library && <div className="image-choice-library"><div><strong>Chọn ảnh đã tải</strong><button type="button" className="text-button" onClick={() => setLibrary(null)}>Đóng thư viện</button></div>{library.length ? <div className="image-choice-grid">{library.map(asset => <button type="button" key={asset.id} onClick={() => { generation.current++; callbacks.current.onChange(`media:${asset.id}`); setLibrary(null) }}><SiteImage source={`media:${asset.id}`} alt={asset.name} privatePreview /><span>{asset.name}</span></button>)}</div> : <p>Chưa có ảnh trong thư viện.</p>}</div>}
    <details className="image-url-option"><summary>Dùng đường dẫn ảnh có sẵn</summary><label><span>URL {label.toLocaleLowerCase('vi')} (https://)</span><input type="text" disabled={disabled || busy} value={value.startsWith('media:') ? '' : value} placeholder="https://…" onChange={event => callbacks.current.onChange(event.target.value)} /></label></details>
    <small>JPG, PNG, WebP · tối đa 10 MB. Ảnh được chuyển thành JPG nhẹ, nền trong suốt chuyển sang trắng. Chỉ đưa lên ảnh được phép công khai.</small>
  </div>
}
