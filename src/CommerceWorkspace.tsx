import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, FileText, Plus, Search, X } from 'lucide-react'
import type { Data } from './domain'
import { formatDate, formatMoney, localDate, orderBalance, orderTotal } from './domain'
import { getCommerce, issueDocument, voidDocument, type CompanyProfile, type DocumentKind, type PaymentMethod, type SalesDocument } from './commerce'
import DocumentPreview from './DocumentPreview'
import { documentLabels } from './document-output'
import './commerce.css'

interface Props { data: Data; onCommit: (next: Data, message: string) => boolean; initialOrderId?: string; initialKind?: DocumentKind; onDirtyChange?: (dirty: boolean) => void }
const kinds: DocumentKind[] = ['quotation', 'payment_request', 'delivery', 'receipt']
const profileFields: { key: keyof CompanyProfile; label: string; type?: string; wide?: boolean; required?: boolean }[] = [
  { key: 'name', label: 'Tên doanh nghiệp trên chứng từ', required: true, wide: true },
  { key: 'taxCode', label: 'Mã số thuế' }, { key: 'phone', label: 'Điện thoại', type: 'tel' },
  { key: 'address', label: 'Địa chỉ doanh nghiệp', wide: true }, { key: 'email', label: 'Email', type: 'email' },
  { key: 'website', label: 'Website (https://)', type: 'url' }, { key: 'bankName', label: 'Ngân hàng' },
  { key: 'bankAccount', label: 'Số tài khoản' }, { key: 'bankAccountName', label: 'Chủ tài khoản', wide: true },
]

