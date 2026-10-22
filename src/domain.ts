import { validatePayrollData, type PayrollData } from './payroll'
import { validateCommerce, type CommerceData } from './commerce'

export type OrderStatus = 'pending' | 'machining' | 'qc' | 'ready' | 'delivered'
export type Priority = 'normal' | 'high'

export interface Order {
  id: string
  code: string
  customerId: string
  partName: string
  quantity: number
  unitPrice: number
  dueDate: string
  createdAt: string
  status: OrderStatus
  priority: Priority
  drawing: string
  material: string
  machine: string
  operator: string
  completedQuantity: number
  paid: number
  notes: string
}

export interface Material {
  id: string
  code: string
  name: string
  spec: string
  unit: string
  stock: number
  minStock: number
  unitCost: number
}

export interface Customer {
  id: string
  name: string
  contact: string
  phone: string
  email: string
  address: string
}

export interface StockMovement {
  id: string
  materialId: string
  type: 'in' | 'out'
  quantity: number
  date: string
  note: string
}

export interface Data {
  version: 1
  orders: Order[]
  materials: Material[]
  customers: Customer[]
  movements: StockMovement[]
  /** Optional to preserve existing v1 demo/cloud backups without inventing staff. */
  payroll?: PayrollData
  /** Optional: old workshop/payroll snapshots remain valid until an admin edits commerce. */
  commerce?: CommerceData
}

export const statusLabels: Record<OrderStatus, string> = {
  pending: 'Chờ sản xuất',
  machining: 'Đang gia công',
  qc: 'Kiểm tra chất lượng',
  ready: 'Sẵn sàng giao',
  delivered: 'Đã giao',
}

export const statusProgress: Record<OrderStatus, number> = {
  pending: 0, machining: 45, qc: 75, ready: 90, delivered: 100,
}

const moneyFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
const compactMoneyFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact', maximumFractionDigits: 1 })
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function formatMoney(value: number): string { return moneyFormatter.format(value) }
export function formatCompactMoney(value: number): string { return compactMoneyFormatter.format(value) }
export function formatDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormatter.format(parsed)
}

/** Local calendar date avoids midnight UTC shifting deadlines for Vietnamese users. */
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function isOverdue(order: Order, now = new Date()): boolean {
  return order.status !== 'delivered' && order.dueDate < localDate(now)
}

export function orderTotal(order: Order): number { return order.quantity * order.unitPrice }
export function orderBalance(order: Order): number { return Math.max(0, orderTotal(order) - order.paid) }

/** LAN demos may use HTTP, where randomUUID is unavailable but getRandomValues works. */
export function newId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 10_000
const requiredText = (value: unknown): value is string => text(value) && value.trim().length > 0
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
const date = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const uniqueIds = (values: Array<Record<string, unknown>>) => new Set(values.map(value => value.id)).size === values.length

/** Validate imports before replacing local data, including relational integrity. */
export function validateData(value: unknown): value is Data {
  if (!record(value) || value.version !== 1) return false
  if (value.payroll !== undefined && !validatePayrollData(value.payroll)) return false
  const { orders, materials, customers, movements } = value
  if (![orders, materials, customers, movements].every(items => Array.isArray(items) && items.length <= 50_000)) return false
  if (!Array.isArray(orders) || !Array.isArray(materials) || !Array.isArray(customers) || !Array.isArray(movements)) return false
  for (const items of [orders, materials, customers, movements]) {
    if (!items.every(item => record(item) && requiredText(item.id)) || !uniqueIds(items)) return false
  }
  if (!customers.every(customer => requiredText(customer.name) && ['contact', 'phone', 'email', 'address'].every(key => text(customer[key])))) return false
  if (!materials.every(material => ['code', 'name', 'unit'].every(key => requiredText(material[key])) && text(material.spec) && ['stock', 'minStock', 'unitCost'].every(key => number(material[key])))) return false
  const customerIds = new Set(customers.map(customer => customer.id))
  const materialIds = new Set(materials.map(material => material.id))
  if (!orders.every(order => {
    if (!['code', 'customerId', 'partName'].every(key => requiredText(order[key])) || !customerIds.has(order.customerId)) return false
    if (!['drawing', 'material', 'machine', 'operator', 'notes'].every(key => text(order[key]))) return false
    if (!number(order.quantity) || !Number.isInteger(order.quantity) || order.quantity < 1 || !number(order.unitPrice) || !number(order.paid)) return false
    if (!number(order.completedQuantity) || !Number.isInteger(order.completedQuantity) || order.completedQuantity > order.quantity) return false
    if (!Number.isSafeInteger(order.quantity * order.unitPrice) || order.paid > order.quantity * order.unitPrice) return false
    return date(order.dueDate) && date(order.createdAt) && Object.prototype.hasOwnProperty.call(statusLabels, order.status) && ['normal', 'high'].includes(order.priority)
  })) return false
  return movements.every(movement => materialIds.has(movement.materialId) && ['in', 'out'].includes(movement.type) && number(movement.quantity) && movement.quantity > 0 && date(movement.date) && text(movement.note)) && (value.commerce === undefined || validateCommerce(value.commerce, orders as unknown as Order[]))
}

export function applyStockMovement(data: Data, materialId: string, type: 'in' | 'out', quantity: number, note: string): Data {
  const material = data.materials.find(item => item.id === materialId)
  if (!material) throw new Error('Không tìm thấy vật tư.')
  if (type !== 'in' && type !== 'out') throw new Error('Loại giao dịch không hợp lệ.')
  if (!number(quantity) || quantity <= 0) throw new Error('Số lượng phải lớn hơn 0 và là số hợp lệ.')
  if (!text(note)) throw new Error('Ghi chú không hợp lệ.')
  if (type === 'out' && quantity > material.stock) throw new Error(`Không đủ tồn kho. Hiện còn ${material.stock} ${material.unit}.`)
  const stock = material.stock + (type === 'in' ? quantity : -quantity)
  if (!number(stock)) throw new Error('Số lượng tồn kho vượt giới hạn cho phép.')
  return {
    ...data,
    materials: data.materials.map(item => item.id === materialId ? { ...item, stock: Math.round(stock * 1_000_000) / 1_000_000 } : item),
    movements: [{ id: newId(), materialId, type, quantity, note: note.trim(), date: localDate() }, ...data.movements],
  }
}
