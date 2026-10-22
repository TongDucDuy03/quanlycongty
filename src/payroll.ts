export type SalaryType = 'monthly' | 'daily' | 'hourly'
export interface Employee {
  id: string; code: string; name: string; role: string; department: string; phone: string
  startDate: string; endDate: string; salaryType: SalaryType; baseSalary: number; insuranceBase: number
  allowances: { allowanceId: string; amount: number }[]
}
export interface AllowanceType { id: string; name: string; basis: 'fixed' | 'workday'; defaultAmount: number }
export interface PayrollSettings {
  standardDays: number; hoursPerDay: number; overtimeWeekday: number; overtimeRestDay: number
  overtimeHoliday: number; employeeInsuranceRate: number
}
export interface Attendance {
  id: string; employeeId: string; date: string; regularHours: number; paidLeaveHours: number
  overtimeWeekdayHours: number; overtimeRestDayHours: number; overtimeHolidayHours: number; note: string
}
export interface PayrollAdjustment {
  id: string; employeeId: string; month: string; bonus: number; advance: number; deduction: number; tax: number; note: string
}
export interface PayrollRow {
  employeeId: string; code: string; name: string; role: string; department: string; salaryType: SalaryType; baseSalary: number
  paidDays: number; workedDays: number; regularHours: number; paidLeaveHours: number
  overtimeWeekdayHours: number; overtimeRestDayHours: number; overtimeHolidayHours: number
  ordinaryPay: number; overtimePay: number; allowancePay: number; bonus: number; grossPay: number
  insurance: number; tax: number; deduction: number; advance: number; netPay: number
}
export interface PayrollPeriod { id: string; month: string; closedAt: string; settings: PayrollSettings; rows: PayrollRow[] }
export interface PayrollData {
  version: 1; employees: Employee[]; attendance: Attendance[]; allowanceTypes: AllowanceType[]
  settings: PayrollSettings; adjustments: PayrollAdjustment[]; periods: PayrollPeriod[]
}

