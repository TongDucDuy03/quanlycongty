import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  CalendarDays,
  Check,
  Download,
  Info,
  LockKeyhole,
  Plus,
  Settings2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { formatMoney, newId } from "./domain";
import { downloadFile } from "./storage";
import {
  calculatePayroll,
  closePayroll,
  createEmptyPayroll,
  createPayrollSeed,
  isPayrollClosed,
  payrollToCSV,
  reopenPayroll,
  removeAttendance,
  upsertAdjustment,
  upsertAttendance,
  upsertEmployee,
  upsertAllowanceType,
  updatePayrollSettings,
  validatePayrollData,
} from "./payroll";
import type {
  AllowanceType,
  Attendance,
  Employee,
  PayrollAdjustment,
  PayrollData,
  PayrollRow,
} from "./payroll";
import "./payroll.css";
import AttendanceMonthGrid from './AttendanceMonthGrid';
import AttendanceEditor from './AttendanceEditor';

type Props = {
  value: PayrollData | undefined;
  onChange: (next: PayrollData, message: string) => boolean;
};
type Modal =
  | { type: "employee"; employee?: Employee }
  | { type: "attendance"; employee: Employee; date: string }
  | { type: "adjustment"; row: PayrollRow }
  | { type: "detail"; row: PayrollRow }
  | { type: "allowance"; allowance?: AllowanceType }
  | { type: "close" | "reopen" }
  | null;
const salaryNames = {
  monthly: "Theo tháng",
  daily: "Theo ngày",
  hourly: "Theo giờ",
};
const tabs = [
  { id: "employees", label: "Nhân sự", icon: Users },
  { id: "attendance", label: "Chấm công", icon: CalendarDays },
  { id: "payroll", label: "Bảng lương", icon: Wallet },
  { id: "settings", label: "Cấu hình lương", icon: Settings2 },
] as const;
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const num = (form: FormData, key: string) => Number(form.get(key) || 0);
const str = (form: FormData, key: string) => String(form.get(key) || "").trim();
const humanError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Không thể lưu thay đổi. Vui lòng kiểm tra dữ liệu.";

