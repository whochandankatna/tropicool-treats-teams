import { supabase, publicAnonKey, API, API2 } from './supabase'
import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON, PublicKeyCredentialRequestOptionsJSON, AuthenticationResponseJSON } from '@simplewebauthn/browser'

// ── Square-backed endpoints (via the Supabase edge function) ───────────────
async function callFn(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${publicAnonKey}`,
      apikey: publicAnonKey,
      ...(opts.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || res.statusText) as Error & { data?: any; status?: number }
    err.data = data
    err.status = res.status
    throw err
  }
  return data
}

// The app outgrew the first edge function's route budget, so a second batch
// of features (reviews, analytics, expenses, webauthn, whatsapp-push,
// training) is deployed as a sibling function (`make-server-3ba8d4df-2`).
// Same request/response contract, just a different base URL.
async function callFn2(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API2}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${publicAnonKey}`,
      apikey: publicAnonKey,
      ...(opts.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || res.statusText) as Error & { data?: any; status?: number }
    err.data = data
    err.status = res.status
    throw err
  }
  return data
}

export const squareSyncStaff = () => callFn('/square/sync-staff', { method: 'POST' })

export interface OverdueTraining { id: number; title: string; dueAt: string }
export class TrainingRequiredError extends Error {
  overdue: OverdueTraining[]
  constructor(message: string, overdue: OverdueTraining[]) {
    super(message)
    this.name = 'TrainingRequiredError'
    this.overdue = overdue
  }
}
export class GeofenceBlockedError extends Error {
  distanceMeters: number | null
  radiusMeters: number
  constructor(message: string, distanceMeters: number | null, radiusMeters: number) {
    super(message)
    this.name = 'GeofenceBlockedError'
    this.distanceMeters = distanceMeters
    this.radiusMeters = radiusMeters
  }
}

// Best-effort browser geolocation for the clock-in geofence check. Resolves
// to null (never rejects) if the browser doesn't support it, the person
// denies the permission prompt, or it just takes too long — the backend
// treats a missing position as "can't verify" and requires a manager
// override rather than silently letting the clock-in through.
export const getGeoPosition = (timeoutMs = 8000): Promise<{ lat: number; lng: number; accuracy: number } | null> => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise(resolve => {
    let done = false
    const finish = (v: { lat: number; lng: number; accuracy: number } | null) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => finish(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      pos => { clearTimeout(timer); finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }) },
      () => { clearTimeout(timer); finish(null) },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    )
  })
}

export async function getClockInLocationIfNeeded() {
  try {
    const status = await callFn('/square/geofence/status') as { enabled: boolean }
    if (!status.enabled) return null
  } catch {
    // If status cannot be checked, supply location so the server can make
    // the final decision without treating a network error as "off".
  }
  return getGeoPosition()
}

export const squareClockIn = async (teamId: number, opts: { managerOverridePin?: string; geofenceOverridePin?: string; lat?: number; lng?: number; accuracy?: number } = {}) => {
  try {
    return await callFn('/square/clock-in', { method: 'POST', body: JSON.stringify({ teamId, managerOverridePin: opts.managerOverridePin, geofenceOverridePin: opts.geofenceOverridePin, lat: opts.lat, lng: opts.lng, accuracy: opts.accuracy }) })
  } catch (e) {
    const data = (e as Error & { data?: any }).data
    if (data?.error === 'training_required') {
      throw new TrainingRequiredError(data.message || 'Overdue mandatory training must be completed before clocking in.', data.overdue ?? [])
    }
    if (data?.error === 'outside_geofence') {
      throw new GeofenceBlockedError(data.message || "Location couldn't be verified — clock-in requires a manager override.", data.distanceMeters ?? null, data.radiusMeters ?? 200)
    }
    throw e
  }
}
export const squareClockOut = (teamId: number) =>
  callFn('/square/clock-out', { method: 'POST', body: JSON.stringify({ teamId }) })

export async function enablePushForTeam(teamId: number, managerPin?: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false
  if (await Notification.requestPermission() !== 'granted') return false
  const reg = await navigator.serviceWorker.register('/sw.js')
  const { publicKey } = await squareVapidKey()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const padding = '='.repeat((4 - (publicKey.length % 4)) % 4)
    const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    const applicationServerKey = Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)))
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  }
  await squarePushSubscribe(teamId, sub.toJSON() as PushSubscriptionJSON, managerPin)
  return true
}

export interface GeofenceSettings { enabled: boolean; lat: number | null; lng: number | null; radiusMeters: number; updatedAt: string | null }
export const managerGeofence = (pin: string) => callFn('/manager/geofence/read', { method: 'POST', body: JSON.stringify({ pin }) }) as Promise<GeofenceSettings>
export const saveManagerGeofence = (pin: string, enabled: boolean, location?: { lat: number; lng: number }) =>
  callFn('/manager/geofence', { method: 'PUT', body: JSON.stringify({ pin, enabled, ...location }) }) as Promise<GeofenceSettings>

export interface ClockoutReview {
  id: number; team_id: number; staffName: string; scheduled_start_at: string; scheduled_end_at: string;
  auto_end_at: string; status: 'pending' | 'failed' | 'approved' | 'adjusted' | 'resolved'; created_at: string;
  actual_end_at?: string | null; reviewed_at?: string | null; review_note: string | null;
}
export const managerClockoutReviews = (pin: string, view: 'pending' | 'history' = 'pending') =>
  callFn('/manager/clockout-reviews/list', { method: 'POST', body: JSON.stringify({ pin, view }) }) as Promise<{ reviews: ClockoutReview[] }>