const MAX_MONEY = 1_000_000_000_000
const hourKeys = ['regularHours', 'paidLeaveHours', 'overtimeWeekdayHours', 'overtimeRestDayHours', 'overtimeHolidayHours'] as const
const moneyKeys = ['ordinaryPay', 'overtimePay', 'allowancePay', 'bonus', 'grossPay', 'insurance', 'tax', 'deduction', 'advance'] as const
const clone = <T>(value: T): T => structuredClone(value)
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const string = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max
const required = (v: unknown): v is string => string(v, 200) && v.trim().length > 0
const number = (v: unknown, max: number, min = 0): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const money = (v: unknown): v is number => number(v, MAX_MONEY)
const validMonth = (v: unknown): v is string => typeof v === 'string' && /^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(v)
const validDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !validMonth(v.slice(0, 7)) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const date = new Date(`${v}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v
}
const unique = (values: string[]) => new Set(values).size === values.length
const salaryType = (v: unknown): v is SalaryType => v === 'monthly' || v === 'daily' || v === 'hourly'
const settingsValid = (v: unknown): v is PayrollSettings => object(v)
  && number(v.standardDays, 31, 1) && number(v.hoursPerDay, 12, 1)
  && number(v.overtimeWeekday, 10) && number(v.overtimeRestDay, 10) && number(v.overtimeHoliday, 10)
  && number(v.employeeInsuranceRate, 100)
const employedOn = (employee: Employee, date: string) => date >= employee.startDate && (!employee.endDate || date <= employee.endDate)
const employedIn = (employee: Employee, month: string) => employee.startDate.slice(0, 7) <= month && (!employee.endDate || employee.endDate.slice(0, 7) >= month)

function rowValid(v: unknown): v is PayrollRow {
  if (!object(v) || !required(v.employeeId) || !required(v.code) || !required(v.name)
    || !string(v.role) || !string(v.department) || !salaryType(v.salaryType) || !money(v.baseSalary)
    || !number(v.paidDays, 31) || !number(v.workedDays, 31)
    || !hourKeys.every(key => number(v[key], 744)) || !moneyKeys.every(key => money(v[key]) && Number.isInteger(v[key]))
    || !number(v.netPay, MAX_MONEY, -MAX_MONEY) || !Number.isInteger(v.netPay)) return false
  return v.grossPay === (v.ordinaryPay as number) + (v.overtimePay as number) + (v.allowancePay as number) + (v.bonus as number)
    && v.netPay === (v.grossPay as number) - (v.insurance as number) - (v.tax as number) - (v.deduction as number) - (v.advance as number)
}

/** Strict validation for local and cloud backup imports; never coerces untrusted values. */
export function validatePayrollData(value: unknown): value is PayrollData {
  if (!object(value) || value.version !== 1 || !settingsValid(value.settings)) return false
  for (const key of ['employees', 'attendance', 'allowanceTypes', 'adjustments', 'periods']) {
    if (!Array.isArray(value[key]) || value[key].length > 100_000 || !value[key].every((v: unknown) => object(v) && required(v.id))) return false
    if (!unique(value[key].map((v: { id: string }) => v.id))) return false
  }
  const data = value as unknown as PayrollData
  if (!data.allowanceTypes.every(v => required(v.name) && (v.basis === 'fixed' || v.basis === 'workday') && money(v.defaultAmount))) return false
  const allowanceIds = new Set(data.allowanceTypes.map(v => v.id))
  if (!data.employees.every(v => required(v.code) && required(v.name) && string(v.role) && string(v.department) && string(v.phone, 50)
    && validDate(v.startDate) && (v.endDate === '' || (validDate(v.endDate) && v.endDate >= v.startDate))
    && salaryType(v.salaryType) && money(v.baseSalary) && money(v.insuranceBase) && Array.isArray(v.allowances)
    && v.allowances.length <= 1000 && v.allowances.every(a => object(a) && required(a.allowanceId) && allowanceIds.has(a.allowanceId) && money(a.amount))
    && unique(v.allowances.map(a => a.allowanceId)))) return false
  if (!unique(data.employees.map(v => v.code.trim().toLocaleLowerCase('vi')))) return false
  const employees = new Map(data.employees.map(v => [v.id, v]))
  // Historical attendance is checked against its period's settings after the month is closed.
  if (!data.periods.every(v => validMonth(v.month) && string(v.closedAt, 40) && /^\d{4}-\d{2}-\d{2}T/.test(v.closedAt) && validDate(v.closedAt.slice(0, 10))
    && Number.isFinite(Date.parse(v.closedAt)) && settingsValid(v.settings) && Array.isArray(v.rows)
    && v.rows.length <= 100_000 && v.rows.every(rowValid) && unique(v.rows.map(r => r.employeeId))
    && v.rows.every(r => r.paidDays === (r.regularHours + r.paidLeaveHours) / v.settings.hoursPerDay
      && r.workedDays === r.regularHours / v.settings.hoursPerDay))) return false
  if (!unique(data.periods.map(v => v.month))) return false
  const periods = new Map(data.periods.map(v => [v.month, v]))
  if (!data.attendance.every(v => {
    const employee = employees.get(v.employeeId)
    if (!employee || !validDate(v.date) || !string(v.note, 2000) || !hourKeys.every(key => number(v[key], 24))) return false
    const period = periods.get(v.date.slice(0, 7))
    const settings = period?.settings ?? data.settings
    // Closed snapshots remain valid if an employee's employment dates are corrected later.
    return (Boolean(period) || employedOn(employee, v.date)) && v.regularHours + v.paidLeaveHours <= settings.hoursPerDay
      && hourKeys.reduce((sum, key) => sum + v[key], 0) <= 24
  })) return false
  if (!unique(data.attendance.map(v => `${v.employeeId}|${v.date}`))) return false
  if (!data.adjustments.every(v => employees.has(v.employeeId) && validMonth(v.month) && string(v.note, 2000)
    && ['bonus', 'advance', 'deduction', 'tax'].every(key => money(v[key as keyof PayrollAdjustment])))) return false
  return unique(data.adjustments.map(v => `${v.employeeId}|${v.month}`))
}

export function createEmptyPayroll(): PayrollData {
  return { version: 1, employees: [], attendance: [], allowanceTypes: [], adjustments: [], periods: [],
    settings: { standardDays: 26, hoursPerDay: 8, overtimeWeekday: 1.5, overtimeRestDay: 2, overtimeHoliday: 3, employeeInsuranceRate: 0 } }
}
export function isPayrollClosed(data: PayrollData, month: string): boolean { return data.periods.some(v => v.month === month) }

export function upsertEmployee(data: PayrollData, employee: Employee): PayrollData {
  const next = { ...data, employees: [...data.employees.filter(v => v.id !== employee.id), clone(employee)] }
  if (!validatePayrollData(next)) throw new Error('Nhân viên không hợp lệ: kiểm tra mã trùng, ngày làm việc, tiền lương và phụ cấp. Ngày làm việc phải bao gồm chấm công chưa khóa.')
  return next
}
export function upsertAllowanceType(data: PayrollData, allowance: AllowanceType): PayrollData {
  const next = { ...data, allowanceTypes: [...data.allowanceTypes.filter(v => v.id !== allowance.id), clone(allowance)] }
  if (!validatePayrollData(next)) throw new Error('Loại phụ cấp hoặc số tiền mặc định không hợp lệ.')
  return next
}
export function updatePayrollSettings(data: PayrollData, settings: PayrollSettings): PayrollData {
  const next = { ...data, settings: clone(settings) }
  if (!validatePayrollData(next)) throw new Error('Cấu hình không hợp lệ hoặc giờ công chuẩn nhỏ hơn chấm công hiện có. Ngày chuẩn: 1–31, giờ/ngày: 1–12, hệ số: 0–10, bảo hiểm: 0–100%.')
  return next
}

export function calculatePayroll(data: PayrollData, month: string): PayrollRow[] {
  if (!validMonth(month)) throw new Error('Tháng tính lương không hợp lệ.')
  if (!validatePayrollData(data)) throw new Error('Dữ liệu nhân sự hoặc cấu hình lương không hợp lệ.')
  const closed = data.periods.find(v => v.month === month)
  if (closed) return clone(closed.rows)
  const s = data.settings
  const rows = data.employees.filter(employee => employedIn(employee, month)).map(employee => {
    const records = data.attendance.filter(v => v.employeeId === employee.id && v.date.startsWith(month))
    const total = (key: typeof hourKeys[number]) => records.reduce((sum, v) => sum + v[key], 0)
    const regularHours = total('regularHours'), paidLeaveHours = total('paidLeaveHours')
    const paidDays = (regularHours + paidLeaveHours) / s.hoursPerDay, workedDays = regularHours / s.hoursPerDay
    const hourly = employee.salaryType === 'monthly' ? employee.baseSalary / s.standardDays / s.hoursPerDay
      : employee.salaryType === 'daily' ? employee.baseSalary / s.hoursPerDay : employee.baseSalary
    const ordinaryPay = Math.round(hourly * (regularHours + paidLeaveHours))
    const overtimeWeekdayHours = total('overtimeWeekdayHours'), overtimeRestDayHours = total('overtimeRestDayHours'), overtimeHolidayHours = total('overtimeHolidayHours')
    const overtimePay = Math.round(hourly * (overtimeWeekdayHours * s.overtimeWeekday + overtimeRestDayHours * s.overtimeRestDay + overtimeHolidayHours * s.overtimeHoliday))
    const allowancePay = employee.allowances.reduce((sum, a) => sum + Math.round(a.amount * (data.allowanceTypes.find(v => v.id === a.allowanceId)!.basis === 'workday' ? workedDays : paidDays > 0 ? 1 : 0)), 0)
    const adjustment = data.adjustments.find(v => v.employeeId === employee.id && v.month === month)
    const bonus = Math.round(adjustment?.bonus ?? 0), tax = Math.round(adjustment?.tax ?? 0)
    const advance = Math.round(adjustment?.advance ?? 0), deduction = Math.round(adjustment?.deduction ?? 0)
    const insurance = paidDays > 0 ? Math.round(employee.insuranceBase * s.employeeInsuranceRate / 100) : 0
    const grossPay = ordinaryPay + overtimePay + allowancePay + bonus
    return { employeeId: employee.id, code: employee.code, name: employee.name, role: employee.role, department: employee.department,
      salaryType: employee.salaryType, baseSalary: employee.baseSalary, paidDays, workedDays, regularHours, paidLeaveHours,
      overtimeWeekdayHours, overtimeRestDayHours, overtimeHolidayHours, ordinaryPay, overtimePay, allowancePay, bonus,
      grossPay, insurance, tax, deduction, advance, netPay: grossPay - insurance - tax - deduction - advance }
  })
  if (!rows.every(rowValid)) throw new Error('Giá trị bảng lương vượt giới hạn cho phép. Kiểm tra tiền lương và số giờ công.')
  return rows
}

export function closePayroll(data: PayrollData, month: string): PayrollData {
  if (isPayrollClosed(data, month)) throw new Error('Tháng này đã khóa bảng lương.')
  const rows = calculatePayroll(data, month)
  const next = { ...data, periods: [...data.periods, { id: `period-${month}`, month, closedAt: new Date().toISOString(), settings: clone(data.settings), rows }] }
  if (!validatePayrollData(next)) throw new Error('Giá trị bảng lương vượt giới hạn cho phép.')
  return next
}
export function reopenPayroll(data: PayrollData, month: string): PayrollData {
  if (!validMonth(month)) throw new Error('Tháng tính lương không hợp lệ.')
  const next = { ...data, periods: data.periods.filter(v => v.month !== month) }
  if (!validatePayrollData(next)) throw new Error('Cấu hình giờ công hoặc ngày làm việc hiện tại không phù hợp dữ liệu cũ. Hãy điều chỉnh trước khi mở khóa.')
  return next
}
export function upsertAttendance(data: PayrollData, record: Attendance): PayrollData {
  if (isPayrollClosed(data, record.date.slice(0, 7))) throw new Error('Tháng này đã khóa. Mở khóa bảng lương trước khi sửa chấm công.')
  const original = data.attendance.find(v => v.id === record.id)
  if (original && isPayrollClosed(data, original.date.slice(0, 7))) throw new Error('Không thể chuyển chấm công khỏi tháng đã khóa.')
  const existing = data.attendance.find(v => v.employeeId === record.employeeId && v.date === record.date)
  const next = { ...data, attendance: [...data.attendance.filter(v => v.id !== record.id && v.id !== existing?.id), { ...record, id: existing?.id ?? record.id }] }
  if (!validatePayrollData(next)) throw new Error('Chấm công không hợp lệ: kiểm tra ngày vào/nghỉ việc, giờ công chuẩn và tổng giờ tối đa 24 giờ/ngày.')
  return next
}
export function removeAttendance(data: PayrollData, id: string): PayrollData {
  const record = data.attendance.find(v => v.id === id)
  if (!record) throw new Error('Không tìm thấy ngày chấm công cần bỏ. Hãy tải lại dữ liệu và kiểm tra.')
  if (isPayrollClosed(data, record.date.slice(0, 7))) throw new Error('Tháng này đã khóa. Mở khóa bảng lương trước khi sửa chấm công.')
  return { ...data, attendance: data.attendance.filter(v => v.id !== id) }
}
export function upsertAdjustment(data: PayrollData, record: PayrollAdjustment): PayrollData {
  if (isPayrollClosed(data, record.month)) throw new Error('Tháng này đã khóa. Mở khóa bảng lương trước khi sửa thu nhập/khấu trừ.')
  const original = data.adjustments.find(v => v.id === record.id)
  if (original && isPayrollClosed(data, original.month)) throw new Error('Không thể chuyển điều chỉnh khỏi tháng đã khóa.')
  const existing = data.adjustments.find(v => v.employeeId === record.employeeId && v.month === record.month)
  const next = { ...data, adjustments: [...data.adjustments.filter(v => v.id !== record.id && v.id !== existing?.id), { ...record, id: existing?.id ?? record.id }] }
  if (!validatePayrollData(next)) throw new Error('Khoản điều chỉnh không hợp lệ. Chỉ nhập số tiền không âm và tháng hợp lệ.')
  return next
}

export function payrollToCSV(rows: PayrollRow[], month: string): string {
  if (!validMonth(month) || !rows.every(rowValid)) throw new Error('Bảng lương xuất CSV không hợp lệ.')
  const cell = (value: string | number) => {
    let text = String(value)
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  const headers = ['Tháng', 'Mã NV', 'Họ tên', 'Bộ phận', 'Ngày hưởng lương', 'Ngày thực làm', 'Lương công', 'Tăng ca', 'Phụ cấp', 'Thưởng', 'Tổng thu nhập', 'Bảo hiểm NV', 'Thuế', 'Khấu trừ', 'Tạm ứng', 'Thực lĩnh']
  return '\uFEFF' + [headers, ...rows.map(v => [month, v.code, v.name, v.department, v.paidDays, v.workedDays, v.ordinaryPay, v.overtimePay, v.allowancePay, v.bonus, v.grossPay, v.insurance, v.tax, v.deduction, v.advance, v.netPay])].map(row => row.map(cell).join(',')).join('\r\n')
}

function localDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
export function createPayrollSeed(now = new Date()): PayrollData {
  let data = createEmptyPayroll()
  const month = localDate(now).slice(0, 7)
  const previous = localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7)
  data.allowanceTypes = [{ id: 'meal', name: 'Ăn ca', basis: 'workday', defaultAmount: 30_000 }, { id: 'travel', name: 'Đi lại', basis: 'fixed', defaultAmount: 300_000 }]
  const names = ['Nguyễn Văn Minh', 'Trần Thị Lan', 'Lê Quốc Huy', 'Phạm Đức Thành', 'Võ Thị Hà']
  data.employees = names.map((name, i) => ({ id: `worker-${i + 1}`, code: `NV00${i + 1}`, name,
    role: ['Thợ CNC', 'Kiểm tra chất lượng', 'Thợ hàn', 'Thợ tiện', 'Kế toán'][i], department: i === 4 ? 'Văn phòng' : 'Xưởng sản xuất',
    phone: '', startDate: `${previous}-01`, endDate: '', salaryType: i === 3 ? 'daily' : i === 4 ? 'hourly' : 'monthly',
    baseSalary: [12_000_000, 10_400_000, 13_000_000, 400_000, 60_000][i], insuranceBase: 0,
    allowances: [{ allowanceId: 'meal', amount: 30_000 }, { allowanceId: 'travel', amount: 300_000 }] }))
  for (const target of [previous, month]) {
    const [year, monthNumber] = target.split('-').map(Number)
    const last = target === month ? now.getDate() : new Date(year, monthNumber, 0).getDate()
    for (let day = 1; day <= last; day++) {
      if (new Date(year, monthNumber - 1, day).getDay() === 0) continue
      const date = `${target}-${String(day).padStart(2, '0')}`
      data.employees.forEach((employee, index) => {
        const leave = index === 1 && day === 8
        data.attendance.push({ id: `${employee.id}-${date}`, employeeId: employee.id, date, regularHours: leave ? 0 : 8,
          paidLeaveHours: leave ? 8 : 0, overtimeWeekdayHours: index < 3 && day % 5 === 0 ? 2 : 0,
          overtimeRestDayHours: 0, overtimeHolidayHours: 0, note: leave ? 'Nghỉ phép có lương (mẫu)' : '' })
      })
    }
  }
  data.adjustments = [{ id: 'advance-sample', employeeId: 'worker-1', month, bonus: 500_000, advance: 1_000_000, deduction: 0, tax: 0, note: 'Số liệu giả định để trình diễn' }]
  data = closePayroll(data, previous)
  return data
}
