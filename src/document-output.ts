import type { SalesDocument } from './commerce'
import { formatDate, formatMoney } from './domain'
import { downloadFile } from './storage'

export const documentLabels: Record<SalesDocument['kind'], string> = {
  quotation: 'Báo giá', payment_request: 'Đề nghị thanh toán', delivery: 'Phiếu giao hàng', receipt: 'Phiếu thu',
}
const methodLabels = { cash: 'Tiền mặt', bank: 'Chuyển khoản', other: 'Khác' }
const escapeHTML = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const filename = (value: SalesDocument) => `${value.number.replace(/[^A-Za-z0-9_.-]/g, '-') || 'chung-tu'}`
const total = (value: SalesDocument) => value.order.quantity * value.order.unitPrice
const amountLabel = (value: SalesDocument) => value.kind === 'receipt' ? 'Số tiền thu theo phiếu' : value.kind === 'payment_request' ? 'Số tiền đề nghị thanh toán' : 'Giá trị báo giá'
const amount = (value: SalesDocument) => value.kind === 'quotation' ? total(value) : value.amount
const bankText = (value: SalesDocument) => [value.company.bankName, value.company.bankAccount && `Số tài khoản: ${value.company.bankAccount}`, value.company.bankAccountName && `Chủ tài khoản: ${value.company.bankAccountName}`].filter(Boolean).join(' · ')
const signatureLabels = (value: SalesDocument) => value.kind === 'receipt' ? ['Người nộp tiền', 'Người lập phiếu / thu tiền'] : value.kind === 'delivery' ? ['Bên nhận hàng', 'Bên giao hàng'] : ['Khách hàng xác nhận', 'Đại diện đơn vị lập']
const footerText = 'Chứng từ thương mại nội bộ, không phải hóa đơn giá trị gia tăng. Thông tin được lưu tại thời điểm lập chứng từ.'

