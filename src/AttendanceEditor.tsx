import { useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import type { Attendance, Employee } from './payroll'
import { displayAttendanceDate } from './AttendanceMonthGrid'

type Props = {
  employee: Employee
  date: string
  record?: Attendance
  hoursPerDay: number
  error: string
  onSave: (record: Omit<Attendance, 'id' | 'employeeId' | 'date'>) => void
  onRemove: () => void
  onClose: () => void
}
const fields = [
  ['regularHours', 'Giờ làm bình thường'],
  ['paidLeaveHours', 'Giờ nghỉ hưởng lương'],
  ['overtimeWeekdayHours', 'Giờ tăng ca ngày thường'],
  ['overtimeRestDayHours', 'Giờ tăng ca ngày nghỉ'],
  ['overtimeHolidayHours', 'Giờ tăng ca ngày lễ'],
] as const
type HoursKey = typeof fields[number][0]

export default function AttendanceEditor({ employee, date, record, hoursPerDay, error, onSave, onRemove, onClose }: Props) {
  const [hours, setHours] = useState(() => Object.fromEntries(fields.map(([key]) => [key, String(record?.[key] ?? 0)])) as Record<HoursKey, string>)
  const [note, setNote] = useState(record?.note ?? '')
  const [removing, setRemoving] = useState(false)
  const preset = (regular: number, paidLeave: number, resetOvertime = false) => {
    setHours(current => ({ ...current, regularHours: String(regular), paidLeaveHours: String(paidLeave), ...(resetOvertime ? { overtimeWeekdayHours: '0', overtimeRestDayHours: '0', overtimeHolidayHours: '0' } : {}) }))
    setRemoving(false)
  }
  return (
    <form className="attendance-editor" onSubmit={event => {
      event.preventDefault()
      onSave({ ...Object.fromEntries(fields.map(([key]) => [key, Number(hours[key] || 0)])) as Record<HoursKey, number>, note: note.trim() })
    }}>
      <div className="payroll-dialog-body">
        <p><strong>{employee.name}</strong> · {displayAttendanceDate(date)}</p>
        <div className="attendance-presets" role="group" aria-label="Điền nhanh ngày công">
          <button type="button" onClick={() => preset(hoursPerDay, 0)}>Đủ công</button>
          <button type="button" onClick={() => preset(hoursPerDay / 2, 0)}>Nửa công</button>
          <button type="button" onClick={() => preset(0, hoursPerDay)}>Nghỉ có lương</button>
          <button type="button" onClick={() => preset(0, 0, true)}>Nghỉ không lương</button>
        </div>
        <div className="payroll-form-grid">
          {fields.map(([key, label]) => <label key={key} className="payroll-field"><span>{label}</span><input type="number" name={key} required min={0} max={24} step="any" value={hours[key]} onChange={event => { setHours(current => ({ ...current, [key]: event.target.value })); setRemoving(false) }} /></label>)}
          <label className="payroll-field"><span>Ghi chú</span><input name="note" maxLength={2000} value={note} placeholder="Ca làm, lý do điều chỉnh…" onChange={event => { setNote(event.target.value); setRemoving(false) }} /></label>
        </div>
        <p className="payroll-muted">Một công = {hoursPerDay} giờ. Giờ làm thường và phép cộng lại không quá {hoursPerDay} giờ; tổng cả tăng ca không quá 24 giờ/ngày. Bảng lương tự tính lại sau khi lưu.</p>
        {record && (
          <div className="attendance-remove">
            {removing ? <>
              <p>Bỏ toàn bộ giờ làm, phép, tăng ca và ghi chú của ngày {displayAttendanceDate(date)}? Ngày này sẽ trở về chưa chấm và lương được tính lại.</p>
              <div className="payroll-actions"><button type="button" className="payroll-button danger-button" onClick={onRemove}>Xác nhận bỏ chấm</button><button type="button" className="payroll-button" onClick={() => setRemoving(false)}>Giữ ngày công</button></div>
            </> : <button type="button" className="payroll-button" onClick={() => setRemoving(true)}><Trash2 /> Bỏ chấm ngày này</button>}
          </div>
        )}
        {error && <p role="alert" className="payroll-error">{error}</p>}
      </div>
      <div className="payroll-dialog-footer"><button type="button" className="payroll-button" onClick={onClose}>Hủy</button><button type="submit" className="payroll-button primary" disabled={removing}><Check />Lưu chấm công</button></div>
    </form>
  )
}
