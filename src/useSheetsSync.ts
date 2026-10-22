import { useEffect, useRef, useState } from 'react'
import type { Data } from './domain'
import { loadSheets, saveSheets, SheetsError, SHEETS_ENDPOINT_KEY, validateSheetsConfig, type SheetsConnectionConfig } from './sheets'
import { readSheetsCheckpoint, reconcileSnapshots, SHEETS_SYNC_KEY, snapshotDigest, type SheetsCheckpoint } from './sheets-sync'

interface Options {
  data: Data
  disabled: boolean
  onReplace: (next: Data, expected: Data) => boolean
  beforeSave?: () => boolean
  beforeUpload?: () => boolean
}
interface View {
  connection: SheetsConnectionConfig | null
  busy: boolean
  revision: number | null
  pending: boolean
  blocked: boolean
  message: string
  sheetUrl: string
  confirmation: 'replace' | 'initialize' | null
  waiting: boolean
}
const RETRIES = [2_000, 5_000, 15_000, 30_000]
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Không kết nối được Google Sheets.'

export function useSheetsSync(options: Options) {
  const latest = useRef(options)
  latest.current = options
  const [initialCheckpoint] = useState(readSheetsCheckpoint)
  const initial = useRef(initialCheckpoint)
  const checkpoint = useRef<SheetsCheckpoint | null>(initial.current)
  const remember = useRef(Boolean(initial.current))
  const generation = useRef(0)
  const alive = useRef(false)
  const locked = useRef(false)
  const verified = useRef(false)
  const stopped = useRef(false)
  const failures = useRef(0)
  const clean = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drafts = useRef(new Set<HTMLFormElement>())
  const confirmCallback = useRef<((accepted: boolean) => void) | null>(null)
  const [view, setView] = useState<View>({ connection: initial.current?.config ?? null, busy: false, revision: initial.current?.revision ?? null, pending: Boolean(initial.current), blocked: false, message: initial.current ? 'Đang kết nối lại Google Sheets…' : 'Kết nối một lần trên thiết bị này để tự động lưu dữ liệu.', sheetUrl: '', confirmation: null, waiting: Boolean(initial.current) })
  const viewRef = useRef(view)
  function update(patch: Partial<View>) { viewRef.current = { ...viewRef.current, ...patch }; if (alive.current) setView(viewRef.current) }
  function cancelTimers() {
    if (timer.current) clearTimeout(timer.current)
    if (retryTimer.current) clearTimeout(retryTimer.current)
    timer.current = null; retryTimer.current = null
  }
  function valid(run: number) { return alive.current && !latest.current.disabled && generation.current === run }
  function persist(next: SheetsCheckpoint) {
    // Save the journal before sending: reload can reconcile a request whose response was lost.
    if (remember.current) {
      try { localStorage.setItem(SHEETS_SYNC_KEY, JSON.stringify(next)) }
      catch { throw new SheetsError('LOCAL_STORAGE', 'Không lưu được trạng thái đồng bộ trên thiết bị. Hãy sao lưu JSON và giải phóng dung lượng trình duyệt trước khi thử lại.') }
    }
    checkpoint.current = next
  }
  function confirmation(kind: 'replace' | 'initialize'): Promise<boolean> {
    update({ confirmation: kind })
    return new Promise(resolve => { confirmCallback.current = resolve })
  }
  function confirm(accepted: boolean) {
    const callback = confirmCallback.current
    confirmCallback.current = null
    update({ confirmation: null })
    callback?.(accepted)
  }
  function editing() {
    for (const form of drafts.current) if (!form.isConnected) drafts.current.delete(form)
    return Boolean(document.querySelector('dialog[open], [role="dialog"]')) || drafts.current.size > 0
  }
  function block(message: string) { stopped.current = true; cancelTimers(); update({ blocked: true, message }) }
  function guarded() {
    if (!latest.current.beforeSave || latest.current.beforeSave()) return true
    block('Chưa thể lưu: dữ liệu ở tab khác đã thay đổi hoặc bản lưu trên thiết bị chưa an toàn. Hãy sao lưu JSON rồi tải lại trang.')
    return false
  }
  function schedule() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const cp = checkpoint.current
    if (!alive.current || latest.current.disabled || locked.current || stopped.current || retryTimer.current || !verified.current || !cp || cp.revision === null || cp.revision === 0) return
    const pending = JSON.stringify(latest.current.data) !== clean.current
    update({ pending })
    if (pending) timer.current = setTimeout(() => { timer.current = null; void run('save') }, 1_500)
  }
  function failed(error: unknown, runId: number) {
    if (!valid(runId)) return
    verified.current = false
    const code = error instanceof SheetsError ? error.code : ''
    if (code === 'CONFLICT' || code === 'REVISION_CONFLICT') {
      block('Có thay đổi từ thiết bị khác. Dữ liệu trên máy vẫn được giữ. Hãy sao lưu JSON, rồi chọn “Tải từ Google Sheets” để nhận bản mới trước khi tiếp tục.')
      return
    }
    if (['UNAUTHORIZED', 'AUTH_FAILED', 'INVALID_TOKEN', 'INVALID_ENDPOINT', 'INVALID_DATA', 'LIMIT', 'TOO_LARGE', 'CONFIG', 'CONFIG_ERROR', 'LOCAL_STORAGE'].includes(code)) { block(errorText(error)); return }
    const delay = RETRIES[failures.current++]
    update({ waiting: true, pending: Boolean(checkpoint.current?.pending) || clean.current !== JSON.stringify(latest.current.data), message: delay === undefined ? 'Chưa kết nối được. Dữ liệu vẫn còn trên thiết bị; bấm “Đồng bộ ngay” để thử lại.' : 'Đang chờ kết nối. Dữ liệu vẫn được giữ trên thiết bị và sẽ tự đồng bộ khi kết nối trở lại.' })
    if (delay !== undefined) retryTimer.current = setTimeout(() => { retryTimer.current = null; void run('refresh') }, delay)
  }
  async function acceptRemote(remote: Data, expected: Data) {
    if (latest.current.data !== expected || !guarded() || !latest.current.onReplace(remote, expected)) {
      block('Dữ liệu trên máy đã đổi trong lúc tải hoặc chưa lưu được an toàn. Bản trên máy vẫn được giữ; hãy sao lưu JSON trước khi thử lại.')
      return false
    }
    return true
  }
  async function run(mode: 'refresh' | 'save' | 'connect' | 'replace' | 'initialize') {
    const cp = checkpoint.current
    if (locked.current || !alive.current || latest.current.disabled || !cp || stopped.current && mode !== 'replace' && mode !== 'connect') return
    if (!guarded()) return
    const runId = generation.current
    const expected = latest.current.data
    let retryInitialization = false
    let refreshAgain = false
    locked.current = true
    update({ busy: true })
    try {
      if (mode === 'save' || mode === 'initialize') {
        if (!verified.current || cp.revision === null) return
        if (latest.current.beforeUpload && !latest.current.beforeUpload()) { block('Bản lưu trên thiết bị cần được khôi phục. Hãy tải dữ liệu từ Google Sheets hoặc nhập bản sao JSON trước khi tiếp tục.'); return }
        const snapshot = latest.current.data
        const serialized = JSON.stringify(snapshot)
        const digest = await snapshotDigest(serialized)
        if (!valid(runId) || !guarded()) return
        persist({ ...cp, pending: digest })
        update({ pending: true, message: 'Đang tự động lưu lên Google Sheets…' })
        const result = await saveSheets(cp.config, cp.revision, snapshot)
        if (!valid(runId) || !guarded()) return
        persist({ ...cp, baseline: digest, revision: result.revision, pending: null })
        clean.current = serialized
        failures.current = 0
        update({ waiting: false, revision: result.revision, sheetUrl: result.spreadsheetUrl, pending: JSON.stringify(latest.current.data) !== serialized, blocked: false, message: result.warning ?? 'Đã lưu lên Google Sheets. Bạn có thể tiếp tục làm việc.' })
      } else {
        update({ message: 'Đang kiểm tra dữ liệu trên Google Sheets…' })
        const remote = await loadSheets(cp.config)
        if (!valid(runId)) return
        const remoteText = remote.data === null ? null : JSON.stringify(remote.data)
        const remoteHash = remoteText === null ? null : await snapshotDigest(remoteText)
        // Read local again after the request so edits made while loading are retained.
        const local = latest.current.data
        const localText = JSON.stringify(local)
        const localHash = await snapshotDigest(localText)
        if (!valid(runId) || !guarded()) return
        if (latest.current.data !== local) { verified.current = false; refreshAgain = true; update({ message: 'Có thay đổi mới trên máy; đang kiểm tra lại trước khi đồng bộ.' }); return }
        let decision = reconcileSnapshots(localHash, remoteHash, cp.baseline, cp.pending)
        update({ sheetUrl: remote.spreadsheetUrl })
        if (mode === 'replace' || mode === 'connect' && cp.baseline === null && remote.data !== null && decision !== 'same') {
          if (latest.current.data !== expected) { block('Dữ liệu trên máy đã đổi trong lúc tải. Chưa thay thế dữ liệu; hãy thử lại sau khi lưu công việc.'); return }
          if (remote.data !== null && remoteHash !== localHash) {
            if (!await confirmation('replace')) { if (valid(runId)) block('Đã hủy thay thế dữ liệu. Dữ liệu trên máy vẫn được giữ.'); return }
            if (!valid(runId) || !guarded()) return
            decision = 'download'
          } else decision = remote.data === null ? 'initial' : 'same'
        }
        if (decision === 'conflict') { block('Có thay đổi trên cả thiết bị này và Google Sheets. Dữ liệu trên máy vẫn được giữ. Hãy sao lưu JSON, rồi chọn “Tải từ Google Sheets” để xử lý.'); return }
        if (decision === 'download' && mode === 'refresh' && editing()) {
          verified.current = false
          update({ pending: true, message: 'Sheet có bản mới. Ứng dụng sẽ nhận dữ liệu sau khi bạn lưu hoặc đóng biểu mẫu đang sửa.' })
          return
        }
        if (decision === 'download' && remote.data !== null && !await acceptRemote(remote.data, local)) return
        if (!valid(runId) || !guarded()) return
        // A previously initialized sheet disappearing must never silently become a new sheet.
        if (remote.data === null && cp.baseline !== null) { block('Sheet không còn bản dữ liệu đã đồng bộ. Dữ liệu trên máy vẫn được giữ; hãy kiểm tra Sheet trước khi kết nối lại.'); return }
        persist({ ...cp, baseline: remoteHash, revision: remote.revision, pending: remote.data === null ? cp.pending : null })
        clean.current = remoteText
        verified.current = true
        stopped.current = false
        const pending = decision === 'acknowledge' || decision === 'upload' || remote.data === null && cp.pending !== null
        if (!pending) failures.current = 0
        update({ waiting: false, revision: remote.revision, pending, blocked: false, message: remote.warning ?? (remote.data === null ? 'Sheet đang trống. Bấm “Khởi tạo Sheet” một lần để bắt đầu tự động lưu.' : pending ? 'Đang chuẩn bị lưu các thay đổi trên thiết bị này…' : 'Đã đồng bộ với Google Sheets. Các thay đổi tiếp theo sẽ tự lưu.') })
        // Initialization whose response was lost is safe to retry only if the sheet is still empty.
        if (remote.data === null && cp.pending !== null) {
          retryInitialization = true
        }
      }
    } catch (error) { failed(error, runId) }
    finally {
      if (valid(runId)) {
        locked.current = false; update({ busy: false }); schedule()
        if (retryInitialization || refreshAgain) timer.current = setTimeout(() => { timer.current = null; void run(retryInitialization ? 'initialize' : 'refresh') }, 1_500)
      }
    }
  }
  async function connect(config: SheetsConnectionConfig, shouldRemember: boolean) {
    if (locked.current || latest.current.disabled) return
    try {
      validateSheetsConfig(config)
      generation.current += 1; cancelTimers(); stopped.current = false; verified.current = false; clean.current = null; failures.current = 0
      remember.current = shouldRemember
      if (!shouldRemember) localStorage.removeItem(SHEETS_SYNC_KEY)
      // Only remember credentials after an authenticated response, below in run().
      checkpoint.current = { config, baseline: null, revision: null, pending: null }
      try { localStorage.setItem(SHEETS_ENDPOINT_KEY, config.endpoint) } catch { /* Optional convenience only. */ }
      update({ connection: config, revision: null, blocked: false, pending: false, sheetUrl: '' })
      await run('connect')
    } catch (error) { update({ message: error instanceof SheetsError ? error.message : 'Không ghi nhớ được kết nối trên thiết bị. Hãy kiểm tra dung lượng/quyền lưu của trình duyệt hoặc bỏ chọn ghi nhớ để dùng trong phiên này.' }) }
  }
  function disconnect() {
    try { localStorage.removeItem(SHEETS_SYNC_KEY) } catch { update({ message: 'Không xóa được kết nối đã nhớ. Hãy kiểm tra quyền lưu của trình duyệt trước khi ngắt.' }); return }
    generation.current += 1; confirm(false); cancelTimers(); locked.current = false; verified.current = false; checkpoint.current = null; clean.current = null; stopped.current = false
    update({ connection: null, busy: false, revision: null, pending: false, blocked: false, sheetUrl: '', message: 'Đã ngắt và quên kết nối trên thiết bị này. Dữ liệu vẫn được giữ trên máy.' })
  }
  function syncNow() {
    if (locked.current || stopped.current) return
    cancelTimers(); failures.current = 0
    void run(verified.current && checkpoint.current?.revision !== 0 && clean.current !== JSON.stringify(latest.current.data) ? 'save' : 'refresh')
  }
  async function initialize() {
    if (locked.current || viewRef.current.confirmation || latest.current.disabled) return
    const runId = generation.current
    locked.current = true; update({ busy: true })
    const accepted = await confirmation('initialize')
    if (!valid(runId)) return
    locked.current = false; update({ busy: false })
    if (accepted) void run('initialize')
  }
  function replace() { cancelTimers(); failures.current = 0; void run('replace') }

  const actions = useRef({ run, schedule, disconnect })
  actions.current = { run, schedule, disconnect }
  useEffect(() => {
    alive.current = true
    if (!options.disabled) void actions.current.run('refresh')
    return () => { alive.current = false; generation.current += 1; confirm(false); cancelTimers(); locked.current = false }
  }, [])
  useEffect(() => {
    if (options.disabled) { generation.current += 1; confirm(false); cancelTimers(); locked.current = false; verified.current = false; update({ busy: false }) }
    else if (alive.current && checkpoint.current && !locked.current) void actions.current.run('refresh')
  }, [options.disabled])
  useEffect(() => {
    if (!verified.current && checkpoint.current && !locked.current && !retryTimer.current && !stopped.current && !options.disabled) void actions.current.run('refresh')
    else actions.current.schedule()
  }, [options.data])
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'hidden' || latest.current.disabled || !checkpoint.current || stopped.current) return
      cancelTimers(); failures.current = 0
      void actions.current.run('refresh')
    }
    const poll = setInterval(() => {
      if (document.visibilityState !== 'hidden' && !retryTimer.current && failures.current === 0 && !stopped.current) void actions.current.run('refresh')
    }, 60_000)
    const leaving = (event: BeforeUnloadEvent) => {
      if (latest.current.disabled || !checkpoint.current || checkpoint.current.revision === 0 && checkpoint.current.pending === null) return
      if (checkpoint.current.pending || clean.current !== null && JSON.stringify(latest.current.data) !== clean.current || viewRef.current.pending) { event.preventDefault(); event.returnValue = '' }
    }
    const changed = (event: StorageEvent) => {
      if (event.key !== SHEETS_SYNC_KEY || !checkpoint.current || !remember.current) return
      const saved = readSheetsCheckpoint()
      if (!saved || saved.config.endpoint !== checkpoint.current.config.endpoint || saved.config.token !== checkpoint.current.config.token) {
        generation.current += 1; confirm(false); cancelTimers(); locked.current = false; checkpoint.current = null; verified.current = false; clean.current = null
        update({ connection: null, busy: false, revision: null, pending: false, blocked: false, message: 'Kết nối đã thay đổi ở tab khác. Hãy tải lại trang để sử dụng kết nối mới.' })
      }
    }
    const draftChanged = (event: Event) => {
      const element = event.target
      if (!(element instanceof HTMLElement) || element.closest('.sheets-connection')) return
      const form = element.closest('form')
      if (form) drafts.current.add(form)
    }
    const submitted = (event: Event) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      const before = latest.current.data
      setTimeout(() => { if (latest.current.data !== before) drafts.current.delete(form) }, 0)
    }
    window.addEventListener('online', wake); window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake)
    window.addEventListener('beforeunload', leaving); window.addEventListener('storage', changed)
    document.addEventListener('input', draftChanged, true); document.addEventListener('change', draftChanged, true); document.addEventListener('submit', submitted, true)
    return () => { clearInterval(poll); window.removeEventListener('online', wake); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake); window.removeEventListener('beforeunload', leaving); window.removeEventListener('storage', changed); document.removeEventListener('input', draftChanged, true); document.removeEventListener('change', draftChanged, true); document.removeEventListener('submit', submitted, true) }
  }, [])
  return { ...view, connect, disconnect, syncNow, initialize, replace, confirm, remembered: Boolean(initial.current) }
}
