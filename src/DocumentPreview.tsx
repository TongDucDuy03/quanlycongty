import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import type { SalesDocument } from './commerce'
import { buildDocumentHTML, documentLabels, downloadDocumentHTML, downloadDocumentPDF, printDocument } from './document-output'

export default function DocumentPreview({ document: value }: { document: SalesDocument }) {
  const html = useMemo(() => buildDocumentHTML(value), [value])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return <section className="commerce-preview" aria-label={`Xem ${documentLabels[value.kind]} ${value.number}`}>
    <div className="commerce-preview-toolbar"><div><strong>{value.number}</strong><p>Bản lưu tại thời điểm lập; thông tin trong chứng từ không đổi khi sửa đơn hàng.</p></div><div className="button-row">
      <button type="button" className="button primary" disabled={busy} onClick={async () => { setBusy(true); setMessage('Đang tạo PDF tiếng Việt…'); try { await downloadDocumentPDF(value); setMessage('Đã tải PDF.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Chưa tạo được PDF. Bạn có thể dùng “In / Lưu PDF”.'); } finally { setBusy(false) } }}><Download size={16} />{busy ? 'Đang tạo PDF…' : 'Tải PDF'}</button>
      <button type="button" className="button primary" onClick={() => { printDocument(value); setMessage('Trong hộp thoại in, chọn máy in hoặc “Lưu dưới dạng PDF”.') }}><Printer size={16} />In / Lưu PDF</button>
      <button type="button" className="button secondary" onClick={() => { downloadDocumentHTML(value); setMessage('Đã tải bản HTML độc lập để xem hoặc in.') }}><Download size={16} />Tải bản HTML</button>
    </div></div>
    {message && <p className="commerce-feedback" role="status">{message}</p>}
    <iframe title={`${documentLabels[value.kind]} ${value.number}`} srcDoc={html} sandbox="allow-same-origin" className="commerce-document-frame" />
  </section>
}