/** All document fields are escaped text. Exports contain no executable content or private live state. */
export function buildDocumentHTML(value: SalesDocument): string {
  const e = escapeHTML
  const details = [value.order.material && `Vật liệu: ${value.order.material}`, value.order.drawing && `Bản vẽ: ${value.order.drawing}`].filter(Boolean)
  const line = (label: string, text: string) => text ? `<p><b>${e(label)}</b> ${e(text)}</p>` : ''
  const signatures = signatureLabels(value)
  const paidLabel = value.kind === 'receipt' ? 'Đã thu trước phiếu này' : 'Đã thu tại thời điểm lập'
  const balanceLabel = value.kind === 'receipt' ? 'Còn phải thu trước phiếu này' : 'Còn phải thu tại thời điểm lập'
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(documentLabels[value.kind])} ${e(value.number)}</title><style>
  *{box-sizing:border-box}html{background:#edf1f3}body{margin:0;color:#1d2f37;font:14px/1.55 Arial,"Segoe UI",sans-serif}.document{max-width:794px;min-height:100vh;margin:auto;background:#fff;padding:42px 46px}p{margin:4px 0;overflow-wrap:anywhere}.seller{padding-bottom:18px;border-bottom:2px solid #1c7261}.seller h1{font-size:20px;margin:0 0 7px}.seller p{font-size:12px;color:#40565e}.heading{text-align:center;margin:27px 0 22px}.heading h2{font-size:25px;text-transform:uppercase;letter-spacing:.7px;margin:0 0 8px}.heading p{font-size:12px;color:#52636b}.buyer{margin-bottom:22px}.buyer h3,.notes h3{font-size:13px;margin:15px 0 6px}.items{width:100%;border-collapse:collapse;margin:18px 0;table-layout:fixed;font-size:12px}.items th{background:#ecf3f1;text-align:left}.items th,.items td{padding:11px 9px;border:1px solid #d7e0e0;vertical-align:top;overflow-wrap:anywhere}.items .num{text-align:right}.items small{display:block;margin-top:4px;color:#52636b}.totals{margin:18px 0 24px auto;width:min(100%,350px)}.totals p{display:flex;justify-content:space-between;gap:18px;font-size:13px}.totals strong{text-align:right;white-space:nowrap}.totals .main{font-size:15px;border-top:1px solid #c5d6d0;padding-top:10px;margin-top:9px}.notes p{white-space:pre-wrap;font-size:12px}.void{border:2px solid #a83d36;color:#8b2d29;padding:12px;margin-bottom:18px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;text-align:center;margin:38px 0 0;break-inside:avoid}.signatures p{margin:0;font-size:13px}.signatures small{display:block;font-size:11px;font-style:italic;color:#64777b;margin-top:4px}.sign-space{height:76px}.footer{font-size:10px;color:#617278;border-top:1px solid #d7e0e0;padding-top:12px;margin-top:20px}.muted{color:#64777b;font-size:11px}
  @page{size:A4;margin:15mm}@media print{html,body{background:#fff}.document{padding:0;max-width:none;min-height:0}.items thead{display:table-header-group}.items tr,.totals,.seller{break-inside:avoid}.heading h2{font-size:23px}.footer{position:static}}
  @media screen and (max-width:540px){.document{padding:23px 18px}.heading h2{font-size:21px}.items{font-size:11px}.items th,.items td{padding:8px 5px}.seller h1{font-size:18px}.signatures{gap:12px}}
  </style></head><body><article class="document"><header class="seller"><h1>${e(value.company.name)}</h1>${line('Địa chỉ:', value.company.address)}${line('Mã số thuế:', value.company.taxCode)}${line('Điện thoại:', value.company.phone)}${line('Email:', value.company.email)}${line('Website:', value.company.website)}</header>
  <div class="heading"><h2>${e(documentLabels[value.kind])}</h2><p>Số: ${e(value.number)} · Ngày ${e(formatDate(value.date))}</p></div>
  ${value.status === 'void' ? `<div class="void"><strong>CHỨNG TỪ ĐÃ HỦY</strong><p>Lý do: ${e(value.voidReason)}</p><p>Không có giá trị thu tiền hoặc giao hàng.</p></div>` : ''}
  <section class="buyer"><h3>${value.kind === 'receipt' ? 'NGƯỜI NỘP TIỀN / KHÁCH HÀNG' : 'THÔNG TIN KHÁCH HÀNG'}</h3>${line('Đơn vị:', value.customer.name)}${line('Người liên hệ:', value.customer.contact)}${line('Địa chỉ:', value.customer.address)}${line('Điện thoại:', value.customer.phone)}${line('Email:', value.customer.email)}${line('Đơn hàng:', value.order.code)}${value.kind === 'delivery' || value.kind === 'quotation' ? line('Hạn giao theo đơn:', formatDate(value.order.dueDate)) : ''}</section>
  <table class="items"><colgroup><col style="width:${value.kind === 'delivery' ? '60' : '46'}%">${value.kind === 'delivery' ? '<col style="width:20%"><col style="width:20%">' : '<col style="width:13%"><col style="width:20%"><col style="width:21%">'}</colgroup><thead><tr><th>Chi tiết / sản phẩm</th>${value.kind === 'delivery' ? '<th class="num">Số lượng đặt</th><th class="num">Giao lần này</th>' : '<th class="num">Số lượng</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th>'}</tr></thead><tbody><tr><td><strong>${e(value.order.partName)}</strong>${details.map(text => `<small>${e(text)}</small>`).join('')}</td><td class="num">${e(value.order.quantity)}</td>${value.kind === 'delivery' ? `<td class="num"><strong>${e(value.deliveryQuantity)}</strong></td>` : `<td class="num">${e(formatMoney(value.order.unitPrice))}</td><td class="num">${e(formatMoney(total(value)))}</td>`}</tr></tbody></table>
  ${value.kind === 'delivery' ? '<p class="muted">Phiếu xác nhận số lượng giao theo chứng từ. Không tự thay đổi tiến độ sản xuất hoặc tồn kho.</p>' : `<section class="totals"><p><span>Giá trị đơn hàng</span><strong>${e(formatMoney(total(value)))}</strong></p><p><span>${paidLabel}</span><strong>${e(formatMoney(value.paidAtIssue))}</strong></p><p><span>${balanceLabel}</span><strong>${e(formatMoney(value.balanceAtIssue))}</strong></p><p class="main"><span>${e(amountLabel(value))}</span><strong>${e(formatMoney(amount(value)))}</strong></p>${value.kind === 'receipt' ? `<p><span>Còn lại sau khi thu theo phiếu</span><strong>${e(formatMoney(value.balanceAtIssue - value.amount))}</strong></p>` : ''}</section>`}
  <section class="notes">${value.kind === 'receipt' ? `${line('Hình thức thu:', methodLabels[value.method])}${line('Mã tham chiếu:', value.reference)}` : ''}${value.kind !== 'delivery' && bankText(value) ? `<h3>THÔNG TIN THANH TOÁN</h3><p>${e(bankText(value))}</p>` : ''}${value.terms ? `<h3>ĐIỀU KIỆN / THỎA THUẬN</h3><p>${e(value.terms)}</p>` : ''}${value.note ? `<h3>GHI CHÚ</h3><p>${e(value.note)}</p>` : ''}</section>
  <section class="signatures">${signatures.map(label => `<div><p><b>${e(label)}</b></p><small>Ký, ghi rõ họ tên${label.includes('đơn vị') ? ', đóng dấu (nếu có)' : ''}</small><div class="sign-space"></div></div>`).join('')}</section><footer class="footer">${footerText}</footer></article></body></html>`
}

export function downloadDocumentHTML(value: SalesDocument) { downloadFile(`${filename(value)}.html`, buildDocumentHTML(value), 'text/html;charset=utf-8') }

export function printDocument(value: SalesDocument) {
  const frame = document.createElement('iframe')
  frame.title = `In ${documentLabels[value.kind]} ${value.number}`
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;'
  frame.onload = () => {
    const target = frame.contentWindow
    if (!target) { frame.remove(); return }
    target.addEventListener('afterprint', () => frame.remove(), { once: true })
    target.focus()
    target.print()
  }
  frame.srcdoc = buildDocumentHTML(value)
  document.body.append(frame)
  // Browsers differ in afterprint support; retain the document long enough for the dialog.
  setTimeout(() => frame.remove(), 120_000)
}

const fontCache = new Map<string, Promise<string>>()
function fontBase64(name: string): Promise<string> {
  const cached = fontCache.get(name)
  if (cached) return cached
  const request = (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/${name}`)
    if (!response.ok) throw new Error('Không tải được phông chữ tiếng Việt. Bạn có thể dùng “In / Lưu PDF”.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192))
    return btoa(binary)
  })().catch(error => { fontCache.delete(name); throw error })
  fontCache.set(name, request)
  return request
}

