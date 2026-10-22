import { describe, expect, it } from 'vitest'
import {
  calculatePayroll, closePayroll, createEmptyPayroll, createPayrollSeed, isPayrollClosed, payrollToCSV,
  reopenPayroll, updatePayrollSettings, upsertAdjustment, upsertAllowanceType, upsertAttendance, upsertEmployee, validatePayrollData,
  type Attendance, type PayrollData,
} from './payroll'

function fixture(): PayrollData {
  const data = createEmptyPayroll()
  data.settings.employeeInsuranceRate = 10.5
  data.allowanceTypes = [{ id: 'meal', name: 'Ăn ca', basis: 'workday', defaultAmount: 30_000 }, { id: 'travel', name: 'Đi lại', basis: 'fixed', defaultAmount: 300_000 }]
  data.employees = [{ id: 'e1', code: 'NV01', name: 'Thợ mẫu', role: 'Thợ CNC', department: 'Xưởng', phone: '', startDate: '2026-01-01', endDate: '', salaryType: 'monthly', baseSalary: 26_000_000, insuranceBase: 10_000_000,
    allowances: [{ allowanceId: 'meal', amount: 30_000 }, { allowanceId: 'travel', amount: 300_000 }] }]
  return data
}
function attendance(date: string, patch: Partial<Attendance> = {}): Attendance {
  return { id: `att-${date}`, employeeId: 'e1', date, regularHours: 8, paidLeaveHours: 0, overtimeWeekdayHours: 0, overtimeRestDayHours: 0, overtimeHolidayHours: 0, note: '', ...patch }
}

describe('payroll formulas', () => {
  it('calculates ordinary salary, paid leave, distinct OT factors, allowances and deductions with independent expected amounts', () => {
    let data = fixture()
    data.attendance = [attendance('2026-10-01', { overtimeWeekdayHours: 2, overtimeRestDayHours: 3, overtimeHolidayHours: 1 }), attendance('2026-10-02'), attendance('2026-10-03', { regularHours: 0, paidLeaveHours: 8 })]
    data = upsertAdjustment(data, { id: 'a1', employeeId: 'e1', month: '2026-10', bonus: 200_000, advance: 500_000, deduction: 50_000, tax: 100_000, note: '' })
    expect(calculatePayroll(data, '2026-10')[0]).toMatchObject({ paidDays: 3, workedDays: 2, ordinaryPay: 3_000_000, overtimePay: 1_500_000,
      allowancePay: 360_000, bonus: 200_000, grossPay: 5_060_000, insurance: 1_050_000, tax: 100_000, deduction: 50_000, advance: 500_000, netPay: 3_360_000 })
  })
  it.each([['daily', 400_000, 600_000, 150_000], ['hourly', 60_000, 720_000, 180_000]] as const)('uses %s salary correctly for fractional days and overtime', (salaryType, baseSalary, ordinaryPay, overtimePay) => {
    const data = fixture()
    data.employees[0] = { ...data.employees[0], salaryType, baseSalary }
    data.attendance = [attendance('2026-10-01', { overtimeWeekdayHours: 2 }), attendance('2026-10-02', { regularHours: 4 })]
    expect(calculatePayroll(data, '2026-10')[0]).toMatchObject({ paidDays: 1.5, ordinaryPay, overtimePay, allowancePay: 345_000 })
  })
  it('does not cap monthly pay at standard days', () => {
    const data = fixture()
    data.attendance = Array.from({ length: 27 }, (_, i) => attendance(`2026-10-${String(i + 1).padStart(2, '0')}`))
    expect(calculatePayroll(data, '2026-10')[0].ordinaryPay).toBe(27_000_000)
  })
  it('does not pay salary, fixed allowances or insurance when there are no paid hours', () => {
    expect(calculatePayroll(fixture(), '2026-10')[0]).toMatchObject({ ordinaryPay: 0, allowancePay: 0, insurance: 0, netPay: 0 })
  })
  it('retains negative net pay as a visible recoverable balance', () => {
    const data = upsertAdjustment(fixture(), { id: 'a1', employeeId: 'e1', month: '2026-10', bonus: 0, advance: 2_000_000, deduction: 0, tax: 0, note: '' })
    expect(calculatePayroll(data, '2026-10')[0].netPay).toBe(-2_000_000)
  })
  it('rounds monetary components to VND before totaling', () => {
    const data = fixture()
    data.employees[0].baseSalary = 10_000_001
    data.employees[0].allowances = []
    data.employees[0].insuranceBase = 0
    data.attendance = [attendance('2026-10-01', { overtimeWeekdayHours: 1 })]
    const row = calculatePayroll(data, '2026-10')[0]
    expect(row.ordinaryPay).toBe(384_615)
    expect(row.overtimePay).toBe(72_115)
    expect(row.netPay).toBe(456_730)
  })
  it('keeps former employees in historical periods and excludes pre-hire/post-exit months', () => {
    const data = fixture()
    data.employees[0].endDate = '2026-10-15'
    data.attendance = [attendance('2026-10-01')]
    expect(calculatePayroll(data, '2026-10')).toHaveLength(1)
    expect(calculatePayroll(data, '2026-11')).toHaveLength(0)
    expect(calculatePayroll(data, '2025-12')).toHaveLength(0)
  })
})

