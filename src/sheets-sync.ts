import { validateSheetsConfig, type SheetsConnectionConfig } from './sheets'

// Connection credentials are device settings, never part of Data or JSON exports.
export const SHEETS_SYNC_KEY = 'xuong-viet.sheets.sync.v1'
export interface SheetsCheckpoint {
  config: SheetsConnectionConfig
  baseline: string | null
  revision: number | null
  pending: string | null
}

export function readSheetsCheckpoint(): SheetsCheckpoint | null {
  try {
    const value = JSON.parse(localStorage.getItem(SHEETS_SYNC_KEY) ?? 'null') as SheetsCheckpoint | null
    if (!value || typeof value.config?.token !== 'string') return null
    validateSheetsConfig(value.config)
    const hash = (v: unknown) => v === null || typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
    if (!hash(value.baseline) || !hash(value.pending) || !(value.revision === null || Number.isSafeInteger(value.revision) && value.revision >= 0)) return null
    if ((value.baseline === null) !== (value.revision === null || value.revision === 0)) return null
    return value
  } catch { return null }
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
