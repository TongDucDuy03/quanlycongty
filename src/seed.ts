import { localDate, type Data, type Order, type OrderStatus } from './domain'
import { createPayrollSeed } from './payroll'

/** Entirely fictional demo records. Date offsets keep the demo useful when opened later. */
export function createSeedData(now = new Date()): Data {
  const day = (offset: number) => {
    const value = new Date(now)
    value.setDate(value.getDate() + offset)
    return localDate(value)
  }
  const customers: Data['customers'] = [
    { id: 'c1', name: 'Cơ điện An Phát', contact: 'Nguyễn Minh Anh', phone: '0900 000 101', email: 'anphat@example.com', address: 'KCN Tân Bình, TP. Hồ Chí Minh' },
    { id: 'c2', name: 'Thiết bị Minh Long', contact: 'Trần Hoàng Nam', phone: '0900 000 102', email: 'minhlong@example.com', address: 'KCN Sóng Thần, Bình Dương' },
    { id: 'c3', name: 'Tự động hóa Việt Tín', contact: 'Lê Thảo Linh', phone: '0900 000 103', email: 'viettin@example.com', address: 'TP. Thủ Đức, TP. Hồ Chí Minh' },
    { id: 'c4', name: 'Bao bì Hưng Thịnh', contact: 'Phạm Quốc Huy', phone: '0900 000 104', email: 'hungthinh@example.com', address: 'KCN Đức Hòa, Long An' },
    { id: 'c5', name: 'Nông cơ Thành Công', contact: 'Võ Thanh Sơn', phone: '0900 000 105', email: 'thanhcong@example.com', address: 'Biên Hòa, Đồng Nai' },
    { id: 'c6', name: 'Khuôn mẫu Đại Việt', contact: 'Đặng Ngọc Hà', phone: '0900 000 106', email: 'daiviet@example.com', address: 'KCN Hiệp Phước, TP. Hồ Chí Minh' },
  ]
  const rows: Array<[string, string, number, number, number, OrderStatus, number, number, string, string, string]> = [
    ['c1', 'Trục truyền động Ø45', 120, 385_000, 2, 'machining', 78, 18_000_000, 'Thép S45C', 'Tiện CNC 01', 'Anh Tuấn'],
    ['c2', 'Bích nối inox DN80', 80, 620_000, 0, 'qc', 80, 20_000_000, 'Inox 304', 'Phay CNC 02', 'Anh Hùng'],
    ['c3', 'Gá đỡ cảm biến nhôm', 250, 145_000, 5, 'machining', 95, 10_000_000, 'Nhôm 6061', 'Phay CNC 01', 'Anh Phúc'],
    ['c4', 'Con lăn băng tải Ø60', 60, 780_000, -2, 'machining', 42, 15_000_000, 'Thép S45C', 'Tiện CNC 02', 'Anh Khoa'],
    ['c5', 'Bạc lót đồng Ø32', 200, 165_000, 1, 'ready', 200, 20_000_000, 'Đồng thau', 'Tiện CNC 01', 'Anh Tuấn'],
    ['c6', 'Tấm đế khuôn 250×180', 12, 2_850_000, 9, 'pending', 0, 10_000_000, 'Thép SKD11', 'Phay CNC 02', 'Anh Hùng'],
    ['c1', 'Puly đai thang Ø150', 45, 920_000, 7, 'pending', 0, 12_000_000, 'Nhôm 6061', 'Tiện CNC 02', 'Anh Khoa'],
    ['c3', 'Khớp nối trục Ø25', 150, 235_000, -1, 'qc', 150, 15_000_000, 'Thép S45C', 'Tiện CNC 01', 'Anh Tuấn'],
    ['c2', 'Chốt định vị Ø12', 500, 48_000, -5, 'delivered', 500, 24_000_000, 'Thép SKD11', 'Tiện CNC 02', 'Anh Khoa'],
    ['c4', 'Dao cắt màng bao bì', 30, 1_250_000, 4, 'machining', 18, 15_000_000, 'Thép SKD11', 'Phay CNC 01', 'Anh Phúc'],
    ['c5', 'Mặt bích hộp số', 24, 1_450_000, -8, 'delivered', 24, 20_000_000, 'Thép S45C', 'Phay CNC 02', 'Anh Hùng'],
    ['c6', 'Bộ căn khuôn chính xác', 40, 680_000, 3, 'ready', 40, 13_600_000, 'Thép SKD11', 'Phay CNC 01', 'Anh Phúc'],
  ]
  const orders: Order[] = rows.map(([customerId, partName, quantity, unitPrice, dueOffset, status, completedQuantity, paid, material, machine, operator], index) => ({
    id: `o${index + 1}`, code: `LSX-${String(2401 + index)}`, customerId, partName, quantity, unitPrice,
    dueDate: day(dueOffset), createdAt: day(-18 + Math.floor(index / 2)), status,
    priority: [1, 3, 7].includes(index) ? 'high' : 'normal',
    drawing: `BV-${String(101 + index)} / Rev.B`, material, machine, operator, completedQuantity, paid,
    notes: index === 3 ? 'Khách cần giao gấp. Kiểm tra độ đảo sau khi tiện.' : index === 7 ? 'Kiểm tra dung sai lỗ H7 trước khi xuất xưởng.' : 'Gia công theo bản vẽ đã duyệt. Kiểm tra kích thước trước khi giao.',
  }))
  return {
    version: 1, customers, orders, payroll: createPayrollSeed(now),
    materials: [
      { id: 'm1', code: 'VT-001', name: 'Thép tròn S45C', spec: 'Ø50 × 6.000 mm', unit: 'kg', stock: 420, minStock: 150, unitCost: 28_500 },
      { id: 'm2', code: 'VT-002', name: 'Inox tấm 304', spec: 'Dày 12 mm', unit: 'kg', stock: 85, minStock: 100, unitCost: 78_000 },
      { id: 'm3', code: 'VT-003', name: 'Nhôm tấm 6061', spec: 'Dày 20 mm', unit: 'kg', stock: 185, minStock: 80, unitCost: 112_000 },
      { id: 'm4', code: 'VT-004', name: 'Thép khuôn SKD11', spec: 'Tấm 30 × 300 mm', unit: 'kg', stock: 42, minStock: 60, unitCost: 145_000 },
      { id: 'm5', code: 'VT-005', name: 'Đồng thau tròn', spec: 'Ø40 × 1.000 mm', unit: 'kg', stock: 64, minStock: 30, unitCost: 185_000 },
      { id: 'm6', code: 'VT-006', name: 'Dao phay ngón carbide', spec: 'Ø10 / 4 me', unit: 'cái', stock: 8, minStock: 10, unitCost: 320_000 },
      { id: 'm7', code: 'VT-007', name: 'Dầu tưới nguội', spec: 'Pha nước 5–8%', unit: 'lít', stock: 120, minStock: 40, unitCost: 65_000 },
    ],
    movements: [
      { id: 's1', materialId: 'm1', type: 'in', quantity: 200, date: day(-1), note: 'Nhập thép cho lệnh LSX-2401, LSX-2407' },
      { id: 's2', materialId: 'm2', type: 'out', quantity: 35, date: day(-1), note: 'Xuất gia công bích nối LSX-2402' },
      { id: 's3', materialId: 'm3', type: 'out', quantity: 65, date: day(-2), note: 'Xuất phôi nhôm cho gá cảm biến LSX-2403' },
      { id: 's4', materialId: 'm6', type: 'out', quantity: 4, date: day(-2), note: 'Cấp dao mới cho máy phay CNC 01' },
      { id: 's5', materialId: 'm4', type: 'out', quantity: 18, date: day(-3), note: 'Xuất vật tư gia công dao cắt LSX-2410' },
    ],
  }
}
