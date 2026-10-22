import type { SupabaseClient } from "@supabase/supabase-js";
import type { Data } from "./domain";
import { statusLabels, validateData } from "./domain";
import { createSeedData } from "./seed";
import { companyManaged, COMPANY_DATA_KEY } from './company-config';

const KEY = companyManaged ? COMPANY_DATA_KEY : "xuong-viet.data.v1";
const storageKey = (scope?: string) =>
  scope === undefined ? KEY : `${KEY}.user.${scope}`;
const fallbackData = (): Data => companyManaged
  ? { version: 1, orders: [], materials: [], customers: [], movements: [] }
  : createSeedData();

export function loadData(scope?: string): {
  data: Data;
  warning?: string;
  token: string | null;
} {
  let token: string | null = null;
  try {
    token = localStorage.getItem(storageKey(scope));
    if (token === null) return { data: fallbackData(), token, ...(companyManaged ? { warning: 'Bản lưu công ty không còn trên thiết bị. Hãy đăng nhập lại để tải dữ liệu trước khi chỉnh sửa.' } : {}) };
    const data: unknown = JSON.parse(token);
    if (!validateData(data)) throw new Error("invalid");
    return { data, token };
  } catch {
    return {
      data: fallbackData(),
      token,
      warning:
        companyManaged ? "Không đọc được bản lưu công ty. Hãy giữ bản sao và đăng nhập lại trước khi chỉnh sửa." : "Không đọc được dữ liệu đã lưu. Đang hiển thị dữ liệu mẫu; hãy kiểm tra bản sao lưu trước khi thay đổi.",
    };
  }
}

/** Optimistic check prevents a stale tab from silently replacing a newer snapshot. */
export function assertLocalDataCurrent(expectedToken: string | null, scope?: string): void {
  if (localStorage.getItem(storageKey(scope)) !== expectedToken) {
    throw new Error("Dữ liệu đã thay đổi ở một tab khác. Hãy sao lưu rồi tải lại trang trước khi đồng bộ.");
  }
}

export function saveData(
  data: Data,
  expectedToken: string | null,
  scope?: string,
): string {
  const key = storageKey(scope);
  if (localStorage.getItem(key) !== expectedToken) {
    throw new Error(
      "Dữ liệu đã thay đổi ở một tab khác. Hãy tải lại trang để xem dữ liệu mới nhất trước khi lưu.",
    );
  }
  if (!validateData(data))
    throw new Error("Dữ liệu không hợp lệ. Thay đổi chưa được lưu.");
  const token = JSON.stringify(data);
  localStorage.setItem(key, token);
  return token;
}

export function clearScopedData(scope: string): void {
  localStorage.removeItem(`${KEY}.user.${scope}`);
}

export function downloadFile(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCSV(data: Data) {
  const safe = (value: unknown) => {
    let text = String(value ?? "");
    // Spreadsheet formula prefixes may follow whitespace, including newlines.
    if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [
    [
      "Mã đơn",
      "Khách hàng",
      "Chi tiết",
      "Số lượng",
      "Đơn giá",
      "Giá trị",
      "Đã thu",
      "Hạn giao",
      "Trạng thái",
    ],
    ...data.orders.map((order) => [
      order.code,
      data.customers.find((customer) => customer.id === order.customerId)?.name,
      order.partName,
      order.quantity,
      order.unitPrice,
      order.quantity * order.unitPrice,
      order.paid,
      order.dueDate,
      statusLabels[order.status],
    ]),
  ];
  downloadFile(
    "xuong-viet-don-hang.csv",
    "\uFEFF" + rows.map((row) => row.map(safe).join(",")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
}

const env = import.meta.env;
const hostname = globalThis.location?.hostname ?? "";
export const cloudAllowed =
  !companyManaged &&
  hostname !== "github.io" &&
  !hostname.endsWith(".github.io") &&
  env.VITE_DEMO_ONLY !== "true";
export let supabase: SupabaseClient | null = null;
export let cloudConfigError = "";

if (cloudAllowed && (env.VITE_SUPABASE_URL || env.VITE_SUPABASE_ANON_KEY)) {
  try {
    const rawUrl = env.VITE_SUPABASE_URL?.trim();
    const key = env.VITE_SUPABASE_ANON_KEY?.trim();
    if (!rawUrl || !key)
      throw new Error("Cần cấu hình đủ URL và khóa công khai Supabase.");
    const url = new URL(rawUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      throw new Error("URL Supabase phải là địa chỉ HTTPS hợp lệ của dự án.");
    }
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      let publicRole = false;
      try {
        const segments = key.split(".");
        if (segments.length === 3) {
          const payload = JSON.parse(
            atob(segments[1].replaceAll("-", "+").replaceAll("_", "/")),
          );
          publicRole = payload.role === "anon";
        }
      } catch {
        /* Invalid keys receive the same safe, actionable message below. */
      }
      if (!publicRole)
        throw new Error(
          "Chỉ dùng khóa publishable hoặc anon của Supabase; không dùng khóa bí mật máy chủ.",
        );
    }
    const { createClient } = await import("@supabase/supabase-js");
    supabase = createClient(url.href, key);
  } catch (error) {
    cloudConfigError =
      error instanceof Error
        ? error.message
        : "Cấu hình Supabase không hợp lệ.";
  }
}
