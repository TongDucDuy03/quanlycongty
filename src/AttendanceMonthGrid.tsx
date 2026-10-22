import { useMemo } from 'react'
import { Check, Plus } from 'lucide-react'
import type { Attendance, Employee, PayrollRow } from './payroll'

export const displayAttendanceDate = (date: string) => date.split('-').reverse().join('/')
const count = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })

type Props = {
  month: string
  employees: Employee[]
  records: Attendance[]
  summaries: PayrollRow[]
  hoursPerDay: number
  closed: boolean
  search: string
  onMark: (employee: Employee, date: string) => void
  onEdit: (employee: Employee, date: string) => void
}

export default function AttendanceMonthGrid({ month, employees, records, summaries, hoursPerDay, closed, search, onMark, onEdit }: Props) {
  const index = useMemo(() => new Map(records.filter(record => record.date.startsWith(`${month}-`)).map(record => [`${record.employeeId}|${record.date}`, record])), [records, month])
  const summaryIndex = new Map(summaries.map(row => [row.employeeId, row]))
  const recordedEmployees = new Set([...index.values()].map(record => record.employeeId))
  const people = employees.filter(employee => (
    (employee.startDate.slice(0, 7) <= month && (!employee.endDate || employee.endDate.slice(0, 7) >= month))
    || recordedEmployees.has(employee.id)
  ) && `${employee.name} ${employee.code} ${employee.department}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))
  const [year, monthNumber] = month.split('-').map(Number)
  const days = Array.from({ length: new Date(year, monthNumber, 0).getDate() }, (_, i) => {
    const day = i + 1
    const weekday = new Date(year, monthNumber - 1, day).getDay()
    return { day, date: `${month}-${String(day).padStart(2, '0')}`, weekday, weekend: weekday === 0 || weekday === 6 }
  })

  if (!people.length) return <div className="attendance-grid-empty">{search ? 'Không tìm thấy nhân viên phù hợp.' : 'Chưa có nhân viên làm việc trong tháng này. Thêm nhân viên ở tab Nhân sự.'}</div>

  return (
    <>
      <div className="attendance-grid-help">
        <span><strong>{people.length} nhân viên</strong> · {days.length} ngày trong tháng</span>
        <span>Cuộn ngang để xem các ngày còn lại →</span>
      </div>
      <div className="payroll-scroll attendance-month-scroll" role="region" aria-label={`Bảng chấm công tháng ${month}`} tabIndex={0}>
        <table className="payroll-table attendance-month-table">
          <caption className="attendance-visually-hidden">Chấm công tháng {month}. Bấm ô trống để chấm đủ công, bấm ô đã chấm để sửa chi tiết.</caption>
          <thead>
            <tr>
              <th scope="col" className="attendance-person">Nhân viên</th>
              {days.map(day => (
                <th scope="col" key={day.date} className={day.weekend ? 'attendance-weekend' : ''}>
                  <span>{String(day.day).padStart(2, '0')}</span>
                  <small>{day.weekday === 0 ? 'CN' : `T${day.weekday + 1}`}</small>
                </th>
              ))}
              <th scope="col" className="attendance-total">Tổng công<small>Gồm phép có lương</small></th>
            </tr>
          </thead>
          <tbody>
            {people.map(employee => (
              <tr key={employee.id}>
                <th scope="row" className="attendance-person"><strong>{employee.name}</strong><small>{employee.code} · {employee.department || employee.role || 'Nhân viên'}</small></th>
                {days.map(day => {
                  const record = index.get(`${employee.id}|${day.date}`)
                  const employed = day.date >= employee.startDate && (!employee.endDate || day.date <= employee.endDate)
                  const overtime = record ? record.overtimeWeekdayHours + record.overtimeRestDayHours + record.overtimeHolidayHours : 0
                  const paidDays = record ? (record.regularHours + record.paidLeaveHours) / hoursPerDay : 0
                  const full = record?.regularHours === hoursPerDay && record.paidLeaveHours === 0
                  const leave = record && record.paidLeaveHours > 0 && record.regularHours === 0
                  const absent = record && !paidDays && !overtime
                  const details = record ? `${count(record.regularHours)} giờ làm, ${count(record.paidLeaveHours)} giờ phép, ${count(overtime)} giờ tăng ca${record.note ? `; ${record.note}` : ''}` : 'Chưa chấm công'
                  const label = `${record ? 'Sửa công' : 'Chấm đủ công'} ${employee.name} ngày ${displayAttendanceDate(day.date)}`
                  return (
                    <td key={day.date} className={day.weekend ? 'attendance-weekend' : ''}>
                      <button
                        type="button"
                        className={`attendance-day${record ? ' recorded' : ''}${leave ? ' leave' : ''}${absent ? ' absent' : ''}`}
                        disabled={closed || !employed}
                        aria-label={label}
                        title={`${displayAttendanceDate(day.date)} · ${employee.name}: ${details}${!employed ? ' · Ngoài thời gian làm việc' : ''}`}
                        onClick={() => record ? onEdit(employee, day.date) : onMark(employee, day.date)}
                      >
                        {!employed && !record ? <span>—</span> : !record ? <Plus size={16} /> : full ? <Check size={18} /> : leave ? <span>P{paidDays !== 1 ? count(paidDays) : ''}</span> : absent ? <span>N</span> : <span>{paidDays ? count(paidDays) : 'TC'}</span>}
                        {overtime > 0 && <small>+{count(overtime)}h</small>}
                        {record && record.regularHours > 0 && record.paidLeaveHours > 0 && <small>có phép</small>}
                      </button>
                    </td>
                  )
                })}
                <td className="attendance-total"><strong>{count(summaryIndex.get(employee.id)?.paidDays ?? 0)}</strong><small>công hưởng lương</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="attendance-legend">
        <span><Check size={15} /> Đủ công ({hoursPerDay} giờ)</span>
        <span><b>0,5</b> Nửa công</span>
        <span><b>P</b> Nghỉ có lương</span>
        <span><b>N</b> Nghỉ không lương</span>
        <span><b>+2h</b> Giờ tăng ca</span>
        <span><Plus size={15} /> Chưa chấm</span>
      </div>
    </>
  )
}