function Field({
  label,
  children,
  hint,
  full,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  full?: boolean;
}) {
  return (
    <label className={`payroll-field${full ? " full" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function NumberField({
  label,
  name,
  value = 0,
  hint,
  min = 0,
  max,
  step = "any",
}: {
  label: string;
  name: string;
  value?: number;
  hint?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        name={name}
        type="number"
        defaultValue={value}
        required
        min={min}
        max={max}
        step={step}
      />
    </Field>
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="payroll-dialog"
      aria-label={title}
      onCancel={onClose}
    >
      <div className="payroll-dialog-header">
        <h3>{title}</h3>
        <button
          type="button"
          className="payroll-dialog-close"
          aria-label="Đóng"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Footer({
  onClose,
  label = "Lưu thay đổi",
}: {
  onClose: () => void;
  label?: string;
}) {
  return (
    <div className="payroll-dialog-footer">
      <button type="button" className="payroll-button" onClick={onClose}>
        Hủy
      </button>
      <button className="payroll-button primary" type="submit">
        <Check />
        {label}
      </button>
    </div>
  );
}
function EmployeeForm({
  employee,
  data,
  onSave,
  onClose,
  error,
}: {
  employee?: Employee;
  data: PayrollData;
  onSave: (employee: Employee) => void;
  onClose: () => void;
  error: string;
}) {
  const [enabled, setEnabled] = useState(
    () => employee?.allowances.map((a) => a.allowanceId) || [],
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    onSave({
      id: employee?.id || newId(),
      code: str(f, "code"),
      name: str(f, "name"),
      role: str(f, "role"),
      department: str(f, "department"),
      phone: str(f, "phone"),
      startDate: str(f, "startDate"),
      endDate: str(f, "endDate"),
      salaryType: str(f, "salaryType") as Employee["salaryType"],
      baseSalary: num(f, "baseSalary"),
      insuranceBase: num(f, "insuranceBase"),
      allowances: enabled.map((allowanceId) => ({
        allowanceId,
        amount: num(f, `allowance-${allowanceId}`),
      })),
    });
  };
  return (
    <form onSubmit={submit}>
      <div className="payroll-dialog-body">
        <div className="payroll-form-grid">
          <Field label="Mã nhân viên">
            <input
              name="code"
              required
              maxLength={30}
              defaultValue={
                employee?.code ||
                `NV${String(data.employees.length + 1).padStart(3, "0")}`
              }
            />
          </Field>
          <Field label="Họ và tên">
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={employee?.name}
            />
          </Field>
          <Field label="Vị trí công việc">
            <input
              name="role"
              required
              maxLength={100}
              defaultValue={employee?.role || "Công nhân"}
            />
          </Field>
          <Field label="Bộ phận">
            <input
              name="department"
              required
              maxLength={100}
              defaultValue={employee?.department || "Sản xuất"}
            />
          </Field>
          <Field label="Số điện thoại">
            <input
              name="phone"
              type="tel"
              maxLength={30}
              defaultValue={employee?.phone}
            />
          </Field>
          <Field label="Hình thức lương">
            <select
              name="salaryType"
              defaultValue={employee?.salaryType || "monthly"}
            >
              {Object.entries(salaryNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <NumberField
            label="Mức lương (₫ / tháng, ngày hoặc giờ)"
            name="baseSalary"
            value={employee?.baseSalary || 0}
            hint="Đơn vị ứng với hình thức lương đã chọn."
          />
          <NumberField
            label="Lương đóng bảo hiểm (₫ / tháng)"
            name="insuranceBase"
            value={employee?.insuranceBase || 0}
            hint="Để 0 nếu chưa áp dụng bảo hiểm."
          />
          <Field label="Ngày vào làm">
            <input
              name="startDate"
              type="date"
              min="2000-01-01"
              max="2199-12-31"
              required
              defaultValue={employee?.startDate || localDate()}
            />
          </Field>
          <Field
            label="Ngày kết thúc làm việc"
            hint="Để trống nếu còn làm việc. Hồ sơ cũ được giữ lại."
          >
            <input
              name="endDate"
              type="date"
              min="2000-01-01"
              max="2199-12-31"
              defaultValue={employee?.endDate}
            />
          </Field>
        </div>
        <div className="payroll-form-section">
          <h4>Phụ cấp riêng của nhân viên</h4>
          <p className="payroll-muted">
            Chọn khoản áp dụng và đặt mức tiền riêng. Phụ cấp cố định được tính
            đủ khi tháng có công hưởng lương; phụ cấp theo ngày chỉ tính ngày
            thực làm.
          </p>
          {data.allowanceTypes.length === 0 && (
            <p className="payroll-muted">
              Thêm loại phụ cấp trong tab Cấu hình lương trước.
            </p>
          )}
          {data.allowanceTypes.map((a) => (
            <div key={a.id} className="payroll-allowance-row">
              <label className="payroll-checkbox">
                <input
                  type="checkbox"
                  checked={enabled.includes(a.id)}
                  onChange={(e) =>
                    setEnabled(
                      e.target.checked
                        ? [...enabled, a.id]
                        : enabled.filter((id) => id !== a.id),
                    )
                  }
                />
                <span>
                  {a.name}
                  <small className="payroll-muted">
                    {" "}
                    ·{" "}
                    {a.basis === "fixed"
                      ? "cố định / tháng"
                      : "theo ngày thực làm"}
                  </small>
                </span>
              </label>
              <input
                className="payroll-input"
                type="number"
                min="0"
                step="any"
                aria-label={`Mức ${a.name}`}
                name={`allowance-${a.id}`}
                disabled={!enabled.includes(a.id)}
                defaultValue={
                  employee?.allowances.find((v) => v.allowanceId === a.id)
                    ?.amount ?? a.defaultAmount
                }
                required
              />
            </div>
          ))}
        </div>
        {error && (
          <p className="payroll-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <Footer onClose={onClose} label="Lưu nhân viên" />
    </form>
  );
}

export default function PayrollWorkspace({ value, onChange }: Props) {
  const [empty] = useState(createEmptyPayroll);
  const data = value || empty;
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("employees");
  const [date, setDate] = useState(localDate);
  const [attendanceView, setAttendanceView] = useState<'month' | 'day'>('month');
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const attendanceMonth = date.slice(0, 7);
  let rows: PayrollRow[] = [],
    attendanceRows: PayrollRow[] = [],
    calculationError = "";
  try {
    rows = calculatePayroll(data, month);
    attendanceRows =
      attendanceMonth === month
        ? rows
        : calculatePayroll(data, attendanceMonth);
  } catch (err) {
    calculationError = humanError(err);
  }
  const closed = isPayrollClosed(data, month);
  const attendanceClosed = isPayrollClosed(data, attendanceMonth);
  const attendanceSettings = data.periods.find(period => period.month === attendanceMonth)?.settings ?? data.settings;
  const active = data.employees.filter(
    (employee) =>
      employee.startDate <= date &&
      (!employee.endDate || employee.endDate >= date),
  );
  const filtered = data.employees.filter((employee) =>
    `${employee.name} ${employee.code} ${employee.department}`
      .toLocaleLowerCase("vi")
      .includes(search.toLocaleLowerCase("vi")),
  );
  const show = (next: Modal) => {
    setModalError("");
    setError("");
    setModal(next);
  };
  const dismiss = () => {
    setModal(null);
    setModalError("");
  };
  const save = (
    operation: () => PayrollData,
    message: string,
    inDialog = true,
  ) => {
    try {
      const next = operation();
      if (!validatePayrollData(next))
        throw new Error(
          "Dữ liệu chưa hợp lệ. Kiểm tra mã nhân viên trùng, khoảng ngày và các chỉ số lương.",
        );
      if (!onChange(next, message))
        throw new Error(
          "Chưa lưu được dữ liệu. Vui lòng thử lại hoặc kiểm tra dung lượng lưu trữ.",
        );
      if (inDialog) dismiss();
      else setError("");
    } catch (err) {
      if (inDialog) setModalError(humanError(err));
      else setError(humanError(err));
    }
  };
  const submitForm =
    (callback: (f: FormData) => void) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      callback(new FormData(event.currentTarget));
    };
  const total = (key: "grossPay" | "netPay" | "advance") =>
    rows.reduce((sum, row) => sum + row[key], 0);
  const employeeForAttendance =
    modal?.type === "attendance" ? modal.employee : undefined;
  const attendanceDate = modal?.type === 'attendance' ? modal.date : date;
  const attendance = employeeForAttendance
    ? data.attendance.find(
        (record) =>
          record.employeeId === employeeForAttendance.id &&
          record.date === attendanceDate,
      )
    : undefined;
  const adjustment =
    modal?.type === "adjustment"
      ? data.adjustments.find(
          (record) =>
            record.employeeId === modal.row.employeeId &&
            record.month === month,
        )
      : undefined;
  const dialogTitle =
    modal?.type === "employee"
      ? modal.employee
        ? "Sửa nhân viên"
        : "Thêm nhân viên"
      : modal?.type === "attendance"
        ? "Chấm công"
        : modal?.type === "adjustment"
          ? "Điều chỉnh lương"
          : modal?.type === "detail"
            ? "Chi tiết lương"
            : modal?.type === "allowance"
              ? modal.allowance
                ? "Sửa phụ cấp"
                : "Thêm loại phụ cấp"
              : modal?.type === "close"
                ? "Chốt bảng lương"
                : "Mở lại bảng lương";
  return (
    <div className="payroll-workspace">
      <div className="payroll-tabs" role="tablist" aria-label="Quản lý nhân sự">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`payroll-${id}`}
            id={`payroll-tab-${id}`}
            onClick={() => {
              setTab(id);
              setError("");
            }}
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>
      {(error || calculationError) && (
        <p className="payroll-error" role="alert">
          {error || calculationError}
        </p>
      )}
      <div
        role="tabpanel"
        id={`payroll-${tab}`}
        aria-labelledby={`payroll-tab-${tab}`}
        className="payroll-workspace"
      >
        {tab === "employees" && (
          <>
            <div className="payroll-stats">
              <div className="payroll-stat">
                <span>Đang làm việc</span>
                <strong>{active.length}</strong>
                <small>
                  Tính đến ngày {date.split("-").reverse().join("/")}
                </small>
              </div>
              <div className="payroll-stat">
                <span>Loại phụ cấp</span>
                <strong>{data.allowanceTypes.length}</strong>
                <small>Có thể thiết lập riêng từng người</small>
              </div>
              <div className="payroll-stat">
                <span>Ngày công tiêu chuẩn</span>
                <strong>{data.settings.standardDays}</strong>
                <small>{data.settings.hoursPerDay} giờ / ngày</small>
              </div>
            </div>
            <section className="payroll-card">
              <div className="payroll-toolbar">
                <div>
                  <h3>Hồ sơ nhân viên</h3>
                  <p className="payroll-muted">
                    Mức lương, bộ phận và phụ cấp cá nhân.
                  </p>
                </div>
                <div className="payroll-actions">
                  <input
                    className="payroll-input"
                    aria-label="Tìm nhân viên"
                    placeholder="Tìm tên, mã hoặc bộ phận…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <button
                    className="payroll-button primary"
                    onClick={() => show({ type: "employee" })}
                  >
                    <Plus />
                    Thêm nhân viên
                  </button>
                </div>
              </div>
              {data.employees.length === 0 ? (
                <div className="payroll-empty">
                  <Users />
                  <h3>Bắt đầu với đội ngũ của bạn</h3>
                  <p>
                    Thêm nhân viên đầu tiên, hoặc nạp nhân sự mẫu để trải nghiệm
                    chấm công và tính lương.
                  </p>
                  <button
                    className="payroll-button"
                    onClick={() =>
                      save(
                        () => createPayrollSeed(),
                        "Đã nạp nhân sự và chấm công mẫu",
                        false,
                      )
                    }
                  >
                    Nạp nhân sự mẫu
                  </button>
                </div>
              ) : (
                <div className="payroll-scroll">
                  <table className="payroll-table">
                    <thead>
                      <tr>
                        <th>Nhân viên</th>
                        <th>Công việc</th>
                        <th>Mức lương</th>
                        <th>Phụ cấp</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((employee) => (
                        <tr key={employee.id}>
                          <td>
                            <strong>{employee.name}</strong>
                            <small>
                              {employee.code} ·{" "}
                              {employee.phone || "Chưa có SĐT"}
                            </small>
                          </td>
                          <td>
                            {employee.role}
                            <small>{employee.department}</small>
                          </td>
                          <td className="payroll-money">
                            <strong>{formatMoney(employee.baseSalary)}</strong>
                            <small>{salaryNames[employee.salaryType]}</small>
                          </td>
                          <td>{employee.allowances.length} khoản</td>
                          <td>
                            <span
                              className={`payroll-badge${employee.endDate && employee.endDate < date ? " neutral" : ""}`}
                            >
                              {employee.startDate > date
                                ? "Chưa vào làm"
                                : employee.endDate && employee.endDate < date
                                  ? "Đã nghỉ việc"
                                  : "Đang làm việc"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="payroll-button"
                              aria-label={`Sửa ${employee.name}`}
                              onClick={() =>
                                show({ type: "employee", employee })
                              }
                            >
                              Chỉnh sửa
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={6}>Không tìm thấy nhân viên phù hợp.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <div className="payroll-note">
              <Info />
              <span>
                Thay đổi hồ sơ và cấu hình sẽ cập nhật các tháng chưa chốt. Bảng
                lương đã chốt giữ nguyên số liệu. Khi nhân viên nghỉ, nhập ngày
                kết thúc để giữ lịch sử.
              </span>
            </div>
          </>
        )}
        {tab === "attendance" && (
          <>
            <section className="payroll-card">
              <div className="payroll-toolbar attendance-toolbar">
                <div>
                  <h3>{attendanceView === 'month' ? 'Bảng chấm công tháng' : 'Chấm công theo ngày'}</h3>
                  <p className="payroll-muted">
                    {attendanceView === 'month' ? 'Bấm ô trống để tích đủ công. Bấm ô đã chấm để sửa hoặc bỏ chấm.' : 'Ghi giờ thực làm, nghỉ hưởng lương và tăng ca.'}
                  </p>
                </div>
                <div className="payroll-actions attendance-controls">
                  <div className="attendance-view-switch" role="group" aria-label="Kiểu bảng chấm công">
                    <button type="button" aria-pressed={attendanceView === 'month'} onClick={() => setAttendanceView('month')}>Bảng tháng</button>
                    <button type="button" aria-pressed={attendanceView === 'day'} onClick={() => setAttendanceView('day')}>Theo ngày</button>
                  </div>
                  <Field label={attendanceView === 'month' ? 'Tháng chấm công' : 'Ngày chấm công'}>
                    <input
                      className="payroll-input"
                      type={attendanceView === 'month' ? 'month' : 'date'}
                      min={attendanceView === 'month' ? '2000-01' : '2000-01-01'}
                      max={attendanceView === 'month' ? '2199-12' : '2199-12-31'}
                      value={attendanceView === 'month' ? attendanceMonth : date}
                      onChange={(event) => {
                        if (event.target.value) {
                          setDate(attendanceView === 'month' ? `${event.target.value}-01` : event.target.value);
                          setMonth(event.target.value.slice(0, 7));
                        }
                      }}
                    />
                  </Field>
                  {attendanceClosed && (
                    <span className="payroll-badge">
                      <LockKeyhole size={13} />
                      Tháng đã chốt
                    </span>
                  )}
                </div>
              </div>
              {attendanceView === 'month' ? <>
                <div className="attendance-search"><Field label="Tìm nhân viên chấm công"><input className="payroll-input" type="search" placeholder="Tên, mã nhân viên, bộ phận…" value={attendanceSearch} onChange={event => setAttendanceSearch(event.target.value)} /></Field></div>
                <AttendanceMonthGrid
                  month={attendanceMonth}
                  employees={data.employees}
                  records={data.attendance}
                  summaries={attendanceRows}
                  hoursPerDay={attendanceSettings.hoursPerDay}
                  closed={attendanceClosed}
                  search={attendanceSearch}
                  onEdit={(employee, selectedDate) => show({ type: 'attendance', employee, date: selectedDate })}
                  onMark={(employee, selectedDate) => save(() => upsertAttendance(data, {
                    id: newId(), employeeId: employee.id, date: selectedDate,
                    regularHours: data.settings.hoursPerDay, paidLeaveHours: 0,
                    overtimeWeekdayHours: 0, overtimeRestDayHours: 0, overtimeHolidayHours: 0, note: '',
                  }), `Đã chấm đủ công cho ${employee.name}`, false)}
                />
              </> : <div className="payroll-scroll">
                <table className="payroll-table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Giờ làm</th>
                      <th>Nghỉ có lương</th>
                      <th>Tăng ca</th>
                      <th>Công tháng {attendanceMonth.slice(5)}</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((employee) => {
                      const record = data.attendance.find(
                        (r) => r.employeeId === employee.id && r.date === date,
                      );
                      const summary = attendanceRows.find(
                        (row) => row.employeeId === employee.id,
                      );
                      return (
                        <tr key={employee.id}>
                          <td>
                            <strong>{employee.name}</strong>
                            <small>{record?.note || employee.code}</small>
                          </td>
                          <td>
                            {record?.regularHours ?? "—"}
                            {record ? " giờ" : ""}
                          </td>
                          <td>
                            {record?.paidLeaveHours ?? "—"}
                            {record ? " giờ" : ""}
                          </td>
                          <td>
                            {record
                              ? record.overtimeWeekdayHours +
                                record.overtimeRestDayHours +
                                record.overtimeHolidayHours
                              : "—"}
                            {record ? " giờ" : ""}
                          </td>
                          <td>
                            {summary?.paidDays.toLocaleString("vi-VN", {
                              maximumFractionDigits: 2,
                            }) || 0}{" "}
                            công<small>Gồm nghỉ hưởng lương</small>
                          </td>
                          <td>
                            <button
                              className="payroll-button"
                              disabled={attendanceClosed}
                              aria-label={`Chấm công ${employee.name}`}
                              onClick={() =>
                                show({ type: "attendance", employee, date })
                              }
                            >
                              {record ? "Sửa công" : "Chấm công"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {active.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          Chưa có nhân viên làm việc trong ngày này. Thêm nhân
                          viên ở tab Nhân sự.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>}
            </section>
            <div className="payroll-note">
              <Info />
              <span>
                Một công = {attendanceSettings.hoursPerDay} giờ. Ô trống là chưa chấm,
                khác với nghỉ không lương. Lương tự tính lại khi sửa công.
                Tháng đã chốt cần mở lại trước khi sửa.
                {attendanceClosed && <button type="button" className="text-button" onClick={() => { setMonth(attendanceMonth); setTab('payroll'); }}>Đến bảng lương để mở lại</button>}
              </span>
            </div>
          </>
        )}
        {tab === "payroll" && (
          <>
            <section className="payroll-card">
              <div className="payroll-toolbar">
                <div className="payroll-actions">
                  <Field label="Tháng tính lương">
                    <input
                      className="payroll-input"
                      type="month"
                      min="2000-01"
                      max="2199-12"
                      value={month}
                      onChange={(event) => {
                        if (event.target.value) setMonth(event.target.value);
                      }}
                    />
                  </Field>
                  <span className={`payroll-badge${closed ? "" : " neutral"}`}>
                    {closed ? <LockKeyhole size={13} /> : <Info size={13} />}
                    {closed
                      ? "Đã chốt · số liệu cố định"
                      : "Bản nháp · tự tính từ chấm công"}
                  </span>
                </div>
                <div className="payroll-actions">
                  <button
                    className="payroll-button"
                    disabled={!rows.length}
                    onClick={() =>
                      downloadFile(
                        `bang-luong-${month}.csv`,
                        payrollToCSV(rows, month),
                        "text/csv;charset=utf-8",
                      )
                    }
                  >
                    <Download />
                    Xuất bảng lương CSV
                  </button>
                  <button
                    className="payroll-button primary"
                    disabled={!rows.length && !closed}
                    onClick={() => show({ type: closed ? "reopen" : "close" })}
                  >
                    <LockKeyhole />
                    {closed ? "Mở lại bảng lương" : "Chốt bảng lương"}
                  </button>
                </div>
              </div>
            </section>
            <div className="payroll-stats">
              <div className="payroll-stat">
                <span>Tổng thu nhập</span>
                <strong>{formatMoney(total("grossPay"))}</strong>
                <small>{rows.length} nhân viên trong kỳ</small>
              </div>
              <div className="payroll-stat">
                <span>Đã tạm ứng</span>
                <strong>{formatMoney(total("advance"))}</strong>
                <small>Được trừ khi tính thực lĩnh</small>
              </div>
              <div className="payroll-stat">
                <span>Tổng thực lĩnh</span>
                <strong className="payroll-green">
                  {formatMoney(total("netPay"))}
                </strong>
                <small>Sau bảo hiểm và các khoản khấu trừ</small>
              </div>
            </div>
            <section className="payroll-card">
              <div className="payroll-scroll">
                <table className="payroll-table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Công hưởng lương</th>
                      <th>Lương theo công</th>
                      <th>Tăng ca + phụ cấp</th>
                      <th>Thực lĩnh</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.employeeId}>
                        <td>
                          <strong>{row.name}</strong>
                          <small>
                            {row.code} · {row.role}
                          </small>
                        </td>
                        <td>
                          {row.paidDays.toLocaleString("vi-VN", {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="payroll-money">
                          {formatMoney(row.ordinaryPay)}
                        </td>
                        <td className="payroll-money">
                          {formatMoney(row.overtimePay + row.allowancePay)}
                        </td>
                        <td className="payroll-money">
                          <strong className="payroll-green">
                            {formatMoney(row.netPay)}
                          </strong>
                        </td>
                        <td>
                          <div className="payroll-actions">
                            <button
                              className="payroll-button"
                              aria-label={`Chi tiết lương ${row.name}`}
                              onClick={() => show({ type: "detail", row })}
                            >
                              Chi tiết
                            </button>
                            <button
                              className="payroll-button"
                              disabled={closed}
                              aria-label={`Điều chỉnh lương ${row.name}`}
                              onClick={() => show({ type: "adjustment", row })}
                            >
                              Điều chỉnh
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          Chưa có nhân viên trong kỳ lương này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="payroll-note">
              <Info />
              <span>
                Lương tháng quy đổi theo ngày công tiêu chuẩn; lương ngày/giờ
                tính theo công đã ghi. Thực lĩnh = lương theo công + tăng ca +
                phụ cấp + thưởng − bảo hiểm − thuế − khấu trừ − tạm ứng. Thuế
                được nhập thủ công; đây không phải công cụ quyết toán thuế tự
                động.
              </span>
            </div>
          </>
        )}
        {tab === "settings" && (
          <>
            <section className="payroll-card">
              <div className="payroll-section-title">
                <div>
                  <h3>Chỉ số tính lương</h3>
                  <p className="payroll-muted">
                    Áp dụng cho tất cả các tháng chưa chốt.
                  </p>
                </div>
                <Settings2 size={20} />
              </div>
              <form
                key={JSON.stringify(data.settings)}
                className="payroll-settings"
                onSubmit={submitForm((f) =>
                  save(
                    () =>
                      updatePayrollSettings(data, {
                        standardDays: num(f, "standardDays"),
                        hoursPerDay: num(f, "hoursPerDay"),
                        overtimeWeekday: num(f, "overtimeWeekday"),
                        overtimeRestDay: num(f, "overtimeRestDay"),
                        overtimeHoliday: num(f, "overtimeHoliday"),
                        employeeInsuranceRate: num(f, "insurancePercent"),
                      }),
                    "Đã lưu cấu hình tính lương",
                    false,
                  ),
                )}
              >
                <div className="payroll-form-grid">
                  <NumberField
                    label="Ngày công tiêu chuẩn / tháng"
                    name="standardDays"
                    value={data.settings.standardDays}
                    min={1}
                    max={31}
                  />
                  <NumberField
                    label="Giờ làm tiêu chuẩn / ngày"
                    name="hoursPerDay"
                    value={data.settings.hoursPerDay}
                    min={1}
                    max={12}
                  />
                  <NumberField
                    label="Bảo hiểm người lao động (%)"
                    name="insurancePercent"
                    value={data.settings.employeeInsuranceRate}
                    max={100}
                    hint="Tỷ lệ × lương đóng bảo hiểm từng người."
                  />
                  <NumberField
                    label="Hệ số tăng ca ngày thường"
                    name="overtimeWeekday"
                    value={data.settings.overtimeWeekday}
                    max={10}
                    hint="Ví dụ 1,5 tương ứng 150%."
                  />
                  <NumberField
                    label="Hệ số tăng ca ngày nghỉ"
                    name="overtimeRestDay"
                    value={data.settings.overtimeRestDay}
                    max={10}
                  />
                  <NumberField
                    label="Hệ số tăng ca ngày lễ"
                    name="overtimeHoliday"
                    value={data.settings.overtimeHoliday}
                    max={10}
                  />
                </div>
                <div className="payroll-actions">
                  <button type="submit" className="payroll-button primary">
                    <Check />
                    Lưu cấu hình
                  </button>
                </div>
              </form>
            </section>
            <section className="payroll-card">
              <div className="payroll-toolbar">
                <div>
                  <h3>Danh mục phụ cấp</h3>
                  <p className="payroll-muted">
                    Đặt loại phụ cấp, sau đó gán mức tiền riêng tại hồ sơ nhân
                    viên.
                  </p>
                </div>
                <button
                  className="payroll-button"
                  onClick={() => show({ type: "allowance" })}
                >
                  <Plus />
                  Thêm loại phụ cấp
                </button>
              </div>
              <div className="payroll-scroll">
                <table className="payroll-table">
                  <thead>
                    <tr>
                      <th>Loại phụ cấp</th>
                      <th>Cách tính</th>
                      <th>Mức gợi ý</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.allowanceTypes.map((allowance) => (
                      <tr key={allowance.id}>
                        <td>
                          <strong>{allowance.name}</strong>
                        </td>
                        <td>
                          {allowance.basis === "fixed"
                            ? "Cố định / tháng"
                            : "Theo ngày thực làm"}
                        </td>
                        <td>{formatMoney(allowance.defaultAmount)}</td>
                        <td>
                          <button
                            className="payroll-button"
                            aria-label={`Sửa phụ cấp ${allowance.name}`}
                            onClick={() =>
                              show({ type: "allowance", allowance })
                            }
                          >
                            Chỉnh sửa
                          </button>
                        </td>
                      </tr>
                    ))}
                    {data.allowanceTypes.length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          Chưa có loại phụ cấp. Có thể thêm ăn ca, đi lại, trách
                          nhiệm…
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="payroll-note">
              <Info />
              <span>
                Các giá trị mặc định chỉ để minh họa. Hãy cấu hình theo hợp đồng
                và quy định phù hợp với doanh nghiệp. Bảo hiểm mặc định 0%; thuế
                nhập thủ công. Phụ cấp cố định và bảo hiểm chỉ phát sinh khi có
                công hưởng lương; phụ cấp theo ngày chỉ dựa trên giờ thực làm.
                Mức gợi ý mới không tự thay đổi phụ cấp đã gán.
              </span>
            </div>
          </>
        )}
      </div>
      {modal && (
        <Dialog title={dialogTitle} onClose={dismiss}>
          {modal.type === "employee" && (
            <EmployeeForm
              employee={modal.employee}
              data={data}
              error={modalError}
              onClose={dismiss}
              onSave={(employee) =>
                save(
                  () => upsertEmployee(data, employee),
                  "Đã lưu hồ sơ nhân viên",
                )
              }
            />
          )}
          {modal.type === "attendance" && (
            <AttendanceEditor
              employee={modal.employee}
              date={modal.date}
              record={attendance}
              hoursPerDay={data.settings.hoursPerDay}
              error={modalError}
              onClose={dismiss}
              onRemove={() => attendance && save(() => removeAttendance(data, attendance.id), 'Đã bỏ ngày chấm công; bảng lương đã cập nhật')}
              onSave={(values) => {
                const record: Attendance = {
                  ...values,
                  id: attendance?.id || newId(),
                  employeeId: modal.employee.id,
                  date: modal.date,
                };
                save(() => upsertAttendance(data, record), "Đã lưu chấm công");
              }}
            />
          )}
          {modal.type === "adjustment" && (
            <form
              onSubmit={submitForm((f) => {
                const record: PayrollAdjustment = {
                  id: adjustment?.id || newId(),
                  employeeId: modal.row.employeeId,
                  month,
                  bonus: num(f, "bonus"),
                  advance: num(f, "advance"),
                  deduction: num(f, "deduction"),
                  tax: num(f, "tax"),
                  note: str(f, "note"),
                };
                save(
                  () => upsertAdjustment(data, record),
                  "Đã lưu điều chỉnh lương",
                );
              })}
            >
              <div className="payroll-dialog-body">
                <p>
                  <strong>{modal.row.name}</strong> · tháng {month}
                </p>
                <div className="payroll-form-grid">
                  <NumberField
                    label="Thưởng (₫)"
                    name="bonus"
                    value={adjustment?.bonus}
                  />
                  <NumberField
                    label="Tạm ứng (₫)"
                    name="advance"
                    value={adjustment?.advance}
                  />
                  <NumberField
                    label="Khấu trừ khác (₫)"
                    name="deduction"
                    value={adjustment?.deduction}
                  />
                  <NumberField
                    label="Thuế TNCN nhập tay (₫)"
                    name="tax"
                    value={adjustment?.tax}
                  />
                  <Field label="Ghi chú điều chỉnh" full>
                    <textarea
                      name="note"
                      rows={3}
                      maxLength={500}
                      defaultValue={adjustment?.note}
                    />
                  </Field>
                </div>
                <p className="payroll-muted">
                  Các khoản nhập ở đây là tổng số tiền của cả tháng, không cộng
                  dồn mỗi lần lưu.
                </p>
                {modalError && (
                  <p role="alert" className="payroll-error">
                    {modalError}
                  </p>
                )}
              </div>
              <Footer onClose={dismiss} label="Lưu điều chỉnh" />
            </form>
          )}
          {modal.type === "detail" && (
            <>
              <div className="payroll-dialog-body">
                <p>
                  <strong>{modal.row.name}</strong> · {modal.row.code} · tháng{" "}
                  {month}
                </p>
                <div className="payroll-details">
                  {(
                    [
                      [
                        "Mức lương / " +
                          { monthly: "tháng", daily: "ngày", hourly: "giờ" }[
                            modal.row.salaryType
                          ],
                        formatMoney(modal.row.baseSalary),
                      ],
                      [
                        "Công hưởng lương",
                        modal.row.paidDays.toLocaleString("vi-VN", {
                          maximumFractionDigits: 2,
                        }) + " công",
                      ],
                      [
                        "Giờ thực làm / nghỉ hưởng lương",
                        `${modal.row.regularHours} / ${modal.row.paidLeaveHours} giờ`,
                      ],
                      [
                        "Tăng ca thường / nghỉ / lễ",
                        `${modal.row.overtimeWeekdayHours} / ${modal.row.overtimeRestDayHours} / ${modal.row.overtimeHolidayHours} giờ`,
                      ],
                      ["Lương theo công", formatMoney(modal.row.ordinaryPay)],
                      ["Tiền tăng ca", formatMoney(modal.row.overtimePay)],
                      ["Phụ cấp", formatMoney(modal.row.allowancePay)],
                      ["Thưởng", formatMoney(modal.row.bonus)],
                      ["Tổng thu nhập", formatMoney(modal.row.grossPay)],
                      ["Bảo hiểm", formatMoney(modal.row.insurance)],
                      ["Thuế TNCN", formatMoney(modal.row.tax)],
                      ["Khấu trừ khác", formatMoney(modal.row.deduction)],
                      ["Tạm ứng", formatMoney(modal.row.advance)],
                      ["Thực lĩnh", formatMoney(modal.row.netPay)],
                    ] as [string, string][]
                  ).map(([label, amount]) => (
                    <div
                      key={label}
                      className={label === "Thực lĩnh" ? "total" : ""}
                    >
                      <span>{label}</span>
                      <strong>{amount}</strong>
                    </div>
                  ))}
                </div>
                <p className="payroll-muted">
                  {closed
                    ? "Số liệu được lưu tại thời điểm chốt, không thay đổi khi sửa hồ sơ hoặc cấu hình."
                    : `Lương tháng: mức lương ÷ ${data.settings.standardDays} ngày × công hưởng lương. Lương ngày: mức lương × công. Lương giờ: mức lương × (giờ làm + nghỉ hưởng lương). Tăng ca: đơn giá giờ × số giờ × hệ số tương ứng.`}
                </p>
              </div>
              <div className="payroll-dialog-footer">
                <button className="payroll-button primary" onClick={dismiss}>
                  Đóng chi tiết
                </button>
              </div>
            </>
          )}
          {modal.type === "allowance" && (
            <form
              onSubmit={submitForm((f) => {
                const allowance: AllowanceType = {
                  id: modal.allowance?.id || newId(),
                  name: str(f, "name"),
                  basis: str(f, "basis") as AllowanceType["basis"],
                  defaultAmount: num(f, "defaultAmount"),
                };
                save(
                  () => upsertAllowanceType(data, allowance),
                  "Đã lưu loại phụ cấp",
                );
              })}
            >
              <div className="payroll-dialog-body">
                <Field label="Tên phụ cấp">
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={modal.allowance?.name}
                    placeholder="Ví dụ: Ăn ca, đi lại, trách nhiệm"
                  />
                </Field>
                <Field label="Cách tính phụ cấp">
                  <select
                    name="basis"
                    defaultValue={modal.allowance?.basis || "workday"}
                  >
                    <option value="workday">Theo ngày thực làm</option>
                    <option value="fixed">Cố định / tháng</option>
                  </select>
                </Field>
                <NumberField
                  label="Mức tiền gợi ý (₫)"
                  name="defaultAmount"
                  value={modal.allowance?.defaultAmount}
                />
                <p className="payroll-muted">
                  Thay đổi cách tính sẽ áp dụng cho các tháng chưa chốt. Mức
                  tiền gợi ý chỉ dùng khi gán mới cho nhân viên.
                </p>
                {modalError && (
                  <p role="alert" className="payroll-error">
                    {modalError}
                  </p>
                )}
              </div>
              <Footer onClose={dismiss} label="Lưu phụ cấp" />
            </form>
          )}
          {(modal.type === "close" || modal.type === "reopen") && (
            <form
              onSubmit={submitForm(() =>
                save(
                  () =>
                    modal.type === "close"
                      ? closePayroll(data, month)
                      : reopenPayroll(data, month),
                  modal.type === "close"
                    ? "Đã chốt bảng lương"
                    : "Đã mở lại bảng lương",
                ),
              )}
            >
              <div className="payroll-dialog-body">
                <p>
                  {modal.type === "close"
                    ? `Chốt bảng lương tháng ${month} cho ${rows.length} nhân viên, tổng thực lĩnh ${formatMoney(total("netPay"))}?`
                    : `Mở lại bảng lương tháng ${month}?`}
                </p>
                <p className="payroll-muted">
                  {modal.type === "close"
                    ? "Số liệu sẽ được giữ cố định. Không thể sửa chấm công và điều chỉnh lương của tháng này cho đến khi mở lại. Hãy kiểm tra đủ ngày công trước khi chốt."
                    : "Bản chốt hiện tại sẽ bị gỡ. Bảng lương được tính lại theo chấm công, hồ sơ và cấu hình mới nhất; số tiền có thể thay đổi. Bạn có thể xuất CSV trước để lưu đối chiếu."}
                </p>
                {modalError && (
                  <p role="alert" className="payroll-error">
                    {modalError}
                  </p>
                )}
              </div>
              <Footer
                onClose={dismiss}
                label={
                  modal.type === "close"
                    ? "Xác nhận chốt lương"
                    : "Xác nhận mở lại"
                }
              />
            </form>
          )}
        </Dialog>
      )}
    </div>
  );
}