/** Text-based A4 PDF with embedded Vietnamese fonts and explicit page-break handling. */
export async function createDocumentPDF(value: SalesDocument): Promise<Blob> {
  const [{ jsPDF }, regular, bold] = await Promise.all([import('jspdf'), fontBase64('NotoSans-Regular.ttf'), fontBase64('NotoSans-Bold.ttf')])
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  pdf.addFileToVFS('NotoSans-Regular.ttf', regular)
  pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal')
  pdf.addFileToVFS('NotoSans-Bold.ttf', bold)
  pdf.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold')
  pdf.setProperties({ title: `${documentLabels[value.kind]} ${value.number}`, subject: 'Chứng từ thương mại nội bộ', creator: 'XưởngViệt' })
  const margin = 16, width = 178, bottom = 270
  let y = 20
  function font(size = 10, strong = false) { pdf.setFont('NotoSans', strong ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(29, 47, 55) }
  function page() {
    pdf.addPage(); y = 18; font(8)
    const header = `${documentLabels[value.kind]} · ${value.number} (tiếp)`
    pdf.text(header, margin, y); y += 7
    pdf.setDrawColor(212, 224, 221); pdf.line(margin, y, margin + width, y); y += 8
  }
  function ensure(height: number) { if (y + height > bottom) { page(); return true } return false }
  function text(content: string, size = 10, strong = false, center = false) {
    font(size, strong)
    const lines: string[] = pdf.splitTextToSize(content.replace(/\r\n?/g, '\n'), width)
    const leading = size * .51
    for (const line of lines) { ensure(leading); font(size, strong); pdf.text(line, center ? 105 : margin, y, center ? { align: 'center' } : {}); y += leading }
  }
  function detail(label: string, content: string) { if (content) text(`${label}: ${content}`, 9) }
  function section(title: string, content: string) { if (!content) return; ensure(16); y += 4; text(title, 10, true); text(content, 9); y += 2 }

  text(value.company.name, 15, true)
  detail('Địa chỉ', value.company.address); detail('Mã số thuế', value.company.taxCode)
  detail('Điện thoại', value.company.phone); detail('Email', value.company.email); detail('Website', value.company.website)
  y += 5; ensure(8); pdf.setDrawColor(28, 114, 97); pdf.line(margin, y, margin + width, y); y += 12
  text(documentLabels[value.kind].toLocaleUpperCase('vi-VN'), 17, true, true)
  text(`Số: ${value.number} · Ngày ${formatDate(value.date)}`, 9, false, true); y += 8
  if (value.status === 'void') { text('CHỨNG TỪ ĐÃ HỦY', 12, true); detail('Lý do', value.voidReason); text('Không có giá trị thu tiền hoặc giao hàng.', 9); y += 5 }
  text(value.kind === 'receipt' ? 'NGƯỜI NỘP TIỀN / KHÁCH HÀNG' : 'THÔNG TIN KHÁCH HÀNG', 10, true)
  detail('Đơn vị', value.customer.name); detail('Người liên hệ', value.customer.contact); detail('Địa chỉ', value.customer.address)
  detail('Điện thoại', value.customer.phone); detail('Email', value.customer.email); detail('Đơn hàng', value.order.code)
  if (value.kind === 'quotation' || value.kind === 'delivery') detail('Hạn giao theo đơn', formatDate(value.order.dueDate))
  y += 7

  const delivery = value.kind === 'delivery'
  const widths = delivery ? [106, 36, 36] : [87, 21, 34, 36]
  const headers = delivery ? ['Chi tiết / sản phẩm', 'Số lượng đặt', 'Giao lần này'] : ['Chi tiết / sản phẩm', 'Số lượng', 'Đơn giá', 'Thành tiền']
  function tableHeader() {
    font(8, true)
    const lines: string[][] = headers.map((header, index) => pdf.splitTextToSize(header, widths[index] - 5))
    const height = Math.max(...lines.map(list => list.length)) * 4 + 5
    ensure(height + 12)
    let x = margin
    lines.forEach((list, index) => {
      pdf.setFillColor(236, 243, 241); pdf.setDrawColor(210, 222, 219); pdf.rect(x, y, widths[index], height, 'FD')
      list.forEach((line, lineIndex) => { font(8, true); pdf.text(line, x + 2.5, y + 4.5 + lineIndex * 4) }); x += widths[index]
    })
    y += height
  }
  tableHeader()
  const description = [value.order.partName, value.order.material && `Vật liệu: ${value.order.material}`, value.order.drawing && `Bản vẽ: ${value.order.drawing}`].filter(Boolean).join('\n')
  const cells = delivery ? [description, String(value.order.quantity), String(value.deliveryQuantity)] : [description, String(value.order.quantity), formatMoney(value.order.unitPrice), formatMoney(total(value))]
  font(9)
  const cellLines: string[][] = cells.map((cell, index) => pdf.splitTextToSize(cell, widths[index] - 5))
  const count = Math.max(...cellLines.map(lines => lines.length))
  let offset = 0
  while (offset < count) {
    if (bottom - y < 12) { page(); tableHeader() }
    const rows = Math.min(count - offset, Math.max(1, Math.floor((bottom - y - 6) / 4.7)))
    const height = rows * 4.7 + 6
    let x = margin
    cellLines.forEach((lines, index) => {
      pdf.setDrawColor(210, 222, 219); pdf.rect(x, y, widths[index], height)
      lines.slice(offset, offset + rows).forEach((line, lineIndex) => {
        font(9); pdf.text(line, index === 0 ? x + 2.5 : x + widths[index] - 2.5, y + 5 + lineIndex * 4.7, index === 0 ? {} : { align: 'right' })
      }); x += widths[index]
    })
    y += height; offset += rows
    if (offset < count) { page(); tableHeader() }
  }
  y += 7
  if (delivery) text('Phiếu xác nhận số lượng giao theo chứng từ. Không tự thay đổi tiến độ sản xuất hoặc tồn kho.', 8)
  else {
    ensure(32)
    detail('Giá trị đơn hàng', formatMoney(total(value)))
    detail(value.kind === 'receipt' ? 'Đã thu trước phiếu này' : 'Đã thu tại thời điểm lập', formatMoney(value.paidAtIssue))
    detail(value.kind === 'receipt' ? 'Còn phải thu trước phiếu này' : 'Còn phải thu tại thời điểm lập', formatMoney(value.balanceAtIssue))
    text(`${amountLabel(value)}: ${formatMoney(amount(value))}`, 11, true)
    if (value.kind === 'receipt') detail('Còn lại sau khi thu theo phiếu', formatMoney(value.balanceAtIssue - value.amount))
  }
  if (value.kind === 'receipt') { section('HÌNH THỨC THU', methodLabels[value.method]); detail('Mã tham chiếu', value.reference) }
  if (!delivery) section('THÔNG TIN THANH TOÁN', bankText(value))
  section('ĐIỀU KIỆN / THỎA THUẬN', value.terms)
  section('GHI CHÚ', value.note)
  ensure(48); y += 10
  signatureLabels(value).forEach((label, index) => {
    const x = margin + width * (index === 0 ? .25 : .75)
    font(9, true); pdf.text(label, x, y, { align: 'center' })
    font(8); pdf.text('Ký, ghi rõ họ tên', x, y + 6, { align: 'center' })
    pdf.setDrawColor(170, 185, 181); pdf.line(x - 28, y + 31, x + 28, y + 31)
  })
  const pages = pdf.getNumberOfPages()
  for (let index = 1; index <= pages; index++) {
    pdf.setPage(index); font(7)
    pdf.setTextColor(92, 111, 116); pdf.setDrawColor(212, 224, 221); pdf.line(margin, 277, margin + width, 277)
    const lines: string[] = pdf.splitTextToSize(footerText, width)
    lines.forEach((line, lineIndex) => pdf.text(line, margin, 282 + lineIndex * 3.4))
    pdf.text(`Trang ${index}/${pages}`, margin + width, 292, { align: 'right' })
  }
  return pdf.output('blob')
}

export async function downloadDocumentPDF(value: SalesDocument) {
  const blob = await createDocumentPDF(value)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a'); link.href = url; link.download = `${filename(value)}.pdf`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
