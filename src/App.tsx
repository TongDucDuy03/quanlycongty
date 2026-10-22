import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Boxes,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  CreditCard,
  Factory,
  FileText,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  TrendingUp,
  Users,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import type { Data, Order, OrderStatus, Material, Customer } from "./domain";
import {
  applyStockMovement,
  formatCompactMoney,
  formatDate,
  formatMoney,
  isOverdue,
  newId,
  orderBalance,
  orderTotal,
  statusLabels,
  statusProgress,
  validateData,
} from "./domain";
import { createSeedData } from "./seed";
import SheetsConnection from "./SheetsConnection";
import {
  cloudAllowed,
  assertLocalDataCurrent,
  cloudConfigError,
  clearScopedData,
  downloadFile,
  exportCSV,
  loadData,
  saveData,
  supabase,
} from "./storage";

const PayrollWorkspace = lazy(() => import("./PayrollWorkspace"));

type Page =
  | "overview"
  | "orders"
  | "production"
  | "inventory"
  | "customers"
  | "finance"
  | "payroll"
  | "settings";
type Modal =
  | { type: "order"; order?: Order }
  | { type: "detail"; id: string }
  | { type: "stock"; material: Material }
  | { type: "customer" }
  | { type: "payment"; order: Order }
  | { type: "reset" }
  | null;