export const decideClockoutReview = (pin: string, id: number, decision: 'approve' | 'adjust' | 'resolve', actualEndAt?: string, note?: string) =>
  callFn(`/manager/clockout-reviews/${id}`, { method: 'POST', body: JSON.stringify({ pin, decision, actualEndAt, note }) })
export const squareRoster = (days = 7) => callFn(`/square/roster?days=${days}`)

// Manager roster editor — reads/writes Square scheduled shifts directly
// (draft until published), plus availability and approved time-off for the
// same window so the manager can see conflicts while editing.
export interface ManagerRosterShift {
  id: string
  version: number
  squareTeamMemberId: string | null
  jobId: string | null
  startAt: string
  endAt: string
  notes: string | null
  isPublished: boolean
  hasUnpublishedChanges: boolean
  teamId: number | null
}
export interface ManagerRosterStaff { teamId: number; name: string; avatar: string; jobId: string | null; jobTitle: string | null }
export interface ManagerRosterAvailability { team_id: number; day_of_week: number; available: boolean; start_time: string | null; end_time: string | null }
export interface ManagerRosterTimeOff { team_id: number; start_date: string; end_date: string }
export interface ManagerRosterData {
  start: string; end: string
  staff: ManagerRosterStaff[]
  shifts: ManagerRosterShift[]
  availability: ManagerRosterAvailability[]
  timeOff: ManagerRosterTimeOff[]
}
export const managerRoster = (pin: string, start: string, end: string) =>
  callFn(`/manager/roster?pin=${encodeURIComponent(pin)}&start=${start}&end=${end}`) as Promise<ManagerRosterData>
export const createManagerShift = (pin: string, teamId: number, startAt: string, endAt: string, notes?: string) =>
  callFn('/manager/roster/shift', { method: 'POST', body: JSON.stringify({ pin, teamId, startAt, endAt, notes }) }) as Promise<{ shift: ManagerRosterShift }>
export const updateManagerShift = (shiftId: string, pin: string, teamId: number, version: number, patch: { startAt?: string; endAt?: string; notes?: string }) =>
  callFn(`/manager/roster/shift/${shiftId}`, { method: 'PUT', body: JSON.stringify({ pin, teamId, version, ...patch }) }) as Promise<{ shift: ManagerRosterShift }>
export const deleteManagerShift = (shiftId: string, pin: string) =>
  callFn(`/manager/roster/shift/${shiftId}?pin=${encodeURIComponent(pin)}`, { method: 'DELETE' }) as Promise<{ ok: boolean }>
export const publishManagerRoster = (pin: string, start: string, end: string, notify = true) =>
  callFn('/manager/roster/publish', { method: 'POST', body: JSON.stringify({ pin, start, end, notify }) }) as Promise<{ published: number; notified: number }>
// Pulls this one staff member's live clock status from Square and reconciles
// local state — the "pull" half of the two-way sync (clock-in/out above are
// the "push" half). Called at login so a clock-in done directly in Square
// (POS terminal, another device) shows up here immediately.
export const squareClockStatus = (teamId: number) =>
  callFn(`/square/clock-status?teamId=${teamId}`) as Promise<{ synced: boolean; team?: { id: number; clocked_in: boolean; clock_in: string | null } }>
// Same pull, but for every Square-linked staff member in one call — polled
// on an interval so a clock-in/out done through the separate Square Team
// App shows up here without anyone needing to log into this app first.
export const squareClockStatusAll = () =>
  callFn('/square/clock-status/all') as Promise<{ synced: boolean; team: { id: number; clocked_in: boolean; clock_in: string | null }[] }>

// PIN login
export const squarePinVerify = (teamId: number, pin: string) =>
  callFn('/square/pin/verify', { method: 'POST', body: JSON.stringify({ teamId, pin }) }) as Promise<{ ok: boolean; error?: string }>
export const squarePinSet = (teamId: number, pin: string) =>
  callFn('/square/pin/set', { method: 'POST', body: JSON.stringify({ teamId, pin }) })
// "Manager Login" checks the PIN against whichever staff profile(s) are
// flagged as manager, so it always matches whatever that person set their
// own PIN to — no separate manager password to keep in sync.
export const squareVerifyManagerPin = (pin: string) =>
  callFn('/square/pin/verify-manager', { method: 'POST', body: JSON.stringify({ pin }) }) as Promise<
    { ok: true; teamId: number; name: string; role: string; avatar: string } | { ok: false; error?: string }
  >

// Web push
export const squareVapidKey = () => callFn('/square/push/vapid-key') as Promise<{ publicKey: string }>
export const squarePushSubscribe = (teamId: number, subscription: PushSubscriptionJSON, managerPin?: string) =>
  callFn('/square/push/subscribe', { method: 'POST', body: JSON.stringify({ teamId, subscription, managerPin }) })

// Financials
export interface FinancialsSummary {
  orderCount: number
  grossSales: number
  discounts: number
  netSales: number
  tax: number
  tip: number
  serviceCharges: number
  totalCollected: number
  refunds: number
  netAfterRefunds: number
}
export interface FinancialsSeriesPoint { date: string; grossSales: number; netSales: number; orderCount: number }
export interface FinancialsChannel { channel: string; grossSales: number; netSales: number; orderCount: number }
export interface FinancialsResponse {
  start: string
  end: string
  currency: string
  summary: FinancialsSummary
  series: FinancialsSeriesPoint[]
  channels: FinancialsChannel[]
}
export interface Transaction {
  id: string
  amount: number
  tip: number
  currency: string
  status: string
  createdAt: string
  sourceType: string
  cardBrand: string | null
  last4: string | null
  receiptUrl: string | null
  orderId: string | null
}
export const squareFinancials = (start: string, end: string) =>
  callFn(`/square/financials?start=${start}&end=${end}`) as Promise<FinancialsResponse>
