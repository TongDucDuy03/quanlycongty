// Public deployment configuration: never put passwords or bearer tokens here.
export const companyEndpoint = import.meta.env.VITE_COMPANY_ENDPOINT?.trim() ?? ''
export const companyManaged = Boolean(companyEndpoint)
export const companyName = import.meta.env.VITE_COMPANY_NAME?.trim() || 'Quản lý công ty'
export const COMPANY_SESSION_KEY = 'xuong-viet.company.session.v1'
export const COMPANY_DATA_KEY = 'xuong-viet.company.data.v1'
export const COMPANY_OWNER_KEY = 'xuong-viet.company.owner.v1'
export const COMPANY_SYNC_KEY = 'xuong-viet.company.sync.v1'
export const COMPANY_LOGOUT_KEY = 'xuong-viet.company.logout.v1'
export const COMPANY_AUTH_EVENT = 'company-auth-expired'
let activeToken = ''
export function setCompanyToken(token: string) { activeToken = token }
export function getCompanyToken() { return activeToken }
