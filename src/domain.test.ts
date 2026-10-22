import { describe, expect, it, vi } from 'vitest'
import { applyStockMovement, isOverdue, newId, orderBalance, orderTotal, validateData } from './domain'
import { createSeedData } from './seed'

const now = new Date(2026, 9, 22, 10)

describe('identifiers on an HTTP LAN demo', () => {
  it('creates RFC4122 v4 identifiers and saves stock movements without randomUUID', () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    vi.stubGlobal('crypto', { getRandomValues })
    try {
      const first = newId()
      const second = newId()
      expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(first).not.toBe(second)
      const updated = applyStockMovement(createSeedData(now), 'm1', 'in', 5, 'Nhập từ điện thoại')
      expect(updated.materials[0].stock).toBe(425)
      expect(validateData(updated)).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('manufacturing demo data and import validation', () => {
  it('produces a valid snapshot with orders in each production stage', () => {
    const data = createSeedData(now)
    expect(validateData(data)).toBe(true)
    expect(data.orders).toHaveLength(12)
    expect(new Set(data.orders.map(order => order.status)).size).toBe(5)
  })

  it('rejects partial and unsupported snapshots', () => {
    for (const value of [null, [], {}, { ...createSeedData(now), version: 2 }]) expect(validateData(value)).toBe(false)
  })

  it('rejects broken references, duplicate ids and impossible dates', () => {
    const data = createSeedData(now)
    expect(validateData({ ...data, customers: [] })).toBe(false)
    expect(validateData({ ...data, materials: [...data.materials, data.materials[0]] })).toBe(false)
    expect(validateData({ ...data, orders: [{ ...data.orders[0], dueDate: '2026-02-30' }] })).toBe(false)
    expect(validateData({ ...data, movements: [{ ...data.movements[0], materialId: 'missing' }] })).toBe(false)
  })

  it('rejects nonfinite money, excess completion and overpayments', () => {
    const data = createSeedData(now)
    for (const patch of [{ unitPrice: Infinity }, { paid: -1 }, { paid: 1e12 }, { completedQuantity: 9999 }, { quantity: 1.5 }, { status: '__proto__' }]) {
      expect(validateData({ ...data, orders: [{ ...data.orders[0], ...patch }] })).toBe(false)
    }
  })
})

describe('order calculations', () => {
  it('calculates the agreed order value and outstanding balance in VND', () => {
    const order = createSeedData(now).orders[0]
    expect(orderTotal(order)).toBe(46_200_000)
    expect(orderBalance(order)).toBe(28_200_000)
  })

  it('flags overdue orders including ready-to-ship, excluding delivered and due today', () => {
    const order = createSeedData(now).orders[0]
    expect(isOverdue({ ...order, dueDate: '2026-10-21', status: 'ready' }, now)).toBe(true)
    expect(isOverdue({ ...order, dueDate: '2026-10-21', status: 'delivered' }, now)).toBe(false)
    expect(isOverdue({ ...order, dueDate: '2026-10-22' }, now)).toBe(false)
  })
})

describe('stock ledger', () => {
  it('updates stock and adds a ledger entry without changing the old snapshot', () => {
    const data = createSeedData(now)
    const next = applyStockMovement(data, 'm1', 'out', 20, '  Xuất phôi thử  ')
    expect(data.materials[0].stock).toBe(420)
    expect(next.materials[0].stock).toBe(400)
    expect(next.movements).toHaveLength(data.movements.length + 1)
    expect(next.movements[0]).toMatchObject({ materialId: 'm1', type: 'out', quantity: 20, note: 'Xuất phôi thử' })
    expect(validateData(next)).toBe(true)
    expect(applyStockMovement(next, 'm1', 'in', 30, '').materials[0].stock).toBe(430)
  })

  it('prevents negative stock, unknown materials and invalid quantities', () => {
    const data = createSeedData(now)
    expect(() => applyStockMovement(data, 'm1', 'out', 421, '')).toThrow('Không đủ tồn kho')
    expect(() => applyStockMovement(data, 'missing', 'in', 1, '')).toThrow('Không tìm thấy')
    for (const quantity of [0, -10, NaN, Infinity]) expect(() => applyStockMovement(data, 'm1', 'in', quantity, '')).toThrow()
    expect(applyStockMovement(data, 'm1', 'out', 420, '').materials[0].stock).toBe(0)
  })
})