export const squareTransactions = (start: string, end: string, cursor?: string, limit = 25) =>
  callFn(`/square/financials/transactions?start=${start}&end=${end}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`) as Promise<{ transactions: Transaction[]; cursor: string | null }>

// Hours & Wages
export interface HoursBucket { weekday: number; saturday: number; sunday: number; total: number }
export interface StaffHours {
  teamId: number
  name: string
  avatar: string
  hourlyRateLatest: number | null
  loggedHours: HoursBucket
  scheduledHours: HoursBucket
  wageCost: number
}
export interface DailyWages { date: string; wageCost: number; grossSales: number; netSales: number; laborPct: number | null }
export interface HoursResponse { start: string; end: string; currency: string; staff: StaffHours[]; daily: DailyWages[] }
export const squareHours = (start: string, end: string) =>
  callFn(`/square/hours?start=${start}&end=${end}`) as Promise<HoursResponse>

// Spotify (shared cafe account — full playback control via Spotify Connect)
export interface SpotifyStatus { connected: boolean; displayName?: string | null; isPremium?: boolean; error?: string }
export interface SpotifyTrack { id: string; uri: string; name: string; artists: string; album: string | null; albumArt: string | null; durationMs: number }
export interface SpotifyDevice { id: string; name: string; type: string; isActive: boolean; volumePercent: number | null }
export interface SpotifyNowPlaying { isPlaying: boolean; progressMs: number; item: SpotifyTrack | null; device: SpotifyDevice | null; shuffle: boolean; repeat: string }

export const spotifyStatus = () => callFn('/spotify/status') as Promise<SpotifyStatus>
export const spotifyAuthUrl = () => callFn('/spotify/auth-url') as Promise<{ url: string }>
export const spotifyDisconnect = () => callFn('/spotify/disconnect', { method: 'POST' })
// Note: callFn throws on any non-2xx response, so these reject (rather than
// resolve to an {error} shape) when Spotify isn't connected, needs Premium,
// or has no active device — callers should try/catch and read err.message.
export const spotifyNowPlaying = () => callFn('/spotify/now-playing') as Promise<SpotifyNowPlaying>
export const spotifyDevices = () => callFn('/spotify/devices') as Promise<{ devices: SpotifyDevice[] }>
export const spotifyPlay = (opts: { deviceId?: string; uri?: string; contextUri?: string } = {}) =>
  callFn('/spotify/play', { method: 'POST', body: JSON.stringify(opts) })
export const spotifyPause = (deviceId?: string) =>
  callFn('/spotify/pause', { method: 'POST', body: JSON.stringify({ deviceId }) })
export const spotifyNext = (deviceId?: string) =>
  callFn('/spotify/next', { method: 'POST', body: JSON.stringify({ deviceId }) })
export const spotifyPrevious = (deviceId?: string) =>
  callFn('/spotify/previous', { method: 'POST', body: JSON.stringify({ deviceId }) })
export const spotifyVolume = (volumePercent: number, deviceId?: string) =>
  callFn('/spotify/volume', { method: 'POST', body: JSON.stringify({ volumePercent, deviceId }) })
export const spotifySeek = (positionMs: number, deviceId?: string) =>
  callFn('/spotify/seek', { method: 'POST', body: JSON.stringify({ positionMs, deviceId }) })
export const spotifyTransfer = (deviceId: string, play = false) =>
  callFn('/spotify/transfer', { method: 'POST', body: JSON.stringify({ deviceId, play }) })
export const spotifySearch = (q: string) =>
  callFn(`/spotify/search?q=${encodeURIComponent(q)}`) as Promise<{ tracks: SpotifyTrack[] }>
export const spotifyQueue = (uri: string, deviceId?: string) =>
  callFn('/spotify/queue', { method: 'POST', body: JSON.stringify({ uri, deviceId }) })
export interface SpotifyUpcoming { currentlyPlaying: SpotifyTrack | null; queue: SpotifyTrack[] }
export const spotifyUpcoming = () => callFn('/spotify/upcoming') as Promise<SpotifyUpcoming>

// Microsoft 365 (Daily Updates — dedicated Graph OAuth app for the cafe mailbox)
export interface MsStatus { connected: boolean; displayName?: string | null; mail?: string | null; error?: string }
export interface MsUpdateItem {
  id: string; subject: string; preview: string; from: string; fromEmail: string | null
  receivedAt: string; isRead: boolean; webLink: string | null
  category: 'overdue' | 'bill' | 'update'; amount: number | null
}
export interface MsUpdatesResponse { since: string; total: number; overdueBills: MsUpdateItem[]; bills: MsUpdateItem[]; updates: MsUpdateItem[] }

export const msStatus = () => callFn('/microsoft/status') as Promise<MsStatus>
export const msAuthUrl = () => callFn('/microsoft/auth-url') as Promise<{ url: string }>
export const msDisconnect = () => callFn('/microsoft/disconnect', { method: 'POST' })
export const msUpdates = (days = 1) => callFn(`/microsoft/updates?days=${days}`) as Promise<MsUpdatesResponse>