const nav = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "orders", label: "Đơn hàng", icon: ClipboardList },
  { id: "production", label: "Tiến độ sản xuất", icon: Factory },
  { id: "inventory", label: "Kho vật tư", icon: Boxes },
  { id: "customers", label: "Khách hàng", icon: Users },
  { id: "finance", label: "Thu chi & công nợ", icon: CreditCard },
  { id: "payroll", label: "Nhân sự & tiền lương", icon: UsersRound },
] as const;
const statuses: OrderStatus[] = [
  "pending",
  "machining",
  "qc",
  "ready",
  "delivered",
];
const uid = newId;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const readPage = (): Page => {
  const v = location.hash.slice(1);
  return [...nav.map((n) => n.id), "settings"].includes(v)
    ? (v as Page)
    : "overview";
};
function Badge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
function Empty({ text = "Không có dữ liệu phù hợp." }: { text?: string }) {
  return (
    <div className="empty">
      <Package size={32} />
      <strong>{text}</strong>
      <span>Thử thay đổi bộ lọc hoặc thêm dữ liệu mới.</span>
    </div>
  );
}
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function ModalFrame({
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
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Đóng">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function App() {
  const [initial] = useState(loadData);
  const [data, setData] = useState(initial.data);
  const currentDataRef = useRef(data);
  currentDataRef.current = data;
  const [sheetsStatus, setSheetsStatus] = useState("");
  const [page, setPage] = useState<Page>(readPage);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("xuong-viet.theme") || "light";
    } catch {
      return "light";
    }
  });
  const [menu, setMenu] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [modal, setModal] = useState<Modal>(null),
    [toast, setToast] = useState(""),
    [notice, setNotice] = useState(initial.warning || ""),
    [alerts, setAlerts] = useState(false);
  const [cloudUser, setCloudUser] = useState(""),
    [cloudRevision, setCloudRevision] = useState<number | null>(null),
    [cloudMessage, setCloudMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef(initial.token);
  const localReadErrorRef = useRef(Boolean(initial.warning));
  const ownerRef = useRef("");
  const generationRef = useRef(0);
  const authGenerationRef = useRef(0);
  const revisionKey = (owner: string) => `xuong-viet.cloud-revision.${owner}`;
  useEffect(() => {
    if (!menu) return;
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    addEventListener("keydown", closeMenu);
    return () => removeEventListener("keydown", closeMenu);
  }, [menu]);
  useEffect(() => {
    if (modal) setNotice("");
  }, [modal?.type]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("xuong-viet.theme", theme);
    } catch {
      /* theme remains in memory */
    }
  }, [theme]);
  useEffect(() => {
    const h = () => {
      setPage(readPage());
      setFilter("all");
      setQuery("");
    };
    addEventListener("hashchange", h);
    return () => removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      const nextOwner = s?.user.id || "";
      if (nextOwner === ownerRef.current) return;
      const previousOwner = ownerRef.current;
      if (previousOwner) {
        try {
          clearScopedData(previousOwner);
          localStorage.removeItem(revisionKey(previousOwner));
        } catch {
          /* UI switches to isolated demo even if storage is unavailable. */
        }
      }
      ownerRef.current = nextOwner;
      authGenerationRef.current++;
      generationRef.current++;
      const local = loadData(nextOwner || undefined);
      tokenRef.current = local.token;
      setData(local.data);
      setCloudUser(nextOwner);
      let revision: number | null = null;
      try {
        const saved = Number(localStorage.getItem(revisionKey(nextOwner)));
        if (
          local.token &&
          !local.warning &&
          Number.isSafeInteger(saved) &&
          saved > 0
        )
          revision = saved;
        if (local.warning) localStorage.removeItem(revisionKey(nextOwner));
      } catch {
        /* Cloud load remains available. */
      }
      setCloudRevision(revision);
      setDirty(Boolean(nextOwner && local.token));
      setNotice(local.warning || "");
      setModal(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const go = (p: Page) => {
    setPage(p);
    history.pushState(null, "", `#${p}`);
    setMenu(false);
    setQuery("");
    setFilter("all");
    setAlerts(false);
  };
  const commit = (next: Data, message: string) => {
    if (!validateData(next)) {
      setNotice("Dữ liệu chưa hợp lệ. Vui lòng kiểm tra các giá trị nhập.");
      return false;
    }
    try {
      tokenRef.current = saveData(
        next,
        tokenRef.current,
        ownerRef.current || undefined,
      );
      currentDataRef.current = next;
      localReadErrorRef.current = false;
      setData(next);
      generationRef.current++;
      setDirty(true);
      setNotice("");
      setToast(message);
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Không thể lưu vào trình duyệt. Hãy xuất bản sao lưu và thử lại.",
      );
      return false;
    }
  };
  const active = data.orders.filter((o) => o.status !== "delivered"),
    late = active.filter((o) => isOverdue(o)),
    low = data.materials.filter((m) => m.stock <= m.minStock),
    balance = data.orders.reduce((s, o) => s + orderBalance(o), 0),
    total = data.orders.reduce((s, o) => s + orderTotal(o), 0),
    collected = data.orders.reduce((s, o) => s + o.paid, 0);
  const match = (s: string) =>
    s
      .toLocaleLowerCase("vi")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replaceAll("đ", "d")
      .includes(
        query
          .toLocaleLowerCase("vi")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replaceAll("đ", "d"),
      );
  const customer = (id: string) =>
    data.customers.find((c) => c.id === id)?.name || "Khách hàng";
  const visible = data.orders.filter(
    (o) =>
      match(`${o.code} ${o.partName} ${customer(o.customerId)}`) &&
      (filter === "all" ||
        (filter === "overdue" ? isOverdue(o) : o.status === filter)),
  );
  const setStatus = (o: Order, status: OrderStatus) =>
    commit(
      {
        ...data,
        orders: data.orders.map((v) =>
          v.id === o.id
            ? {
                ...v,
                status,
                completedQuantity:
                  status === "ready" || status === "delivered"
                    ? v.quantity
                    : v.completedQuantity,
              }
            : v,
        ),
      },
      "Đã cập nhật tiến độ sản xuất",
    );
  const orderTable = (orders: Order[], compact = false) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>ĐƠN HÀNG / CHI TIẾT</th>
            <th>KHÁCH HÀNG</th>
            <th>TIẾN ĐỘ</th>
            <th>HẠN GIAO</th>
            {!compact && <th className="right">GIÁ TRỊ</th>}
            <th>TRẠNG THÁI</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              onClick={() => setModal({ type: "detail", id: o.id })}
            >
              <td>
                <button
                  className="table-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ type: "detail", id: o.id });
                  }}
                >
                  {o.code}
                  {o.priority === "high" && (
                    <span className="priority-dot" title="Ưu tiên cao" />
                  )}
                </button>
                <span className="cell-sub">{o.partName}</span>
              </td>
              <td>
                <span className="customer-name">{customer(o.customerId)}</span>
                <span className="cell-sub">{o.quantity} chi tiết</span>
              </td>
              <td>
                <div className="progress-cell">
                  <div className="progress-track">
                    <i style={{ width: `${statusProgress[o.status]}%` }} />
                  </div>
                  <span>{statusProgress[o.status]}%</span>
                </div>
              </td>
              <td>
                <span className={isOverdue(o) ? "late-text" : ""}>
                  {formatDate(o.dueDate)}
                </span>
                {isOverdue(o) && (
                  <span className="cell-sub late-text">Trễ hạn</span>
                )}
              </td>
              {!compact && (
                <td className="right amount">{formatMoney(orderTotal(o))}</td>
              )}
              <td>
                <Badge status={o.status} />
              </td>
              <td>
                <button
                  aria-label={`Chi tiết ${o.code}`}
                  className="icon-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ type: "detail", id: o.id });
                  }}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length && <Empty />}
    </div>
  );

  async function cloudAction(action: "load" | "save" | "init") {
    if (!supabase || !cloudUser) return;
    if (
      action === "load" &&
      !confirm(
        "Tải dữ liệu đám mây sẽ thay thế dữ liệu trên thiết bị này. Bạn nên xuất bản sao lưu trước. Tiếp tục?",
      )
    )
      return;
    if (
      action === "init" &&
      !confirm(
        "Tạo kho dữ liệu đám mây từ dữ liệu đang hiển thị? Chỉ thực hiện khi đây là dữ liệu bạn muốn lưu.",
      )
    )
      return;
    setBusy(true);
    setCloudMessage("");
    const startedGeneration = generationRef.current;
    const startedAuthGeneration = authGenerationRef.current;
    const startedOwner = cloudUser;
    const rememberRevision = (revision: number) => {
      setCloudRevision(revision);
      try {
        localStorage.setItem(revisionKey(startedOwner), String(revision));
      } catch {
        /* A reload may require an explicit cloud load. */
      }
    };
    try {
      if (
        action !== "load" &&
        loadData(startedOwner).token !== tokenRef.current
      ) {
        throw Error(
          "Dữ liệu trên máy đã thay đổi ở tab khác. Tải lại trang trước khi lưu lên đám mây.",
        );
      }
      if (action === "load") {
        const { data: row, error } = await supabase
          .from("workshop_snapshots")
          .select("data,revision")
          .eq("owner_id", cloudUser)
          .maybeSingle();
        if (startedAuthGeneration !== authGenerationRef.current) return;
        if (startedGeneration !== generationRef.current)
          throw Error(
            "Bạn đã chỉnh sửa trong lúc tải. Dữ liệu trên máy được giữ nguyên; hãy sao lưu rồi tải lại khi sẵn sàng.",
          );
        if (error) throw error;
        if (!row)
          throw Error("Chưa có kho đám mây. Bấm “Khởi tạo kho” để tạo.");
        if (!validateData(row.data))
          throw Error("Dữ liệu đám mây không đúng định dạng.");
        if (commit(row.data, "Đã tải dữ liệu từ đám mây")) {
          rememberRevision(row.revision);
          setDirty(false);
          setCloudMessage("Đã tải thành công.");
        }
      } else {
        if (action === "save" && cloudRevision === null)
          throw Error("Hãy tải dữ liệu đám mây trước khi lưu để tránh ghi đè.");
        const result =
          action === "init"
            ? await supabase
                .from("workshop_snapshots")
                .insert({ owner_id: cloudUser, data, revision: 1 })
                .select("revision")
                .single()
            : await supabase
                .from("workshop_snapshots")
                .update({ data, revision: cloudRevision! + 1 })
                .eq("owner_id", cloudUser)
                .eq("revision", cloudRevision!)
                .select("revision")
                .maybeSingle();
        if (startedAuthGeneration !== authGenerationRef.current) return;
        if (result.error) throw result.error;
        if (!result.data)
          throw Error(
            "Dữ liệu đã thay đổi trên thiết bị khác. Xuất bản sao lưu, sau đó tải lại để đối chiếu.",
          );
        rememberRevision(result.data.revision);
        const unchanged = startedGeneration === generationRef.current;
        setDirty(!unchanged);
        setCloudMessage(
          unchanged
            ? "Đã lưu lên đám mây thành công."
            : "Đã lưu bản trước đó. Có thay đổi mới trên máy; bấm lưu lần nữa để gửi tiếp.",
        );
      }
    } catch (e) {
      if (startedAuthGeneration === authGenerationRef.current)
        setCloudMessage(
          e instanceof Error
            ? e.message
            : "Không thể đồng bộ. Kiểm tra kết nối và cấu hình Supabase.",
        );
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    setCloudMessage(
      error?.message ||
        "Đã đăng nhập. Hãy tải kho dữ liệu hoặc khởi tạo lần đầu.",
    );
    setBusy(false);
  }

  return (
    <div className="app-shell">
      {menu && (
        <div className="sidebar-backdrop" onClick={() => setMenu(false)} />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <button
          className="icon-button sidebar-close"
          aria-label="Đóng menu"
          onClick={() => setMenu(false)}
        >
          <X size={20} />
        </button>
        <a className="brand" href="#overview" onClick={() => go("overview")}>
          <span className="brand-mark">
            <Factory size={25} />
          </span>
          <span>
            Xưởng<span className="brand-light">Việt</span>
            <small>QUẢN LÝ XƯỞNG CƠ KHÍ</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">AP</span>
          <div>
            <strong>Cơ khí An Phát</strong>
            <small>Không gian làm việc mẫu</small>
          </div>
          <ChevronDown size={16} />
        </div>
        <span className="nav-caption">KHÔNG GIAN QUẢN LÝ</span>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "orders" && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">
              <ShieldCheck size={20} />
            </span>
            <strong>Gọn việc xưởng, vững tiến độ.</strong>
            <p>Mọi thông tin cần thiết, trong một không gian.</p>
            <button onClick={() => go("settings")}>
              Hướng dẫn & dữ liệu <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings size={19} />
            Cài đặt & dữ liệu
          </button>
          <div className="profile">
            <span className="avatar">AP</span>
            <div>
              <strong>Chủ xưởng</strong>
              <small>Không gian demo</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span>Không gian làm việc</span>
            <ChevronRight size={14} />
            <strong>
              {nav.find((n) => n.id === page)?.label || "Cài đặt & dữ liệu"}
            </strong>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="local-indicator"
              data-sync-state={sheetsStatus.includes("cần xử lý") ? "attention" : /đang|chờ|chưa/.test(sheetsStatus) ? "pending" : "ready"}
              onClick={() => go("settings")}
              title="Xem trạng thái kết nối và đồng bộ dữ liệu"
            >
              <i />
              {sheetsStatus || (cloudUser
                ? dirty
                  ? "Đám mây · Chưa gửi thay đổi"
                  : "Đám mây · Đồng bộ thủ công"
                : "Demo · Lưu trên máy")}
            </button>
            <button
              className="icon-button"
              title={
                theme === "light" ? "Chuyển chế độ tối" : "Chuyển chế độ sáng"
              }
              aria-label={
                theme === "light" ? "Chuyển chế độ tối" : "Chuyển chế độ sáng"
              }
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button bell"
                aria-label="Thông báo cần chú ý"
                onClick={() => setAlerts(!alerts)}
              >
                <Bell size={19} />
                {late.length + low.length > 0 && <i />}
              </button>
              {alerts && (
                <div className="notification-panel">
                  <strong>Cần chú ý</strong>
                  <button
                    onClick={() => {
                      go("orders");
                      setFilter("overdue");
                    }}
                  >
                    {late.length} đơn hàng đã quá hạn <ArrowRight size={16} />
                  </button>
                  <button onClick={() => go("inventory")}>
                    {low.length} vật tư chạm mức tối thiểu{" "}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
            <span className="avatar small">AP</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "overview"
                  ? "XƯỞNG HOẠT ĐỘNG, BẠN CHỦ ĐỘNG"
                  : "CƠ KHÍ AN PHÁT"}
              </div>
              <h1>
                {page === "overview"
                  ? "Tổng quan xưởng"
                  : nav.find((n) => n.id === page)?.label ||
                    "Cài đặt & dữ liệu"}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {
                  {
                    overview:
                      "Một góc nhìn rõ ràng cho ngày làm việc hiệu quả.",
                    orders:
                      "Theo sát từng đơn hàng, từ tiếp nhận đến bàn giao.",
                    production:
                      "Biết việc đang ở đâu, chủ động từng công đoạn.",
                    inventory:
                      "Nắm chắc tồn kho, sẵn sàng cho kế hoạch sản xuất.",
                    customers:
                      "Giữ kết nối và theo dõi đơn hàng của từng khách.",
                    finance:
                      "Nắm rõ giá trị đơn hàng, khoản đã thu và còn phải thu.",
                    payroll:
                      "Quản lý nhân sự, chấm công và tính lương rõ ràng theo từng tháng.",
                    settings:
                      "Quản lý dữ liệu, sao lưu và kết nối không gian của bạn.",
                  }[page]
                }
              </p>
            </div>
            {page !== "payroll" && (
              <div className="heading-actions">
                {page === "overview" ? (
                  <span className="date-chip">
                    <Clock3 size={16} />
                    {new Intl.DateTimeFormat("vi-VN", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    }).format(new Date())}
                  </span>
                ) : (
                  <button
                    className="button secondary"
                    onClick={() => {
                      exportCSV(data);
                      setToast("Đã xuất danh sách đơn hàng");
                    }}
                  >
                    <ArrowDownToLine size={16} />
                    Xuất đơn hàng
                  </button>
                )}
                {page !== "settings" && (
                  <button
                    className="button primary"
                    onClick={() =>
                      setModal(
                        page === "customers"
                          ? { type: "customer" }
                          : { type: "order" },
                      )
                    }
                  >
                    <Plus size={18} />
                    {page === "customers" ? "Thêm khách hàng" : "Tạo đơn hàng"}
                  </button>
                )}
              </div>
            )}
          </div>
          {notice && (
            <div className="notice" role="alert">
              {notice}
              <button aria-label="Ẩn thông báo" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {page === "overview" && (
            <>
              <div className="welcome-banner">
                <div className="welcome-decoration">
                  <Wrench size={26} />
                </div>
                <div>
                  <strong>Chào bạn, hôm nay xưởng có gì?</strong>
                  <p>
                    Có <b>{active.length} đơn hàng</b> đang theo dõi và{" "}
                    <b>
                      {data.orders.filter((o) => o.status === "ready").length}{" "}
                      đơn sẵn sàng giao
                    </b>
                    . Cùng kiểm tra nhé.
                  </p>
                </div>
                <button onClick={() => go("production")}>
                  Xem tiến độ <ArrowRight size={17} />
                </button>
              </div>
              <div className="stats-grid">
                <Stat
                  title="Đơn hàng đang thực hiện"
                  value={String(active.length).padStart(2, "0")}
                  icon={<ClipboardList size={21} />}
                  sub={`${data.orders.filter((o) => o.status === "machining").length} đơn đang gia công`}
                  color="green"
                  onClick={() => go("orders")}
                />
                <Stat
                  title="Giá trị đơn hàng"
                  value={formatCompactMoney(total)}
                  icon={<TrendingUp size={21} />}
                  sub="Tổng giá trị các đơn trong demo"
                  color="blue"
                  onClick={() => go("finance")}
                />
                <Stat
                  title="Công nợ phải thu"
                  value={formatCompactMoney(balance)}
                  icon={<CreditCard size={21} />}
                  sub={`${data.orders.filter((o) => orderBalance(o) > 0).length} đơn chưa thu đủ`}
                  color="orange"
                  onClick={() => go("finance")}
                />
                <Stat
                  title="Đơn hàng trễ hạn"
                  value={String(late.length).padStart(2, "0")}
                  icon={<Clock3 size={21} />}
                  sub={
                    late.length
                      ? "Cần ưu tiên xử lý hôm nay"
                      : "Các đơn hàng đều đúng tiến độ"
                  }
                  color="red"
                  onClick={() => {
                    go("orders");
                    setFilter("overdue");
                  }}
                />
              </div>
              <div className="overview-middle">
                <section className="card production-overview">
                  <div className="card-header">
                    <div>
                      <h2>Nhịp sản xuất</h2>
                      <p>Phân bố đơn hàng theo công đoạn</p>
                    </div>
                    <span className="subtle-pill">
                      {data.orders.length} đơn hàng
                    </span>
                  </div>
                  <div className="production-chart">
                    <div
                      className="donut"
                      style={{
                        background: (() => {
                          let n = 0;
                          return `conic-gradient(${statuses
                            .map((s, i) => {
                              const start = n;
                              n +=
                                (data.orders.filter((o) => o.status === s)
                                  .length /
                                  Math.max(data.orders.length, 1)) *
                                100;
                              return `${["var(--chart-pending)", "var(--green)", "var(--chart-qc)", "var(--chart-ready)", "var(--chart-delivered)"][i]} ${start}% ${n}%`;
                            })
                            .join(",")})`;
                        })(),
                      }}
                    >
                      <div>
                        <strong>{active.length}</strong>
                        <span>đơn đang mở</span>
                      </div>
                    </div>
                    <div className="chart-legend">
                      {statuses.map((s, i) => (
                        <button
                          key={s}
                          onClick={() => {
                            go("orders");
                            setFilter(s);
                          }}
                        >
                          <span className={`legend-dot legend-${i}`} />
                          <span>{statusLabels[s]}</span>
                          <b>
                            {String(
                              data.orders.filter((o) => o.status === s).length,
                            ).padStart(2, "0")}
                          </b>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="card-footer-note">
                    <span className="online-dot" />
                    Cập nhật theo dữ liệu đang lưu trên thiết bị
                  </div>
                </section>
                <section className="card attention-card">
                  <div className="card-header">
                    <div>
                      <h2>
                        Việc cần chú ý{" "}
                        <span className="tiny-count">
                          {late.length + low.length}
                        </span>
                      </h2>
                      <p>Những việc nhỏ, cần xử lý kịp thời</p>
                    </div>
                    <Bell size={18} />
                  </div>
                  <div className="attention-list">
                    {late.slice(0, 2).map((o) => (
                      <button
                        className="attention-item"
                        key={o.id}
                        onClick={() => setModal({ type: "detail", id: o.id })}
                      >
                        <span className="attention-icon red">
                          <Clock3 size={18} />
                        </span>
                        <span>
                          <strong>{o.code} · Chậm bàn giao</strong>
                          <small>
                            {o.partName} · Hạn {formatDate(o.dueDate)}
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                    {low.slice(0, 2).map((m) => (
                      <button
                        className="attention-item"
                        key={m.id}
                        onClick={() => setModal({ type: "stock", material: m })}
                      >
                        <span className="attention-icon orange">
                          <Package size={18} />
                        </span>
                        <span>
                          <strong>{m.name} sắp hết</strong>
                          <small>
                            Còn {m.stock} {m.unit} · Tối thiểu {m.minStock}{" "}
                            {m.unit}
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                    {!late.length && !low.length && (
                      <Empty text="Xưởng đang trong tầm kiểm soát" />
                    )}
                  </div>
                </section>
              </div>
              <section className="card orders-card">
                <div className="card-header">
                  <div>
                    <h2>Đơn hàng cần theo dõi</h2>
                    <p>Ưu tiên những đơn có hạn giao gần nhất</p>
                  </div>
                  <button className="text-button" onClick={() => go("orders")}>
                    Tất cả đơn hàng <ArrowRight size={16} />
                  </button>
                </div>
                {orderTable(
                  [...active]
                    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                    .slice(0, 5),
                  true,
                )}
                <div className="table-footer">
                  <span>
                    Hiển thị {Math.min(active.length, 5)} / {active.length} đơn
                    hàng đang mở
                  </span>
                  <span>
                    <span className="priority-dot" /> Ưu tiên cao
                  </span>
                </div>
              </section>
            </>
          )}
          {page === "orders" && (
            <section className="card">
              <div className="list-toolbar">
                <div className="tabs">
                  <button
                    className={filter === "all" ? "selected" : ""}
                    onClick={() => setFilter("all")}
                  >
                    Tất cả <span>{data.orders.length}</span>
                  </button>
                  <button
                    className={filter === "machining" ? "selected" : ""}
                    onClick={() => setFilter("machining")}
                  >
                    Đang gia công
                  </button>
                  <button
                    className={filter === "overdue" ? "selected" : ""}
                    onClick={() => setFilter("overdue")}
                  >
                    Trễ hạn <span>{late.length}</span>
                  </button>
                </div>
                <SearchBox
                  value={query}
                  onChange={setQuery}
                  placeholder="Tìm mã đơn, chi tiết, khách hàng..."
                />
              </div>
              <div className="filter-line">
                <span>{visible.length} đơn hàng</span>
                <label>
                  Trạng thái{" "}
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Tất cả trạng thái</option>
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {statusLabels[s]}
                      </option>
                    ))}
                    <option value="overdue">Trễ hạn</option>
                  </select>
                </label>
              </div>
              {orderTable(visible)}
            </section>
          )}
          {page === "production" && (
            <>
              <div className="board-intro">
                <span>
                  <span className="online-dot" /> {active.length} đơn đang mở
                </span>
                <span>Bấm vào đơn để cập nhật số lượng và công đoạn</span>
              </div>
              <div className="kanban">
                {statuses.map((s, i) => (
                  <section className="kanban-column" key={s}>
                    <h2>
                      <span className={`legend-dot legend-${i}`} />
                      {statusLabels[s]}
                      <span>
                        {data.orders.filter((o) => o.status === s).length}
                      </span>
                    </h2>
                    {data.orders
                      .filter((o) => o.status === s)
                      .map((o) => (
                        <article className="job-card" key={o.id}>
                          <button
                            className="job-main"
                            onClick={() =>
                              setModal({ type: "detail", id: o.id })
                            }
                          >
                            <div>
                              <span className="job-code">{o.code}</span>
                              {o.priority === "high" && (
                                <span className="priority-label">Ưu tiên</span>
                              )}
                            </div>
                            <h3>{o.partName}</h3>
                            <p>{customer(o.customerId)}</p>
                            <div className="job-spec">
                              <span>
                                <Package size={14} />
                                {o.quantity} chi tiết
                              </span>
                              <span>
                                <Wrench size={14} />
                                {o.machine || "Chưa xếp máy"}
                              </span>
                            </div>
                            <div className="progress-track">
                              <i
                                style={{
                                  width: `${(o.completedQuantity / o.quantity) * 100}%`,
                                }}
                              />
                            </div>
                            <small>
                              Hoàn thành {o.completedQuantity}/{o.quantity} chi
                              tiết
                            </small>
                            <div className="job-foot">
                              <span className={isOverdue(o) ? "late-text" : ""}>
                                <Clock3 size={13} />
                                {formatDate(o.dueDate)}
                              </span>
                              <span
                                className="operator-avatar"
                                title={o.operator}
                              >
                                {o.operator?.split(" ").at(-1)?.slice(0, 2) ||
                                  "—"}
                              </span>
                            </div>
                          </button>
                          {i < 4 && (
                            <button
                              className="advance-button"
                              onClick={() => setStatus(o, statuses[i + 1])}
                            >
                              {i === 0
                                ? "Bắt đầu gia công"
                                : i === 1
                                  ? "Chuyển kiểm tra"
                                  : i === 2
                                    ? "Sẵn sàng giao"
                                    : "Xác nhận đã giao"}
                              <ArrowRight size={14} />
                            </button>
                          )}
                        </article>
                      ))}
                    {!data.orders.some((o) => o.status === s) && (
                      <div className="kanban-empty">Chưa có đơn hàng</div>
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          {page === "inventory" && (
            <>
              <div className="mini-stats">
                <div>
                  <Package />
                  <span>
                    Mã vật tư<strong>{data.materials.length}</strong>
                  </span>
                </div>
                <div>
                  <Clock3 />
                  <span>
                    Cần bổ sung<strong>{low.length} vật tư</strong>
                  </span>
                </div>
                <div>
                  <Boxes />
                  <span>
                    Giá trị tồn kho tham khảo
                    <strong>
                      {formatMoney(
                        data.materials.reduce(
                          (s, m) => s + m.stock * m.unitCost,
                          0,
                        ),
                      )}
                    </strong>
                  </span>
                </div>
              </div>
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2>Danh mục vật tư</h2>
                    <p>Xuất, nhập và cảnh báo tồn kho tối thiểu</p>
                  </div>
                  <SearchBox
                    value={query}
                    onChange={setQuery}
                    placeholder="Tìm tên hoặc mã vật tư..."
                  />
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>VẬT TƯ</th>
                        <th>QUY CÁCH</th>
                        <th>TỒN KHO</th>
                        <th>TỐI THIỂU</th>
                        <th>TRẠNG THÁI</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.materials
                        .filter((m) => match(m.name + m.code))
                        .map((m) => (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.name}</strong>
                              <span className="cell-sub">{m.code}</span>
                            </td>
                            <td>{m.spec}</td>
                            <td>
                              <strong>{m.stock}</strong> {m.unit}
                            </td>
                            <td>
                              {m.minStock} {m.unit}
                            </td>
                            <td>
                              <span
                                className={`badge ${m.stock <= m.minStock ? "warning" : "ready"}`}
                              >
                                <i />
                                {m.stock <= m.minStock
                                  ? "Cần bổ sung"
                                  : "Đủ tồn kho"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="button small-button secondary"
                                onClick={() =>
                                  setModal({ type: "stock", material: m })
                                }
                              >
                                Nhập / Xuất
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!data.materials.some((m) => match(m.name + m.code)) && (
                    <Empty />
                  )}
                </div>
              </section>
              <section className="card section-gap">
                <div className="card-header">
                  <div>
                    <h2>Lịch sử nhập xuất</h2>
                    <p>Các giao dịch vật tư gần nhất</p>
                  </div>
                </div>
                {data.movements.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>THỜI GIAN</th>
                          <th>VẬT TƯ</th>
                          <th>LOẠI</th>
                          <th>SỐ LƯỢNG</th>
                          <th>GHI CHÚ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.movements.slice(0, 20).map((m) => (
                          <tr key={m.id}>
                            <td>{formatDate(m.date.slice(0, 10))}</td>
                            <td>
                              {
                                data.materials.find(
                                  (v) => v.id === m.materialId,
                                )?.name
                              }
                            </td>
                            <td>{m.type === "in" ? "Nhập kho" : "Xuất kho"}</td>
                            <td>
                              {m.type === "in" ? "+" : "−"}
                              {m.quantity}
                            </td>
                            <td>{m.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="Chưa có giao dịch vật tư" />
                )}
              </section>
            </>
          )}
          {page === "customers" && (
            <>
              <div className="customer-toolbar">
                <span>{data.customers.length} khách hàng trong danh bạ</span>
                <SearchBox
                  value={query}
                  onChange={setQuery}
                  placeholder="Tìm khách hàng, điện thoại..."
                />
              </div>
              <div className="customer-grid">
                {data.customers
                  .filter((c) => match(c.name + c.phone + c.contact))
                  .map((c, i) => {
                    const orders = data.orders.filter(
                      (o) => o.customerId === c.id,
                    );
                    return (
                      <section className="card customer-card" key={c.id}>
                        <div className="customer-card-top">
                          <span className={`customer-avatar tone-${i % 3}`}>
                            {c.name
                              .split(" ")
                              .slice(-2)
                              .map((w) => w[0])
                              .join("")}
                          </span>
                          <span className="subtle-pill">
                            {orders.length} đơn hàng
                          </span>
                        </div>
                        <h2>{c.name}</h2>
                        <p>{c.contact}</p>
                        <dl>
                          <div>
                            <dt>Điện thoại</dt>
                            <dd>
                              <a href={`tel:${c.phone}`}>{c.phone}</a>
                            </dd>
                          </div>
                          <div>
                            <dt>Email</dt>
                            <dd>{c.email || "Chưa cập nhật"}</dd>
                          </div>
                          <div>
                            <dt>Địa chỉ</dt>
                            <dd>{c.address || "Chưa cập nhật"}</dd>
                          </div>
                        </dl>
                        <div className="customer-balance">
                          <span>Còn phải thu</span>
                          <strong>
                            {formatMoney(
                              orders.reduce((s, o) => s + orderBalance(o), 0),
                            )}
                          </strong>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => {
                            go("orders");
                            setQuery(c.name);
                          }}
                        >
                          Xem đơn hàng <ArrowRight size={15} />
                        </button>
                      </section>
                    );
                  })}
              </div>
              {!data.customers.some((c) =>
                match(c.name + c.phone + c.contact),
              ) && <Empty />}
            </>
          )}
          {page === "finance" && (
            <>
              <div className="stats-grid finance-stats">
                <Stat
                  title="Tổng giá trị đơn hàng"
                  value={formatCompactMoney(total)}
                  icon={<FileText size={21} />}
                  sub="Chưa bao gồm nghiệp vụ thuế / hóa đơn"
                  color="blue"
                />
                <Stat
                  title="Đã thu từ khách hàng"
                  value={formatCompactMoney(collected)}
                  icon={<ArrowDownLeft size={21} />}
                  sub={`${total ? Math.round((collected / total) * 100) : 0}% giá trị đơn hàng`}
                  color="green"
                />
                <Stat
                  title="Còn phải thu"
                  value={formatCompactMoney(balance)}
                  icon={<CreditCard size={21} />}
                  sub="Bao gồm các đơn chưa giao hàng"
                  color="orange"
                />
              </div>
              <div className="info-note">
                <CircleHelp size={17} />
                <span>
                  Bản demo theo dõi tiền thu theo đơn. Chi phí, lợi nhuận, sổ
                  quỹ và kế toán thuế thuộc giai đoạn mở rộng.
                </span>
              </div>
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2>Công nợ theo đơn hàng</h2>
                    <p>Ghi nhận thanh toán để cập nhật số tiền còn phải thu</p>
                  </div>
                  <SearchBox
                    value={query}
                    onChange={setQuery}
                    placeholder="Tìm đơn hoặc khách hàng..."
                  />
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>ĐƠN HÀNG</th>
                        <th>KHÁCH HÀNG</th>
                        <th className="right">GIÁ TRỊ</th>
                        <th className="right">ĐÃ THU</th>
                        <th className="right">CÒN PHẢI THU</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders
                        .filter((o) => match(o.code + customer(o.customerId)))
                        .map((o) => (
                          <tr key={o.id}>
                            <td>
                              <strong>{o.code}</strong>
                              <span className="cell-sub">{o.partName}</span>
                            </td>
                            <td>{customer(o.customerId)}</td>
                            <td className="right">
                              {formatMoney(orderTotal(o))}
                            </td>
                            <td className="right green-text">
                              {formatMoney(o.paid)}
                            </td>
                            <td className="right amount">
                              {formatMoney(orderBalance(o))}
                            </td>
                            <td>
                              {orderBalance(o) > 0 ? (
                                <button
                                  className="button secondary small-button"
                                  onClick={() =>
                                    setModal({ type: "payment", order: o })
                                  }
                                >
                                  <Plus size={14} />
                                  Thu tiền
                                </button>
                              ) : (
                                <span className="paid-label">
                                  <CheckCheck size={16} />
                                  Đã thu đủ
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!data.orders.some((o) =>
                    match(o.code + customer(o.customerId)),
                  ) && <Empty />}
                </div>
              </section>
            </>
          )}
          {page === "payroll" && (
            <Suspense
              fallback={
                <div className="card payroll-loading" role="status">
                  Đang mở nhân sự & tiền lương…
                </div>
              }
            >
              <PayrollWorkspace
                key={cloudUser || "demo"}
                value={data.payroll}
                onChange={(payroll, message) =>
                  commit({ ...data, payroll }, message)
                }
              />
            </Suspense>
          )}
          <div hidden={page !== "settings"}>
            <div className="settings-grid">
              <SheetsConnection
                data={data}
                disabled={Boolean(cloudUser)}
                onStatus={setSheetsStatus}
                beforeUpload={() => {
                  if (!localReadErrorRef.current) return true;
                  setNotice("Bản lưu trên thiết bị bị lỗi. Hãy nhận lại dữ liệu từ Google Sheets hoặc khôi phục bản sao trước khi tiếp tục.");
                  return false;
                }}
                beforeSave={() => {
                  try {
                    assertLocalDataCurrent(tokenRef.current, ownerRef.current || undefined);
                    if (tokenRef.current === null) {
                      tokenRef.current = saveData(
                        currentDataRef.current,
                        null,
                        ownerRef.current || undefined,
                      );
                    }
                    return true;
                  } catch (error) {
                    setNotice(error instanceof Error ? error.message : "Không đọc được bản lưu trên thiết bị.");
                    return false;
                  }
                }}
                onReplace={(next, expected) => {
                  if (currentDataRef.current !== expected) {
                    setNotice("Dữ liệu trên máy vừa thay đổi. Hãy sao lưu và tải lại từ Google Sheets.");
                    return false;
                  }
                  return commit(next, "Đã tải dữ liệu từ Google Sheets");
                }}
              />
              <section className="card settings-card">
                <span className="settings-icon">
                  <ShieldCheck />
                </span>
                <h2>Bản lưu trên thiết bị</h2>
                <p>
                  Thay đổi được lưu trên thiết bị trước rồi tự động gửi lên
                  Google Sheets khi đã kết nối. Chờ trạng thái “Đã đồng bộ”
                  trước khi đóng ứng dụng. Bạn có thể tải thêm bản sao JSON
                  để giữ riêng.
                </p>
                <div className="settings-status">
                  <span className="online-dot" /> {data.orders.length} đơn hàng
                  · {data.customers.length} khách hàng · {data.materials.length}{" "}
                  vật tư
                </div>
                <div className="button-row">
                  <button
                    className="button primary"
                    onClick={() =>
                      downloadFile(
                        `xuong-viet-backup-${today()}.json`,
                        JSON.stringify(data, null, 2),
                      )
                    }
                  >
                    <ArrowDownToLine size={16} />
                    Sao lưu JSON
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => fileRef.current?.click()}
                  >
                    Khôi phục bản sao
                  </button>
                  <input
                    hidden
                    ref={fileRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        if (f.size > 5_000_000)
                          throw Error("File quá lớn (tối đa 5 MB).");
                        const next: unknown = JSON.parse(await f.text());
                        if (!validateData(next))
                          throw Error(
                            "Bản sao lưu không đúng định dạng hoặc chứa dữ liệu không hợp lệ.",
                          );
                        if (
                          confirm(
                            "Khôi phục sẽ thay thế toàn bộ dữ liệu trên thiết bị. Tiếp tục?",
                          )
                        )
                          commit(next, "Đã khôi phục dữ liệu");
                      } catch (err) {
                        setNotice(
                          err instanceof Error
                            ? err.message
                            : "Không đọc được file.",
                        );
                      }
                    }}
                  />
                </div>
                <hr />
                <button
                  className="text-button danger"
                  onClick={() => setModal({ type: "reset" })}
                >
                  Đặt lại dữ liệu mẫu
                </button>
              </section>
              {supabase && <section className="card settings-card">
                <span className="settings-icon blue">
                  <Factory />
                </span>
                <h2>Kết nối Supabase</h2>
                <p>
                  Kết nối thay thế dành cho cấu hình Supabase đã có. Chỉ sử dụng
                  một nơi đồng bộ trong cùng phiên làm việc.
                </p>
                {!cloudAllowed ? (
                  <div className="info-note">
                    Bản GitHub Pages chỉ phục vụ trình diễn. Kết nối dữ liệu
                    thật trên môi trường phù hợp theo hướng dẫn triển khai.
                  </div>
                ) : !supabase ? (
                  <div className="info-note">
                    {cloudConfigError ||
                      "Chưa cấu hình Supabase. Xem docs/SUPABASE.md trong mã nguồn để tạo kho dữ liệu và cấu hình kết nối."}
                  </div>
                ) : !cloudUser ? (
                  <form onSubmit={login} className="login-form">
                    <Field label="Email">
                      <input
                        required
                        name="email"
                        type="email"
                        autoComplete="username"
                      />
                    </Field>
                    <Field label="Mật khẩu">
                      <input
                        required
                        name="password"
                        type="password"
                        autoComplete="current-password"
                      />
                    </Field>
                    <button disabled={busy} className="button primary">
                      {busy ? "Đang đăng nhập…" : "Đăng nhập"}
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="settings-status">
                      Đã đăng nhập ·{" "}
                      {cloudRevision === null
                        ? "Chưa tải dữ liệu"
                        : `Phiên bản ${cloudRevision}`}
                      {dirty ? " · Có thay đổi trên máy" : ""}
                    </div>
                    <div className="button-row">
                      <button
                        disabled={busy}
                        className="button secondary"
                        onClick={() => cloudAction("load")}
                      >
                        Tải từ đám mây
                      </button>
                      <button
                        disabled={busy || cloudRevision === null}
                        className="button primary"
                        onClick={() => cloudAction("save")}
                      >
                        Lưu lên đám mây
                      </button>
                      <button
                        disabled={busy || cloudRevision !== null}
                        className="button secondary"
                        onClick={() => cloudAction("init")}
                      >
                        Khởi tạo kho
                      </button>
                      <button
                        disabled={busy}
                        className="text-button"
                        onClick={async () => {
                          if (
                            !confirm(
                              "Đăng xuất sẽ xóa bản lưu trên máy của tài khoản này. Hãy lưu lên đám mây hoặc sao lưu JSON trước nếu còn thay đổi. Tiếp tục?",
                            )
                          )
                            return;
                          const { error } = await supabase!.auth.signOut();
                          setCloudMessage(
                            error?.message ||
                              "Đã đăng xuất và trở về dữ liệu demo riêng trên thiết bị.",
                          );
                        }}
                      >
                        Đăng xuất
                      </button>
                    </div>
                  </>
                )}
                {cloudMessage && (
                  <p className="cloud-message" role="status">
                    {cloudMessage}
                  </p>
                )}
              </section>}
              <section className="card settings-card wide">
                <h2>Thử demo trong 3 phút</h2>
                <div className="demo-steps">
                  <div>
                    <span>01</span>
                    <strong>Nhận một đơn mới</strong>
                    <p>Tạo đơn hàng, chọn khách và hẹn ngày giao.</p>
                  </div>
                  <div>
                    <span>02</span>
                    <strong>Theo dõi sản xuất</strong>
                    <p>Chuyển đơn qua gia công, kiểm tra và giao hàng.</p>
                  </div>
                  <div>
                    <span>03</span>
                    <strong>Kiểm soát vật tư & tiền</strong>
                    <p>Thử xuất kho và ghi nhận thanh toán của khách.</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <footer className="page-footer">
            <span>
              <span className="brand-mini">XưởngViệt</span> · Rõ việc, vững tiến
              độ.
            </span>
            <span>
              {cloudUser
                ? "Kho cá nhân · Đồng bộ thủ công"
                : "Bản demo · Dữ liệu minh họa"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <ModalFrame
          title={
            modal.type === "order"
              ? modal.order
                ? "Chỉnh sửa đơn hàng"
                : "Tạo đơn hàng mới"
              : modal.type === "detail"
                ? "Chi tiết đơn hàng"
                : modal.type === "stock"
                  ? "Nhập / xuất vật tư"
                  : modal.type === "customer"
                    ? "Thêm khách hàng"
                    : modal.type === "payment"
                      ? "Ghi nhận thanh toán"
                      : "Đặt lại dữ liệu mẫu"
          }
          onClose={() => setModal(null)}
        >
          {notice && (
            <div className="notice modal-notice" role="alert">
              {notice}
            </div>
          )}
          {modal.type === "order" && (
            <OrderForm
              data={data}
              order={modal.order}
              onCancel={() => setModal(null)}
              onSave={(o) => {
                if (
                  commit(
                    {
                      ...data,
                      orders: modal.order
                        ? data.orders.map((v) => (v.id === o.id ? o : v))
                        : [o, ...data.orders],
                    },
                    modal.order
                      ? "Đã cập nhật đơn hàng"
                      : "Đã tạo đơn hàng mới",
                  )
                )
                  setModal({ type: "detail", id: o.id });
              }}
            />
          )}
          {modal.type === "detail" &&
            (() => {
              const o = data.orders.find((v) => v.id === modal.id);
              if (!o) return <Empty />;
              return (
                <div className="detail">
                  <div className="detail-title">
                    <div>
                      <span className="eyebrow">{o.code}</span>
                      <h3>{o.partName}</h3>
                      <p>{customer(o.customerId)}</p>
                    </div>
                    <Badge status={o.status} />
                  </div>
                  <div className="detail-grid">
                    <div>
                      <span>Số lượng</span>
                      <strong>{o.quantity} chi tiết</strong>
                    </div>
                    <div>
                      <span>Hạn giao</span>
                      <strong className={isOverdue(o) ? "late-text" : ""}>
                        {formatDate(o.dueDate)}
                      </strong>
                    </div>
                    <div>
                      <span>Vật liệu</span>
                      <strong>{o.material || "Chưa ghi nhận"}</strong>
                    </div>
                    <div>
                      <span>Bản vẽ / phiên bản</span>
                      <strong>{o.drawing || "Chưa ghi nhận"}</strong>
                    </div>
                    <div>
                      <span>Máy phụ trách</span>
                      <strong>{o.machine || "Chưa phân công"}</strong>
                    </div>
                    <div>
                      <span>Người phụ trách</span>
                      <strong>{o.operator || "Chưa phân công"}</strong>
                    </div>
                    <div>
                      <span>Giá trị đơn</span>
                      <strong>{formatMoney(orderTotal(o))}</strong>
                    </div>
                    <div>
                      <span>Còn phải thu</span>
                      <strong>{formatMoney(orderBalance(o))}</strong>
                    </div>
                  </div>
                  <div className="detail-controls">
                    <Field label="Công đoạn hiện tại">
                      <select
                        value={o.status}
                        onChange={(e) =>
                          setStatus(o, e.target.value as OrderStatus)
                        }
                      >
                        {statuses.map((s) => (
                          <option key={s} value={s}>
                            {statusLabels[s]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const n = Number(
                          new FormData(e.currentTarget).get("completed"),
                        );
                        commit(
                          {
                            ...data,
                            orders: data.orders.map((v) =>
                              v.id === o.id
                                ? { ...v, completedQuantity: n }
                                : v,
                            ),
                          },
                          "Đã cập nhật số lượng hoàn thành",
                        );
                      }}
                    >
                      <Field label={`Đã hoàn thành (tối đa ${o.quantity})`}>
                        <div className="input-with-button">
                          <input
                            key={`${o.id}-${o.completedQuantity}`}
                            name="completed"
                            type="number"
                            min="0"
                            max={o.quantity}
                            step="1"
                            required
                            defaultValue={o.completedQuantity}
                          />
                          <button className="button secondary">Lưu</button>
                        </div>
                      </Field>
                    </form>
                  </div>
                  {o.notes && (
                    <div className="detail-notes">
                      <strong>Ghi chú sản xuất</strong>
                      <p>{o.notes}</p>
                    </div>
                  )}
                  <div className="modal-actions">
                    <button
                      className="button secondary"
                      onClick={() => setModal({ type: "order", order: o })}
                    >
                      Chỉnh sửa đơn
                    </button>
                    {orderBalance(o) > 0 && (
                      <button
                        className="button primary"
                        onClick={() => setModal({ type: "payment", order: o })}
                      >
                        Ghi nhận thu tiền
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          {modal.type === "stock" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  const next = applyStockMovement(
                    data,
                    modal.material.id,
                    f.get("type") as "in" | "out",
                    Number(f.get("quantity")),
                    String(f.get("note")),
                  );
                  if (commit(next, "Đã cập nhật tồn kho")) setModal(null);
                } catch (err) {
                  setNotice(
                    err instanceof Error
                      ? err.message
                      : "Không thể cập nhật kho",
                  );
                }
              }}
            >
              <div className="modal-body">
                <div className="form-summary">
                  <strong>{modal.material.name}</strong>
                  <span>
                    Hiện có {modal.material.stock} {modal.material.unit} ·{" "}
                    {modal.material.spec}
                  </span>
                </div>
                <div className="form-grid">
                  <Field label="Loại giao dịch">
                    <select name="type">
                      <option value="in">Nhập kho</option>
                      <option value="out">Xuất kho</option>
                    </select>
                  </Field>
                  <Field label={`Số lượng (${modal.material.unit})`}>
                    <input
                      required
                      name="quantity"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="1000000000"
                    />
                  </Field>
                  <Field label="Lý do / mã đơn liên quan" wide>
                    <textarea
                      name="note"
                      required
                      maxLength={500}
                      placeholder="Ví dụ: Xuất vật tư gia công đơn DH-012"
                    />
                  </Field>
                </div>
                <p className="field-hint">
                  Không cho phép xuất vượt tồn kho. Lịch sử giao dịch được lưu
                  lại.
                </p>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setModal(null)}
                >
                  Hủy
                </button>
                <button className="button primary">Lưu giao dịch</button>
              </div>
            </form>
          )}
          {modal.type === "customer" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const c: Customer = {
                  id: uid(),
                  name: String(f.get("name")).trim(),
                  contact: String(f.get("contact")).trim(),
                  phone: String(f.get("phone")).trim(),
                  email: String(f.get("email")).trim(),
                  address: String(f.get("address")).trim(),
                };
                if (
                  commit(
                    { ...data, customers: [c, ...data.customers] },
                    "Đã thêm khách hàng",
                  )
                )
                  setModal(null);
              }}
            >
              <div className="modal-body form-grid">
                <Field label="Tên công ty / khách hàng *" wide>
                  <input name="name" required maxLength={150} />
                </Field>
                <Field label="Người liên hệ *">
                  <input name="contact" required maxLength={100} />
                </Field>
                <Field label="Điện thoại *">
                  <input name="phone" required type="tel" maxLength={30} />
                </Field>
                <Field label="Email">
                  <input name="email" type="email" maxLength={150} />
                </Field>
                <Field label="Địa chỉ">
                  <input name="address" maxLength={300} />
                </Field>
              </div>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  Hủy
                </button>
                <button className="button primary">Lưu khách hàng</button>
              </div>
            </form>
          )}
          {modal.type === "payment" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amount = Number(
                  new FormData(e.currentTarget).get("amount"),
                );
                const o = data.orders.find((v) => v.id === modal.order.id)!;
                if (
                  !Number.isFinite(amount) ||
                  amount <= 0 ||
                  amount > orderBalance(o)
                ) {
                  setNotice(
                    "Số tiền phải lớn hơn 0 và không vượt khoản còn phải thu.",
                  );
                  return;
                }
                if (
                  commit(
                    {
                      ...data,
                      orders: data.orders.map((v) =>
                        v.id === o.id ? { ...v, paid: v.paid + amount } : v,
                      ),
                    },
                    "Đã ghi nhận thanh toán",
                  )
                )
                  setModal(null);
              }}
            >
              <div className="modal-body">
                <div className="form-summary">
                  <strong>
                    {modal.order.code} · {customer(modal.order.customerId)}
                  </strong>
                  <span>
                    Còn phải thu: {formatMoney(orderBalance(modal.order))}
                  </span>
                </div>
                <Field label="Số tiền thu thêm (VNĐ) *">
                  <input
                    autoFocus
                    required
                    name="amount"
                    type="number"
                    min="1"
                    step="1"
                    max={orderBalance(modal.order)}
                  />
                </Field>
                <p className="field-hint">
                  Bản demo lưu tổng tiền đã thu theo đơn; chưa có sổ lịch sử
                  phiếu thu.
                </p>
              </div>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  Hủy
                </button>
                <button className="button primary">Xác nhận thu tiền</button>
              </div>
            </form>
          )}
          {modal.type === "reset" && (
            <>
              <div className="modal-body">
                <p>
                  Thao tác này thay thế dữ liệu trên trình duyệt bằng bộ dữ liệu
                  mẫu mới. Hãy sao lưu nếu bạn cần giữ các thay đổi.
                </p>
              </div>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setModal(null)}
                >
                  Giữ dữ liệu
                </button>
                <button
                  className="button danger-button"
                  onClick={() => {
                    if (commit(createSeedData(), "Đã đặt lại dữ liệu mẫu"))
                      setModal(null);
                  }}
                >
                  Đặt lại
                </button>
              </div>
            </>
          )}
        </ModalFrame>
      )}
    </div>
  );
}

function Stat({
  title,
  value,
  icon,
  sub,
  color,
  onClick,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  sub: string;
  color: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="stat-top">
        <span>{title}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-sub">
        <span className={`stat-dot ${color}`} />
        {sub}
        {onClick && <ArrowUpRight size={14} />}
      </span>
    </>
  );
  return onClick ? (
    <button className="stat-card" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="stat-card">{content}</div>
  );
}
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-box">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Xóa tìm kiếm" onClick={() => onChange("")}>
          <X size={14} />
        </button>
      )}
    </label>
  );
}
function OrderForm({
  data,
  order,
  onSave,
  onCancel,
}: {
  data: Data;
  order?: Order;
  onSave: (o: Order) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const quantity = Number(f.get("quantity")),
          unitPrice = Number(f.get("unitPrice"));
        if (
          order &&
          (order.paid > quantity * unitPrice ||
            order.completedQuantity > quantity)
        ) {
          setError(
            "Giá trị đơn không thể thấp hơn tiền đã thu; số lượng không thể thấp hơn số đã hoàn thành.",
          );
          return;
        }
        const code =
          order?.code ||
          `DH-${String(Math.max(0, ...data.orders.map((o) => Number(o.code.replace(/\D/g, "")) || 0)) + 1).padStart(3, "0")}`;
        onSave({
          id: order?.id || uid(),
          code,
          customerId: String(f.get("customerId")),
          partName: String(f.get("partName")).trim(),
          quantity,
          unitPrice,
          dueDate: String(f.get("dueDate")),
          createdAt: order?.createdAt || today(),
          status: order?.status || "pending",
          priority: f.get("priority") as Order["priority"],
          drawing: String(f.get("drawing")).trim(),
          material: String(f.get("material")).trim(),
          machine: String(f.get("machine")).trim(),
          operator: String(f.get("operator")).trim(),
          completedQuantity: order?.completedQuantity || 0,
          paid: order?.paid || 0,
          notes: String(f.get("notes")).trim(),
        });
      }}
    >
      <div className="modal-body">
        <div className="form-grid">
          <Field label="Khách hàng *" wide>
            <select
              name="customerId"
              defaultValue={order?.customerId || ""}
              required
            >
              <option value="" disabled>
                Chọn khách hàng
              </option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tên chi tiết / sản phẩm *" wide>
            <input
              required
              name="partName"
              maxLength={200}
              defaultValue={order?.partName}
              placeholder="Ví dụ: Trục truyền động Ø40"
            />
          </Field>
          <Field label="Số lượng *">
            <input
              required
              name="quantity"
              type="number"
              min="1"
              max="1000000"
              step="1"
              defaultValue={order?.quantity || 1}
            />
          </Field>
          <Field label="Đơn giá (VNĐ) *">
            <input
              required
              name="unitPrice"
              type="number"
              min="0"
              max="1000000000"
              step="1"
              defaultValue={order?.unitPrice}
            />
          </Field>
          <Field label="Ngày giao hàng *">
            <input
              required
              name="dueDate"
              type="date"
              defaultValue={order?.dueDate || today()}
            />
          </Field>
          <Field label="Mức ưu tiên">
            <select name="priority" defaultValue={order?.priority || "normal"}>
              <option value="normal">Bình thường</option>
              <option value="high">Ưu tiên cao</option>
            </select>
          </Field>
          <Field label="Vật liệu">
            <input
              name="material"
              maxLength={100}
              defaultValue={order?.material}
              placeholder="Thép C45, inox 304..."
            />
          </Field>
          <Field label="Mã bản vẽ / phiên bản">
            <input
              name="drawing"
              maxLength={100}
              defaultValue={order?.drawing}
              placeholder="BV-001 / Rev.A"
            />
          </Field>
          <Field label="Máy phụ trách">
            <input
              name="machine"
              maxLength={100}
              defaultValue={order?.machine}
              placeholder="Tiện CNC 01"
            />
          </Field>
          <Field label="Người phụ trách">
            <input
              name="operator"
              maxLength={100}
              defaultValue={order?.operator}
              placeholder="Họ và tên"
            />
          </Field>
          <Field label="Ghi chú kỹ thuật" wide>
            <textarea
              name="notes"
              maxLength={1000}
              defaultValue={order?.notes}
              placeholder="Dung sai, xử lý bề mặt, yêu cầu kiểm tra..."
            />
          </Field>
        </div>
        {error && (
          <p className="late-text" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Hủy
        </button>
        <button className="button primary" type="submit">
          <Check size={16} />
          {order ? "Lưu thay đổi" : "Tạo đơn hàng"}
        </button>
      </div>
    </form>
  );
}
