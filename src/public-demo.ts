import type { PublicCatalog } from './commerce'

/** Fictional presentation content only; never derived from private business data. */
export const publicDemo: PublicCatalog = {
  version: 1, publishedAt: '2026-10-22T00:00:00.000Z',
  profile: {
    name: 'Cơ khí An Phát', tagline: 'Gia công theo bản vẽ. Đồng hành cùng sản xuất.',
    description: 'Không gian giới thiệu mẫu dành cho doanh nghiệp cơ khí: trình bày năng lực gia công, danh mục chi tiết và cách khách hàng liên hệ báo giá. Nội dung này là minh họa để trải nghiệm phần mềm.',
    address: '', phone: '', email: '', website: '', heroImage: '',
    capabilities: ['Tiện & phay CNC', 'Gia công theo bản vẽ', 'Kết cấu & đồ gá', 'Sản xuất theo đơn'],
  },
  products: [
    { id: 'demo-shaft', name: 'Trục truyền động', category: 'Tiện CNC', summary: 'Chi tiết tròn xoay gia công theo bản vẽ và yêu cầu lắp ghép.', specification: 'Đường kính, chiều dài, dung sai và xử lý bề mặt được xác nhận khi báo giá.', material: 'Thép / inox theo yêu cầu', unit: 'Chi tiết', imageUrl: '', priceLabel: 'Báo giá theo bản vẽ', featured: true },
    { id: 'demo-jig', name: 'Đồ gá gia công', category: 'Phay CNC', summary: 'Đồ gá phục vụ định vị và hỗ trợ công đoạn sản xuất.', specification: 'Trao đổi bản vẽ, kích thước phôi và yêu cầu sử dụng để thống nhất phương án.', material: 'Theo yêu cầu kỹ thuật', unit: 'Bộ', imageUrl: '', priceLabel: 'Liên hệ báo giá', featured: true },
    { id: 'demo-flange', name: 'Mặt bích & bạc lót', category: 'Chi tiết máy', summary: 'Chi tiết máy sản xuất theo kích thước và số lượng đặt hàng.', specification: 'Thông số vật liệu, số lượng, tiêu chuẩn kiểm tra và lịch giao sẽ được xác nhận riêng.', material: 'Thép / đồng / inox', unit: 'Chi tiết', imageUrl: '', priceLabel: 'Báo giá theo số lượng', featured: true },
    { id: 'demo-frame', name: 'Khung & kết cấu cơ khí', category: 'Kết cấu', summary: 'Hạng mục cơ khí theo thiết kế và yêu cầu của khách hàng.', specification: 'Gửi kích thước, bản vẽ và điều kiện sử dụng để trao đổi phạm vi gia công.', material: 'Theo bản vẽ', unit: 'Bộ', imageUrl: '', priceLabel: 'Liên hệ trao đổi', featured: false },
  ],
}