describe('locked payroll and updates', () => {
  it('freezes a historical row/settings independently of later salary, names and rules', () => {
    const data = fixture()
    data.attendance = [attendance('2026-10-01')]
    const closed = closePayroll(data, '2026-10')
    const expected = calculatePayroll(closed, '2026-10')
    const changed = upsertEmployee(closed, { ...closed.employees[0], name: 'Tên mới', baseSalary: 99_000_000 })
    changed.settings.standardDays = 20
    changed.settings.hoursPerDay = 4
    changed.allowanceTypes[0].basis = 'fixed'
    expect(calculatePayroll(changed, '2026-10')).toEqual(expected)
    expect(closed.periods[0].settings.hoursPerDay).toBe(8)
    const read = calculatePayroll(changed, '2026-10')
    read[0].name = 'Mutated caller copy'
    expect(calculatePayroll(changed, '2026-10')).toEqual(expected)
    expect(data.periods).toHaveLength(0)
  })
  it('blocks changes to locked attendance and adjustments, including moving their id to an open month', () => {
    let data = fixture()
    data.attendance = [attendance('2026-10-01')]
    const adjustment = { id: 'a1', employeeId: 'e1', month: '2026-10', bonus: 0, advance: 0, deduction: 0, tax: 0, note: '' }
    data = closePayroll(upsertAdjustment(data, adjustment), '2026-10')
    expect(() => upsertAttendance(data, attendance('2026-10-02'))).toThrow(/khóa/)
    expect(() => upsertAttendance(data, { ...data.attendance[0], date: '2026-11-01' })).toThrow(/khóa/)
    expect(() => upsertAdjustment(data, adjustment)).toThrow(/khóa/)
    expect(() => upsertAdjustment(data, { ...adjustment, month: '2026-11' })).toThrow(/khóa/)
    expect(() => closePayroll(data, '2026-10')).toThrow(/khóa/)
    expect(isPayrollClosed(data, '2026-10')).toBe(true)
    const reopened = reopenPayroll(data, '2026-10')
    expect(isPayrollClosed(reopened, '2026-10')).toBe(false)
    expect(upsertAttendance(reopened, attendance('2026-10-01', { regularHours: 4 })).attendance[0].regularHours).toBe(4)
  })
  it('replaces same worker/day and worker/month rather than double counting', () => {
    let data = upsertAttendance(fixture(), attendance('2026-10-01'))
    data = upsertAttendance(data, attendance('2026-10-01', { id: 'new-id', regularHours: 4 }))
    expect(data.attendance).toHaveLength(1)
    expect(data.attendance[0].id).toBe('att-2026-10-01')
    const adjustment = { id: 'a1', employeeId: 'e1', month: '2026-10', bonus: 0, advance: 0, deduction: 0, tax: 0, note: '' }
    data = upsertAdjustment(upsertAdjustment(data, adjustment), { ...adjustment, id: 'new-id', bonus: 100 })
    expect(data.adjustments).toHaveLength(1)
    expect(data.adjustments[0].bonus).toBe(100)
  })
  it('rejects settings incompatible with open attendance and permits safe settings updates', () => {
    const data = upsertAttendance(fixture(), attendance('2026-10-01'))
    expect(() => updatePayrollSettings(data, { ...data.settings, hoursPerDay: 4 })).toThrow(/chấm công/)
    expect(updatePayrollSettings(data, { ...data.settings, standardDays: 24 }).settings.standardDays).toBe(24)
    expect(upsertAllowanceType(data, { id: 'other', name: 'Trách nhiệm', basis: 'fixed', defaultAmount: 200_000 }).allowanceTypes).toHaveLength(3)
  })
})