// Use maybeSingle() instead of single() so 0 rows doesn't throw
async function first<T>(q: any): Promise<T> {
  const { data, error } = await q.select().maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Categories
export const getCategories = async () => {
  const { data, error } = await supabase.from('tt_categories').select('*').order('position')
  if (error) throw new Error(error.message)
  return data as { id: number; name: string; position: number }[]
}
export const addCategory = async (name: string, position: number) =>
  first(supabase.from('tt_categories').upsert({ name, position }, { onConflict: 'name' }))
export const updateCategory = async (id: number, patch: object) =>
  first(supabase.from('tt_categories').update(patch).eq('id', id))
export const deleteCategory = async (id: number) => {
  const { error } = await supabase.from('tt_categories').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Roles
export const getRoles = async () => {
  const { data, error } = await supabase.from('tt_roles').select('*').order('id')
  if (error) throw new Error(error.message)
  return data as { id: number; name: string }[]
}
export const addRole = async (name: string) =>
  first(supabase.from('tt_roles').upsert({ name }, { onConflict: 'name' }))
export const updateRole = async (id: number, patch: object) =>
  first(supabase.from('tt_roles').update(patch).eq('id', id))
export const deleteRole = async (id: number) => {
  const { error } = await supabase.from('tt_roles').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Team
export const getTeam = async () => {
  const { data, error } = await supabase.from('tt_team').select('*').order('id')
  if (error) throw new Error(error.message)
  return data as any[]
}
export const addTeamMember = async (body: object) =>
  first(supabase.from('tt_team').insert(body))
export const updateTeamMember = async (id: number, patch: object) =>
  first(supabase.from('tt_team').update(patch).eq('id', id))
export const deleteTeamMember = async (id: number) => {
  const { error } = await supabase.from('tt_team').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Items
export const getItems = async () => {
  const { data, error } = await supabase.from('tt_items').select('*').order('id')
  if (error) throw new Error(error.message)
  return data as any[]
}
export const addItem = async (body: object) =>
  first(supabase.from('tt_items').insert(body))
export const updateItem = async (id: number, patch: object) =>
  first(supabase.from('tt_items').update(patch).eq('id', id))
export const deleteItem = async (id: number) => {
  const { error } = await supabase.from('tt_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Recipes
export interface Recipe {
  id: number
  title: string
  category: string | null
  ingredients: string | null
  instructions: string
  image_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
export const getRecipes = async () => {
  const { data, error } = await supabase.from('tt_recipes').select('*').order('title')
  if (error) throw new Error(error.message)
  return data as Recipe[]
}
export const addRecipe = async (body: Partial<Recipe>) =>
  first(supabase.from('tt_recipes').insert({ ...body, updated_at: new Date().toISOString() }))
export const updateRecipe = async (id: number, patch: Partial<Recipe>) =>
  first(supabase.from('tt_recipes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id))
export const deleteRecipe = async (id: number) => {
  const { error } = await supabase.from('tt_recipes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Training — three content shapes depending on `type`:
//   text:  { body: string }
//   quiz:  { questions: { question: string; options: string[]; correctIndex: number }[] }
//   video: { youtubeUrl: string }
export type TrainingType = 'text' | 'quiz' | 'video'
export interface TrainingQuestion { question: string; options: string[]; correctIndex: number }
export interface Training {
  id: number
  title: string
  type: TrainingType
  content: { body?: string; questions?: TrainingQuestion[]; youtubeUrl?: string }
  created_by: string | null
  created_at: string
  updated_at: string
  mandatory: boolean
  mandatory_since: string | null
  due_at: string | null
  grace_period_days: number
}
export interface TrainingCompletion {
  id: number
  training_id: number
  team_id: number
  score: number | null
  total: number | null
  completed_at: string
  attempts: number
  passed: boolean
  locked: boolean
}
export const getTrainings = async () => {
  const { data, error } = await supabase.from('tt_trainings').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Training[]
}
const DEFAULT_TRAINING_GRACE_PERIOD_DAYS = 3
export const addTraining = async (body: Partial<Training>, managerPin: string) =>
  callFn2('/manager/training', { method: 'POST', body: JSON.stringify({ ...body, pin: managerPin, grace_period_days: body.grace_period_days ?? DEFAULT_TRAINING_GRACE_PERIOD_DAYS }) })
export const updateTraining = async (id: number, patch: Partial<Training>, managerPin: string) =>
  callFn2(`/manager/training/${id}`, { method: 'PUT', body: JSON.stringify({ ...patch, pin: managerPin }) })
export const deleteTraining = async (id: number, managerPin: string) =>
  callFn2(`/manager/training/${id}?pin=${encodeURIComponent(managerPin)}`, { method: 'DELETE' })
export const getTrainingCompletions = async () => {
  const { data, error } = await supabase.from('tt_training_completions').select('*')
  if (error) throw new Error(error.message)
  return data as TrainingCompletion[]
}
export interface TrainingAttemptResult { completion: TrainingCompletion; attemptsRemaining: number | null; locked?: boolean }
export const recordTrainingCompletion = async (trainingId: number, teamId: number, answers?: Record<number, number>) =>
  callFn2('/training/attempt', { method: 'POST', body: JSON.stringify({ trainingId, teamId, answers }) }) as Promise<TrainingAttemptResult>
export const resetTrainingAttempt = async (trainingId: number, teamId: number, managerPin: string) =>
  callFn2('/manager/training/reset', { method: 'POST', body: JSON.stringify({ trainingId, teamId, pin: managerPin }) })

// Chat
export const getChat = async () => {
  const { data, error } = await supabase.from('tt_chat').select('*').order('created_at').limit(100)
  if (error) throw new Error(error.message)
  return data as any[]
}
export const postChat = async (body: object) =>
  first(supabase.from('tt_chat').insert(body))

// ── Checklist (Opening/Closing) ─────────────────────────────────────────────
export interface ChecklistItem { id: number; type: 'opening' | 'closing'; label: string; position: number; archived: boolean }
export interface ChecklistLogEntry { id: number; checklist_item_id: number; log_date: string; status: 'done' | 'not_done'; team_id: number | null; team_name: string | null; reason: string | null; completed_at: string }
export const getChecklistItems = async () => {
  const { data, error } = await supabase.from('tt_checklist_items').select('*').eq('archived', false).order('type').order('position')
  if (error) throw new Error(error.message)
  return data as ChecklistItem[]
}
export const addChecklistItem = async (body: Partial<ChecklistItem>) => first(supabase.from('tt_checklist_items').insert(body))
export const archiveChecklistItem = async (id: number) => first(supabase.from('tt_checklist_items').update({ archived: true }).eq('id', id))
export const getChecklistLog = async (logDate: string) => {
  const { data, error } = await supabase.from('tt_checklist_log').select('*').eq('log_date', logDate)
  if (error) throw new Error(error.message)
  return data as ChecklistLogEntry[]
}
export const setChecklistLog = async (itemId: number, logDate: string, status: 'done' | 'not_done', teamId: number | null, teamName: string | null, reason?: string | null) =>
  first(supabase.from('tt_checklist_log').upsert(
    { checklist_item_id: itemId, log_date: logDate, status, team_id: teamId, team_name: teamName, reason: reason ?? null, completed_at: new Date().toISOString() },
    { onConflict: 'checklist_item_id,log_date' },
  ))
export const clearChecklistLog = async (itemId: number, logDate: string) => {
  const { error } = await supabase.from('tt_checklist_log').delete().eq('checklist_item_id', itemId).eq('log_date', logDate)
  if (error) throw new Error(error.message)
}

// ── Public / school holidays (forecast inputs) ──────────────────────────────
// start_time/end_time (nullable) support part-day holidays (e.g. Christmas Eve
// 6pm-midnight) — set together or left null for a full-day holiday.
export interface PublicHoliday { id: number; holiday_date: string; name: string; start_time: string | null; end_time: string | null }
export interface SchoolHoliday { id: number; start_date: string; end_date: string; term_name: string | null }
export const getPublicHolidays = async () => {
  const { data, error } = await supabase.from('tt_public_holidays').select('*').order('holiday_date')
  if (error) throw new Error(error.message)
  return data as PublicHoliday[]
}
export const addPublicHoliday = async (body: Partial<PublicHoliday>) => first(supabase.from('tt_public_holidays').insert(body))
export const deletePublicHoliday = async (id: number) => { const { error } = await supabase.from('tt_public_holidays').delete().eq('id', id); if (error) throw new Error(error.message) }
export const getSchoolHolidays = async () => {
  const { data, error } = await supabase.from('tt_school_holidays').select('*').order('start_date')
  if (error) throw new Error(error.message)
  return data as SchoolHoliday[]
}
export const addSchoolHoliday = async (body: Partial<SchoolHoliday>) => first(supabase.from('tt_school_holidays').insert(body))
export const deleteSchoolHoliday = async (id: number) => { const { error } = await supabase.from('tt_school_holidays').delete().eq('id', id); if (error) throw new Error(error.message) }

// ── Expenses ─────────────────────────────────────────────────────────────────
// Field names corrected 2026-08-30 against the live Entries/Comparison components:
// the table uses description/category/cost_type/recurrence (not vendor/recurring/recurrence_days).
export interface Expense {
  id: number
  description: string
  category: string
  cost_type: 'fixed' | 'variable'
  amount_cents: number
  expense_date: string
  recurrence: 'none' | 'weekly' | 'monthly' | 'yearly'
  recurrence_end_date: string | null
  notes: string | null
  due_date: string | null
  paid: boolean
  paid_at: string | null
  created_by: string | null
}
export const getExpenses = async () => {
  const { data, error } = await supabase.from('tt_expenses').select('*').order('expense_date', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Expense[]
}
export const addExpense = async (body: Partial<Expense>) => first(supabase.from('tt_expenses').insert({ ...body, updated_at: new Date().toISOString() }))
export const setExpensePaid = async (id: number, paid: boolean) =>
  first(supabase.from('tt_expenses').update({ paid, paid_at: paid ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', id))
export const updateExpense = async (id: number, patch: Partial<Expense>) => first(supabase.from('tt_expenses').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id))
export const deleteExpense = async (id: number) => { const { error } = await supabase.from('tt_expenses').delete().eq('id', id); if (error) throw new Error(error.message) }
// PDF import from the linked email inbox — lives on the second edge function.
// Shape corrected 2026-08-30 against the live inbox-import panel: candidates
// are keyed by messageId+attachmentId, and import returns the downloaded file
// plus what the PDF parse detected (amount/category), not a flat suggestion.
export interface InboxAttachment { messageId: string; attachmentId: string; subject: string; filename: string; from: string; receivedAt: string; sizeKB: number }
export const expensesInboxAttachments = (days = 30) => callFn2(`/manager/expenses/inbox-attachments?days=${days}`) as Promise<{ candidates: InboxAttachment[] }>
export interface InboxImportResult { filename: string; contentBytesBase64: string; amountDetected: boolean; categoryDetected: boolean; expense: Expense }
export const expensesInboxImport = (messageId: string, attachmentId: string) =>
  callFn2('/manager/expenses/inbox-attachments/import', { method: 'POST', body: JSON.stringify({ messageId, attachmentId }) }) as Promise<InboxImportResult>
// Note: daily wage-cost (used to fold labour into the Expenses totals/chart) reuses
// squareHours(start, end).daily — same endpoint the Wages tab already calls, just a
// wider date range and reading DailyWages.wageCost per day.

// ── Analytics (second edge function) ────────────────────────────────────────
// Shapes below matched 2026-08-30 against the live Analytics tab component
// (field names are the raw backend response, some cents fields don't carry a
// "Cents" suffix despite holding cents — e.g. summary.totalRevenue).
export interface AnalyticsSummary { totalRevenue: number; totalOrders: number; totalItemsSold: number; avgOrderValueCents: number; avgBasketSize: number; totalDiscount: number; salesPerLaborHourCents: number | null }
export interface AnalyticsLeaderboardItem { name: string; qty: number; revenue: number }
export interface AnalyticsTrendingItem { name: string; growthPct: number }
export interface AnalyticsLeastWantedItem { name: string; qty: number }
export interface AnalyticsBasketPair { itemA: string; itemB: string; count: number }
export interface AnalyticsModifier { name: string; qty: number; revenue: number }
export interface AnalyticsCategoryMix { category: string; revenue: number }
export interface AnalyticsDayOfWeekRevenue { dow: number; revenue: number }
export interface AnalyticsHourlyHeatmapItem { name: string; hours: number[] }
export interface AnalyticsOverview {
  summary: AnalyticsSummary
  leaderboard: AnalyticsLeaderboardItem[]
  trending: AnalyticsTrendingItem[]
  leastWanted: AnalyticsLeastWantedItem[]
  neverSold: string[]
  basketPairs: AnalyticsBasketPair[]
  modifiers: AnalyticsModifier[]
  categoryMix: AnalyticsCategoryMix[]
  dayOfWeekRevenue: AnalyticsDayOfWeekRevenue[]
  hourlyHeatmap: AnalyticsHourlyHeatmapItem[]
}
export const squareAnalyticsOverview = (start: string, end: string, compareStart?: string, compareEnd?: string) => {
  const p = new URLSearchParams({ start, end })
  if (compareStart) p.set('compareStart', compareStart)
  if (compareEnd) p.set('compareEnd', compareEnd)
  return callFn2(`/square/analytics/overview?${p.toString()}`) as Promise<AnalyticsOverview>
}
export interface AnalyticsStaffEntry { name: string; transactions: number; revenue: number }
export interface AnalyticsStaff { available: boolean; staff: AnalyticsStaffEntry[]; reason?: string }
export const squareAnalyticsStaff = (start: string, end: string) =>
  callFn2(`/square/analytics/staff?start=${start}&end=${end}`) as Promise<AnalyticsStaff>
export interface AnalyticsCustomers { available: boolean; uniqueCustomers: number; returningInRange: number; singleVisitInRange: number; note?: string; reason?: string }
export const squareAnalyticsCustomers = (start: string, end: string) =>
  callFn2(`/square/analytics/customers?start=${start}&end=${end}`) as Promise<AnalyticsCustomers>

export interface DailySalesPoint { date: string; revenue: number; orders: number; itemsSold: number }
export const squareAnalyticsDaily = (start: string, end: string) =>
  callFn2(`/square/analytics/daily?start=${start}&end=${end}`) as Promise<{ start: string; end: string; days: DailySalesPoint[] }>

export interface StaffShift { teamId: number | null; name: string; date: string; startAt: string; endAt: string | null; hours: number | null }
export const squareAnalyticsShifts = (start: string, end: string) =>
  callFn2(`/square/analytics/shifts?start=${start}&end=${end}`) as Promise<{ start: string; end: string; shifts: StaffShift[] }>

export interface ItemTrendSeries { name: string; total: number; weeks: number[] }
export const squareAnalyticsItemTrend = (start: string, end: string) =>
  callFn2(`/square/analytics/item-trend?start=${start}&end=${end}`) as Promise<{ weeks: string[]; series: ItemTrendSeries[] }>

// ── Manager alerts (nightly push + in-app reminder, second edge function) ──
export const managerStocktakeAlertStatus = (pin: string) =>
  callFn2(`/manager/push/stocktake-alert/status?pin=${encodeURIComponent(pin)}`) as Promise<{ subscribedManagers: number; totalManagers: number }>
export const managerStocktakeAlertTestSend = (pin: string) =>
  callFn2('/manager/push/stocktake-alert/test-send', { method: 'POST', body: JSON.stringify({ pin }) }) as Promise<{ sent: number; outCount: number; lowCount: number }>
export const managerStocktakeReminderTestSend = (pin: string) =>
  callFn2('/manager/notifications/stocktake-reminder/test-send', { method: 'POST', body: JSON.stringify({ pin }) }) as Promise<{ sent: boolean; pushed: number; targeted: number }>

// ── Availability, Time Off, Shift Swap (first edge function) ───────────────
// Field names corrected 2026-08-30 against the live Availability component:
// response is {availability}, and each day uses day_of_week/start_time/end_time.
export interface AvailabilityDay { day_of_week: number; available: boolean; start_time: string; end_time: string }
export const getAvailability = (teamId: number) => callFn(`/team/${teamId}/availability`) as Promise<{ availability: AvailabilityDay[] }>
export const setAvailability = (teamId: number, days: AvailabilityDay[]) =>
  callFn(`/team/${teamId}/availability`, { method: 'PUT', body: JSON.stringify({ days }) })

// tt_team is the manager-list view's embedded staff relation (name/avatar) —
// present on manager-facing requests, absent on the staff's own list.
export interface TimeOffRequest { id: number; team_id: number; team_name: string; tt_team?: { name: string; avatar: string } | null; start_date: string; end_date: string; reason: string | null; status: 'pending' | 'approved' | 'denied'; decided_by: string | null; manager_note: string | null }
export const getMyTimeOff = (teamId: number) => callFn(`/team/${teamId}/time-off`) as Promise<{ requests: TimeOffRequest[] }>
export const requestTimeOff = (teamId: number, startDate: string, endDate: string, reason?: string) =>
  callFn(`/team/${teamId}/time-off`, { method: 'POST', body: JSON.stringify({ startDate, endDate, reason }) })
export const cancelTimeOff = (teamId: number, requestId: number) => callFn(`/team/${teamId}/time-off/${requestId}`, { method: 'DELETE' })
export const managerTimeOff = (status?: string) => callFn(`/manager/time-off${status ? `?status=${status}` : ''}`) as Promise<{ requests: TimeOffRequest[] }>
export const managerDecideTimeOff = (requestId: number, status: 'approved' | 'denied', decidedBy: string, note?: string) =>
  callFn(`/manager/time-off/${requestId}/decide`, { method: 'POST', body: JSON.stringify({ status, decidedBy, note }) })
export const managerCreateTimeOff = (teamId: number, startDate: string, endDate: string, reason: string, decidedBy: string) =>
  callFn('/manager/time-off', { method: 'POST', body: JSON.stringify({ teamId, startDate, endDate, reason, decidedBy }) })

// Shape corrected 2026-08-30 against the live staff Shift Swap component.
export interface ShiftSwapRequest {
  id: number
  requesting_team_id: number
  square_shift_id: string
  shift_start_at: string
  shift_end_at: string
  reason: string | null
  status: 'open' | 'pending_manager' | 'approved' | 'denied' | 'cancelled'
  requester?: { name: string; avatar: string } | null
  coverer?: { name: string; avatar: string } | null
  manager_note: string | null
}
export const requestShiftSwap = (teamId: number, body: { squareShiftId: string; shiftStartAt: string; shiftEndAt: string; reason?: string; targetTeamId?: number }) =>
  callFn(`/team/${teamId}/shift-swap`, { method: 'POST', body: JSON.stringify(body) })
export const openShiftSwaps = () => callFn('/shift-swap/open') as Promise<{ requests: ShiftSwapRequest[] }>
export const myShiftSwaps = (teamId: number) => callFn(`/team/${teamId}/shift-swap`) as Promise<{ requests: ShiftSwapRequest[] }>
export const offerShiftSwap = (requestId: number, teamId: number) => callFn(`/shift-swap/${requestId}/offer`, { method: 'POST', body: JSON.stringify({ teamId }) })
export const cancelShiftSwap = (teamId: number, requestId: number) => callFn(`/team/${teamId}/shift-swap/${requestId}/cancel`, { method: 'POST' })
export const managerShiftSwaps = (status?: string) => callFn(`/manager/shift-swap${status ? `?status=${status}` : ''}`) as Promise<{ requests: ShiftSwapRequest[] }>
export const managerDecideShiftSwap = (pin: string, requestId: number, approve: boolean, decidedBy: string, note?: string) =>
  callFn(`/manager/shift-swap/${requestId}/decide`, { method: 'POST', body: JSON.stringify({ pin, status: approve ? 'approved' : 'denied', decidedBy, note }) })

// ── Payroll ──────────────────────────────────────────────────────────────────
// Shape corrected 2026-08-30 against the live Hours & Pay component: cycles carry
// Award pay-band breakdowns (ordinary/evening/Saturday/Sunday/public-holiday) in
// both hours and cents, plus a per-shift list, not a flat gross/net/lines shape.
export interface PayBands { ordinary: number; eveningEarly: number; eveningLate: number; saturday: number; sundayL1: number; sundayL23: number; publicHoliday: number }
export interface PayShift { date: string; start: string; end: string; source: 'square' | 'manual'; payCents: number }
export interface PayrollCycle {
  start: string; end: string; label: string; isCurrent: boolean
  totalHours: number; totalPayCents: number; estimatedNetPayCents: number; estimatedTaxCents: number
  bandHours: PayBands; bandPayCents: PayBands; shifts: PayShift[]
}
export interface PayrollMe { configured: boolean; dobMissing: boolean; classificationLabel: string; employmentType: 'casual' | 'part_time' | 'full_time'; claimsTaxFreeThreshold: boolean; cycles: PayrollCycle[] }
export const payrollMe = (teamId: number, cycles = 4) => callFn(`/payroll/me?teamId=${teamId}&cycles=${cycles}`) as Promise<PayrollMe>
export const payrollVoidShift = (pin: string, teamId: number, timecardId: string, note?: string) =>
  callFn('/payroll/void-shift', { method: 'POST', body: JSON.stringify({ pin, teamId, timecardId, note }) })
export const payrollUnvoidShift = (pin: string, teamId: number, timecardId: string) =>
  callFn('/payroll/unvoid-shift', { method: 'POST', body: JSON.stringify({ pin, teamId, timecardId }) })
export interface VoidedShift { timecard_id: string; voided_at: string }
export const payrollVoidedShifts = (pin: string, teamId: number) =>
  callFn(`/payroll/voided-shifts?pin=${encodeURIComponent(pin)}&teamId=${teamId}`) as Promise<{ voided: VoidedShift[] }>
export interface PayrollClassificationOption { key: string; label: string; minHourly: number }
export interface ManagerStaffPay {
  teamId: number; name: string; avatar: string; role: string; age: number | null; dob: string | null
  employmentType: 'casual' | 'part_time' | 'full_time'; claimsTaxFreeThreshold: boolean
  classification: string | null; classificationLabel: string; classificationLocked: boolean
}
export const payrollManagerStaff = (pin: string) =>
  callFn(`/payroll/manager/staff?pin=${encodeURIComponent(pin)}`) as Promise<{ staff: ManagerStaffPay[]; classifications: PayrollClassificationOption[] }>
export const payrollSetClassification = (pin: string, teamId: number, classification: string) =>
  callFn('/payroll/manager/classification', { method: 'POST', body: JSON.stringify({ pin, teamId, classification }) })
export const payrollSetEmploymentType = (pin: string, teamId: number, employmentType: string) =>
  callFn('/payroll/manager/employment-type', { method: 'POST', body: JSON.stringify({ pin, teamId, employmentType }) })
export const payrollSetDob = (pin: string, teamId: number, dob: string) =>
  callFn('/payroll/manager/dob', { method: 'POST', body: JSON.stringify({ pin, teamId, dob }) })
export const payrollSetTaxFreeThreshold = (pin: string, teamId: number, claims: boolean) =>
  callFn('/payroll/manager/tax-free-threshold', { method: 'POST', body: JSON.stringify({ pin, teamId, claimsTaxFreeThreshold: claims }) })

// Reviews. Corrected 2026-08-30: these routes live on the FIRST edge
// function (verified live via direct curl against both bases), not the
// second — an earlier assumption in this file had it backwards. Field
// names below corrected against the live scoreboard + manager panel
// components: the response has cycleStart/cycleEnd/staff[] with a
// per-staff tiers[] (reward-tier progress + claim state), pending reviews
// come back under {reviews}, and /claim takes tier+notes, not count+note.
export interface ReviewTier { tier: number; label: string; count: number; reached: boolean; claim: { given_at: string } | null }
export interface ReviewScoreboardEntry { teamId: number; name: string; avatar: string; count: number; tiers: ReviewTier[] }
export interface ReviewScoreboard { cycleStart: string; cycleEnd: string; staff: ReviewScoreboardEntry[] }
export const reviewsScoreboard = () =>
  callFn('/reviews/scoreboard') as Promise<ReviewScoreboard>
// Field names below corrected 2026-08-30 against the live manager reviews
// panel: pending reviews carry raw reviewer_name/review_text (not
// customerName/text), and the two "log manually" endpoints turned out to be
// backwards from an earlier guess — Manual logs ONE full review (rating,
// text, reviewer name, date); ManualBulk backfills a known COUNT for one
// staff member on one date, not a multi-entry array.
export interface PendingReview { id: number; rating: number | null; reviewer_name: string | null; review_text: string | null }
export const managerReviewsSync = (pin: string) =>
  callFn('/manager/reviews/sync', { method: 'POST', body: JSON.stringify({ pin }) }) as Promise<{ fetched: number; imported: number }>
export const managerReviewsPending = (pin: string) =>
  callFn(`/manager/reviews/pending?pin=${encodeURIComponent(pin)}`) as Promise<{ reviews: PendingReview[] }>
export const managerReviewsAssign = (reviewId: number, pin: string, teamId: number) =>
  callFn(`/manager/reviews/${reviewId}/assign`, { method: 'POST', body: JSON.stringify({ pin, teamId }) })
export const managerReviewsManual = (body: { pin: string; teamId: number; rating: number; reviewDate: string; reviewText?: string; reviewerName?: string }) =>
  callFn('/manager/reviews/manual', { method: 'POST', body: JSON.stringify(body) })
export const managerReviewsManualBulk = (body: { pin: string; teamId: number; count: number; reviewDate: string }) =>
  callFn('/manager/reviews/manual-bulk', { method: 'POST', body: JSON.stringify(body) }) as Promise<{ inserted: number }>
export const managerReviewsScoreboard = (pin: string) =>
  callFn(`/manager/reviews/scoreboard?pin=${encodeURIComponent(pin)}`) as Promise<ReviewScoreboard>
export const managerReviewsClaim = (pin: string, teamId: number, tier: number, notes?: string) =>
  callFn('/manager/reviews/claim', { method: 'POST', body: JSON.stringify({ pin, teamId, tier, notes }) })
export interface GoogleReviewsStatus { connected: boolean; businessName?: string | null; error?: string }
export const googleReviewsStatus = () => callFn('/google-reviews/status') as Promise<GoogleReviewsStatus>
export const googleReviewsAuthUrl = () => callFn('/google-reviews/auth-url') as Promise<{ url: string }>
export const googleReviewsDisconnect = () => callFn('/google-reviews/disconnect', { method: 'POST' })

// WebAuthn / passkey (Face ID, fingerprint, Windows Hello) device enrollment
// for the Account > Security tab, plus the sign-in-side routes used by the
// "Sign in with Face ID" button on the login screen. Lives on the SECOND
// edge function.
export interface WebAuthnCredential { id: string; device_label: string | null; created_at: string; last_used_at: string | null }
export const webauthnRegisterOptions = (teamId: number, pin: string) =>
  callFn2('/webauthn/register-options', { method: 'POST', body: JSON.stringify({ teamId, pin }) }) as Promise<{ flowId: string; options: PublicKeyCredentialCreationOptionsJSON }>
export const webauthnRegisterVerify = (teamId: number, pin: string, flowId: string, response: RegistrationResponseJSON, deviceLabel: string) =>
  callFn2('/webauthn/register-verify', { method: 'POST', body: JSON.stringify({ teamId, pin, flowId, response, deviceLabel }) })
export const webauthnCredentials = (teamId: number, pin: string) =>
  callFn2(`/webauthn/credentials?teamId=${teamId}&pin=${encodeURIComponent(pin)}`) as Promise<{ credentials: WebAuthnCredential[] }>
export const webauthnDeleteCredential = (credentialId: string, teamId: number, pin: string) =>
  callFn2(`/webauthn/credentials/${credentialId}?teamId=${teamId}&pin=${encodeURIComponent(pin)}`, { method: 'DELETE' })
export const webauthnLoginOptions = () =>
  callFn2('/webauthn/login-options', { method: 'POST' }) as Promise<{ flowId: string; options: PublicKeyCredentialRequestOptionsJSON }>
export const webauthnLoginVerify = (flowId: string, response: AuthenticationResponseJSON) =>
  callFn2('/webauthn/login-verify', { method: 'POST', body: JSON.stringify({ flowId, response }) }) as Promise<{ verified: boolean; teamId?: number; name?: string; error?: string }>
