import { validateSheetsConfig, type SheetsConnectionConfig } from './sheets'
import { companyManaged, companyEndpoint, COMPANY_SYNC_KEY, getCompanyToken } from './company-config'

// Connection credentials are device settings, never part of Data or JSON exports.
export const LEGACY_SHEETS_SYNC_KEY = 'xuong-viet.sheets.sync.v1'
export const SHEETS_SYNC_KEY = companyManaged ? COMPANY_SYNC_KEY : LEGACY_SHEETS_SYNC_KEY
export interface SheetsCheckpoint {
  config: SheetsConnectionConfig
  baseline: string | null
  revision: number | null
  pending: string | null
}

export function readSheetsCheckpoint(legacy = false): SheetsCheckpoint | null {
  try {
    const value = JSON.parse(localStorage.getItem(legacy ? LEGACY_SHEETS_SYNC_KEY : SHEETS_SYNC_KEY) ?? 'null') as SheetsCheckpoint | null
    if (companyManaged && !legacy && value?.config?.endpoint !== companyEndpoint) return null
    if (companyManaged && !legacy && value && value.config?.endpoint === companyEndpoint) value.config = { endpoint: companyEndpoint, token: getCompanyToken() }
    if (!value || typeof value.config?.token !== 'string') return null
    validateSheetsConfig(value.config)
    const hash = (v: unknown) => v === null || typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
    if (!hash(value.baseline) || !hash(value.pending) || !(value.revision === null || Number.isSafeInteger(value.revision) && value.revision >= 0)) return null
    if ((value.baseline === null) !== (value.revision === null || value.revision === 0)) return null
    return value
  } catch { return null }
}

export function writeSheetsCheckpoint(value: SheetsCheckpoint) {
  // The journal survives session expiry, but never stores the credential.
  const stored = companyManaged ? { ...value, config: { endpoint: value.config.endpoint, token: '' } } : value
  localStorage.setItem(SHEETS_SYNC_KEY, JSON.stringify(stored))
}

export async function snapshotDigest(serialized: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export type Reconciliation = 'same' | 'acknowledge' | 'upload' | 'download' | 'conflict' | 'initial'
/** Compare contents as well as revisions: a timed-out save may already be committed. */
export function reconcileSnapshots(local: string, remote: string | null, baseline: string | null, pending: string | null): Reconciliation {
  if (remote === local) return 'same'
  if (pending !== null && remote === pending) return 'acknowledge'
  if (baseline === null) return remote === null ? 'initial' : 'conflict'
  if (remote === baseline) return 'upload'
  if (local === baseline && remote !== null) return 'download'
  return 'conflict'
}