describe('payroll validation and export', () => {
  it('provides valid empty and seeded current/previous periods using the local calendar', () => {
    expect(validatePayrollData(createEmptyPayroll())).toBe(true)
    const data = createPayrollSeed(new Date(2026, 0, 1, 0, 1))
    expect(validatePayrollData(data)).toBe(true)
    expect(data.employees).toHaveLength(5)
    expect(data.periods[0].month).toBe('2025-12')
    expect(data.attendance.some(v => v.date === '2026-01-01')).toBe(true)
  })
  it('rejects malformed nested data without throwing', () => {
    for (const value of [null, {}, [], { ...fixture(), version: 2 }, { ...fixture(), employees: [null] }, { ...fixture(), allowanceTypes: [null] }, { ...fixture(), periods: [null] }, { ...fixture(), employees: [{ ...fixture().employees[0], allowances: [null] }] }]) {
      expect(validatePayrollData(value)).toBe(false)
    }
  })
  it('rejects duplicate identifiers, employee codes and broken allowance/employee references', () => {
    const data = fixture()
    expect(validatePayrollData({ ...data, employees: [data.employees[0], data.employees[0]] })).toBe(false)
    expect(validatePayrollData({ ...data, employees: [data.employees[0], { ...data.employees[0], id: 'e2', code: 'nv01' }] })).toBe(false)
    expect(validatePayrollData({ ...data, allowanceTypes: [] })).toBe(false)
    expect(validatePayrollData({ ...data, attendance: [attendance('2026-10-01', { employeeId: 'missing' })] })).toBe(false)
    expect(validatePayrollData({ ...data, attendance: [attendance('2026-10-01'), attendance('2026-10-01', { id: 'different' })] })).toBe(false)
  })
  it('rejects impossible dates, dates outside employment and impossible daily hours', () => {
    for (const record of [attendance('2026-02-30'), attendance('2025-12-31'), attendance('2026-10-01', { paidLeaveHours: 1 }), attendance('2026-10-01', { overtimeWeekdayHours: 17 }), attendance('2026-10-01', { regularHours: -1 }), attendance('2026-10-01', { regularHours: NaN })]) {
      expect(validatePayrollData({ ...fixture(), attendance: [record] })).toBe(false)
    }
    expect(() => calculatePayroll(fixture(), '2026-13')).toThrow()
  })
  it('rejects nonfinite, negative and unbounded settings or money', () => {
    for (const patch of [{ standardDays: 0 }, { hoursPerDay: 13 }, { overtimeWeekday: Infinity }, { employeeInsuranceRate: 101 }, { overtimeHoliday: -1 }]) {
      expect(validatePayrollData({ ...fixture(), settings: { ...fixture().settings, ...patch } })).toBe(false)
    }
    for (const baseSalary of [-1, NaN, Infinity, 1e15]) {
      const data = fixture(); data.employees[0].baseSalary = baseSalary
      expect(validatePayrollData(data)).toBe(false)
    }
    const extreme = fixture(); extreme.employees[0].salaryType = 'hourly'; extreme.employees[0].baseSalary = 1e12
    extreme.attendance = [attendance('2026-10-01')]
    expect(() => calculatePayroll(extreme, '2026-10')).toThrow(/giới hạn/)
  })
  it('rejects corrupted snapshot arithmetic and duplicate closed periods', () => {
    const data = closePayroll(fixture(), '2026-10')
    const corrupted = structuredClone(data)
    corrupted.periods[0].rows[0].netPay = 100
    expect(validatePayrollData(corrupted)).toBe(false)
    expect(validatePayrollData({ ...data, periods: [...data.periods, { ...data.periods[0], id: 'second' }] })).toBe(false)
  })
  it('exports BOM UTF-8 CSV, escapes quotes and neutralizes spreadsheet formula injection', () => {
    const data = fixture()
    data.employees[0].name = '  =HYPERLINK("evil")'
    data.employees[0].code = '+formula'
    data.employees[0].department = '@SUM(1,2)'
    const csv = payrollToCSV(calculatePayroll(data, '2026-10'), '2026-10')
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"\'  =HYPERLINK(""evil"")"')
    expect(csv).toContain('"\'+formula"')
    expect(csv).toContain('"\'@SUM(1,2)"')
    expect(csv.split('\r\n')).toHaveLength(2)
  })
})