export default function CommerceWorkspace({ data, onCommit, initialOrderId, initialKind, onDirtyChange }: Props) {
  const commerce = useMemo(() => getCommerce(data), [data])
  const [tab, setTab] = useState<'documents' | 'company'>('documents')
  const [creating, setCreating] = useState(Boolean(initialOrderId || initialKind))
  const [orderId, setOrderId] = useState(initialOrderId ?? data.orders[0]?.id ?? '')
  const [kind, setKind] = useState<DocumentKind>(initialKind ?? 'quotation')
  const [date, setDate] = useState(localDate)
  const [amount, setAmount] = useState<string | null>(null)
  const [quantity, setQuantity] = useState<string | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('bank')
  const [reference, setReference] = useState('')
  const [terms, setTerms] = useState('')
  const [note, setNote] = useState('')
  const [selectedId, setSelectedId] = useState(commerce.documents.at(-1)?.id ?? '')
  const [filter, setFilter] = useState<DocumentKind | 'all'>('all')
  const [status, setStatus] = useState<'all' | 'issued' | 'void'>('all')
  const [search, setSearch] = useState('')
  const [voidId, setVoidId] = useState('')
  const [company, setCompany] = useState<CompanyProfile>(() => ({ ...commerce.company }))
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const dirtyCallback = useRef(onDirtyChange)
  dirtyCallback.current = onDirtyChange
  useEffect(() => { dirtyCallback.current?.(dirty) }, [dirty])
  useEffect(() => () => { dirtyCallback.current?.(false) }, [])
  useEffect(() => {
    if (initialOrderId || initialKind) { setOrderId(initialOrderId ?? data.orders[0]?.id ?? ''); setKind(initialKind ?? 'quotation'); setCreating(true); setTab('documents'); setAmount(null); setQuantity(null); setError('') }
  }, [initialOrderId, initialKind])
  useEffect(() => { if (!dirty) setCompany({ ...commerce.company }) }, [commerce.company, dirty])

  const order = data.orders.find(item => item.id === orderId)
  const balance = order ? orderBalance(order) : 0
  const alreadyDelivered = commerce.documents.filter(item => item.orderId === orderId && item.kind === 'delivery' && item.status === 'issued').reduce((sum, item) => sum + item.deliveryQuantity, 0)
  const remainingQuantity = order ? Math.max(0, order.quantity - alreadyDelivered) : 0
  const selected = commerce.documents.find(item => item.id === selectedId)
  const voidTarget = commerce.documents.find(item => item.id === voidId)
  const needle = search.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('đ', 'd')
  const documents = [...commerce.documents].reverse().filter(item => (filter === 'all' || item.kind === filter) && (status === 'all' || item.status === status) && `${item.number} ${item.order.code} ${item.customer.name} ${item.order.partName}`.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('đ', 'd').includes(needle))
  const opening = commerce.openingPaid.find(item => item.orderId === orderId)?.amount ?? 0

  function allowDiscard() { return !dirty || window.confirm('Biểu mẫu có thay đổi chưa lưu. Bỏ thay đổi để tiếp tục?') }
  function resetDraft() { setDate(localDate()); setAmount(null); setQuantity(null); setMethod('bank'); setReference(''); setTerms(''); setNote(''); setDirty(false); setError('') }
  function chooseTab(next: 'documents' | 'company') {
    if (next === tab || !allowDiscard()) return
    resetDraft(); setCreating(false); setCompany({ ...commerce.company }); setTab(next); setMessage('')
  }
  function saveDocument(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    try {
      const next = issueDocument(data, { kind, orderId, date, amount: kind === 'receipt' || kind === 'payment_request' ? Number(amount ?? balance) : undefined, deliveryQuantity: kind === 'delivery' ? Number(quantity ?? remainingQuantity) : undefined, method, reference, terms, note })
      const issued = next.commerce!.documents.at(-1)!
      if (!onCommit(next, `Đã lập ${documentLabels[kind].toLocaleLowerCase('vi')} ${issued.number}`)) { setError('Chưa lưu được chứng từ. Hãy kiểm tra thông báo dữ liệu và thử lại.'); return }
      setSelectedId(issued.id); setFilter('all'); setStatus('all'); setSearch(''); setCreating(false); resetDraft()
      setMessage(kind === 'receipt' ? 'Đã lập phiếu thu và cập nhật công nợ. Chờ “Đã đồng bộ” trước khi chuyển thiết bị.' : 'Đã lưu chứng từ. Bạn có thể xem, tải PDF hoặc in ngay.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Chưa lập được chứng từ.') }
  }

  return <div className="commerce-workspace">
    <div className="commerce-tabs" role="tablist" aria-label="Bán hàng và chứng từ"><button type="button" role="tab" aria-selected={tab === 'documents'} aria-controls="commerce-documents" onClick={() => chooseTab('documents')}><FileText size={17} />Chứng từ bán hàng</button><button type="button" role="tab" aria-selected={tab === 'company'} aria-controls="commerce-company" onClick={() => chooseTab('company')}><Building2 size={17} />Thông tin xuất chứng từ</button></div>
    {error && <div className="notice" role="alert">{error}<button type="button" aria-label="Ẩn lỗi chứng từ" onClick={() => setError('')}><X size={16} /></button></div>}
    {message && <p className="commerce-feedback" role="status">{message}</p>}
    {tab === 'company' ? <section className="card commerce-card" id="commerce-company" role="tabpanel" aria-label="Thông tin xuất chứng từ"><div className="card-header"><div><h2>Thông tin đơn vị lập chứng từ</h2><p>Thông tin pháp lý và ngân hàng dùng cho chứng từ mới. Các chứng từ đã lập giữ nguyên bản lưu.</p></div></div>
      <form className="commerce-form" onChange={() => setDirty(true)} onSubmit={event => { event.preventDefault(); setError(''); const next = { ...data, commerce: { ...commerce, company: Object.fromEntries(Object.entries(company).map(([key, value]) => [key, value.trim()])) as unknown as CompanyProfile } }; if (onCommit(next, 'Đã lưu thông tin xuất chứng từ')) { setDirty(false); setMessage('Đã lưu hồ sơ. Bạn có thể lập chứng từ bán hàng.'); } else setError('Chưa lưu được hồ sơ. Kiểm tra website HTTPS và các trường đã nhập.'); }}>
        <div className="commerce-fields">{profileFields.map(field => <label className={field.wide ? 'wide' : ''} key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span><input type={field.type ?? 'text'} value={company[field.key]} onChange={event => setCompany(previous => ({ ...previous, [field.key]: event.target.value }))} required={field.required} maxLength={field.key === 'name' ? 200 : 1000} /></label>)}</div>
        <p className="commerce-help">Hồ sơ này được lưu trong phần quản lý. Trang giới thiệu công khai có bộ thông tin riêng; số tài khoản ngân hàng không tự được công khai.</p><div className="button-row"><button type="submit" className="button primary">Lưu thông tin doanh nghiệp</button><button type="button" className="button secondary" onClick={() => { if (allowDiscard()) { setCompany({ ...commerce.company }); setDirty(false); setError(''); setMessage('Đã bỏ các thay đổi chưa lưu.'); } }}>Bỏ thay đổi</button></div>
      </form></section> : <section id="commerce-documents" role="tabpanel" aria-label="Chứng từ bán hàng">
      <div className="commerce-topline"><div><h2>Chứng từ theo đơn hàng</h2><p>Báo giá, đề nghị thanh toán, giao hàng và phiếu thu trong cùng một nơi.</p></div><button type="button" className="button primary" onClick={() => { if (!allowDiscard()) return; resetDraft(); setCreating(true); setMessage(''); }}><Plus size={17} />Lập chứng từ</button></div>
      {!commerce.company.name.trim() && <div className="commerce-setup"><Building2 size={22} /><div><strong>Điền thông tin doanh nghiệp trước khi lập chứng từ</strong><p>Tên doanh nghiệp, địa chỉ và tài khoản nhận tiền sẽ xuất hiện trên bản in.</p></div><button type="button" className="button secondary" onClick={() => chooseTab('company')}>Thiết lập thông tin</button></div>}
      {creating && <section className="card commerce-card"><div className="card-header"><div><h2>Lập chứng từ mới</h2><p>Chọn đơn hàng đã có để điền thông tin khách hàng và chi tiết gia công.</p></div></div><form className="commerce-form" onSubmit={saveDocument} onChange={() => setDirty(true)}>
        <div className="commerce-fields"><label className="wide"><span>Đơn hàng *</span><select required value={orderId} onChange={event => { setOrderId(event.target.value); setAmount(null); setQuantity(null) }}><option value="">Chọn đơn hàng</option>{data.orders.map(item => <option key={item.id} value={item.id}>{item.code} · {item.partName} · {data.customers.find(customer => customer.id === item.customerId)?.name}</option>)}</select></label>
          <label><span>Loại chứng từ *</span><select value={kind} onChange={event => { setKind(event.target.value as DocumentKind); setAmount(null); setQuantity(null) }}>{kinds.map(value => <option key={value} value={value}>{documentLabels[value]}</option>)}</select></label><label><span>Ngày lập *</span><input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
          {(kind === 'receipt' || kind === 'payment_request') && <label><span>{kind === 'receipt' ? 'Số tiền thu (VNĐ) *' : 'Số tiền đề nghị (VNĐ) *'}</span><input type="number" min={1} max={balance} step={1} required value={amount ?? String(balance)} onChange={event => setAmount(event.target.value)} /></label>}
          {kind === 'delivery' && <label><span>Số lượng giao lần này *</span><input type="number" min={1} max={remainingQuantity} step={1} required value={quantity ?? String(remainingQuantity)} onChange={event => setQuantity(event.target.value)} /></label>}
          {kind === 'receipt' && <><label><span>Hình thức thu tiền</span><select value={method} onChange={event => setMethod(event.target.value as PaymentMethod)}><option value="bank">Chuyển khoản</option><option value="cash">Tiền mặt</option><option value="other">Khác</option></select></label><label className="wide"><span>Mã giao dịch / tham chiếu</span><input value={reference} maxLength={300} onChange={event => setReference(event.target.value)} /></label></>}
          <label className="wide"><span>Điều kiện / thỏa thuận</span><textarea rows={3} value={terms} maxLength={4000} placeholder="Ví dụ: thanh toán trong 7 ngày; thời hạn hiệu lực báo giá; điều kiện giao nhận…" onChange={event => setTerms(event.target.value)} /></label><label className="wide"><span>Ghi chú trên chứng từ</span><textarea rows={3} value={note} maxLength={4000} onChange={event => setNote(event.target.value)} placeholder="Chỉ ghi nội dung cần gửi cho khách hàng." /></label>
        </div>
        {order && <div className="commerce-order-summary"><span>Giá trị đơn <strong>{formatMoney(orderTotal(order))}</strong></span><span>Đã thu <strong>{formatMoney(order.paid)}</strong></span><span>Còn phải thu <strong>{formatMoney(balance)}</strong></span>{kind === 'delivery' && <span>Còn có thể lập phiếu giao <strong>{remainingQuantity} chi tiết</strong></span>}{opening > 0 && <p>Số tiền đã thu trước khi có sổ phiếu: {formatMoney(opening)}. Đây là số dư đầu kỳ, không phải một phiếu thu mới.</p>}</div>}
        <p className="commerce-help">{kind === 'receipt' ? 'Lập phiếu thu sẽ ghi nhận tiền đã nhận và giảm công nợ. Chỉ lập khi doanh nghiệp thực sự nhận tiền.' : kind === 'payment_request' ? 'Đề nghị thanh toán chưa ghi nhận tiền đã thu và không thay đổi công nợ.' : kind === 'delivery' ? 'Phiếu giao hàng theo dõi số lượng trên chứng từ; không tự cập nhật tiến độ sản xuất hoặc xuất kho.' : 'Báo giá lấy theo đơn giá của đơn hàng. Báo giá không làm thay đổi công nợ.'} Chứng từ này không thay thế hóa đơn VAT.</p>
        <div className="button-row"><button type="submit" className="button primary" disabled={!commerce.company.name.trim() || !order}>{kind === 'receipt' ? 'Lập phiếu thu & ghi nhận tiền' : 'Lưu chứng từ'}</button><button type="button" className="button secondary" onClick={() => { if (allowDiscard()) { resetDraft(); setCreating(false) } }}>Hủy lập chứng từ</button></div>
      </form></section>}
      <div className="commerce-browser"><section className="card commerce-list" aria-label="Danh sách chứng từ"><div className="commerce-list-heading"><h3>Lịch sử chứng từ <span>{commerce.documents.length}</span></h3><label className="commerce-search"><Search size={16} /><input aria-label="Tìm chứng từ" value={search} placeholder="Số phiếu, đơn hàng, khách hàng…" onChange={event => setSearch(event.target.value)} /></label><div className="commerce-filter-row"><label><span>Loại</span><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">Tất cả loại</option>{kinds.map(value => <option key={value} value={value}>{documentLabels[value]}</option>)}</select></label><label><span>Trạng thái</span><select value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="all">Tất cả trạng thái</option><option value="issued">Còn hiệu lực</option><option value="void">Đã hủy</option></select></label></div></div>
        <div className="commerce-document-list">{documents.length ? documents.map(item => <button type="button" key={item.id} className={`commerce-document-item ${selectedId === item.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id}><span className="commerce-item-top"><strong>{item.number}</strong><span className={item.status === 'void' ? 'commerce-void-badge' : 'commerce-issued-badge'}>{item.status === 'void' ? 'Đã hủy' : 'Còn hiệu lực'}</span></span><span>{documentLabels[item.kind]} · {formatDate(item.date)}</span><span className="commerce-item-customer">{item.customer.name}</span><small>{item.order.code} · {item.kind === 'delivery' ? `${item.deliveryQuantity} chi tiết` : formatMoney(item.amount)}</small></button>) : <div className="commerce-empty"><FileText size={28} /><strong>{commerce.documents.length ? 'Không có chứng từ phù hợp' : 'Chưa lập chứng từ nào'}</strong><p>{commerce.documents.length ? 'Thử đổi bộ lọc hoặc từ khóa.' : 'Chọn “Lập chứng từ” để bắt đầu từ một đơn hàng.'}</p></div>}</div>
      </section><div className="commerce-preview-column">{selected ? <><DocumentPreview key={selected.id} document={selected} /><div className="commerce-document-meta"><p>{selected.status === 'void' ? `Đã hủy: ${selected.voidReason}` : 'Chứng từ đã lập được giữ nguyên; nếu sai, hủy có lý do rồi lập chứng từ mới.'}</p>{selected.status === 'issued' && <button type="button" className="text-button danger" onClick={() => setVoidId(selected.id)}>Hủy chứng từ {selected.number}</button>}</div></> : <div className="card commerce-empty commerce-preview-empty"><FileText size={36} /><h3>Xem trước và gửi cho khách</h3><p>Chọn một chứng từ để tải PDF, tải HTML hoặc in trên giấy A4.</p></div>}</div></div>
    </section>}
    {voidTarget && <VoidDocumentDialog document={voidTarget} onClose={() => setVoidId('')} onConfirm={reason => { try { const next = voidDocument(data, voidTarget.id, reason); if (!onCommit(next, `Đã hủy chứng từ ${voidTarget.number}`)) return 'Chưa lưu được việc hủy. Hãy kiểm tra đồng bộ và thử lại.'; setVoidId(''); setMessage(voidTarget.kind === 'receipt' ? 'Đã hủy phiếu thu và hoàn lại công nợ tương ứng.' : 'Đã hủy chứng từ. Lịch sử vẫn được giữ.'); return ''; } catch (failure) { return failure instanceof Error ? failure.message : 'Chưa hủy được chứng từ.' } }} />}
  </div>
}

function VoidDocumentDialog({ document: value, onConfirm, onClose }: { document: SalesDocument; onConfirm: (reason: string) => string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close() }, [])
  return <dialog ref={dialog} className="modal commerce-void-dialog" aria-labelledby="commerce-void-title" onCancel={onClose}><div className="modal-head"><h2 id="commerce-void-title">Hủy chứng từ {value.number}</h2><button type="button" className="icon-button" aria-label="Đóng xác nhận hủy" onClick={onClose}><X size={18} /></button></div><form onSubmit={event => { event.preventDefault(); if (!reason.trim()) { setError('Nhập lý do hủy chứng từ.'); return } setError(onConfirm(reason.trim())) }}><div className="modal-body"><p>{value.kind === 'receipt' ? `Hủy phiếu này sẽ giảm tiền đã thu ${formatMoney(value.amount)} và tăng lại công nợ. Lịch sử phiếu vẫn được giữ.` : 'Chứng từ sẽ được đánh dấu đã hủy và giữ lại trong lịch sử.'}</p><label className="commerce-void-reason"><span>Lý do hủy *</span><textarea autoFocus required maxLength={1000} rows={4} value={reason} onChange={event => setReason(event.target.value)} /></label>{error && <p role="alert" className="commerce-dialog-error">{error}</p>}</div><div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Giữ chứng từ</button><button className="button primary" type="submit">Xác nhận hủy chứng từ</button></div></form></dialog>
}
