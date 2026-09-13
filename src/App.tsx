import { useState, useMemo, useEffect, useLayoutEffect, useRef, Fragment, CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from 'gsap'
import { supabase } from './lib/supabase'
import { draftCategories, draftChecklistItems, draftItems, draftManager, draftRoles, draftTeam } from './lib/draft-data'

const IS_DRAFT_MODE = import.meta.env.VITE_DRAFT_MODE === 'true'
const ACTIVE_PROFILE_STORAGE_KEY = 'tropicool.activeProfileId.v1'
import * as api from './lib/api'
import { startRegistration, startAuthentication, browserSupportsWebAuthn, platformAuthenticatorIsAvailable, WebAuthnError } from '@simplewebauthn/browser'

type StockStatus = 'ok' | 'low' | 'out'
type MainTab = 'overview' | 'stocktake' | 'team' | 'music' | 'manager'
type ManagerGroup = 'overview' | 'finance' | 'staff' | 'growth' | 'updates' | 'settings'
type FinanceSub = 'sales' | 'forecast' | 'expenses' | 'wages' | 'setup'
type StaffSub = 'directory' | 'roster' | 'swaps' | 'timeoff' | 'training' | 'clockouts'
type GrowthSub = 'reviews' | 'analytics'
type SettingsSub = 'categories' | 'roles' | 'alerts' | 'location'
interface NavGroupDef { key: ManagerGroup; label: string; sub?: { key: string; label: string }[] }
const MANAGER_NAV: NavGroupDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'finance', label: 'Finance', sub: [{ key: 'sales', label: 'Sales' }, { key: 'forecast', label: 'Forecast' }, { key: 'expenses', label: 'Expenses' }, { key: 'wages', label: 'Wages' }, { key: 'setup', label: 'Setup' }] },
  { key: 'staff', label: 'Staff', sub: [{ key: 'directory', label: 'Directory' }, { key: 'roster', label: 'Roster' }, { key: 'swaps', label: 'Swaps' }, { key: 'timeoff', label: 'Time Off' }, { key: 'training', label: 'Training' }, { key: 'clockouts', label: 'Clock-outs' }] },
  { key: 'growth', label: 'Growth', sub: [{ key: 'reviews', label: 'Reviews' }, { key: 'analytics', label: 'Analytics' }] },
  { key: 'updates', label: 'Updates' },
  { key: 'settings', label: 'Settings', sub: [{ key: 'categories', label: 'Categories' }, { key: 'roles', label: 'Roles' }, { key: 'alerts', label: 'Alerts' }, { key: 'location', label: 'Geolocation' }] },
]
function navIcon(key: ManagerGroup, size = 15) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (key) {
    case 'overview': return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
    case 'finance': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5c0-1.4 1.2-2.5 2.5-2.5s2.5.9 2.5 2c0 3-5 1.5-5 4.5 0 1.1 1.2 2 2.5 2s2.5-1.1 2.5-2.5" /></svg>
    case 'staff': return <svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17.5" cy="9" r="2.4" /><path d="M21 20c0-2.5-1.7-4.6-4-5.3" /></svg>
    case 'growth': return <svg {...common}><polyline points="3 17 9 11 13 15 21 6" /><polyline points="14 6 21 6 21 13" /></svg>
    case 'updates': return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 6-2.5 7-2.5 7h17S18 14 18 8Z" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
    case 'settings': return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.32.4.58.72.72.32.13.68.18 1.03.13H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
  }
}
type FinancialsPreset = 'today' | 'yesterday' | '7d' | '30d' | '365d' | 'thisMonth' | 'custom'
type FinancialsMetric = 'gross' | 'net' | 'orders'
// 'reviews', 'checklist' and 'account' are reconstructed in the next pass —
// they're included here now so Overview's navigation buttons already point
// at the right place and don't need touching again once those land.
type TeamSection = 'clock' | 'status' | 'roster' | 'recipes' | 'training' | 'reviews' | 'checklist' | 'account'
type AccountTab = 'clock' | 'swaps' | 'timeoff' | 'availability' | 'pay' | 'security'
type TeamNavTarget = { section: TeamSection; accountTab?: AccountTab }
type RosterFilterMode = 'day' | 'week' | 'employee'
type RosterShift = { id: string; team_member_id: string | null; name: string; job_title: string | null; start_at: string; end_at: string }

interface Item {
  id: number
  name: string
  category: string
  unit: string
  par: number
  qty: number
  createdAt?: string
}

interface TeamMember {
  id: number
  name: string
  role: string
  clockedIn: boolean
  clockIn?: string
  signedOff?: string
  signedOffTime?: string
  avatar: string
  isManager?: boolean
}

function readRememberedProfileId(): number | null {
  try {
    const value = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)
    if (!value) return null
    const id = Number(value)
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

function rememberProfile(id: number) {
  try { window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, String(id)) } catch {}
}

function forgetRememberedProfile() {
  try { window.localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY) } catch {}
}

const INITIAL_ITEMS: Item[] = [
  { id: 1,  name: 'Croissants',           category: 'Fridge',   unit: 'pcs', par: 24,  qty: 18 },
  { id: 2,  name: 'Pain au Chocolat',     category: 'Fridge',   unit: 'pcs', par: 20,  qty: 4 },
  { id: 3,  name: 'Canelés',              category: 'Fridge',   unit: 'pcs', par: 30,  qty: 0 },
  { id: 4,  name: 'Mille-Feuille',        category: 'Fridge',   unit: 'pcs', par: 12,  qty: 9 },
  { id: 5,  name: 'Éclair — Vanilla',     category: 'Fridge',   unit: 'pcs', par: 16,  qty: 11 },
  { id: 6,  name: 'Éclair — Chocolate',   category: 'Fridge',   unit: 'pcs', par: 16,  qty: 3 },
  { id: 7,  name: 'Vanilla Bean Gelato',  category: 'Freezer',  unit: 'L',   par: 5,   qty: 3.5 },
  { id: 8,  name: 'Salted Caramel',       category: 'Freezer',  unit: 'L',   par: 5,   qty: 0 },
  { id: 9,  name: 'Pistachio Sorbet',     category: 'Freezer',  unit: 'L',   par: 4,   qty: 4 },
  { id: 10, name: 'Dark Chocolate',       category: 'Freezer',  unit: 'L',   par: 4,   qty: 1.5 },
  { id: 11, name: 'Lychee Rose Sorbet',   category: 'Freezer',  unit: 'L',   par: 3,   qty: 2.8 },
  { id: 12, name: 'Valrhona 70% Blocks',  category: 'Shelf',  unit: 'kg',  par: 3,   qty: 2.1 },
  { id: 13, name: 'White Couverture',     category: 'Shelf',  unit: 'kg',  par: 2,   qty: 0.4 },
  { id: 14, name: 'Cocoa Powder',         category: 'Shelf',  unit: 'kg',  par: 2,   qty: 1.8 },
  { id: 15, name: 'Truffle — Raspberry',  category: 'Shelf',  unit: 'pcs', par: 40,  qty: 22 },
  { id: 16, name: 'Truffle — Champagne',  category: 'Shelf',  unit: 'pcs', par: 40,  qty: 6 },
  { id: 17, name: 'Espresso Beans',       category: 'Packaging',  unit: 'kg',  par: 2,   qty: 1.2 },
  { id: 18, name: 'Oat Milk',             category: 'Packaging',  unit: 'L',   par: 10,  qty: 7 },
  { id: 19, name: 'Matcha Powder',        category: 'Packaging',  unit: 'g',   par: 500, qty: 120 },
  { id: 20, name: 'Rose Syrup',           category: 'Packaging',  unit: 'mL',  par: 750, qty: 750 },
  { id: 21, name: 'Caster Sugar',         category: 'Cleaning',     unit: 'kg',  par: 5,   qty: 3.5 },
  { id: 22, name: 'Fleur de Sel',         category: 'Cleaning',     unit: 'g',   par: 200, qty: 80 },
  { id: 23, name: 'Vanilla Extract',      category: 'Cleaning',     unit: 'mL',  par: 250, qty: 40 },
  { id: 24, name: 'Edible Gold Leaf',     category: 'Cleaning',     unit: 'pcs', par: 20,  qty: 14 },
]

const INITIAL_TEAM: TeamMember[] = [
  { id: 1, name: 'Sophie Laurent', role: 'Head Pastry Chef',  clockedIn: true,  clockIn: '06:30', signedOff: 'prev', signedOffTime: 'Yesterday, 14:52', avatar: 'SL' },
  { id: 2, name: 'Marcus Tran',    role: 'Sous Chef',         clockedIn: true,  clockIn: '07:15', avatar: 'MT' },
  { id: 3, name: 'Isla Winters',   role: 'Front of House',    clockedIn: true,  clockIn: '09:00', avatar: 'IW' },
  { id: 4, name: 'Remy Dubois',    role: 'Chocolatier',       clockedIn: false, signedOff: 'prev', signedOffTime: 'Yesterday, 15:10', avatar: 'RD' },
  { id: 5, name: 'Chloe Park',     role: 'Pastry Chef',       clockedIn: false, avatar: 'CP' },
  { id: 6, name: 'James Okafor',   role: 'Barista',           clockedIn: true,  clockIn: '08:45', avatar: 'JO' },
]

const INITIAL_CATEGORIES = ['Fridge', 'Freezer', 'Shelf', 'Packaging', 'Cleaning']
const INITIAL_ROLES = ['Head Pastry Chef', 'Sous Chef', 'Pastry Chef', 'Chocolatier', 'Front of House', 'Barista', 'Kitchen Hand']
const UNIT_OPTIONS = ['pcs', 'kg', 'L', 'g', 'mL', 'Sleeves', 'Punnets', 'Units']

let _tempId = -1
const tempId = () => _tempId--

function getStatus(qty: number, par: number): StockStatus {
  const r = qty / par
  if (r === 0) return 'out'
  if (r < 0.3) return 'low'
  return 'ok'
}

// ── Shared style helpers ──────────────────────────────────────────────────────
const glass: CSSProperties = {
  background: 'rgba(255,255,255,0.55)',
  backdropFilter: 'blur(28px) saturate(180%)',
  WebkitBackdropFilter: 'blur(28px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
}
const glassDark: CSSProperties = {
  background: 'rgba(0,0,0,0.86)',
  backdropFilter: 'blur(28px) saturate(180%)',
  WebkitBackdropFilter: 'blur(28px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: '0 4px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)',
}
const glassSubtle: CSSProperties = {
  background: 'rgba(255,255,255,0.32)',
  backdropFilter: 'blur(16px) saturate(150%)',
  WebkitBackdropFilter: 'blur(16px) saturate(150%)',
  border: '1px solid rgba(255,255,255,0.6)',
  boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
}

function mono(extra?: CSSProperties): CSSProperties {
  return { fontFamily: 'JetBrains Mono, monospace', ...extra }
}

// Brand accent used for "forecast"/highlight states across Overview and
// Financials — introduced alongside the low-stock shading pass.
const BRAND_PURPLE = '#BF77F6'

// Monday–Sunday bounds for "this week", used by the staff Overview landing
// page to total up rostered hours.
function currentWeekBounds(): { start: Date; end: Date } {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + diffToMonday)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return { start, end }
}

// Small GSAP-backed "stagger fade + rise in" reveal for a list container —
// re-plays whenever `dep` changes (e.g. the list's item-id signature).
function useStaggerReveal(dep: string) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const children = Array.from(el.children)
    if (children.length === 0) return
    gsap.killTweensOf(children)
    gsap.fromTo(children, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.05, ease: 'power2.out', clearProps: 'transform' })
  }, [dep])
  return ref
}

// Fires a short vibration on devices that support the Vibration API
// (Android Chrome, most non-Apple mobile browsers). iOS Safari has no web
// haptics API at all, so this silently no-ops there — the visual pressed
// state on buttons (see PressableKey below) is what carries the feedback
// on iPhones, with real haptic buzz layered on top wherever it's supported.
function hapticTap() {
  try { navigator.vibrate?.(8) } catch { /* not supported — ignore */ }
}

// Cheeky, randomized splash-screen lines, bucketed by time of day. Picking
// one at random (instead of a single fixed line per bucket) keeps the
// loading screen from feeling repetitive to staff who open the app dozens
// of times a shift — small thing, but it's meant to put a smile on.
const SPLASH_LINES: Record<'night' | 'morning' | 'afternoon' | 'evening', string[]> = {
  night: [
    "Who's up this late? Respect.",
    "Shh… even the espresso machine is asleep.",
    'Night owl mode: activated.',
    'The cafe is dreaming of croissants right now.',
    "Loading quietly, so we don't wake the pastries.",
    'Burning the midnight coffee oil.',
  ],
  morning: [
    "Coffee's brewing. So are we.",
    'Rise and grind — literally.',
    "Good morning! Let's make today deliciously busy.",
    'Warming up faster than the milk steamer.',
    'First one in? Bold move. We like it.',
    'Early bird gets the good pastries.',
  ],
  afternoon: [
    'Midday hustle, loading…',
    'Powering through the lunch rush with you.',
    'Afternoon slump? Not on our watch.',
    'Keeping the good vibes — and the good coffee — flowing.',
    'Halfway through the day, fully caffeinated.',
    'Loading at full steam. Milk pun intended.',
  ],
  evening: [
    'Winding down the shift, one order at a time.',
    'Evening crew, reporting for duty.',
    "The sun's setting, the espresso's not.",
    'Golden hour, gold-star service.',
    "Almost closing time — let's finish strong.",
    'Loading up the last of the day\'s magic.',
  ],
}

function splashBucket(hour: number): keyof typeof SPLASH_LINES {
  if (hour < 5) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

function pickSplashLine(hour: number) {
  const lines = SPLASH_LINES[splashBucket(hour)]
  return lines[Math.floor(Math.random() * lines.length)]
}

// Shared loading state for any section/tab that's mid-fetch — swapped in for
// what used to be a static "Loading…" line so switching screens always
// feels like something is actively happening, not just a stall.
function SectionSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div style={{ ...glass, borderRadius: 16, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ width: 30, height: 30, borderRadius: 99, border: '2.5px solid rgba(0,0,0,0.12)', borderTopColor: 'rgba(0,0,0,0.55)', animation: 'spin 0.7s linear infinite' }} />
      <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)' })}>{label}</div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// 12-hour clock formatting, e.g. "8:05 am" — matches the backend's hhmm()
// format exactly so optimistic local updates never disagree with what
// Square/the server hands back on the next sync.
function formatClock12(d: Date) {
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// Parses either "HH:MM" (legacy 24-hour, still valid for old stored rows)
// or "h:mm am/pm" back into 24-hour hh/mm for elapsed-time math.
function parseClockTime(str: string): { hh: number; mm: number } {
  const m = str.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/)
  if (!m) return { hh: 0, mm: 0 }
  let hh = Number(m[1])
  const mm = Number(m[2])
  const ampm = m[3]?.toUpperCase()
  if (ampm === 'PM' && hh !== 12) hh += 12
  if (ampm === 'AM' && hh === 12) hh = 0
  return { hh, mm }
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '9px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
  background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.12)',
  borderRadius: 8, color: '#000', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: CSSProperties = mono({
  fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
  color: 'rgba(0,0,0,0.4)', marginBottom: 6, display: 'block',
})

// ── Sub-components ────────────────────────────────────────────────────────────
function QtyBar({ qty, par }: { qty: number; par: number }) {
  const pct = Math.min(100, (qty / par) * 100)
  return (
    <div style={{ height: 1, width: '100%', background: 'rgba(0,0,0,0.1)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pct}%`, background: '#000', transition: 'width 0.35s ease' }} />
    </div>
  )
}

function Counter({ value, onChange, unit }: { value: number; onChange: (v: number) => void; unit: string }) {
  const step = unit === 'pcs' || unit === 'g' || unit === 'mL' ? 1 : 0.5
  const btn: CSSProperties = {
    width: 32, height: 32, minWidth: 32, minHeight: 32, padding: 0, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'JetBrains Mono, monospace', fontSize: 15, lineHeight: 1,
    background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 8, color: '#000', cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none', flexShrink: 0,
  }
  return (
    <div className="stock-counter" style={{ display: 'flex', alignItems: 'center', height: 32, gap: 6 }}>
      <button aria-label={`Decrease stock by ${step} ${unit}`} style={btn} onClick={() => onChange(Math.max(0, +(value - step).toFixed(1)))}>−</button>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 2, width: 44 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#000', fontWeight: 600 }}>
          {value % 1 === 0 ? value : value.toFixed(1)}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.06em', color: 'rgba(0,0,0,0.32)' }}>
          {unit}
        </span>
      </span>
      <button aria-label={`Increase stock by ${step} ${unit}`} style={btn} onClick={() => onChange(+(value + step).toFixed(1))}>+</button>
    </div>
  )
}

// Reusable inline-edit list for categories and roles
function TagList({
  items, noun, onAdd, onRename, onDelete, reorderable, onReorder,
}: {
  items: string[]
  noun: string
  onAdd: (v: string) => void
  onRename: (old: string, next: string) => void
  onDelete: (v: string) => void
  reorderable?: boolean
  onReorder?: (newOrder: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [dragItem, setDragItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)

  function submitAdd() {
    const v = draft.trim()
    if (!v || items.includes(v)) return
    onAdd(v)
    setDraft('')
  }

  function submitRename() {
    const v = editValue.trim()
    if (!v || !editTarget || (v !== editTarget && items.includes(v))) return
    onRename(editTarget, v)
    setEditTarget(null)
  }

  // Reordering supports two input styles so it works everywhere: native
  // HTML5 drag-and-drop (desktop pointer/mouse) and explicit up/down
  // buttons (reliable on iOS Safari, which doesn't fire HTML5 drag events
  // for touch).
  function moveItem(item: string, dir: -1 | 1) {
    if (!onReorder) return
    const idx = items.indexOf(item)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= items.length) return
    const next = [...items]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    onReorder(next)
  }

  function handleDrop(target: string) {
    if (!onReorder || !dragItem || dragItem === target) { setDragItem(null); setDragOverItem(null); return }
    const from = items.indexOf(dragItem)
    const to = items.indexOf(target)
    if (from === -1 || to === -1) { setDragItem(null); setDragOverItem(null); return }
    const next = [...items]
    next.splice(from, 1)
    next.splice(to, 0, dragItem)
    onReorder(next)
    setDragItem(null); setDragOverItem(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item, idx) => (
        <div key={item}
          draggable={!!reorderable && editTarget !== item && confirmDel !== item}
          onDragStart={() => setDragItem(item)}
          onDragOver={e => { if (reorderable) { e.preventDefault(); setDragOverItem(item) } }}
          onDragLeave={() => setDragOverItem(prev => (prev === item ? null : prev))}
          onDrop={e => { e.preventDefault(); handleDrop(item) }}
          onDragEnd={() => { setDragItem(null); setDragOverItem(null) }}
          style={{
            ...glass, borderRadius: 10, overflow: 'hidden',
            opacity: dragItem === item ? 0.4 : 1,
            outline: dragOverItem === item && dragItem && dragItem !== item ? '2px solid rgba(0,0,0,0.3)' : 'none',
            outlineOffset: -2,
          }}
        >
          {editTarget === item ? (
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', alignItems: 'center' }}>
              <input
                autoFocus
                style={{ ...inputStyle, flex: 1, padding: '6px 10px' }}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditTarget(null) }}
              />
              <button onClick={submitRename} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Save</button>
              <button onClick={() => setEditTarget(null)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.45)', fontSize: 12, cursor: 'pointer' }}>✕</button>
            </div>
          ) : confirmDel === item ? (
            <div style={{ display: 'flex', gap: 10, padding: '10px 14px', alignItems: 'center' }}>
              <span style={{ flex: 1, fontSize: 13, color: '#000' }}>Delete <strong>{item}</strong>?</span>
              <button onClick={() => { onDelete(item); setConfirmDel(null) }} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Delete</button>
              <button onClick={() => setConfirmDel(null)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.45)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', gap: 10 }}>
              {reorderable && (
                <span
                  title="Drag to reorder"
                  style={{ cursor: 'grab', color: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', flexShrink: 0, touchAction: 'none' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="8" cy="6" r="1.6"/><circle cx="16" cy="6" r="1.6"/>
                    <circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/>
                    <circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/>
                  </svg>
                </span>
              )}
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#000' }}>{item}</span>
              {reorderable && (
                <>
                  <button
                    onClick={() => moveItem(item, -1)} disabled={idx === 0} title="Move up"
                    style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', background: 'transparent', cursor: idx === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: idx === 0 ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.4)', flexShrink: 0 }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                  <button
                    onClick={() => moveItem(item, 1)} disabled={idx === items.length - 1} title="Move down"
                    style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', background: 'transparent', cursor: idx === items.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: idx === items.length - 1 ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.4)', flexShrink: 0 }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </>
              )}
              <button
                onClick={() => { setEditTarget(item); setEditValue(item); setConfirmDel(null) }}
                style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.4)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                onClick={() => { setConfirmDel(item); setEditTarget(null) }}
                style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.35)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Add row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder={`New ${noun}...`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitAdd()}
        />
        <button
          onClick={submitAdd}
          disabled={!draft.trim() || items.includes(draft.trim())}
          style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: draft.trim() && !items.includes(draft.trim()) ? '#000' : 'rgba(0,0,0,0.12)', color: draft.trim() && !items.includes(draft.trim()) ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
        >
          + Add
        </button>
      </div>
    </div>
  )
}

// ── Item Edit Drawer ──────────────────────────────────────────────────────────
function ItemEditDrawer({ item, categories, onSave, onDelete, onCancel }: {
  item: Item
  categories: string[]
  onSave: (patch: Partial<Omit<Item, 'id'>>) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState(item.category)
  const [unit, setUnit] = useState(item.unit)
  const [par, setPar] = useState(String(item.par))
  const [confirmDel, setConfirmDel] = useState(false)

  const valid = name.trim() && +par > 0

  function save() {
    if (!valid) return
    onSave({ name: name.trim(), category, unit, par: +par })
  }

  const field: CSSProperties = { ...inputStyle, padding: '7px 10px', fontSize: 12 }
  const lbl: CSSProperties = { ...labelStyle, marginBottom: 4 }

  return (
    <div className="item-edit-drawer" style={{ borderTop: '1px solid rgba(0,0,0,0.07)', background: 'rgba(0,0,0,0.03)', padding: '16px 20px 18px' }}>
      {/* Fields */}
      <div className="item-edit-fields" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={lbl}>Name</label>
          <input aria-label="Item name" style={field} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} autoFocus />
        </div>
        <div>
          <label style={lbl}>Category</label>
          <select aria-label="Item category" style={{ ...field, appearance: 'none' }} value={category} onChange={e => setCategory(e.target.value)}>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Unit</label>
          <select aria-label="Item unit" style={{ ...field, appearance: 'none' }} value={unit} onChange={e => setUnit(e.target.value)}>
            {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>PAR</label>
          <input aria-label="Target stock level" style={field} type="number" step="any" value={par} onChange={e => setPar(e.target.value)} min={0.01} onKeyDown={e => e.key === 'Enter' && save()} />
        </div>
      </div>

      {/* Actions */}
      {confirmDel ? (
        /* Delete confirmation row */
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#000' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ flex: 1, fontSize: 12, color: '#000' }}>Delete <strong>{item.name}</strong> permanently?</span>
          <button onClick={onDelete} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#000', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em' }}>Delete</button>
          <button onClick={() => setConfirmDel(false)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 11, cursor: 'pointer' }}>Keep</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Save */}
          <button onClick={save} disabled={!valid}
            style={{ height: 32, padding: '0 18px', borderRadius: 8, border: 'none', background: valid ? '#000' : 'rgba(0,0,0,0.1)', color: valid ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 12, fontWeight: 500, cursor: valid ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
            Save
          </button>
          {/* Cancel */}
          <button onClick={onCancel}
            style={{ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', color: 'rgba(0,0,0,0.45)', fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>

          <div style={{ flex: 1 }} />

          {/* Delete */}
          <button onClick={() => setConfirmDel(true)}
            style={{ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(0,0,0,0.4)', transition: 'all 0.15s' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            <span style={mono({ fontSize: 9, letterSpacing: '0.13em', textTransform: 'uppercase' })}>Delete item</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Add Item Modal ─────────────────────────────────────────────────────────────
function AddItemModal({ categories, onAdd, onClose }: { categories: string[]; onAdd: (item: Omit<Item, 'id'>) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(categories[0] ?? '')
  const [unit, setUnit] = useState(UNIT_OPTIONS[0])
  const [par, setPar] = useState('')
  const [qty, setQty] = useState('')
  const valid = name.trim() && +par > 0 && +qty >= 0

  function submit() {
    if (!valid) return
    onAdd({ name: name.trim(), category, unit, par: +par, qty: +qty })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      <div style={{ ...glass, position: 'relative', borderRadius: 20, padding: 32, width: '100%', maxWidth: 440, zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#000', letterSpacing: '-0.02em' }}>Add New Item</div>
          <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: 99, cursor: 'pointer', fontSize: 14, color: '#000' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>Item Name</label>
            <input style={inputStyle} placeholder="e.g. Mango Sorbet" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={{ ...inputStyle, appearance: 'none' }} value={category} onChange={e => setCategory(e.target.value)}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Unit</label>
              <select style={{ ...inputStyle, appearance: 'none' }} value={unit} onChange={e => setUnit(e.target.value)}>
                {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>PAR Level</label>
              <input style={inputStyle} type="number" placeholder="e.g. 24" value={par} onChange={e => setPar(e.target.value)} min={1} />
            </div>
            <div>
              <label style={labelStyle}>Current Qty</label>
              <input style={inputStyle} type="number" placeholder="e.g. 12" value={qty} onChange={e => setQty(e.target.value)} min={0} />
            </div>
          </div>
          <button
            onClick={submit} disabled={!valid}
            style={{ marginTop: 8, padding: '12px 24px', borderRadius: 10, border: 'none', background: valid ? '#000' : 'rgba(0,0,0,0.15)', color: valid ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 13, fontWeight: 500, cursor: valid ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
          >
            Add to Stocktake
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Team View ──────────────────────────────────────────────────────────────────
// ── Analog clock face (SVG, ticks every second) ─────────────────────────────
function AnalogClock({ size = 176 }: { size?: number }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const s = now.getSeconds()
  const m = now.getMinutes()
  const h = now.getHours() % 12
  const secDeg = s * 6
  const minDeg = m * 6 + s * 0.1
  const hourDeg = h * 30 + m * 0.5
  const hand = (deg: number, len: number, width: number, color: string) => {
    const rad = (deg * Math.PI) / 180
    return <line x1="100" y1="100" x2={100 + len * Math.sin(rad)} y2={100 - len * Math.cos(rad)} stroke={color} strokeWidth={width} strokeLinecap="round" />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="97" fill="rgba(255,255,255,0.55)" stroke="rgba(0,0,0,0.12)" strokeWidth="1.5" />
      {[...Array(12)].map((_, i) => {
        const angle = (i * 30 * Math.PI) / 180
        const x1 = 100 + 82 * Math.sin(angle), y1 = 100 - 82 * Math.cos(angle)
        const x2 = 100 + 91 * Math.sin(angle), y2 = 100 - 91 * Math.cos(angle)
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(0,0,0,0.28)" strokeWidth={i % 3 === 0 ? 2.5 : 1.2} />
      })}
      {hand(hourDeg, 44, 4.5, '#000')}
      {hand(minDeg, 64, 3, '#000')}
      {hand(secDeg, 72, 1.4, 'rgba(0,0,0,0.4)')}
      <circle cx="100" cy="100" r="4" fill="#000" />
    </svg>
  )
}

// ── Clock In/Out — its own minimal, interactive section ─────────────────────
// Swipe-to-confirm slider — mirrors the "slide to unlock" pattern so clocking
// in/out on a shared shop-floor device takes a deliberate drag, not a stray
// tap. Works with mouse and touch via pointer events.
function SwipeToConfirm({ label, clockedIn, elapsedShort, onConfirm }: { label: string; clockedIn: boolean; elapsedShort?: string; onConfirm: () => boolean | Promise<boolean> }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [feedback, setFeedback] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [activeLabel, setActiveLabel] = useState(label)
  const THUMB = 52

  function trackWidth() { return trackRef.current?.clientWidth ?? 280 }
  function clamp(x: number) { return Math.max(0, Math.min(x, trackWidth() - THUMB)) }

  function onPointerDown(e: ReactPointerEvent) {
    if (feedback !== 'idle') return
    (e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!dragging || !trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    setDragX(clamp(e.clientX - rect.left - THUMB / 2))
  }
  async function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    const max = trackWidth() - THUMB
    if (max > 0 && dragX / max >= 0.82) {
      setDragX(max)
      setActiveLabel(label)
      setFeedback('pending')
      hapticTap()
      const confirmed = await onConfirm()
      setFeedback(confirmed ? 'success' : 'error')
      if (confirmed) hapticTap()
      setTimeout(() => {
        setFeedback('idle')
        setDragX(0)
      }, confirmed ? 900 : 1400)
    } else {
      setDragX(0)
    }
  }

  const max = Math.max(1, trackWidth() - THUMB)
  const progress = dragX / max
  const feedbackText = feedback === 'pending'
    ? (activeLabel === 'clock in' ? 'Clocking in…' : 'Preparing…')
    : feedback === 'success'
      ? (activeLabel === 'clock in' ? 'Clocked in' : 'Checklist ready')
      : feedback === 'error' ? 'Not confirmed — retry' : `Slide to ${label}`

  return (
    <div
      ref={trackRef}
      className={feedback === 'success' ? 'clock-swipe-success' : undefined}
      aria-live="polite"
      style={{ position: 'relative', width: '100%', maxWidth: 320, height: THUMB, borderRadius: 99, background: feedback === 'success' ? BRAND_PURPLE : feedback === 'error' ? '#7f1d1d' : clockedIn ? 'rgba(0,0,0,0.06)' : '#000', touchAction: 'none', userSelect: 'none', transition: 'background 0.25s ease' }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: 99, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: feedback === 'idle' ? Math.max(0, 1 - progress * 1.6) : 1, transition: dragging ? 'none' : 'opacity 0.2s' }}>
        <span style={mono({ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: feedback === 'idle' && clockedIn ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.82)' })}>
          {feedbackText}{feedback === 'idle' ? ' ›' : ''}
        </span>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'absolute', top: 2, left: 2, width: THUMB - 4, height: THUMB - 4, borderRadius: 99,
          background: clockedIn ? '#000' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: feedback === 'idle' ? 'grab' : 'default', transform: `translateX(${dragX}px) scale(${feedback === 'success' ? 1.08 : 1})`, transition: dragging ? 'none' : 'transform 0.25s ease',
          boxShadow: clockedIn ? `0 2px 8px rgba(0,0,0,0.25), 0 0 0 2px #fff, 0 0 0 4px ${BRAND_PURPLE}` : '0 2px 8px rgba(0,0,0,0.25)',
        }}
      >
        {feedback === 'pending' ? (
          <span className="clock-spinner" aria-hidden="true" />
        ) : feedback === 'success' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={clockedIn ? '#fff' : '#000'} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
        ) : feedback === 'error' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={clockedIn ? '#fff' : '#000'} strokeWidth={2.5} strokeLinecap="round"><path d="M7 7l10 10M17 7 7 17" /></svg>
        ) : clockedIn && elapsedShort ? (
          <span style={mono({ fontSize: 8, letterSpacing: '0.02em', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' })}>{elapsedShort}</span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={clockedIn ? '#fff' : '#000'} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        )}
      </div>
    </div>
  )
}

const GLOVES_REMINDER_MESSAGES = [
  "Bare hands make great fingerprints, not great açaí bowls. Gloves and a headband on before you touch anything.",
  "Nobody wants a side of you with their smoothie. Gloves and headband, please.",
  "Your hands are lovely. The scoop cookies still don't want them touching directly. Gloves and headband on.",
  "Nobody wants a splash of you in their matcha. Gloves and headband, thanks.",
  "Great hairstyle for a night out, less great for the yogurt bowls. Headband and gloves, champion.",
  "We appreciate the enthusiasm, not the fingerprints. Gloves and headband before you dive into those pancakes.",
  "The scoop cookies are judgmental about bare hands. Suit up: gloves, headband, let's go.",
  "Fresh shift, fresh gloves, fresh headband. Let's not reenact a crime scene in the açaí bowls.",
  "Nobody's saying you're germy. Everybody's saying wear the gloves anyway.",
  "Big 'about to touch everything with bare hands' energy detected. Please don't. Gloves and headband.",
  "The sauces don't need a personal touch, literally. Gloves and headband before you start prep.",
  "Your hands have had quite a day already. The smoothies haven't consented. Gloves on.",
]

function ClockSection({ me, onClockToggle, managerPin }: { me: TeamMember | null; onClockToggle: (m: TeamMember) => Promise<boolean>; managerPin?: string | null }) {
  const [, tick] = useState(0)
  const [showGlovesReminder, setShowGlovesReminder] = useState(false)
  const [glovesMessage, setGlovesMessage] = useState(GLOVES_REMINDER_MESSAGES[0])
  const [showCloseChecklist, setShowCloseChecklist] = useState(false)
  const [checklistChecks, setChecklistChecks] = useState<Record<string, boolean>>({})
  const [clockOutFeedback, setClockOutFeedback] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [pushReady, setPushReady] = useState(false)
  const [pushMessage, setPushMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!me || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    navigator.serviceWorker.getRegistration('/sw.js').then(async reg => {
      if (reg && Notification.permission === 'granted' && await reg.pushManager.getSubscription()) setPushReady(true)
    }).catch(() => {})
  }, [me?.id])

  async function enableClockoutPush() {
    if (!me) return
    if (IS_DRAFT_MODE) { setPushMessage('Phone notifications are disabled in this sample preview.'); return }
    try {
      const enabled = await api.enablePushForTeam(me.id, me.isManager ? managerPin ?? undefined : undefined)
      setPushReady(enabled)
      setPushMessage(enabled ? 'Phone reminders are enabled for this profile.' : 'Notifications were not enabled. On iPhone, add this app to your Home Screen, then allow notifications.')
    } catch (e) { setPushMessage(e instanceof Error ? e.message : 'Could not enable phone reminders.') }
  }

  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  if (!me) {
    return <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>Select a profile to clock in.</div>
  }

  let elapsedLabel = ''
  let elapsedShort = ''
  if (me.clockedIn && me.clockIn) {
    const { hh, mm } = parseClockTime(me.clockIn)
    const start = new Date()
    start.setHours(hh, mm, 0, 0)
    let diffMs = Date.now() - start.getTime()
    if (diffMs < 0) diffMs += 24 * 3600 * 1000
    const totalMin = Math.floor(diffMs / 60000)
    elapsedShort = `${Math.floor(totalMin / 60)}h${(totalMin % 60).toString().padStart(2, '0')}m`
    elapsedLabel = `${elapsedShort} on shift`
  }

  const CLOSE_ITEMS = [
    { key: 'stocktake', label: "Finished tonight's stocktake" },
    { key: 'money', label: 'Counted and locked away the till' },
    { key: 'closing', label: 'Closing checklist done (lights, doors, fridges)' },
  ]

  async function handleSlideConfirm(): Promise<boolean> {
    if (me!.clockedIn) {
      setChecklistChecks({})
      setClockOutFeedback('idle')
      setShowCloseChecklist(true)
      return true
    } else {
      const confirmed = await onClockToggle(me!)
      if (confirmed) {
        setGlovesMessage(GLOVES_REMINDER_MESSAGES[Math.floor(Math.random() * GLOVES_REMINDER_MESSAGES.length)])
        setTimeout(() => setShowGlovesReminder(true), 650)
      }
      return confirmed
    }
  }

  async function confirmClockOut() {
    if (clockOutFeedback === 'pending' || clockOutFeedback === 'success') return
    setClockOutFeedback('pending')
    const [confirmed] = await Promise.all([
      onClockToggle(me!),
      new Promise<void>(resolve => setTimeout(resolve, 450)),
    ])
    if (!confirmed) {
      setClockOutFeedback('error')
      return
    }
    setClockOutFeedback('success')
    hapticTap()
    setTimeout(() => {
      setShowCloseChecklist(false)
      setClockOutFeedback('idle')
    }, 900)
  }

  return (
    <div style={{ ...glass, borderRadius: 24, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <AnalogClock />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: '#000' }}>{me.name}</div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginTop: 6 })}>
          {me.clockedIn ? elapsedLabel : 'Not clocked in'}
        </div>
      </div>
      <SwipeToConfirm label={me.clockedIn ? 'clock out' : 'clock in'} clockedIn={me.clockedIn} elapsedShort={elapsedShort} onConfirm={handleSlideConfirm} />
      {!pushReady && <button type="button" onClick={enableClockoutPush} style={{ padding: '9px 14px', borderRadius: 99, border: '1px solid rgba(0,0,0,0.15)', background: 'rgba(255,255,255,0.62)', cursor: 'pointer', fontSize: 12 }}>Enable phone clock-out reminders</button>}
      {pushMessage && <div role="status" style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)', textAlign: 'center' }}>{pushMessage}</div>}

      {showGlovesReminder && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowGlovesReminder(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
          <div style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', border: '1px solid rgba(255,255,255,0.82)', boxShadow: '0 24px 64px rgba(0,0,0,0.14)', borderRadius: 24, padding: '28px 26px', width: '90%', maxWidth: 340, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🧤</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#000', marginBottom: 8 }}>You're clocked in</div>
            <div style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.55)', lineHeight: 1.5, marginBottom: 20 }}>
              {glovesMessage}
            </div>
            <button onClick={() => setShowGlovesReminder(false)}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '12px 32px', borderRadius: 99, cursor: 'pointer', border: 'none', background: '#000', color: '#fff', fontWeight: 500 }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {showCloseChecklist && (
        <div onClick={e => { if (e.target === e.currentTarget && clockOutFeedback !== 'pending' && clockOutFeedback !== 'success') setShowCloseChecklist(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
          <div style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', border: '1px solid rgba(255,255,255,0.82)', boxShadow: '0 24px 64px rgba(0,0,0,0.14)', borderRadius: 24, padding: '28px 26px', width: '90%', maxWidth: 360 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#000', marginBottom: 4, textAlign: 'center' }}>Have you finished these?</div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginBottom: 18, textAlign: 'center' }}>Before you clock out</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
              {CLOSE_ITEMS.map(item => {
                const done = !!checklistChecks[item.key]
                return (
                  <button key={item.key} onClick={() => setChecklistChecks(c => ({ ...c, [item.key]: !c[item.key] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)', background: done ? 'rgba(0,0,0,0.04)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 22, height: 22, minWidth: 22, borderRadius: 7, border: `1.5px solid ${done ? '#000' : 'rgba(0,0,0,0.25)'}`, background: done ? '#000' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                      {done && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <span style={{ fontSize: 13, color: '#000' }}>{item.label}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowCloseChecklist(false)} disabled={clockOutFeedback === 'pending' || clockOutFeedback === 'success'}
                style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '12px', borderRadius: 99, cursor: clockOutFeedback === 'pending' || clockOutFeedback === 'success' ? 'default' : 'pointer', border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.6)', opacity: clockOutFeedback === 'pending' || clockOutFeedback === 'success' ? 0.45 : 1 }}>
                Not Yet
              </button>
              <button onClick={confirmClockOut} disabled={clockOutFeedback === 'pending' || clockOutFeedback === 'success'} aria-live="polite"
                className={clockOutFeedback === 'success' ? 'clock-swipe-success' : undefined}
                style={{ flex: 1, minHeight: 40, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '12px', borderRadius: 99, cursor: clockOutFeedback === 'pending' || clockOutFeedback === 'success' ? 'default' : 'pointer', border: 'none', background: clockOutFeedback === 'success' ? BRAND_PURPLE : clockOutFeedback === 'error' ? '#7f1d1d' : '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.25s ease' }}>
                {clockOutFeedback === 'pending' && <span className="clock-spinner" aria-hidden="true" />}
                {clockOutFeedback === 'success' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>}
                {clockOutFeedback === 'pending' ? 'Clocking out…' : clockOutFeedback === 'success' ? 'Clocked out' : clockOutFeedback === 'error' ? 'Try again' : 'Yes, Clock Out'}
              </button>
            </div>
            {clockOutFeedback === 'error' && <div role="alert" style={mono({ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7f1d1d', marginTop: 10, textAlign: 'center' })}>Clock-out wasn't confirmed. Please try again.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Roster — Day / Week / Per-employee filtered views ───────────────────────
function RosterSection({ roster, loadingRoster, onLoadRoster }: { roster: RosterShift[]; loadingRoster: boolean; onLoadRoster: () => void }) {
  const [mode, setMode] = useState<RosterFilterMode>('week')
  const [dayOffset, setDayOffset] = useState(0)
  const [employee, setEmployee] = useState<string>('')

  useEffect(() => { onLoadRoster() }, [])

  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })
  const timeLabel = (s: RosterShift) => {
    const start = new Date(s.start_at), end = new Date(s.end_at)
    return `${start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}–${end.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}`
  }
  const sameDay = (iso: string, d: Date) => new Date(iso).toDateString() === d.toDateString()

  const employees = [...new Set(roster.map(s => s.name))].sort()

  const ShiftRow = ({ s, showDay }: { s: RosterShift; showDay?: boolean }) => (
    <div style={{ ...glass, borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 38, height: 38, borderRadius: 99, background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: '#000' }}>
        {s.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{s.name}</div>
        {showDay && <div style={mono({ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>{dayLabel(s.start_at)}</div>}
      </div>
      <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.55)' })}>{timeLabel(s)}</div>
    </div>
  )

  const MODES: { key: RosterFilterMode; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'employee', label: 'Employee' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2 }}>
          {MODES.map(md => (
            <button key={md.key} onClick={() => setMode(md.key)}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: mode === md.key ? '#000' : 'transparent', color: mode === md.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: mode === md.key ? 500 : 400 }}>
              {md.label}
            </button>
          ))}
        </div>
        <button onClick={onLoadRoster} disabled={loadingRoster} title="Refresh from Square"
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: loadingRoster ? 'default' : 'pointer', transition: 'all 0.2s', background: 'rgba(0,0,0,0.07)', color: '#000', border: '1px solid rgba(0,0,0,0.12)', opacity: loadingRoster ? 0.5 : 1 }}>
          {loadingRoster ? 'Loading…' : '⟳ Refresh'}
        </button>
      </div>

      {loadingRoster && roster.length === 0 && <SectionSpinner label="Loading roster…" />}

      {!(loadingRoster && roster.length === 0) && mode === 'day' && (() => {
        const day = new Date(); day.setDate(day.getDate() + dayOffset)
        const shifts = roster.filter(s => sameDay(s.start_at, day)).sort((a, b) => a.start_at.localeCompare(b.start_at))
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <button onClick={() => setDayOffset(o => o - 1)} style={{ width: 28, height: 28, borderRadius: 99, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', color: 'rgba(0,0,0,0.5)' }}>‹</button>
              <div style={mono({ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.5)' })}>
                {dayOffset === 0 ? 'Today — ' : ''}{day.toLocaleDateString('en-AU', { weekday: 'long', day: '2-digit', month: 'short' })}
              </div>
              <button onClick={() => setDayOffset(o => o + 1)} style={{ width: 28, height: 28, borderRadius: 99, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', color: 'rgba(0,0,0,0.5)' }}>›</button>
            </div>
            {shifts.length === 0
              ? <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No shifts this day.</div>
              : shifts.map(s => <ShiftRow key={s.id} s={s} />)}
          </div>
        )
      })()}

      {!(loadingRoster && roster.length === 0) && mode === 'week' && (() => {
        const byDay = new Map<string, RosterShift[]>()
        for (const s of roster) {
          const key = new Date(s.start_at).toDateString()
          if (!byDay.has(key)) byDay.set(key, [])
          byDay.get(key)!.push(s)
        }
        const days = [...byDay.keys()].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
        return days.length === 0
          ? <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No published shifts.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {days.map(key => {
                const shifts = byDay.get(key)!.sort((a, b) => a.start_at.localeCompare(b.start_at))
                return (
                  <div key={key}>
                    <div style={mono({ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>{dayLabel(shifts[0].start_at)}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {shifts.map(s => <ShiftRow key={s.id} s={s} />)}
                    </div>
                  </div>
                )
              })}
            </div>
          )
      })()}

      {!(loadingRoster && roster.length === 0) && mode === 'employee' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <select value={employee} onChange={e => setEmployee(e.target.value)} style={{ ...inputStyle, appearance: 'none', maxWidth: 260 }}>
            <option value="">All employees</option>
            {employees.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          {(() => {
            const shifts = roster.filter(s => !employee || s.name === employee).sort((a, b) => a.start_at.localeCompare(b.start_at))
            return shifts.length === 0
              ? <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No shifts found.</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{shifts.map(s => <ShiftRow key={s.id} s={s} showDay />)}</div>
          })()}
        </div>
      )}
    </div>
  )
}

const iconBtnStyle: CSSProperties = { width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.4)', flexShrink: 0, cursor: 'pointer' }

function mondayOf(d: Date) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

// ── Manager Roster editor — full read/write control over the Square-backed
// roster: create/move/resize draft shifts, copy the whole week forward, and
// publish with an optional staff notification. This is the manager-only
// counterpart to the read-only RosterSection above (which staff see under
// Team > Roster and which Manager > Staff > Roster used to just reuse).
function ManagerRosterEditSection({ team, sessionPin }: { team: TeamMember[]; sessionPin: string | null }) {
  const [pin, setPin] = useState('')
  const [managerPin, setManagerPin] = useState<string | null>(sessionPin)
  const [pinError, setPinError] = useState(false)
  const [checkingPin, setCheckingPin] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [data, setData] = useState<api.ManagerRosterData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editing, setEditing] = useState<{ teamId: number; day: Date; shift?: api.ManagerRosterShift; timeOff?: api.ManagerRosterTimeOff } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [copying, setCopying] = useState(false)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const [showPublish, setShowPublish] = useState(false)
  const [notifyStaff, setNotifyStaff] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState<string | null>(null)
  const [dragShiftId, setDragShiftId] = useState<string | null>(null)

  function fmtDate(d: Date) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }
  function addDays(d: Date, n: number) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd }
  const weekEnd = addDays(weekStart, 6)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  async function load(pinValue: string) {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await api.managerRoster(pinValue, fmtDate(weekStart), fmtDate(weekEnd))
      setData(res)
      setManagerPin(pinValue)
      setPinError(false)
    } catch (e) {
      if (!data) { setPinError(true); setPin('') } else { setLoadError(e instanceof Error ? e.message : 'Could not load roster') }
    } finally {
      setLoading(false)
      setCheckingPin(false)
    }
  }

  useEffect(() => { if (managerPin) load(managerPin) }, [weekStart.getTime()])

  async function handlePin(k: string) {
    if (checkingPin) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(false); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) { setCheckingPin(true); await load(next) }
  }

  function shiftsFor(teamId: number, day: Date) {
    if (!data) return []
    const ds = fmtDate(day)
    return data.shifts.filter(s => s.teamId === teamId && s.startAt.slice(0, 10) === ds)
  }

  // Approved time off overlapping this day, if any — the backend already scopes
  // data.timeOff to status "approved" and to the visible week window.
  function timeOffFor(teamId: number, day: Date) {
    if (!data) return undefined
    const ds = fmtDate(day)
    return data.timeOff.find(t => t.team_id === teamId && t.start_date <= ds && t.end_date >= ds)
  }
  function timeOffThisWeek(teamId: number) {
    return data ? data.timeOff.filter(t => t.team_id === teamId) : []
  }
  function fmtShort(ds: string) {
    return new Date(`${ds}T00:00:00`).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
  }

  async function saveShift(startTime: string, endTime: string, notes: string) {
    if (!managerPin || !editing) return
    setSaving(true)
    setSaveError(null)
    try {
      const ds = fmtDate(editing.day)
      const startAt = `${ds}T${startTime}:00+10:00`
      const endAt = `${ds}T${endTime}:00+10:00`
      if (editing.shift) {
        await api.updateManagerShift(editing.shift.id, managerPin, editing.teamId, editing.shift.version, { startAt, endAt, notes: notes || undefined })
      } else {
        await api.createManagerShift(managerPin, editing.teamId, startAt, endAt, notes || undefined)
      }
      setEditing(null)
      await load(managerPin)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save shift')
    } finally {
      setSaving(false)
    }
  }

  async function deleteShift() {
    if (!managerPin || !editing?.shift) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.deleteManagerShift(editing.shift.id, managerPin)
      setEditing(null)
      await load(managerPin)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not delete shift')
    } finally {
      setSaving(false)
    }
  }

  async function moveShift(shift: api.ManagerRosterShift, targetTeamId: number, targetDay: Date) {
    if (!managerPin) return
    const origStart = new Date(shift.startAt)
    const durationMs = new Date(shift.endAt).getTime() - origStart.getTime()
    const ds = fmtDate(targetDay)
    const hh = String(origStart.getHours()).padStart(2, '0')
    const mm = String(origStart.getMinutes()).padStart(2, '0')
    const startAt = `${ds}T${hh}:${mm}:00+10:00`
    const endAt = new Date(new Date(startAt).getTime() + durationMs).toISOString()
    try {
      await api.updateManagerShift(shift.id, managerPin, targetTeamId, shift.version, { startAt, endAt })
      await load(managerPin)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not move shift')
    }
  }

  async function copyToNextWeek() {
    if (!managerPin || !data) return
    const weekShifts = data.shifts.filter(s => s.teamId)
    if (weekShifts.length === 0) { setCopyMsg('Nothing to copy this week.'); return }
    setCopying(true)
    setCopyMsg(null)
    try {
      let count = 0
      for (const s of weekShifts) {
        const startAt = new Date(new Date(s.startAt).getTime() + 7 * 86400000).toISOString()
        const endAt = new Date(new Date(s.endAt).getTime() + 7 * 86400000).toISOString()
        await api.createManagerShift(managerPin, s.teamId!, startAt, endAt, s.notes || undefined)
        count++
      }
      setCopyMsg(`Copied ${count} shift${count === 1 ? '' : 's'} to next week.`)
    } catch (e) {
      setCopyMsg(e instanceof Error ? e.message : 'Copy failed partway through — check next week before publishing.')
    } finally {
      setCopying(false)
    }
  }

  async function doPublish() {
    if (!managerPin) return
    setPublishing(true)
    setPublishMsg(null)
    try {
      const res = await api.publishManagerRoster(managerPin, fmtDate(weekStart), fmtDate(weekEnd), notifyStaff)
      setPublishMsg(res.published === 0 ? 'Nothing to publish — no draft shifts this week.' : `Published ${res.published} shift${res.published === 1 ? '' : 's'}${res.notified ? `, notified ${res.notified} staff` : ''}.`)
      await load(managerPin)
    } catch (e) {
      setPublishMsg(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  const unpublishedCount = data ? data.shifts.filter(s => s.teamId && !s.isPublished).length : 0

  if (!managerPin) {
    return (
      <div style={{ ...glass, borderRadius: 20, padding: '40px 32px', textAlign: 'center', maxWidth: 340, margin: '0 auto' }}>
        <div style={{ width: 46, height: 46, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 4 }}>Manager PIN required</div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 28 })}>Publishing shifts notifies staff</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                disabled={k === '' || checkingPin}
                onPointerDown={() => { if (k && !checkingPin) { setPressedKey(k); hapticTap() } }}
                onPointerUp={() => setPressedKey(null)}
                onPointerLeave={() => setPressedKey(null)}
                onPointerCancel={() => setPressedKey(null)}
                onClick={() => k && handlePin(k)}
                style={{ width: 58, height: 58, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.7)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.5)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 16 : 19, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checkingPin ? 0.5 : 1 }}
              >{k}</button>
            </div>
          ))}
        </div>
        {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginTop: 4 })}>Incorrect PIN — try again</div>}
        {checkingPin && !pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>Checking…</div>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setWeekStart(w => addDays(w, -7))} style={iconBtnStyle}>‹</button>
          <div style={mono({ fontSize: 11, letterSpacing: '0.1em', color: 'rgba(0,0,0,0.6)' })}>
            {weekStart.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} – {weekEnd.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
          </div>
          <button onClick={() => setWeekStart(w => addDays(w, 7))} style={iconBtnStyle}>›</button>
          <button onClick={() => setWeekStart(mondayOf(new Date()))} style={{ ...iconBtnStyle, width: 'auto', padding: '0 10px', ...mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }) }}>This week</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyToNextWeek} disabled={copying || loading} style={{ ...mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }), padding: '8px 14px', borderRadius: 99, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.6)', cursor: copying ? 'default' : 'pointer', opacity: copying ? 0.5 : 1 }}>
            {copying ? 'Copying…' : 'Copy to next week'}
          </button>
          <button onClick={() => setShowPublish(true)} disabled={loading} style={{ ...mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }), padding: '8px 14px', borderRadius: 99, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            Publish
            {unpublishedCount > 0 && <span style={{ background: BRAND_PURPLE, color: '#fff', borderRadius: 99, minWidth: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unpublishedCount}</span>}
          </button>
        </div>
      </div>

      {copyMsg && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.45)' })}>{copyMsg}</div>}
      {loadError && <div style={mono({ fontSize: 10, color: 'rgba(180,40,40,0.75)' })}>{loadError}</div>}

      {loading && !data ? (
        <SectionSpinner label="Loading roster…" />
      ) : data && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(7, minmax(120px, 1fr))`, gap: 6, minWidth: 900 }}>
            <div />
            {days.map(d => (
              <div key={d.toISOString()} style={{ textAlign: 'center', ...mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' }) }}>
                {d.toLocaleDateString('en-AU', { weekday: 'short' })}<br />
                <span style={{ color: 'rgba(0,0,0,0.6)', fontWeight: 600 }}>{d.getDate()}</span>
              </div>
            ))}
            {data.staff.map(s => {
              const weekOff = timeOffThisWeek(s.teamId)
              return (
              <Fragment key={s.teamId}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {team.find(t => t.id === s.teamId)?.avatar ?? s.avatar}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name.split(' ')[0]}</div>
                    {weekOff.length > 0 && (
                      <div title={weekOff.map(t => `Time off ${fmtShort(t.start_date)} – ${fmtShort(t.end_date)}`).join(', ')}
                        style={mono({ fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: BRAND_PURPLE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}>
                        ⚠ Time off
                      </div>
                    )}
                  </div>
                </div>
                {days.map(d => {
                  const cellShifts = shiftsFor(s.teamId, d)
                  const offEntry = timeOffFor(s.teamId, d)
                  return (
                    <div
                      key={d.toISOString()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault()
                        const shiftId = e.dataTransfer.getData('text/plain')
                        const shift = data.shifts.find(sh => sh.id === shiftId)
                        if (shift) moveShift(shift, s.teamId, d)
                      }}
                      onClick={() => { if (cellShifts.length === 0) setEditing({ teamId: s.teamId, day: d, timeOff: offEntry }) }}
                      style={{
                        minHeight: 44, borderRadius: 8, padding: 4, display: 'flex', flexDirection: 'column', gap: 4, cursor: cellShifts.length === 0 ? 'pointer' : 'default',
                        background: offEntry ? 'repeating-linear-gradient(45deg, rgba(191,119,246,0.14), rgba(191,119,246,0.14) 6px, rgba(191,119,246,0.05) 6px, rgba(191,119,246,0.05) 12px)' : 'rgba(0,0,0,0.03)',
                        border: offEntry ? `1px dashed ${BRAND_PURPLE}` : '1px dashed rgba(0,0,0,0.1)',
                      }}
                    >
                      {offEntry && cellShifts.length === 0 && (
                        <div style={mono({ fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: BRAND_PURPLE, textAlign: 'center', padding: '4px 2px' })}>Time off</div>
                      )}
                      {cellShifts.map(sh => (
                        <div
                          key={sh.id}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('text/plain', sh.id); setDragShiftId(sh.id) }}
                          onDragEnd={() => setDragShiftId(null)}
                          onClick={e => { e.stopPropagation(); setEditing({ teamId: s.teamId, day: d, shift: sh, timeOff: offEntry }) }}
                          style={{ position: 'relative', borderRadius: 6, padding: '4px 6px', cursor: 'grab', background: sh.isPublished && !sh.hasUnpublishedChanges ? '#000' : BRAND_PURPLE, color: '#fff', opacity: dragShiftId === sh.id ? 0.4 : 1, boxShadow: offEntry ? '0 0 0 2px #fff, 0 0 0 4px #d92d20' : 'none' }}
                        >
                          {offEntry && <span title="Scheduled during approved time off" style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: 99, background: '#d92d20', color: '#fff', fontSize: 9, lineHeight: '14px', textAlign: 'center' }}>!</span>}
                          <div style={mono({ fontSize: 9, fontWeight: 600 })}>{fmtTime(sh.startAt)}–{fmtTime(sh.endAt)}</div>
                          {!sh.isPublished && <div style={mono({ fontSize: 8, opacity: 0.75 })}>Draft</div>}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </Fragment>
              )
            })}
          </div>
        </div>
      )}

      {editing && (
        <ShiftEditModal
          staffName={data?.staff.find(s => s.teamId === editing.teamId)?.name ?? ''}
          day={editing.day}
          shift={editing.shift}
          timeOff={editing.timeOff}
          saving={saving}
          error={saveError}
          onSave={saveShift}
          onDelete={editing.shift ? deleteShift : undefined}
          onClose={() => { setEditing(null); setSaveError(null) }}
        />
      )}

      {showPublish && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => !publishing && setShowPublish(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
          <div style={{ ...glass, position: 'relative', borderRadius: 20, padding: 32, width: '100%', maxWidth: 380, zIndex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 8 }}>Publish this week's roster</div>
            <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', lineHeight: 1.6, marginBottom: 20 })}>
              {unpublishedCount} draft shift{unpublishedCount === 1 ? '' : 's'} will go live. Staff will see their shifts in Team → Roster.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, cursor: 'pointer' }}>
              <input type="checkbox" checked={notifyStaff} onChange={e => setNotifyStaff(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 12, color: '#000' }}>Notify staff (push notification)</span>
            </label>
            {publishMsg && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.5)', marginBottom: 12 })}>{publishMsg}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={doPublish} disabled={publishing} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: '#000', color: '#fff', fontSize: 13, fontWeight: 500, cursor: publishing ? 'default' : 'pointer', opacity: publishing ? 0.6 : 1 }}>
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
              <button onClick={() => setShowPublish(false)} disabled={publishing} style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.6)', fontSize: 13, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ShiftEditModal({ staffName, day, shift, timeOff, saving, error, onSave, onDelete, onClose }: {
  staffName: string; day: Date; shift?: api.ManagerRosterShift; timeOff?: api.ManagerRosterTimeOff; saving: boolean; error: string | null
  onSave: (startTime: string, endTime: string, notes: string) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const toTime = (iso?: string) => iso ? new Date(iso).toTimeString().slice(0, 5) : ''
  const [startTime, setStartTime] = useState(toTime(shift?.startAt) || '09:00')
  const [endTime, setEndTime] = useState(toTime(shift?.endAt) || '17:00')
  const [notes, setNotes] = useState(shift?.notes ?? '')
  const valid = !!startTime && !!endTime && startTime < endTime
  const fmtShort = (ds: string) => new Date(`${ds}T00:00:00`).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      <div style={{ ...glass, position: 'relative', borderRadius: 20, padding: 32, width: '100%', maxWidth: 380, zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: '#000', letterSpacing: '-0.02em' }}>{shift ? 'Edit shift' : 'Add shift'}</div>
          <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: 99, cursor: 'pointer', fontSize: 14, color: '#000' }}>✕</button>
        </div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 22 })}>
          {staffName} · {day.toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })}
        </div>
        {timeOff && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(217,45,32,0.08)', border: '1px solid rgba(217,45,32,0.25)', borderRadius: 12, padding: '10px 12px', marginBottom: 18 }}>
            <span style={{ fontSize: 13 }}>⚠️</span>
            <div style={{ fontSize: 11.5, color: '#a02419', lineHeight: 1.5 }}>
              {staffName.split(' ')[0]} has approved time off {fmtShort(timeOff.start_date)} – {fmtShort(timeOff.end_date)}. Scheduling this shift will overlap it.
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Start</label>
              <input style={inputStyle} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>End</label>
              <input style={inputStyle} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <input style={inputStyle} placeholder="e.g. Covering front counter" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {error && <div style={mono({ fontSize: 10, color: 'rgba(180,40,40,0.75)' })}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onSave(startTime, endTime, notes)} disabled={!valid || saving}
              style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: valid ? '#000' : 'rgba(0,0,0,0.15)', color: valid ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 13, fontWeight: 500, cursor: valid && !saving ? 'pointer' : 'default' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {onDelete && (
              <button onClick={onDelete} disabled={saving} style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid rgba(180,40,40,0.25)', background: 'transparent', color: 'rgba(180,40,40,0.75)', fontSize: 13, cursor: 'pointer' }}>Delete</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Recipes ──────────────────────────────────────────────────────────────────
function RecipesSection({ isManager }: { isManager: boolean }) {
  const [recipes, setRecipes] = useState<api.Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try { setRecipes(await api.getRecipes()) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function handleAdd(body: Partial<api.Recipe>) { await api.addRecipe(body); setShowAdd(false); load() }
  async function handleUpdate(id: number, patch: Partial<api.Recipe>) { await api.updateRecipe(id, patch); setEditId(null); load() }
  async function handleDelete(id: number) { await api.deleteRecipe(id); setConfirmDelete(null); load() }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {isManager && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => { setShowAdd(v => !v); setEditId(null) }}
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: 'pointer', background: showAdd ? '#000' : 'rgba(0,0,0,0.07)', color: showAdd ? '#fff' : '#000', border: '1px solid rgba(0,0,0,0.12)' }}>
            {showAdd ? '✕' : '+ Add Recipe'}
          </button>
        </div>
      )}
      {showAdd && <RecipeForm onSave={handleAdd} onCancel={() => setShowAdd(false)} />}
      {error && <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>Couldn't load recipes: {error}</div>}
      {loading && recipes.length === 0 && <SectionSpinner />}
      {!loading && recipes.length === 0 && !showAdd && (
        <div style={{ ...glass, borderRadius: 16, padding: '40px 24px', textAlign: 'center', ...mono({ fontSize: 12, color: 'rgba(0,0,0,0.35)' }) }}>
          No recipes yet{isManager ? ' — add the first one above.' : '.'}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recipes.map(r => {
          const isOpen = expandedId === r.id
          const isEditing = editId === r.id
          return (
            <div key={r.id} style={{ ...glass, borderRadius: 14, overflow: 'hidden' }}>
              {isEditing ? (
                <div style={{ padding: '16px 20px' }}>
                  <RecipeForm initial={r} onSave={patch => handleUpdate(r.id, patch)} onCancel={() => setEditId(null)} />
                </div>
              ) : confirmDelete === r.id ? (
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1, fontSize: 13, color: '#000' }}>Delete <strong>{r.title}</strong>?</div>
                  <button onClick={() => handleDelete(r.id)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Delete</button>
                  <button onClick={() => setConfirmDelete(null)} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <>
                  <button onClick={() => setExpandedId(isOpen ? null : r.id)} style={{ width: '100%', textAlign: 'left', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{r.title}</div>
                      {r.category && <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 3 })}>{r.category}</div>}
                    </div>
                    {isManager && (
                      <>
                        <span onClick={e => { e.stopPropagation(); setEditId(r.id); setExpandedId(null) }} style={iconBtnStyle} title="Edit">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </span>
                        <span onClick={e => { e.stopPropagation(); setConfirmDelete(r.id) }} style={iconBtnStyle} title="Delete">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                        </span>
                      </>
                    )}
                    <span style={{ color: 'rgba(0,0,0,0.3)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 20px 18px', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14 }}>
                      {r.image_url && <img src={r.image_url} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginBottom: 14 }} />}
                      {r.ingredients && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 6 })}>Ingredients</div>
                          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.75)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{r.ingredients}</div>
                        </div>
                      )}
                      <div>
                        <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 6 })}>Method</div>
                        <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.75)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{r.instructions}</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RecipeForm({ initial, onSave, onCancel }: { initial?: api.Recipe; onSave: (patch: Partial<api.Recipe>) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [ingredients, setIngredients] = useState(initial?.ingredients ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '')
  const valid = !!(title.trim() && instructions.trim())

  return (
    <div style={{ ...glass, borderRadius: 16, padding: '20px 20px 16px' }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#000', marginBottom: 16 }}>{initial ? 'Edit Recipe' : 'New Recipe'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><label style={labelStyle}>Title</label><input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
        <div><label style={labelStyle}>Category</label><input style={inputStyle} value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Pastry" /></div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Ingredients</label>
        <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'JetBrains Mono, monospace' }} value={ingredients} onChange={e => setIngredients(e.target.value)} placeholder="One per line…" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Method</label>
        <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} value={instructions} onChange={e => setInstructions(e.target.value)} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Image URL (optional)</label>
        <input style={inputStyle} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => valid && onSave({ title: title.trim(), category: category.trim() || null, ingredients: ingredients.trim() || null, instructions: instructions.trim(), image_url: imageUrl.trim() || null })}
          disabled={!valid} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: valid ? '#000' : 'rgba(0,0,0,0.15)', color: valid ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 12, fontWeight: 500, cursor: valid ? 'pointer' : 'not-allowed' }}>Save</button>
        <button onClick={onCancel} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Training ─────────────────────────────────────────────────────────────────
function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1) || null
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null
    }
  } catch { /* not a valid URL */ }
  return null
}

function trainingDueAt(training: api.Training): string | null {
  if (training.due_at) return training.due_at
  if (!training.mandatory_since) return null
  return new Date(new Date(training.mandatory_since).getTime() + training.grace_period_days * 86400000).toISOString()
}

function trainingDeadlineLabel(training: api.Training): string | null {
  const dueAt = trainingDueAt(training)
  return dueAt ? new Date(dueAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Brisbane' }) : null
}

function TrainingSection({ me, isManager, managerPin = null, team = [], onCompletionChanged }: { me: TeamMember | null; isManager: boolean; managerPin?: string | null; team?: TeamMember[]; onCompletionChanged?: () => void }) {
  const [trainings, setTrainings] = useState<api.Training[]>([])
  const [completions, setCompletions] = useState<api.TrainingCompletion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [t, c] = await Promise.all([api.getTrainings(), api.getTrainingCompletions()])
      setTrainings(t); setCompletions(c)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function managerAction(action: () => Promise<unknown>, after: () => void) {
    if (!managerPin) { setError('Manager access has expired. Reopen the Manager tab and enter your PIN.'); return }
    setError(null)
    try { await action(); after(); await load() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  async function handleAdd(body: Partial<api.Training>) { await managerAction(() => api.addTraining(body, managerPin!), () => setShowAdd(false)) }
  async function handleUpdate(id: number, patch: Partial<api.Training>) { await managerAction(() => api.updateTraining(id, patch, managerPin!), () => setEditId(null)) }
  async function handleDelete(id: number) { await managerAction(() => api.deleteTraining(id, managerPin!), () => setConfirmDelete(null)) }
  async function markComplete(trainingId: number, answers?: Record<number, number>) {
    if (!me) throw new Error('Sign in to complete training')
    const result = await api.recordTrainingCompletion(trainingId, me.id, answers)
    await load()
    onCompletionChanged?.()
    return result
  }
  async function resetAttempt(trainingId: number, teamId: number) {
    await managerAction(() => api.resetTrainingAttempt(trainingId, teamId, managerPin!), () => {})
  }

  const myCompletionFor = (trainingId: number) => completions.find(c => c.training_id === trainingId && c.team_id === me?.id)
  const completedCountFor = (trainingId: number) => completions.filter(c => c.training_id === trainingId && c.passed && team.some(member => member.id === c.team_id && !member.isManager)).length
  const TYPE_LABEL: Record<api.TrainingType, string> = { text: 'Read', quiz: 'Quiz', video: 'Video' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {isManager && managerPin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => { setShowAdd(v => !v); setEditId(null) }}
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: 'pointer', background: showAdd ? '#000' : 'rgba(0,0,0,0.07)', color: showAdd ? '#fff' : '#000', border: '1px solid rgba(0,0,0,0.12)' }}>
            {showAdd ? '✕' : '+ Add Training'}
          </button>
        </div>
      )}
      {showAdd && <TrainingForm onSave={handleAdd} onCancel={() => setShowAdd(false)} />}
      {error && <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>Couldn't load training: {error}</div>}
      {loading && trainings.length === 0 && <SectionSpinner />}
      {!loading && trainings.length === 0 && !showAdd && (
        <div style={{ ...glass, borderRadius: 16, padding: '40px 24px', textAlign: 'center', ...mono({ fontSize: 12, color: 'rgba(0,0,0,0.35)' }) }}>
          No training material yet{isManager ? ' — add the first one above.' : '.'}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {trainings.map(t => {
          const isOpen = openId === t.id
          const isEditing = editId === t.id
          const mine = myCompletionFor(t.id)
          return (
            <div key={t.id} style={{ ...glass, borderRadius: 14, overflow: 'hidden' }}>
              {isEditing ? (
                <div style={{ padding: '16px 20px' }}>
                  <TrainingForm initial={t} onSave={patch => handleUpdate(t.id, patch)} onCancel={() => setEditId(null)} />
                </div>
              ) : confirmDelete === t.id ? (
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1, fontSize: 13, color: '#000' }}>Delete <strong>{t.title}</strong>?</div>
                  <button onClick={() => handleDelete(t.id)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Delete</button>
                  <button onClick={() => setConfirmDelete(null)} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <>
                  <button onClick={() => setOpenId(isOpen ? null : t.id)} style={{ width: '100%', textAlign: 'left', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <span style={{ ...mono({ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 6 }), background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.5)', flexShrink: 0 }}>{TYPE_LABEL[t.type]}</span>
                    {t.mandatory && <span style={{ ...mono({ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 6 }), background: 'rgba(180,40,40,0.1)', color: 'rgba(180,40,40,0.75)', flexShrink: 0 }}>Mandatory</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{t.title}</div>
                      <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.34)', marginTop: 3 })}>
                        {isManager ? `${completedCountFor(t.id)} of ${team.filter(member => !member.isManager).length} staff passed` : t.mandatory && trainingDeadlineLabel(t) ? `Due ${trainingDeadlineLabel(t)}` : 'Optional training'}
                      </div>
                    </div>
                    {mine?.passed && <span style={{ color: 'rgba(0,0,0,0.35)', fontSize: 14, flexShrink: 0 }} title="You've completed this">✓</span>}
                    {isManager && (
                      <>
                        <span onClick={e => { e.stopPropagation(); setEditId(t.id); setOpenId(null) }} style={iconBtnStyle} title="Edit">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </span>
                        <span onClick={e => { e.stopPropagation(); setConfirmDelete(t.id) }} style={iconBtnStyle} title="Delete">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                        </span>
                      </>
                    )}
                    <span style={{ color: 'rgba(0,0,0,0.3)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 20px 18px', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14 }}>
                      <TrainingBody training={t} me={me} myCompletion={mine ?? null} onComplete={answers => markComplete(t.id, answers)} />
                      {isManager && (
                        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                          <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.38)', marginBottom: 8 })}>Staff progress</div>
                          <div style={{ display: 'grid', gap: 6 }}>
                            {team.filter(member => !member.isManager).map(member => {
                              const completion = completions.find(c => c.training_id === t.id && c.team_id === member.id)
                              const state = completion?.passed ? 'Passed' : completion?.locked ? 'Locked' : completion ? `${Math.max(0, 3 - completion.attempts)} attempts left` : 'Pending'
                              return <div key={member.id} style={{ ...glassSubtle, borderRadius: 9, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ width: 25, height: 25, borderRadius: 99, background: '#000', color: '#fff', display: 'grid', placeItems: 'center', ...mono({ fontSize: 8, fontWeight: 600 }) }}>{member.avatar}</span>
                                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{member.name}</span>
                                <span style={mono({ fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: completion?.passed ? 'rgba(30,120,70,0.8)' : completion?.locked ? 'rgba(180,40,40,0.8)' : 'rgba(0,0,0,0.4)' })}>{state}</span>
                                {completion?.locked && <button onClick={() => resetAttempt(t.id, member.id)} style={{ border: 'none', borderRadius: 7, padding: '5px 8px', background: '#000', color: '#fff', cursor: 'pointer', ...mono({ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }) }}>Reset</button>}
                              </div>
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CompleteButton({ done, disabled, onClick }: { done: boolean; disabled: boolean; onClick: () => Promise<unknown> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function complete() {
    setSaving(true); setError(null)
    try { await onClick() } catch (e) { setError(e instanceof Error ? e.message : 'Could not save completion') }
    finally { setSaving(false) }
  }
  return (
    <div>
      <button onClick={complete} disabled={done || disabled || saving}
        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 18px', borderRadius: 8, border: 'none', cursor: done || disabled || saving ? 'default' : 'pointer', background: done ? 'rgba(0,0,0,0.08)' : '#000', color: done ? 'rgba(0,0,0,0.4)' : '#fff', opacity: (disabled || saving) && !done ? 0.5 : 1 }}>
        {done ? '✓ Completed' : saving ? 'Saving…' : 'Mark as Complete'}
      </button>
      {error && <div style={mono({ fontSize: 9, color: 'rgba(180,40,40,0.75)', marginTop: 7 })}>{error}</div>}
    </div>
  )
}

function TrainingBody({ training, me, myCompletion, onComplete }: { training: api.Training; me: TeamMember | null; myCompletion: api.TrainingCompletion | null; onComplete: (answers?: Record<number, number>) => Promise<api.TrainingAttemptResult> }) {
  if (training.type === 'text') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.75)', whiteSpace: 'pre-wrap', lineHeight: 1.7, marginBottom: 16 }}>{training.content.body}</div>
        <CompleteButton done={!!myCompletion?.passed} disabled={!me} onClick={() => onComplete()} />
      </div>
    )
  }
  if (training.type === 'video') {
    const videoId = training.content.youtubeUrl ? youtubeVideoId(training.content.youtubeUrl) : null
    return (
      <div>
        {videoId ? (
          <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', marginBottom: 16, background: '#000' }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title={training.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        ) : (
          <div style={{ ...glassSubtle, borderRadius: 10, padding: 16, fontSize: 12, color: 'rgba(0,0,0,0.4)', marginBottom: 16 }}>Couldn't read this video link.</div>
        )}
        <CompleteButton done={!!myCompletion?.passed} disabled={!me} onClick={() => onComplete()} />
      </div>
    )
  }
  return <QuizBody training={training} me={me} myCompletion={myCompletion} onComplete={onComplete} />
}

function QuizBody({ training, me, myCompletion, onComplete }: { training: api.Training; me: TeamMember | null; myCompletion: api.TrainingCompletion | null; onComplete: (answers?: Record<number, number>) => Promise<api.TrainingAttemptResult> }) {
  const questions = training.content.questions ?? []
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [result, setResult] = useState<api.TrainingAttemptResult | null>(myCompletion?.passed ? { completion: myCompletion, attemptsRemaining: null } : null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSubmitting(true); setError(null)
    try { setResult(await onComplete(answers)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not submit quiz') }
    finally { setSubmitting(false) }
  }

  if (myCompletion?.locked || result?.locked || result?.completion.locked) {
    const completion = result?.completion ?? myCompletion
    return <div style={{ ...glassSubtle, borderRadius: 10, padding: 14, fontSize: 13, color: '#000' }}>
      <strong>Quiz locked</strong><div style={{ marginTop: 4, color: 'rgba(0,0,0,0.55)' }}>Score: {completion?.score ?? 0} / {completion?.total ?? questions.length}. Ask a manager to reset your attempts.</div>
    </div>
  }
  if (result?.completion.passed || myCompletion?.passed) {
    const completion = result?.completion ?? myCompletion
    return <div style={{ ...glassSubtle, borderRadius: 10, padding: 14, fontSize: 13, color: '#000' }}><strong>Passed</strong> · Score {completion?.score} / {completion?.total}</div>
  }
  if (result && !result.completion.passed) {
    return <div style={{ ...glassSubtle, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 13, color: '#000' }}>Score: <strong>{result.completion.score} / {result.completion.total}</strong></div>
      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 4 }}>{result.attemptsRemaining} {result.attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining. A perfect score is required.</div>
      <button onClick={() => { setAnswers({}); setResult(null) }} style={{ marginTop: 10, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', ...mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }) }}>Try again</button>
    </div>
  }

  return (
    <div>
      {questions.map((q, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#000', marginBottom: 8 }}>{i + 1}. {q.question}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {q.options.map((opt, oi) => (
              <button key={oi} onClick={() => setAnswers(a => ({ ...a, [i]: oi }))}
                style={{ textAlign: 'left', padding: '9px 14px', borderRadius: 8, border: answers[i] === oi ? '1.5px solid #000' : '1px solid rgba(0,0,0,0.12)', background: answers[i] === oi ? 'rgba(0,0,0,0.05)' : 'transparent', cursor: 'pointer', fontSize: 12.5, color: '#000' }}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button onClick={submit} disabled={!me || submitting || Object.keys(answers).length < questions.length}
        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#000', color: '#fff', opacity: submitting || Object.keys(answers).length < questions.length ? 0.4 : 1 }}>
        {submitting ? 'Checking…' : 'Submit'}
      </button>
      {error && <div style={mono({ fontSize: 9, color: 'rgba(180,40,40,0.75)', marginTop: 7 })}>{error}</div>}
    </div>
  )
}

function TrainingForm({ initial, onSave, onCancel }: { initial?: api.Training; onSave: (patch: Partial<api.Training>) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [type, setType] = useState<api.TrainingType>(initial?.type ?? 'text')
  const [body, setBody] = useState(initial?.content.body ?? '')
  const [youtubeUrl, setYoutubeUrl] = useState(initial?.content.youtubeUrl ?? '')
  const [questions, setQuestions] = useState<api.TrainingQuestion[]>(initial?.content.questions ?? [{ question: '', options: ['', ''], correctIndex: 0 }])
  const [mandatory, setMandatory] = useState(initial?.mandatory ?? false)
  const [dueDate, setDueDate] = useState(initial?.due_at ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date(initial.due_at)) : '')
  const todayBrisbane = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date())

  function updateQuestion(i: number, patch: Partial<api.TrainingQuestion>) {
    setQuestions(qs => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  }
  function updateOption(qi: number, oi: number, value: string) {
    setQuestions(qs => qs.map((q, idx) => (idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q)))
  }
  function addOption(qi: number) {
    setQuestions(qs => qs.map((q, idx) => (idx === qi ? { ...q, options: [...q.options, ''] } : q)))
  }
  function removeOption(qi: number, oi: number) {
    setQuestions(qs => qs.map((q, idx) => (idx === qi ? { ...q, options: q.options.filter((_, j) => j !== oi), correctIndex: q.correctIndex === oi ? 0 : q.correctIndex > oi ? q.correctIndex - 1 : q.correctIndex } : q)))
  }
  function addQuestion() { setQuestions(qs => [...qs, { question: '', options: ['', ''], correctIndex: 0 }]) }
  function removeQuestion(i: number) { setQuestions(qs => qs.filter((_, idx) => idx !== i)) }

  const valid = !!(title.trim() && (!mandatory || dueDate) && (
    (type === 'text' && body.trim()) ||
    (type === 'video' && youtubeVideoId(youtubeUrl.trim() || '') !== null) ||
    (type === 'quiz' && questions.length > 0 && questions.every(q => q.question.trim() && q.options.filter(o => o.trim()).length >= 2))
  ))

  function save() {
    if (!valid) return
    const content = type === 'text' ? { body: body.trim() }
      : type === 'video' ? { youtubeUrl: youtubeUrl.trim() }
      : { questions: questions.map(q => ({ question: q.question.trim(), options: q.options.map(o => o.trim()).filter(Boolean), correctIndex: q.correctIndex })) }
    onSave({ title: title.trim(), type, content, mandatory, due_at: mandatory ? `${dueDate}T23:59:59+10:00` : null })
  }

  return (
    <div style={{ ...glass, borderRadius: 16, padding: '20px 20px 16px' }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#000', marginBottom: 16 }}>{initial ? 'Edit Training' : 'New Training'}</div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Title</label>
        <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Type</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['text', 'quiz', 'video'] as api.TrainingType[]).map(tp => (
            <button key={tp} onClick={() => !initial && setType(tp)} disabled={!!initial}
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: type === tp ? '#000' : 'transparent', color: type === tp ? '#fff' : 'rgba(0,0,0,0.5)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: initial ? 'default' : 'pointer', opacity: initial && type !== tp ? 0.4 : 1 }}>
              {tp}
            </button>
          ))}
        </div>
      </div>

      {type === 'text' && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Content</label>
          <textarea style={{ ...inputStyle, minHeight: 140, resize: 'vertical' }} value={body} onChange={e => setBody(e.target.value)} placeholder="Write the training material…" />
        </div>
      )}

      {type === 'video' && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>YouTube URL</label>
          <input style={inputStyle} value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
          {youtubeUrl.trim() && !youtubeVideoId(youtubeUrl.trim()) && (
            <div style={mono({ fontSize: 10, color: 'rgba(180,40,40,0.7)', marginTop: 6 })}>Doesn't look like a valid YouTube link.</div>
          )}
        </div>
      )}

      {type === 'quiz' && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {questions.map((q, qi) => (
            <div key={qi} style={{ ...glassSubtle, borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                <input style={{ ...inputStyle, flex: 1 }} value={q.question} onChange={e => updateQuestion(qi, { question: e.target.value })} placeholder={`Question ${qi + 1}`} />
                {questions.length > 1 && (
                  <button onClick={() => removeQuestion(qi)} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', color: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>✕</button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {q.options.map((opt, oi) => (
                  <div key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="radio" checked={q.correctIndex === oi} onChange={() => updateQuestion(qi, { correctIndex: oi })} title="Correct answer" />
                    <input style={{ ...inputStyle, flex: 1, padding: '6px 10px' }} value={opt} onChange={e => updateOption(qi, oi, e.target.value)} placeholder={`Option ${oi + 1}`} />
                    {q.options.length > 2 && (
                      <button onClick={() => removeOption(qi, oi)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', background: 'transparent', cursor: 'pointer', color: 'rgba(0,0,0,0.35)', fontSize: 11, flexShrink: 0 }}>✕</button>
                    )}
                  </div>
                ))}
                <button onClick={() => addOption(qi)} style={{ alignSelf: 'flex-start', fontSize: 11, color: 'rgba(0,0,0,0.4)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add option</button>
              </div>
            </div>
          ))}
          <button onClick={addQuestion} style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 8, border: '1px dashed rgba(0,0,0,0.2)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>+ Add question</button>
        </div>
      )}

      <div style={{ ...glassSubtle, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <button onClick={() => setMandatory(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
          <span style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid rgba(0,0,0,0.25)', background: mandatory ? '#000' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {mandatory && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>Mandatory training</div>
            <div style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>Staff who have not passed will be blocked from clocking in after the deadline. Managers are exempt.</div>
          </div>
        </button>
        {mandatory && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, marginBottom: 0, flexShrink: 0 }}>Deadline</label>
            <input type="date" min={initial?.due_at ? undefined : todayBrisbane} style={{ ...inputStyle, width: 180 }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            {!dueDate && <span style={mono({ fontSize: 9, color: 'rgba(180,40,40,0.72)' })}>Choose a deadline to save.</span>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={!valid} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: valid ? '#000' : 'rgba(0,0,0,0.15)', color: valid ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 12, fontWeight: 500, cursor: valid ? 'pointer' : 'not-allowed' }}>Save</button>
        <button onClick={onCancel} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}

function TeamView({
  team, onUpdateTeamMember, onClockToggle, meId,
  roster, loadingRoster, onLoadRoster,
  deepLink, onDeepLinkConsumed, onTrainingCompletionChanged, managerPin,
}: {
  team: TeamMember[]
  onUpdateTeamMember: (id: number, patch: Partial<TeamMember>) => void
  onClockToggle: (m: TeamMember) => Promise<boolean>
  meId: number | null
  roster: RosterShift[]
  loadingRoster: boolean
  onLoadRoster: () => void
  deepLink?: TeamNavTarget | null
  onDeepLinkConsumed?: () => void
  onTrainingCompletionChanged?: () => void
  managerPin?: string | null
}) {
  const [section, setSection] = useState<TeamSection>('account')
  const [accountTab, setAccountTab] = useState<AccountTab>('clock')
  const [clockPinTarget, setClockPinTarget] = useState<TeamMember | null>(null)
  const me = team.find(t => t.id === meId) ?? null

  // Overview's landing pages navigate here by section (and optionally a
  // specific Account sub-tab) — consume it once, then let the tab bar
  // above take over as normal.
  useEffect(() => {
    if (!deepLink) return
    setSection(deepLink.section)
    if (deepLink.accountTab) setAccountTab(deepLink.accountTab)
    onDeepLinkConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink])
  const active = team.filter(m => m.clockedIn)
  const offShift = team.filter(m => !m.clockedIn)
  const signers = team.filter(m => m.signedOff)

  // Clocking someone in/out from this list always requires that person's own
  // PIN — otherwise anyone signed in could clock a colleague in or out.
  function toggleClock(m: TeamMember) {
    setClockPinTarget(m)
  }

  function signOff(m: TeamMember) {
    const now = new Date()
    const t = now.toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' }) + ', ' + formatClock12(now)
    onUpdateTeamMember(m.id, { signedOff: 'current', signedOffTime: t })
  }

  const MemberCard = ({ m }: { m: TeamMember }) => (
    <div style={{ ...glass, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#000', color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', transition: 'all 0.2s', boxShadow: m.clockedIn ? `0 0 0 2px #fff, 0 0 0 4px ${BRAND_PURPLE}` : 'none' }}>
        {m.avatar}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{m.name}</div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>{m.role}</div>
        {m.clockedIn && m.clockIn && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 4 })}>Clocked in {m.clockIn}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <button onClick={() => toggleClock(m)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.15)', transition: 'all 0.2s', background: m.clockedIn ? '#000' : 'rgba(0,0,0,0.05)', color: m.clockedIn ? '#fff' : 'rgba(0,0,0,0.5)' }}>
          {m.clockedIn ? 'Clock Out' : 'Clock In'}
        </button>
        {m.clockedIn && (
          <button onClick={() => signOff(m)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: 'rgba(0,0,0,0.5)', transition: 'all 0.2s' }}>
            Sign Off
          </button>
        )}
      </div>
    </div>
  )

  const SectionHead = ({ label, dot, count }: { label: string; dot: string; count: number }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: dot, display: 'inline-block' }} />
      <span style={mono({ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' })}>{label} — {count}</span>
    </div>
  )

  const SECTIONS: { key: TeamSection; label: string }[] = [
    { key: 'account', label: 'My Account' },
    { key: 'status', label: 'Status' },
    { key: 'roster', label: 'Roster' },
    { key: 'checklist', label: 'Checklist' },
    { key: 'recipes', label: 'Recipes' },
    { key: 'training', label: 'Training' },
    { key: 'reviews', label: 'Reviews' },
  ]

  // Honest placeholder for sections that are next up in the reconstruction
  // queue rather than fake or silently-broken content.
  const ComingSoon = ({ label }: { label: string }) => (
    <div style={{ ...glassSubtle, borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
      <div style={mono({ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>{label}</div>
      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.35)' }}>Being rebuilt — back shortly.</div>
    </div>
  )

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="team-section-tabs" style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2, maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: section === s.key ? '#000' : 'transparent', color: section === s.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: section === s.key ? 500 : 400, flexShrink: 0 }}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'clock' && <ClockSection me={me} onClockToggle={onClockToggle} managerPin={managerPin} />}

      {section === 'status' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div>
            <SectionHead label="On Shift" dot="#000" count={active.length} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {active.length === 0 ? <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>Nobody clocked in yet</div>
                : active.map(m => <MemberCard key={m.id} m={m} />)}
            </div>
          </div>
          {offShift.length > 0 && (
            <div>
              <SectionHead label="Off Shift" dot="rgba(0,0,0,0.25)" count={offShift.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{offShift.map(m => <MemberCard key={m.id} m={m} />)}</div>
            </div>
          )}
          {signers.length > 0 && (
            <div>
              <SectionHead label="Last Stocktake Sign-offs" dot="rgba(0,0,0,0.15)" count={signers.length} />
              <div style={{ ...glassSubtle, borderRadius: 16, overflow: 'hidden' }}>
                {signers.map((m, i) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < signers.length - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 99, background: 'rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...mono({ fontSize: 10, fontWeight: 600, color: '#000' }) }}>{m.avatar}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>{m.name}</div>
                      <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>{m.role}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={mono({ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(0,0,0,0.4)' })}>{m.signedOffTime}</div>
                      <div style={mono({ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.25)', marginTop: 2 })}>{m.signedOff === 'current' ? 'This Session' : 'Previous Session'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'roster' && <RosterSection roster={roster} loadingRoster={loadingRoster} onLoadRoster={onLoadRoster} />}

      {section === 'checklist' && <ChecklistSection me={me} isManager={!!me?.isManager} />}

      {section === 'recipes' && <RecipesSection isManager={!!me?.isManager} />}

      {section === 'training' && <TrainingSection me={me} isManager={false} onCompletionChanged={onTrainingCompletionChanged} />}

      {section === 'reviews' && <StaffReviewsPanel />}

      {section === 'account' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
            {([
              { key: 'clock', label: 'My Clock' },
              { key: 'swaps', label: 'Shift Swap' },
              { key: 'timeoff', label: 'Time Off' },
              { key: 'availability', label: 'Availability' },
              { key: 'pay', label: 'Hours & Pay' },
              { key: 'security', label: 'Security' },
            ] as { key: AccountTab; label: string }[]).map(t => (
              <button key={t.key} onClick={() => setAccountTab(t.key)}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: accountTab === t.key ? '#000' : 'transparent', color: accountTab === t.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: accountTab === t.key ? 500 : 400 }}>
                {t.label}
              </button>
            ))}
          </div>
          {accountTab === 'clock' && <ClockSection me={me} onClockToggle={onClockToggle} managerPin={managerPin} />}
          {accountTab === 'availability' && <AvailabilitySection me={me} />}
          {accountTab === 'swaps' && <StaffShiftSwapSection me={me} team={team} roster={roster} />}
          {accountTab === 'timeoff' && <StaffTimeOffSection me={me} />}
          {accountTab === 'pay' && <HoursPaySection me={me} />}
          {accountTab === 'security' && <AccountSecuritySection me={me} />}
        </div>
      )}
    </div>

    {clockPinTarget && (
      <LoginPinOverlay
        member={clockPinTarget}
        onSuccess={() => { onClockToggle(clockPinTarget); setClockPinTarget(null) }}
        onCancel={() => setClockPinTarget(null)}
      />
    )}
    </>
  )
}

// ── Overview: manager + staff landing pages ─────────────────────────────────

// Popup shown when tapping a stock-alert row on the manager Overview page.
function ItemDetailPopup({ item, onClose, onGoToItems }: { item: Item; onClose: () => void; onGoToItems: () => void }) {
  const status = getStatus(item.qty, item.par)
  const statusLabel = { ok: 'In Stock', low: 'Low Stock', out: 'Out of Stock' }[status]
  const statusBg = { ok: 'rgba(0,0,0,0.04)', low: 'rgba(0,0,0,0.13)', out: 'rgba(0,0,0,0.08)' }[status]
  const fmt = (n: number) => (n % 1 === 0 ? n : n.toFixed(1))
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      <div style={{ ...glass, position: 'relative', borderRadius: 20, padding: '26px 24px', width: '100%', maxWidth: 360, zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)' })}>{item.category}</div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, padding: '4px 10px', borderRadius: 8, color: '#000', background: statusBg }}>{statusLabel}</span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 600, color: '#000', marginBottom: 18 }}>{item.name}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
          <div style={{ ...glassSubtle, borderRadius: 12, padding: '12px 14px' }}>
            <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 4 })}>Current</div>
            <div style={mono({ fontSize: 17, fontWeight: 600, color: '#000' })}>{fmt(item.qty)} <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(0,0,0,0.4)' }}>{item.unit}</span></div>
          </div>
          <div style={{ ...glassSubtle, borderRadius: 12, padding: '12px 14px' }}>
            <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 4 })}>Par</div>
            <div style={mono({ fontSize: 17, fontWeight: 600, color: '#000' })}>{fmt(item.par)} <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(0,0,0,0.4)' }}>{item.unit}</span></div>
          </div>
        </div>
        <button onClick={onGoToItems} style={{ width: '100%', padding: '13px 0', borderRadius: 99, border: 'none', background: '#000', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 10 }}>Go to Stock Levels →</button>
        <button onClick={onClose} style={{ width: '100%', padding: '11px 0', borderRadius: 99, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.55)', fontSize: 12, cursor: 'pointer' }}>Close</button>
      </div>
    </div>
  )
}

// Manager Overview landing page — out-of-stock/low-stock alerts up front,
// tap through to a popup with the item's current vs. par, then straight to
// Stock Levels to fix it.
function ManagerOverviewLanding({ items, onGoToStock }: { items: Item[]; onGoToStock: () => void }) {
  const [selected, setSelected] = useState<Item | null>(null)
  const alerts = useMemo(() => {
    const out = items.filter(i => getStatus(i.qty, i.par) === 'out').sort((a, b) => a.name.localeCompare(b.name))
    const low = items.filter(i => getStatus(i.qty, i.par) === 'low').sort((a, b) => a.name.localeCompare(b.name))
    return [...out, ...low]
  }, [items])
  const listRef = useStaggerReveal(alerts.map(i => i.id).join(','))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...glassDark, borderRadius: 20, padding: '22px 22px 18px' }}>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8 })}>Store Overview</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={mono({ fontSize: 34, fontWeight: 300, color: '#fff', lineHeight: 1 })}>{alerts.length}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>item{alerts.length === 1 ? '' : 's'} to order</div>
        </div>
      </div>

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 10 })}>Out of Stock & Low Stock</div>
        {alerts.length === 0 ? (
          <div style={{ ...glassSubtle, borderRadius: 16, padding: '32px 24px', textAlign: 'center', ...mono({ fontSize: 12, color: 'rgba(0,0,0,0.35)' }) }}>
            Nothing to order right now — stock looks good.
          </div>
        ) : (
          <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map(item => {
              const status = getStatus(item.qty, item.par)
              const qtyLabel = item.qty % 1 === 0 ? item.qty : item.qty.toFixed(1)
              return (
                <button key={item.id} onClick={() => setSelected(item)} style={{ ...glass, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{item.name}</div>
                    <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.5)', marginTop: 2 })}>{item.category} · {qtyLabel}/{item.par} {item.unit}</div>
                  </div>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, padding: '4px 10px', borderRadius: 8, flexShrink: 0, color: '#000', background: status === 'out' ? 'rgba(0,0,0,0.09)' : 'rgba(0,0,0,0.13)' }}>
                    {status === 'out' ? 'OUT' : 'LOW'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <ItemDetailPopup
          item={selected}
          onClose={() => setSelected(null)}
          onGoToItems={() => { onGoToStock(); setSelected(null) }}
        />
      )}
    </div>
  )
}

// Staff Overview landing page — welcome + clock button, hours this week,
// reviews this cycle, estimated pay teaser, upcoming shifts, checklist link.
function StaffOverviewLanding({
  me, roster, loadingRoster, onLoadRoster, onGoToTeam,
}: {
  me: TeamMember | null
  roster: RosterShift[]
  loadingRoster: boolean
  onLoadRoster: () => void
  onGoToTeam: (target: TeamNavTarget) => void
}) {
  useEffect(() => {
    if (roster.length === 0 && !loadingRoster) onLoadRoster()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [reviewCount, setReviewCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    api.reviewsScoreboard().then(res => {
      if (cancelled || !me) return
      const entry = res.staff.find(s => s.teamId === me.id)
      setReviewCount(entry?.count ?? 0)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [me?.id])

  const hoursThisWeek = useMemo(() => {
    if (!me) return 0
    const { start, end } = currentWeekBounds()
    return roster
      .filter(r => r.name === me.name && new Date(r.start_at) >= start && new Date(r.start_at) < end)
      .reduce((sum, r) => sum + (new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / 3_600_000, 0)
  }, [roster, me])

  const upcomingShifts = useMemo(() => {
    if (!me) return []
    const now = new Date()
    return roster
      .filter(r => r.name === me.name && new Date(r.start_at) >= now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .slice(0, 3)
  }, [roster, me])

  if (!me) return null

  const statTile: CSSProperties = { ...glass, borderRadius: 16, padding: '16px 18px', textAlign: 'left', border: 'none', cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...glassDark, borderRadius: 20, padding: '22px 22px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 6 })}>Welcome back</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: '#fff' }}>{me.name.split(' ')[0]}</div>
          <div style={mono({ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 8 })}>{me.clockedIn ? `Clocked in since ${me.clockIn}` : 'Not clocked in'}</div>
        </div>
        <button onClick={() => onGoToTeam({ section: 'account', accountTab: 'clock' })}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '10px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', background: me.clockedIn ? BRAND_PURPLE : '#fff', color: '#000', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {me.clockedIn ? 'Clock Out' : 'Clock In'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <button onClick={() => onGoToTeam({ section: 'roster' })} style={statTile}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Hours This Week</div>
          <div style={mono({ fontSize: 22, fontWeight: 300, color: '#000' })}>{hoursThisWeek.toFixed(1)}h</div>
          <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>Rostered, Mon–Sun →</div>
        </button>
        <button onClick={() => onGoToTeam({ section: 'reviews' })} style={statTile}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Reviews This Cycle</div>
          <div style={mono({ fontSize: 22, fontWeight: 300, color: '#000' })}>{reviewCount === null ? '—' : reviewCount}</div>
          <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>Full scoreboard →</div>
        </button>
        <button onClick={() => onGoToTeam({ section: 'account', accountTab: 'pay' })} style={statTile}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Estimated Pay · Last Cycle</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>PIN required</div>
          <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>View Hours & Pay →</div>
        </button>
      </div>

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 10 })}>Upcoming Shifts</div>
        {upcomingShifts.length === 0 ? (
          <div style={{ ...glassSubtle, borderRadius: 16, padding: '24px 20px', textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>Nothing scheduled yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcomingShifts.map(s => (
              <div key={s.id} style={{ ...glass, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>{new Date(s.start_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.5)' })}>{formatClock12(new Date(s.start_at))} – {formatClock12(new Date(s.end_at))}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onGoToTeam({ section: 'checklist' })}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '9px 16px', borderRadius: 99, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(0,0,0,0.05)', color: '#000', cursor: 'pointer' }}>
          Checklist
        </button>
      </div>
    </div>
  )
}

// ── Opening/Closing Checklist ────────────────────────────────────────────────
function ChecklistSection({ me, isManager }: { me: TeamMember | null; isManager: boolean }) {
  const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date())
  const [items, setItems] = useState<api.ChecklistItem[]>(() => IS_DRAFT_MODE ? draftChecklistItems as api.ChecklistItem[] : [])
  const [log, setLog] = useState<api.ChecklistLogEntry[]>([])
  const [loading, setLoading] = useState(!IS_DRAFT_MODE)
  const [type, setType] = useState<'opening' | 'closing'>('opening')
  const [notDoneTarget, setNotDoneTarget] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const today = todayStr()

  async function load() {
    if (IS_DRAFT_MODE) return
    setLoading(true)
    try {
      const [i, l] = await Promise.all([api.getChecklistItems(), api.getChecklistLog(today)])
      setItems(i); setLog(l)
    } catch (e) {
      console.warn('Checklist load failed:', e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const logByItem = new Map(log.map(l => [l.checklist_item_id, l]))
  const visible = items.filter(i => i.type === type)
  const doneCount = visible.filter(i => logByItem.get(i.id)?.status === 'done').length

  async function markDone(itemId: number) {
    setLog(prev => [...prev.filter(l => l.checklist_item_id !== itemId), {
      id: -itemId, checklist_item_id: itemId, log_date: today, status: 'done' as const,
      team_id: me?.id ?? null, team_name: me?.name ?? null, reason: null, completed_at: new Date().toISOString(),
    }])
    if (IS_DRAFT_MODE) return
    try { await api.setChecklistLog(itemId, today, 'done', me?.id ?? null, me?.name ?? null) }
    catch (e) { console.warn('Checklist mark done failed:', e) }
  }
  async function markNotDone(itemId: number) {
    const r = reason.trim() || null
    setLog(prev => [...prev.filter(l => l.checklist_item_id !== itemId), {
      id: -itemId, checklist_item_id: itemId, log_date: today, status: 'not_done' as const,
      team_id: me?.id ?? null, team_name: me?.name ?? null, reason: r, completed_at: new Date().toISOString(),
    }])
    setNotDoneTarget(null); setReason('')
    if (IS_DRAFT_MODE) return
    try { await api.setChecklistLog(itemId, today, 'not_done', me?.id ?? null, me?.name ?? null, r) }
    catch (e) { console.warn('Checklist mark not-done failed:', e) }
  }
  async function reset(itemId: number) {
    setLog(prev => prev.filter(l => l.checklist_item_id !== itemId))
    if (IS_DRAFT_MODE) return
    try { await api.clearChecklistLog(itemId, today) }
    catch (e) { console.warn('Checklist reset failed:', e) }
  }
  async function addTask() {
    const label = newLabel.trim()
    if (!label) return
    setNewLabel('')
    const position = items.filter(i => i.type === type).length
    if (IS_DRAFT_MODE) {
      setItems(prev => [...prev, { id: -Date.now(), type, label, position, archived: false } as api.ChecklistItem])
      return
    }
    try { await api.addChecklistItem({ type, label, position }); load() }
    catch (e) { console.warn('Add checklist item failed:', e) }
  }
  async function removeTask(id: number) {
    setItems(prev => prev.filter(i => i.id !== id))
    if (IS_DRAFT_MODE) return
    try { await api.archiveChecklistItem(id) }
    catch (e) { console.warn('Delete checklist item failed:', e) }
  }

  const TYPES: { key: 'opening' | 'closing'; label: string }[] = [{ key: 'opening', label: 'Opening' }, { key: 'closing', label: 'Closing' }]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2 }}>
          {TYPES.map(t => (
            <button key={t.key} onClick={() => setType(t.key)}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: type === t.key ? '#000' : 'transparent', color: type === t.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: type === t.key ? 500 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>
        {isManager && (
          <button onClick={() => setEditing(v => !v)}
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: 'pointer', background: editing ? '#000' : 'rgba(0,0,0,0.07)', color: editing ? '#fff' : '#000', border: '1px solid rgba(0,0,0,0.12)' }}>
            {editing ? 'Done Editing' : 'Edit Tasks'}
          </button>
        )}
      </div>

      <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)' })}>
        {today} · {doneCount} of {visible.length} done
      </div>

      {loading && <SectionSpinner />}

      {!loading && editing && (
        <div style={{ ...glass, borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(i => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.04)' }}>
              <span style={{ flex: 1, fontSize: 13, color: '#000' }}>{i.label}</span>
              <button onClick={() => removeTask(i.id)}
                style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.4)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder={`New ${type} task…`} value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} />
            <button onClick={addTask} disabled={!newLabel.trim()}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: newLabel.trim() ? '#000' : 'rgba(0,0,0,0.12)', color: newLabel.trim() ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              + Add
            </button>
          </div>
        </div>
      )}

      {!loading && !editing && visible.length === 0 && (
        <div style={{ ...glass, borderRadius: 16, padding: '40px 24px', textAlign: 'center', ...mono({ fontSize: 12, color: 'rgba(0,0,0,0.35)' }) }}>
          No {type} tasks yet{isManager ? ' — tap "Edit Tasks" to add some.' : '.'}
        </div>
      )}

      {!loading && !editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(i => {
            const entry = logByItem.get(i.id)
            const done = entry?.status === 'done'
            const notDone = entry?.status === 'not_done'
            return (
              <div key={i.id} style={{ ...glass, borderRadius: 14, overflow: 'hidden' }}>
                <div className="checklist-task" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
                  <button onClick={() => (done || notDone) ? reset(i.id) : markDone(i.id)}
                    aria-label={`${done || notDone ? 'Reset' : 'Mark done:'} ${i.label}`} title={done || notDone ? 'Tap to reset' : 'Mark done'}
                    style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, border: `1.5px solid ${done ? '#22c55e' : notDone ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)'}`, background: done ? '#22c55e' : notDone ? 'rgba(0,0,0,0.08)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    {done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    {notDone && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={3} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: '#000', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.55 : 1 }}>{i.label}</div>
                    {entry && (
                      <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: notDone ? 'rgba(180,60,40,0.65)' : 'rgba(0,0,0,0.35)', marginTop: 3 })}>
                        {done ? `Done by ${entry.team_name ?? 'someone'}` : `Not done — ${entry.team_name ?? 'someone'}${entry.reason ? `: ${entry.reason}` : ''}`}
                      </div>
                    )}
                  </div>
                  {!done && !notDone && (
                    <button className="checklist-exception" onClick={() => { setNotDoneTarget(i.id); setReason('') }}
                      style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', color: 'rgba(0,0,0,0.4)', cursor: 'pointer', flexShrink: 0 }}>
                      Can't do it
                    </button>
                  )}
                </div>
                {notDoneTarget === i.id && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', gap: 8 }}>
                    <input style={{ ...inputStyle, flex: 1 }} placeholder="Why not? (optional)" value={reason} onChange={e => setReason(e.target.value)} autoFocus />
                    <button onClick={() => markNotDone(i.id)}
                      style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Mark Not Done
                    </button>
                    <button onClick={() => setNotDoneTarget(null)}
                      style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Reviews scoreboard (staff-facing) ───────────────────────────────────────
function StaffReviewsPanel() {
  const [data, setData] = useState<api.ReviewScoreboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.reviewsScoreboard().then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the scoreboard') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return <SectionSpinner label="Loading reviews…" />
  if (error) return <div style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.5)' })}>{error}</div>
  if (!data) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>
        This cycle: {data.cycleStart} to {data.cycleEnd} — 10 reviews = $250 Myer card, 20 reviews = 2 nights' hotel
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.staff.map(s => (
          <div key={s.teamId} style={{ ...glass, borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 99, background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{s.avatar}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: '#000' }}>{s.name}</div>
                <div style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.4)' })}>{s.count} review{s.count === 1 ? '' : 's'} this cycle</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {s.tiers.map(t => (
                <div key={t.tier} style={{ flex: '1 1 160px', minWidth: 160 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.5)' })}>{t.label}</span>
                    <span style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.4)' })}>{Math.min(s.count, t.count)}/{t.count}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, s.count / t.count * 100)}%`, background: t.reached ? BRAND_PURPLE : 'rgba(191,119,246,0.35)', transition: 'width 0.3s' }} />
                  </div>
                  {t.reached && <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>{t.claim ? 'Reward given' : 'Reward pending'}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {data.staff.length === 0 && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)' })}>No team members yet.</div>}
      </div>
    </div>
  )
}

// ── Availability (staff Account sub-tab) ────────────────────────────────────
const DAYS_OF_WEEK: { dow: number; label: string }[] = [
  { dow: 1, label: 'Monday' }, { dow: 2, label: 'Tuesday' }, { dow: 3, label: 'Wednesday' },
  { dow: 4, label: 'Thursday' }, { dow: 5, label: 'Friday' }, { dow: 6, label: 'Saturday' }, { dow: 0, label: 'Sunday' },
]

function AvailabilitySection({ me }: { me: TeamMember | null }) {
  const [days, setDays] = useState<Record<number, { available: boolean; start_time: string; end_time: string }>>(() => {
    const d: Record<number, { available: boolean; start_time: string; end_time: string }> = {}
    for (const w of DAYS_OF_WEEK) d[w.dow] = { available: true, start_time: '09:00', end_time: '17:00' }
    return d
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!me) return
    let cancelled = false
    setLoading(true)
    api.getAvailability(me.id).then(res => {
      if (cancelled || res.availability.length === 0) return
      setDays(prev => {
        const next = { ...prev }
        for (const a of res.availability) next[a.day_of_week] = { available: a.available, start_time: a.start_time?.slice(0, 5) ?? '09:00', end_time: a.end_time?.slice(0, 5) ?? '17:00' }
        return next
      })
    }).catch(e => console.warn('Failed to load availability', e)).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [me?.id])

  async function save() {
    if (!me) return
    setSaving(true); setSaved(false)
    try {
      await api.setAvailability(me.id, DAYS_OF_WEEK.map(w => ({ day_of_week: w.dow, ...days[w.dow] })))
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { console.warn('Failed to save availability', e) }
    finally { setSaving(false) }
  }

  if (!me) return <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>Select a profile to set availability.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {loading ? <SectionSpinner /> : DAYS_OF_WEEK.map(w => {
        const d = days[w.dow]
        return (
          <div key={w.dow} style={{ ...glass, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 92, fontSize: 13, fontWeight: 500, color: '#000', flexShrink: 0 }}>{w.label}</div>
            <button onClick={() => setDays(prev => ({ ...prev, [w.dow]: { ...prev[w.dow], available: !prev[w.dow].available } }))}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 99, border: '1px solid rgba(0,0,0,0.15)', cursor: 'pointer', background: d.available ? '#000' : 'transparent', color: d.available ? '#fff' : 'rgba(0,0,0,0.4)', transition: 'all 0.2s', flexShrink: 0 }}>
              {d.available ? 'Available' : 'Off'}
            </button>
            {d.available && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                <input type="time" value={d.start_time} onChange={e => setDays(prev => ({ ...prev, [w.dow]: { ...prev[w.dow], start_time: e.target.value } }))} style={{ ...inputStyle, width: 100, padding: '6px 10px' }} />
                <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>–</span>
                <input type="time" value={d.end_time} onChange={e => setDays(prev => ({ ...prev, [w.dow]: { ...prev[w.dow], end_time: e.target.value } }))} style={{ ...inputStyle, width: 100, padding: '6px 10px' }} />
              </div>
            )}
          </div>
        )
      })}
      <button onClick={save} disabled={saving}
        style={{ marginTop: 4, padding: '10px 24px', borderRadius: 8, border: 'none', background: saving ? 'rgba(0,0,0,0.15)' : '#000', color: saving ? 'rgba(0,0,0,0.3)' : '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'default' : 'pointer', transition: 'all 0.2s', alignSelf: 'flex-start' }}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Availability'}
      </button>
    </div>
  )
}

// ── Shift Swap (staff Account sub-tab) ──────────────────────────────────────
function RequestCoverModal({ shift, team, onClose, onSubmit }: { shift: RosterShift; team: TeamMember[]; onClose: () => void; onSubmit: (reason: string, targetTeamId?: number) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [targetId, setTargetId] = useState<number | ''>('')
  const [submitting, setSubmitting] = useState(false)
  async function submit() {
    setSubmitting(true)
    try { await onSubmit(reason, targetId ? Number(targetId) : undefined) }
    finally { setSubmitting(false) }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...glass, borderRadius: 18, padding: 24, maxWidth: 380, width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#000' }}>Request Cover</div>
          <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 4 })}>
            {new Date(shift.start_at).toLocaleDateString('en-AU', { weekday: 'long', day: '2-digit', month: 'short' })} · {new Date(shift.start_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}–{new Date(shift.end_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Ask a specific teammate (optional)</label>
          <select style={{ ...inputStyle, appearance: 'none' }} value={targetId} onChange={e => setTargetId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Post to the whole team</option>
            {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Reason (optional)</label>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Doctor's appointment" />
        </div>
        <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', letterSpacing: '0.04em' })}>
          {targetId ? "Your manager will need to approve before it's final." : "Any teammate can offer to cover it — your manager will need to approve before it's final."}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={submit} disabled={submitting}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 13, fontWeight: 500, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Sending…' : 'Send Request'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.6)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function StaffShiftSwapSection({ me, team, roster }: { me: TeamMember | null; team: TeamMember[]; roster: RosterShift[] }) {
  const [tab, setTab] = useState<'mine' | 'open' | 'history'>('mine')
  const [open, setOpen] = useState<api.ShiftSwapRequest[]>([])
  const [mine, setMine] = useState<api.ShiftSwapRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [requestingShift, setRequestingShift] = useState<RosterShift | null>(null)
  const [offering, setOffering] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!me) return
    setLoading(true)
    try {
      const [o, m] = await Promise.all([api.openShiftSwaps(), api.myShiftSwaps(me.id)])
      setOpen(o.requests); setMine(m.requests)
    } catch (e) { console.warn('Failed to load shift swaps', e) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [me?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>Select a profile to swap shifts.</div>

  const now = Date.now()
  const requestedShiftIds = new Set(mine.filter(m => m.requesting_team_id === me.id && m.status !== 'cancelled' && m.status !== 'denied').map(m => m.square_shift_id))
  const myUpcomingShifts = roster.filter(s => s.name === me.name && new Date(s.end_at).getTime() > now).sort((a, b) => a.start_at.localeCompare(b.start_at))
  const openForOthers = open.filter(s => s.requesting_team_id !== me.id)

  const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    open: { bg: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.55)', label: 'Open' },
    pending_manager: { bg: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.55)', label: 'Awaiting manager' },
    approved: { bg: '#000', color: '#fff', label: 'Approved' },
    denied: { bg: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.35)', label: 'Declined' },
    cancelled: { bg: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.35)', label: 'Cancelled' },
  }
  const dayLabel = (s: string) => new Date(s).toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })
  const timeLabel = (s: string, e: string) => `${new Date(s).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}–${new Date(e).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}`

  async function submitRequest(reason: string, targetTeamId?: number) {
    if (!me || !requestingShift) return
    setError(null)
    try {
      await api.requestShiftSwap(me.id, { squareShiftId: requestingShift.id, shiftStartAt: requestingShift.start_at, shiftEndAt: requestingShift.end_at, reason: reason.trim() || undefined, targetTeamId })
      setRequestingShift(null); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit request — try again.') }
  }
  async function offer(requestId: number) {
    if (!me) return
    setOffering(requestId); setError(null)
    try { await api.offerShiftSwap(requestId, me.id); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'That shift may already be taken — try refreshing.') }
    finally { setOffering(null) }
  }
  async function cancel(requestId: number) {
    if (!me) return
    try { await api.cancelShiftSwap(me.id, requestId); await load() }
    catch (e) { console.warn('Failed to cancel swap request', e) }
  }

  const TABS: { key: 'mine' | 'open' | 'history'; label: string }[] = [
    { key: 'mine', label: 'My Shifts' }, { key: 'open', label: `Open (${openForOthers.length})` }, { key: 'history', label: 'My Requests' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2, alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0, background: tab === t.key ? '#000' : 'transparent', color: tab === t.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: tab === t.key ? 500 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={mono({ fontSize: 10, color: 'rgba(180,40,40,0.75)' })}>{error}</div>}
      {loading && <SectionSpinner />}

      {!loading && tab === 'mine' && (
        myUpcomingShifts.length === 0
          ? <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No upcoming published shifts found.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myUpcomingShifts.map(s => {
                const requested = requestedShiftIds.has(s.id)
                return (
                  <div key={s.id} style={{ ...glass, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>{dayLabel(s.start_at)}</div>
                      <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>{timeLabel(s.start_at, s.end_at)}</div>
                    </div>
                    {requested
                      ? <span style={{ ...mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }), padding: '5px 10px', borderRadius: 7, background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.55)', flexShrink: 0 }}>Requested</span>
                      : <button onClick={() => setRequestingShift(s)} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.15)', background: 'rgba(0,0,0,0.04)', color: '#000', fontSize: 11, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>Request Cover</button>}
                  </div>
                )
              })}
            </div>
      )}

      {!loading && tab === 'open' && (
        openForOthers.length === 0
          ? <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No open shifts up for grabs right now.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {openForOthers.map(s => (
                <div key={s.id} style={{ ...glass, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 99, background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: '#000' }}>{s.requester?.avatar ?? '??'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>{s.requester?.name ?? 'Unknown'}</div>
                    <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>{dayLabel(s.shift_start_at)} · {timeLabel(s.shift_start_at, s.shift_end_at)}</div>
                    {s.reason && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>{s.reason}</div>}
                  </div>
                  <button onClick={() => offer(s.id)} disabled={offering === s.id}
                    style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: '#000', color: '#fff', fontSize: 11, fontWeight: 500, cursor: offering === s.id ? 'default' : 'pointer', flexShrink: 0, opacity: offering === s.id ? 0.6 : 1 }}>
                    {offering === s.id ? 'Offering…' : 'Offer to Cover'}
                  </button>
                </div>
              ))}
            </div>
      )}

      {!loading && tab === 'history' && (
        mine.length === 0
          ? <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No shift swap activity yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mine.map(s => {
                const st = STATUS_STYLE[s.status]
                const isMine = s.requesting_team_id === me.id
                return (
                  <div key={s.id} style={{ ...glass, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>{isMine ? 'Your shift' : `Covering for ${s.requester?.name ?? 'a teammate'}`}</div>
                      <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>{dayLabel(s.shift_start_at)} · {timeLabel(s.shift_start_at, s.shift_end_at)}</div>
                      {s.reason && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>{s.reason}</div>}
                      {s.status === 'denied' && s.manager_note && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>Manager: {s.manager_note}</div>}
                      {s.status === 'approved' && !isMine && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>You're covering this shift.</div>}
                    </div>
                    <span style={{ ...mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }), padding: '5px 10px', borderRadius: 7, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                    {isMine && (s.status === 'open' || s.status === 'pending_manager') && (
                      <button onClick={() => cancel(s.id)} title="Withdraw request"
                        style={{ width: 26, height: 26, borderRadius: 99, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.4)', cursor: 'pointer', flexShrink: 0, fontSize: 13, lineHeight: 1 }}>✕</button>
                    )}
                  </div>
                )
              })}
            </div>
      )}

      {requestingShift && (
        <RequestCoverModal shift={requestingShift} team={team.filter(t => t.id !== me.id)} onClose={() => setRequestingShift(null)} onSubmit={submitRequest} />
      )}
    </div>
  )
}

// ── Time Off (staff Account sub-tab) ────────────────────────────────────────
function StaffTimeOffSection({ me }: { me: TeamMember | null }) {
  const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date())
  const [requests, setRequests] = useState<api.TimeOffRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!me) return
    setLoading(true)
    try { const res = await api.getMyTimeOff(me.id); setRequests(res.requests) }
    catch (e) { console.warn('Failed to load time off requests', e) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [me?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!me || !start || !end) return
    setSubmitting(true); setError(null)
    try {
      await api.requestTimeOff(me.id, start, end, reason.trim() || undefined)
      setStart(''); setEnd(''); setReason(''); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to submit request') }
    finally { setSubmitting(false) }
  }
  async function cancel(id: number) {
    if (!me) return
    try { await api.cancelTimeOff(me.id, id); await load() }
    catch (e) { console.warn('Failed to cancel request', e) }
  }

  if (!me) return <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>Select a profile to request time off.</div>

  const today = todayStr()
  const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.55)', label: 'Pending' },
    approved: { bg: '#000', color: '#fff', label: 'Approved' },
    denied: { bg: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.35)', label: 'Declined' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...glass, borderRadius: 16, padding: '20px 20px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#000', marginBottom: 14 }}>Request Time Off</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>From</label>
            <input style={inputStyle} type="date" value={start} min={today} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>To</label>
            <input style={inputStyle} type="date" value={end} min={start || today} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
        <label style={labelStyle}>Reason (optional)</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Family event" />
        {error && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.5)', marginTop: 8 })}>{error}</div>}
        <button onClick={submit} disabled={!start || !end || submitting}
          style={{ marginTop: 14, padding: '10px 24px', borderRadius: 8, border: 'none', background: !start || !end || submitting ? 'rgba(0,0,0,0.15)' : '#000', color: !start || !end || submitting ? 'rgba(0,0,0,0.3)' : '#fff', fontSize: 13, fontWeight: 500, cursor: !start || !end || submitting ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 12 })}>Your Requests</div>
        {loading && requests.length === 0 ? <SectionSpinner /> : requests.length === 0 ? (
          <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No requests yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {requests.map(r => {
              const st = STATUS_STYLE[r.status]
              return (
                <div key={r.id} style={{ ...glass, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>{r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`}</div>
                    {r.reason && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 4 })}>{r.reason}</div>}
                    {r.status === 'denied' && r.manager_note && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 4 })}>Manager: {r.manager_note}</div>}
                  </div>
                  <span style={{ ...mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }), padding: '5px 10px', borderRadius: 7, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                  {r.status === 'pending' && (
                    <button onClick={() => cancel(r.id)} title="Withdraw request"
                      style={{ width: 26, height: 26, borderRadius: 99, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.4)', cursor: 'pointer', flexShrink: 0, fontSize: 13, lineHeight: 1 }}>✕</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hours & Pay (staff Account sub-tab) ─────────────────────────────────────
const STAFF_PAY_ESTIMATE_FACTOR = 0.85
const staffPayEstimate = (cents: number) => Math.round(cents * STAFF_PAY_ESTIMATE_FACTOR)

function PayBandRows({ rows }: { rows: { label: string; hours: number; payCents: number }[] }) {
  if (rows.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'rgba(0,0,0,0.55)' }}>{r.label}</span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)' })}>{r.hours}h</span>
            <span style={mono({ fontSize: 12, fontWeight: 600, color: '#000' })}>{formatMoney(staffPayEstimate(r.payCents), 'AUD')}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
function PayShiftList({ shifts }: { shifts: api.PayShift[] }) {
  if (shifts.length === 0) return <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)', textAlign: 'center', padding: '8px 0' })}>No shifts recorded</div>
  return (
    <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {shifts.map((s, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ color: '#000' }}>{new Date(`${s.date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
            <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginLeft: 8 })}>{s.start}–{s.end}</span>
            {s.source === 'manual' && <span style={mono({ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginLeft: 6 })}>manual</span>}
          </div>
          <span style={mono({ fontSize: 11, fontWeight: 600, color: '#000', flexShrink: 0 })}>{formatMoney(staffPayEstimate(s.payCents), 'AUD')}</span>
        </div>
      ))}
    </div>
  )
}
function bandRows(hours: api.PayBands, cents: api.PayBands) {
  const rows: { label: string; hours: number; payCents: number }[] = []
  const add = (label: string, h: number, c: number) => {
    const existing = rows.find(r => r.label === label)
    if (existing) { existing.hours += h; existing.payCents += c }
    else if (h > 0 || c > 0) rows.push({ label, hours: h, payCents: c })
  }
  add('Ordinary', hours.ordinary, cents.ordinary)
  add('Evening', hours.eveningEarly + hours.eveningLate, cents.eveningEarly + cents.eveningLate)
  add('Saturday', hours.saturday, cents.saturday)
  add('Sunday', hours.sundayL1 + hours.sundayL23, cents.sundayL1 + cents.sundayL23)
  add('Public holiday', hours.publicHoliday, cents.publicHoliday)
  return rows
}
function HoursPaySection({ me }: { me: TeamMember | null }) {
  const [data, setData] = useState<api.PayrollMe | null>(null)
  const [loading, setLoading] = useState(false)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [cycleCount, setCycleCount] = useState(4)

  async function load(n = cycleCount) {
    if (!me) return
    setLoading(true)
    try { setData(await api.payrollMe(me.id, n)) }
    catch (e) { console.warn('Failed to load pay', e) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [me?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadMore() {
    const n = cycleCount + 4
    setCycleCount(n); load(n)
  }

  const fmtRange = (s: string, e: string) => {
    const sd = new Date(`${s}T00:00:00`), ed = new Date(`${e}T00:00:00`)
    return `${sd.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${ed.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }

  if (!me) return null
  if (loading && !data) return <SectionSpinner label="Loading your pay…" />
  if (!data) return null
  if (!data.configured) return (
    <div style={{ ...glassSubtle, borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#000', marginBottom: 6 }}>Pay classification not set up yet</div>
      <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.4)', lineHeight: 1.6 })}>Ask your manager to set your Award classification in Manager → Finance → Setup — your hours and pay estimate will show here once that's done.</div>
    </div>
  )

  const current = data.cycles.find(c => c.isCurrent) ?? data.cycles[0]
  const previous = data.cycles.filter(c => c !== current)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>
        {data.classificationLabel} · {data.employmentType === 'casual' ? 'Casual' : data.employmentType === 'part_time' ? 'Part-time' : 'Full-time'}
      </div>
      <div style={{ ...glassSubtle, borderRadius: 12, padding: '12px 16px', ...mono({ fontSize: 10, color: 'rgba(0,0,0,0.5)', lineHeight: 1.6 }) }}>
        Conservative guide only. Your payroll system calculates the final amount.
      </div>
      {data.dobMissing && (
        <div style={{ ...glassSubtle, borderRadius: 12, padding: '12px 16px', ...mono({ fontSize: 10, color: 'rgba(150,90,20,0.85)', lineHeight: 1.6 }) }}>
          Your date of birth hasn't been set, so pay below is estimated at the full adult rate. Ask your manager to add it if you're under 21 — junior rates may apply.
        </div>
      )}
      {current && (
        <div style={{ ...glass, borderRadius: 18, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>{fmtRange(current.start, current.end)}</div>
              <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 3 })}>Current fortnight</div>
            </div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 99, background: '#000', color: '#fff', whiteSpace: 'nowrap' }}>{current.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#000', letterSpacing: '-0.02em' }}>{formatMoney(staffPayEstimate(current.totalPayCents), 'AUD')}</div>
              <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>Estimated gross pay</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#000', letterSpacing: '-0.02em' }}>{current.totalHours}</div>
              <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>Hours</div>
            </div>
          </div>
          <div style={{ ...glassSubtle, borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Estimated net pay</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#000' }}>{formatMoney(staffPayEstimate(current.estimatedNetPayCents), 'AUD')}</span>
              <span style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)' })}>−{formatMoney(staffPayEstimate(current.estimatedTaxCents), 'AUD')} tax</span>
            </div>
          </div>
          <PayBandRows rows={bandRows(current.bandHours, current.bandPayCents)} />
          <PayShiftList shifts={current.shifts} />
        </div>
      )}
      {previous.length > 0 && (
        <div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 10 })}>Previous fortnights</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {previous.map((c, i) => {
              const isOpen = openIdx === i
              return (
                <div key={c.start} style={{ ...glassSubtle, borderRadius: 14, overflow: 'hidden' }}>
                  <button onClick={() => setOpenIdx(isOpen ? null : i)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>{fmtRange(c.start, c.end)}</div>
                      <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>{c.label} · {c.totalHours}h</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#000' }}>{formatMoney(staffPayEstimate(c.totalPayCents), 'AUD')}</div>
                        <div style={mono({ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)' })}>net {formatMoney(staffPayEstimate(c.estimatedNetPayCents), 'AUD')}</div>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9" /></svg>
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 18px 16px' }}>
                      <div style={{ ...glassSubtle, borderRadius: 10, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Estimated net pay</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>{formatMoney(staffPayEstimate(c.estimatedNetPayCents), 'AUD')}</span>
                          <span style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)' })}>−{formatMoney(staffPayEstimate(c.estimatedTaxCents), 'AUD')} tax</span>
                        </div>
                      </div>
                      <PayBandRows rows={bandRows(c.bandHours, c.bandPayCents)} />
                      <PayShiftList shifts={c.shifts} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button onClick={loadMore} disabled={loading}
            style={{ width: '100%', marginTop: 10, padding: 10, borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', color: 'rgba(0,0,0,0.5)', cursor: loading ? 'default' : 'pointer', ...mono({ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }) }}>
            {loading ? 'Loading…' : 'Load older fortnights'}
          </button>
        </div>
      )}
      <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.28)', lineHeight: 1.6, padding: '0 4px' })}>
        Estimates only, based on the Fast Food Industry Award. Net pay assumes this is your main job, no HELP/STSL debt, and {data.claimsTaxFreeThreshold ? 'the tax-free threshold claimed' : 'the tax-free threshold not claimed'} — excludes superannuation, which your employer pays on top.
      </div>
    </div>
  )
}

// ── Account > Security — Face ID / fingerprint / Windows Hello device
// enrollment, gated behind the member's own PIN. The "Sign in with Face ID"
// button on the login screen (UserSelectScreen) uses the sign-in-side
// routes (login-options/login-verify) via handleFaceIdLogin in App.
function AccountSecuritySection({ me }: { me: TeamMember | null }) {
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [checking, setChecking] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [verifiedPin, setVerifiedPin] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<api.WebAuthnCredential[]>([])
  const [loadingCredentials, setLoadingCredentials] = useState(false)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [deviceName, setDeviceName] = useState(() => {
    const ua = navigator.userAgent
    const os = /iPhone/.test(ua) ? 'iPhone'
      : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android device'
      : /Macintosh/.test(ua) ? 'Mac'
      : /Windows/.test(ua) ? 'Windows PC'
      : 'This device'
    const browser = /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /CriOS\//.test(ua) ? 'Chrome'
      : /FxiOS\//.test(ua) ? 'Firefox'
      : /Firefox\//.test(ua) ? 'Firefox'
      : /Safari\//.test(ua) ? 'Safari'
      : null
    return browser ? `${os} · ${browser}` : os
  })
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      if (!browserSupportsWebAuthn()) { setSupported(false); return }
      try { setSupported(await platformAuthenticatorIsAvailable()) } catch { setSupported(false) }
    })()
  }, [])

  async function verifyPin(candidate: string) {
    if (!me) return
    setChecking(true)
    try {
      const res = await api.webauthnCredentials(me.id, candidate)
      setCredentials(res.credentials)
      setVerifiedPin(candidate)
      setPinError(false)
    } catch {
      setPinError(true)
      setPin('')
      setVerifiedPin(null)
    } finally {
      setChecking(false)
      setLoadingCredentials(false)
    }
  }

  async function handlePinKey(k: string) {
    if (checking) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(false); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      setLoadingCredentials(true)
      await verifyPin(next)
    }
  }

  async function enrollDevice() {
    if (!me || !verifiedPin) return
    setEnrolling(true)
    setEnrollError(null)
    try {
      const { flowId, options } = await api.webauthnRegisterOptions(me.id, verifiedPin)
      const response = await startRegistration({ optionsJSON: options })
      await api.webauthnRegisterVerify(me.id, verifiedPin, flowId, response, deviceName.trim() || 'This device')
      const res = await api.webauthnCredentials(me.id, verifiedPin)
      setCredentials(res.credentials)
    } catch (e) {
      if (e instanceof WebAuthnError && e.code === 'ERROR_CEREMONY_ABORTED') {
        // user cancelled the OS prompt — not an error worth surfacing
      } else {
        setEnrollError(e instanceof Error ? e.message : 'Could not set up Face ID / Fingerprint on this device.')
      }
    } finally {
      setEnrolling(false)
    }
  }

  async function removeDevice(credentialId: string) {
    if (!me || !verifiedPin) return
    setRemovingId(credentialId)
    try {
      await api.webauthnDeleteCredential(credentialId, me.id, verifiedPin)
      setCredentials(prev => prev.filter(c => c.id !== credentialId))
    } catch { /* ignore */ } finally {
      setRemovingId(null)
    }
  }

  if (!me) return null

  if (!verifiedPin) {
    return (
      <div style={{ ...glass, borderRadius: 20, padding: '36px 28px', maxWidth: 340, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: 46, height: 46, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 4 }}>Security is private</div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 28 })}>Enter your PIN to manage it</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                disabled={k === '' || checking}
                onPointerDown={() => { if (k && !checking) { setPressedKey(k); hapticTap() } }}
                onPointerUp={() => setPressedKey(null)}
                onPointerLeave={() => setPressedKey(null)}
                onPointerCancel={() => setPressedKey(null)}
                onClick={() => k && handlePinKey(k)}
                style={{ width: 58, height: 58, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.7)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.5)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 16 : 19, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checking ? 0.5 : 1 }}
              >{k}</button>
            </div>
          ))}
        </div>
        {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginTop: 4 })}>Incorrect PIN — try again</div>}
        {checking && !pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>Checking…</div>}
      </div>
    )
  }

  if (loadingCredentials) return <SectionSpinner label="Loading your devices…" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...glass, borderRadius: 18, padding: 22 }}>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Face ID / Fingerprint</div>
        {supported === false ? (
          <div style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.5)', lineHeight: 1.6 }}>
            This device or browser doesn't support Face ID, fingerprint, or Windows Hello sign-in. Your PIN still works as normal.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.55)', lineHeight: 1.6, marginBottom: 14 }}>
              Register this device so you can sign in with Face ID, fingerprint, or Windows Hello instead of typing your PIN. On a shared device, each person registers their own — it'll ask who's signing in.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="Name this device" style={{ ...inputStyle, flex: '1 1 180px', minWidth: 0 }} />
              <button onClick={enrollDevice} disabled={enrolling} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '10px 16px', borderRadius: 10, border: 'none', cursor: enrolling ? 'default' : 'pointer', background: '#000', color: '#fff', opacity: enrolling ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {enrolling ? 'Setting up…' : '+ Enable on this device'}
              </button>
            </div>
            {enrollError && <div style={mono({ fontSize: 10, color: 'rgba(180,40,40,0.75)', marginTop: 8 })}>{enrollError}</div>}
          </>
        )}
      </div>

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 10 })}>Registered Devices</div>
        {credentials.length === 0 ? (
          <div style={{ ...glassSubtle, borderRadius: 14, padding: 20, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.35)' }) }}>
            No devices registered yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {credentials.map(c => (
              <div key={c.id} style={{ ...glassSubtle, borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>{c.device_label || 'Unnamed device'}</div>
                  <div style={mono({ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>
                    Added {new Date(c.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {c.last_used_at ? ` · Last used ${new Date(c.last_used_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                  </div>
                </div>
                <button onClick={() => removeDevice(c.id)} disabled={removingId === c.id} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(180,40,40,0.25)', background: 'rgba(180,40,40,0.08)', color: 'rgba(180,40,40,0.85)', cursor: removingId === c.id ? 'default' : 'pointer', opacity: removingId === c.id ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                  {removingId === c.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Financials: money formatting ────────────────────────────────────────────
function formatMoney(cents: number, currency = 'AUD') {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format((cents ?? 0) / 100)
}

// ── Financials: interactive SVG sales chart with hover tooltip ─────────────
function SalesChart({ series, metric, currency }: { series: api.FinancialsSeriesPoint[]; metric: FinancialsMetric; currency: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(680)
  const height = 220, padL = 8, padR = 8, padT = 16, padB = 28
  const innerW = width - padL - padR, innerH = height - padT - padB
  const n = series.length

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const measuredWidth = entries[0]?.contentRect.width
      if (measuredWidth) setWidth(previous => Math.abs(previous - measuredWidth) > 2 ? measuredWidth : previous)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [n])

  const values = series.map(p => metric === 'gross' ? p.grossSales : metric === 'net' ? p.netSales : p.orderCount)
  const maxV = Math.max(1, ...values)

  function xAt(i: number) { return n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW }
  function yAt(v: number) { return padT + innerH - (v / maxV) * innerH }

  const fmt = (v: number) => metric === 'orders' ? String(v) : formatMoney(v, currency)

  if (n === 0) {
    return <div style={{ ...glassSubtle, borderRadius: 14, padding: 40, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No sales data for this range.</div>
  }

  const points = values.map((v, i) => [xAt(i), yAt(v)] as const)
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${xAt(n - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
  const labelStep = Math.max(1, Math.ceil(n / 7))

  return (
    <div ref={wrapRef} className="sales-chart" style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 220, display: 'block', cursor: 'crosshair' }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const relX = ((e.clientX - rect.left) / rect.width) * width
          let idx = 0, best = Infinity
          for (let i = 0; i < n; i++) {
            const d = Math.abs(xAt(i) - relX)
            if (d < best) { best = d; idx = i }
          }
          setHoverIdx(idx)
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={padL} x2={width - padR} y1={padT + innerH * t} y2={padT + innerH * t} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
        ))}
        <path d={areaPath} fill="url(#salesFill)" stroke="none" />
        <path d={linePath} fill="none" stroke="#000" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((p, i) => i % labelStep === 0 && (
          <text key={p.date} x={xAt(i)} y={height - 8} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(0,0,0,0.35)">
            {new Date(p.date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
          </text>
        ))}
        {hoverIdx !== null && (
          <>
            <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={padT} y2={padT + innerH} stroke="rgba(0,0,0,0.25)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={xAt(hoverIdx)} cy={yAt(values[hoverIdx])} r={4} fill="#000" />
          </>
        )}
      </svg>
      {hoverIdx !== null && (
        <div style={{ position: 'absolute', top: 4, left: `${(xAt(hoverIdx) / width) * 100}%`, transform: 'translateX(-50%)', ...glass, borderRadius: 10, padding: '6px 10px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>
            {new Date(series[hoverIdx].date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>{fmt(values[hoverIdx])}</div>
        </div>
      )}
    </div>
  )
}

// ── Financials: date range + summary + chart + channels + transactions ─────
function FinancialsSection() {
  const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date())
  const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const presetRange = (p: FinancialsPreset): { start: string; end: string } => {
    const today = todayStr()
    switch (p) {
      case 'today': return { start: today, end: today }
      case 'yesterday': { const y = addDays(today, -1); return { start: y, end: y } }
      case '7d': return { start: addDays(today, -6), end: today }
      case '30d': return { start: addDays(today, -29), end: today }
      case '365d': return { start: addDays(today, -364), end: today }
      case 'thisMonth': return { start: today.slice(0, 7) + '-01', end: today }
      default: return { start: today, end: today }
    }
  }

  const [preset, setPreset] = useState<FinancialsPreset>('7d')
  const [range, setRange] = useState(() => presetRange('7d'))
  const [pendingStart, setPendingStart] = useState(range.start)
  const [pendingEnd, setPendingEnd] = useState(range.end)
  const [metric, setMetric] = useState<FinancialsMetric>('gross')
  const [data, setData] = useState<api.FinancialsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<api.Transaction[]>([])
  const [txCursor, setTxCursor] = useState<string | null>(null)
  const [txLoadingMore, setTxLoadingMore] = useState(false)
  const [showFailed, setShowFailed] = useState(false)

  function applyPreset(p: FinancialsPreset) {
    setPreset(p)
    const r = presetRange(p)
    setRange(r)
    setPendingStart(r.start)
    setPendingEnd(r.end)
  }

  function applyCustomRange() {
    if (!pendingStart || !pendingEnd || pendingStart > pendingEnd) return
    setPreset('custom')
    setRange({ start: pendingStart, end: pendingEnd })
  }

  async function load() {
    setLoading(true); setError(null)
    try {
      const [fin, tx] = await Promise.all([
        api.squareFinancials(range.start, range.end),
        // Fetch the max page size — a large share of raw payment attempts can
        // be failed card-testing noise, and we filter those out by default,
        // so a bigger page keeps the visible list from looking sparse.
        api.squareTransactions(range.start, range.end, undefined, 100),
      ])
      setData(fin)
      setTransactions(tx.transactions)
      setTxCursor(tx.cursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [range.start, range.end])

  async function loadMoreTransactions() {
    if (!txCursor) return
    setTxLoadingMore(true)
    try {
      const tx = await api.squareTransactions(range.start, range.end, txCursor, 100)
      setTransactions(prev => [...prev, ...tx.transactions])
      setTxCursor(tx.cursor)
    } catch (e) {
      console.warn('Failed to load more transactions', e)
    } finally {
      setTxLoadingMore(false)
    }
  }

  const s = data?.summary
  const currency = data?.currency ?? 'AUD'
  const fmt = (v: number) => formatMoney(v, currency)

  const PRESETS: { key: FinancialsPreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '365d', label: '365 Days' },
    { key: 'thisMonth', label: 'This Month' },
  ]

  const METRICS: { key: FinancialsMetric; label: string }[] = [
    { key: 'gross', label: 'Gross' },
    { key: 'net', label: 'Net' },
    { key: 'orders', label: 'Orders' },
  ]

  // FAILED payments are frequently card-testing/fraud noise (many tiny,
  // identical-amount attempts with rotating card numbers) rather than real
  // activity — hide them from the list by default, with a toggle to reveal.
  const failedCount = transactions.filter(t => t.status === 'FAILED').length
  const visibleTransactions = showFailed ? transactions : transactions.filter(t => t.status !== 'FAILED')

  const CARDS: { label: string; value: string; dark?: boolean }[] = [
    { label: 'Gross Sales', value: s ? fmt(s.grossSales) : '—', dark: true },
    { label: 'Net Sales', value: s ? fmt(s.netSales) : '—' },
    { label: 'Total Collected', value: s ? fmt(s.totalCollected) : '—' },
    { label: 'Orders', value: s ? String(s.orderCount) : '—' },
    { label: 'Tax', value: s ? fmt(s.tax) : '—' },
    { label: 'Tips', value: s ? fmt(s.tip) : '—' },
    { label: 'Discounts', value: s ? fmt(s.discounts) : '—' },
    { label: 'Refunds', value: s ? fmt(s.refunds) : '—' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Date range controls */}
      <div className="finance-controls-shell" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div className="finance-controls-inner" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <div className="finance-presets" style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2 }}>
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: preset === p.key ? '#000' : 'transparent', color: preset === p.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: preset === p.key ? 500 : 400, whiteSpace: 'nowrap' }}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="finance-date-range" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input aria-label="From date" type="date" value={pendingStart} max={pendingEnd || todayStr()} onChange={e => setPendingStart(e.target.value)}
              style={{ ...inputStyle, padding: '6px 8px', fontSize: 11, width: 132 }} />
            <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>→</span>
            <input aria-label="To date" type="date" value={pendingEnd} min={pendingStart} max={todayStr()} onChange={e => setPendingEnd(e.target.value)}
              style={{ ...inputStyle, padding: '6px 8px', fontSize: 11, width: 132 }} />
            <button onClick={applyCustomRange}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.15)', background: preset === 'custom' ? '#000' : 'rgba(0,0,0,0.05)', color: preset === 'custom' ? '#fff' : 'rgba(0,0,0,0.5)' }}>
              Apply
            </button>
          </div>
        </div>
        <button onClick={load} disabled={loading} title="Refresh"
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: loading ? 'default' : 'pointer', transition: 'all 0.2s', background: 'rgba(0,0,0,0.07)', color: '#000', border: '1px solid rgba(0,0,0,0.12)', opacity: loading ? 0.5 : 1 }}>
          {loading ? 'Loading…' : '⟳ Refresh'}
        </button>
      </div>

      {loading && !data && <SectionSpinner />}

      {error && (
        <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
          Couldn't load financials: {error}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {CARDS.map(card => (
          <div key={card.label} style={{ ...(card.dark ? glassDark : glass), borderRadius: 12, padding: '14px 16px' }}>
            <div style={mono({ fontSize: card.value.length > 9 ? 15 : 20, fontWeight: 300, color: card.dark ? '#fff' : '#000', lineHeight: 1.2 })}>{card.value}</div>
            <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: card.dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)', marginTop: 6 })}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ ...glass, borderRadius: 16, padding: '18px 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' })}>Sales Over Time</div>
          <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2 }}>
            {METRICS.map(m => (
              <button key={m.key} onClick={() => setMetric(m.key)}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: metric === m.key ? '#000' : 'transparent', color: metric === m.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: metric === m.key ? 500 : 400 }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <SalesChart series={data?.series ?? []} metric={metric} currency={currency} />
      </div>

      {/* Channel breakdown */}
      {data && data.channels.length > 0 && (
        <div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 10 })}>Sales by Channel</div>
          <div style={{ ...glassSubtle, borderRadius: 16, overflow: 'hidden' }}>
            {data.channels.map((ch, i) => {
              const pct = data.summary.grossSales > 0 ? (ch.grossSales / data.summary.grossSales) * 100 : 0
              return (
                <div key={ch.channel} style={{ padding: '12px 18px', borderBottom: i < data.channels.length - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>{ch.channel}</div>
                    <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.5)', whiteSpace: 'nowrap' })}>{fmt(ch.grossSales)} · {ch.orderCount} orders</div>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#000', borderRadius: 99 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' })}>Recent Transactions</div>
          {failedCount > 0 && (
            <button onClick={() => setShowFailed(v => !v)}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.12)', background: showFailed ? '#000' : 'rgba(0,0,0,0.05)', color: showFailed ? '#fff' : 'rgba(0,0,0,0.5)' }}>
              {showFailed ? `Hide failed (${failedCount})` : `Show failed (${failedCount})`}
            </button>
          )}
        </div>
        {visibleTransactions.length === 0 && !loading && (
          <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>
            {transactions.length === 0 ? 'No transactions in this range.' : 'No successful transactions in this range — try "Show failed" above.'}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibleTransactions.map(t => {
            const statusColor = t.status === 'COMPLETED' ? '#000' : t.status === 'FAILED' ? 'rgba(180,40,40,0.8)' : 'rgba(0,0,0,0.4)'
            return (
              <div key={t.id} style={{ ...glass, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>
                    {fmt(t.amount)}{t.tip > 0 ? ` + ${fmt(t.tip)} tip` : ''}
                  </div>
                  <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 3 })}>
                    {t.cardBrand ? `${t.cardBrand} •••• ${t.last4}` : t.sourceType}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor, fontWeight: 600 })}>{t.status}</div>
                  <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 3 })}>
                    {new Date(t.createdAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {txCursor && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <button onClick={loadMoreTransactions} disabled={txLoadingMore}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 18px', borderRadius: 99, cursor: txLoadingMore ? 'default' : 'pointer', background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.55)', border: '1px solid rgba(0,0,0,0.12)', opacity: txLoadingMore ? 0.5 : 1 }}>
              {txLoadingMore ? 'Loading…' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hours & Wages: logged vs scheduled hours (weekday/Sat/Sun), wage cost vs income ─
function HoursWagesSection() {
  const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date())
  const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const presetRange = (p: FinancialsPreset): { start: string; end: string } => {
    const today = todayStr()
    switch (p) {
      case 'today': return { start: today, end: today }
      case 'yesterday': { const y = addDays(today, -1); return { start: y, end: y } }
      case '7d': return { start: addDays(today, -6), end: today }
      case '30d': return { start: addDays(today, -29), end: today }
      case 'thisMonth': return { start: today.slice(0, 7) + '-01', end: today }
      default: return { start: today, end: today }
    }
  }

  const [preset, setPreset] = useState<FinancialsPreset>('7d')
  const [range, setRange] = useState(() => presetRange('7d'))
  const [pendingStart, setPendingStart] = useState(range.start)
  const [pendingEnd, setPendingEnd] = useState(range.end)
  const [data, setData] = useState<api.HoursResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyPreset(p: FinancialsPreset) {
    setPreset(p)
    const r = presetRange(p)
    setRange(r)
    setPendingStart(r.start)
    setPendingEnd(r.end)
  }

  function applyCustomRange() {
    if (!pendingStart || !pendingEnd || pendingStart > pendingEnd) return
    setPreset('custom')
    setRange({ start: pendingStart, end: pendingEnd })
  }

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await api.squareHours(range.start, range.end)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [range.start, range.end])

  const currency = data?.currency ?? 'AUD'
  const fmt = (v: number) => formatMoney(v, currency)
  const fmtHrs = (h: number) => `${h.toFixed(1)}h`

  const PRESETS: { key: FinancialsPreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: 'thisMonth', label: 'This Month' },
  ]

  const totals = (data?.staff ?? []).reduce((acc, s) => ({
    logged: acc.logged + s.loggedHours.total,
    scheduled: acc.scheduled + s.scheduledHours.total,
    wageCost: acc.wageCost + s.wageCost,
  }), { logged: 0, scheduled: 0, wageCost: 0 })

  const totalIncome = (data?.daily ?? []).reduce((sum, d) => sum + d.grossSales, 0)
  const overallLaborPct = totalIncome > 0 ? (totals.wageCost / totalIncome) * 100 : null

  const CARDS: { label: string; value: string; dark?: boolean }[] = [
    { label: 'Logged Hours', value: fmtHrs(totals.logged), dark: true },
    { label: 'Scheduled Hours', value: fmtHrs(totals.scheduled) },
    { label: 'Wage Cost', value: fmt(totals.wageCost) },
    { label: 'Labor %', value: overallLaborPct !== null ? `${overallLaborPct.toFixed(1)}%` : '—' },
  ]

  function laborColor(pct: number | null) {
    if (pct === null) return 'rgba(0,0,0,0.3)'
    if (pct >= 35) return 'rgba(0,0,0,0.9)'
    if (pct >= 25) return 'rgba(0,0,0,0.65)'
    return 'rgba(0,0,0,0.4)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Date range controls */}
      <div className="finance-controls-shell" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div className="finance-controls-inner" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <div className="finance-presets" style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2 }}>
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: preset === p.key ? '#000' : 'transparent', color: preset === p.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: preset === p.key ? 500 : 400, whiteSpace: 'nowrap' }}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="finance-date-range" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input aria-label="From date" type="date" value={pendingStart} max={pendingEnd || todayStr()} onChange={e => setPendingStart(e.target.value)}
              style={{ ...inputStyle, padding: '6px 8px', fontSize: 11, width: 132 }} />
            <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>→</span>
            <input aria-label="To date" type="date" value={pendingEnd} min={pendingStart} max={todayStr()} onChange={e => setPendingEnd(e.target.value)}
              style={{ ...inputStyle, padding: '6px 8px', fontSize: 11, width: 132 }} />
            <button onClick={applyCustomRange}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.15)', background: preset === 'custom' ? '#000' : 'rgba(0,0,0,0.05)', color: preset === 'custom' ? '#fff' : 'rgba(0,0,0,0.5)' }}>
              Apply
            </button>
          </div>
        </div>
        <button onClick={load} disabled={loading} title="Refresh"
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: loading ? 'default' : 'pointer', transition: 'all 0.2s', background: 'rgba(0,0,0,0.07)', color: '#000', border: '1px solid rgba(0,0,0,0.12)', opacity: loading ? 0.5 : 1 }}>
          {loading ? 'Loading…' : '⟳ Refresh'}
        </button>
      </div>

      {loading && !data && <SectionSpinner />}

      {error && (
        <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
          Couldn't load hours & wages: {error}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {CARDS.map(card => (
          <div key={card.label} style={{ ...(card.dark ? glassDark : glass), borderRadius: 12, padding: '14px 16px' }}>
            <div style={mono({ fontSize: card.value.length > 9 ? 15 : 20, fontWeight: 300, color: card.dark ? '#fff' : '#000', lineHeight: 1.2 })}>{card.value}</div>
            <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: card.dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)', marginTop: 6 })}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Per-staff hours */}
      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 10 })}>Staff — Logged vs Scheduled</div>
        {(data?.staff ?? []).length === 0 && !loading && (
          <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>
            No hours logged or scheduled in this range.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(data?.staff ?? []).map(s => {
            const variance = s.loggedHours.total - s.scheduledHours.total
            return (
              <div key={s.teamId} style={{ ...glass, borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 99, background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 600, color: '#000' }}>{s.avatar}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{s.name}</div>
                    <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>
                      {s.hourlyRateLatest !== null ? `${fmt(s.hourlyRateLatest)}/hr` : 'Rate n/a'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={mono({ fontSize: 15, fontWeight: 500, color: '#000' })}>{fmt(s.wageCost)}</div>
                    <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: variance === 0 ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.6)', fontWeight: variance !== 0 ? 600 : 400, marginTop: 2 })}>
                      {variance === 0 ? 'On schedule' : variance > 0 ? `+${variance.toFixed(1)}h over` : `${variance.toFixed(1)}h under`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {([
                    { label: 'Logged', b: s.loggedHours },
                    { label: 'Scheduled', b: s.scheduledHours },
                  ] as { label: string; b: api.HoursBucket }[]).map(col => (
                    <div key={col.label} style={{ ...glassSubtle, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>{col.label} — {fmtHrs(col.b.total)}</div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.55)' })}>Wkday <strong style={{ color: '#000' }}>{fmtHrs(col.b.weekday)}</strong></div>
                        <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.55)' })}>Sat <strong style={{ color: '#000' }}>{fmtHrs(col.b.saturday)}</strong></div>
                        <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.55)' })}>Sun <strong style={{ color: '#000' }}>{fmtHrs(col.b.sunday)}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Daily wages vs income */}
      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 10 })}>Wages vs Income by Day</div>
        {(data?.daily ?? []).length === 0 && !loading && (
          <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>
            No data for this range.
          </div>
        )}
        <div style={{ ...glassSubtle, borderRadius: 16, overflow: 'hidden' }}>
          {(data?.daily ?? []).map((d, i) => {
            const pct = d.laborPct
            const barPct = pct !== null ? Math.min(100, pct) : 0
            return (
              <div key={d.date} style={{ padding: '12px 18px', borderBottom: i < (data?.daily.length ?? 0) - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>
                    {new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })}
                  </div>
                  <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.5)', whiteSpace: 'nowrap' })}>
                    {fmt(d.wageCost)} wages · {fmt(d.grossSales)} gross{pct !== null ? ' · ' : ''}
                    {pct !== null && <span style={{ fontWeight: 600, color: laborColor(pct) }}>{pct.toFixed(1)}% labor</span>}
                  </div>
                </div>
                <div style={{ height: 4, borderRadius: 99, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barPct}%`, background: laborColor(pct), borderRadius: 99 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Music: shared cafe Spotify account, custom player matching app style ───
const transportBtn: CSSProperties = {
  width: 38, height: 38, borderRadius: 99, border: 'none', background: 'rgba(255,255,255,0.1)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
}

function fmtMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function MusicView() {
  const [status, setStatus] = useState<api.SpotifyStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [now, setNow] = useState<api.SpotifyNowPlaying | null>(null)
  const [nowError, setNowError] = useState<string | null>(null)
  const [devices, setDevices] = useState<api.SpotifyDevice[]>([])
  const [showDevices, setShowDevices] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<api.SpotifyTrack[]>([])
  const [searching, setSearching] = useState(false)
  const [queuedUri, setQueuedUri] = useState<string | null>(null)
  const [localProgress, setLocalProgress] = useState(0)
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null)
  const [upcoming, setUpcoming] = useState<api.SpotifyTrack[]>([])
  const popupRef = useRef<Window | null>(null)

  async function loadStatus() {
    setStatusLoading(true)
    try { setStatus(await api.spotifyStatus()) } catch { setStatus({ connected: false }) }
    finally { setStatusLoading(false) }
  }

  useEffect(() => { loadStatus() }, [])

  async function loadNow() {
    try {
      const n = await api.spotifyNowPlaying()
      setNow(n); setNowError(null); setLocalProgress(n.progressMs); setVolumeDraft(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setNowError(msg)
      if (msg === 'not_connected') setStatus(s => (s ? { ...s, connected: false } : s))
    }
  }

  async function loadUpcoming() {
    try { const { queue } = await api.spotifyUpcoming(); setUpcoming(queue) }
    catch { /* non-fatal — queue is a nice-to-have, don't surface an error for it */ }
  }

  useEffect(() => {
    if (!status?.connected) return
    loadNow()
    loadUpcoming()
    const iv = setInterval(() => { loadNow(); loadUpcoming() }, 5000)
    return () => clearInterval(iv)
  }, [status?.connected])

  // Smooth local progress ticking between polls, resynced every 5s by loadNow
  useEffect(() => {
    if (!now?.isPlaying || !now.item) return
    const durationMs = now.item.durationMs
    const iv = setInterval(() => setLocalProgress(p => Math.min(durationMs, p + 1000)), 1000)
    return () => clearInterval(iv)
  }, [now?.isPlaying, now?.item?.id])

  async function connect() {
    setConnecting(true)
    try {
      const { url } = await api.spotifyAuthUrl()
      const popup = window.open(url, 'spotify-connect', 'width=460,height=720')
      popupRef.current = popup
      const iv = setInterval(() => {
        if (!popupRef.current || popupRef.current.closed) {
          clearInterval(iv)
          setConnecting(false)
          loadStatus()
        }
      }, 700)
    } catch {
      setConnecting(false)
    }
  }

  async function disconnect() {
    try { await api.spotifyDisconnect() } catch { /* ignore */ }
    setStatus({ connected: false })
    setNow(null)
    setShowDevices(false)
  }

  async function loadDevices() {
    try {
      const { devices } = await api.spotifyDevices()
      setDevices(devices)
      setShowDevices(true)
    } catch (e) {
      setNowError(e instanceof Error ? e.message : String(e))
    }
  }

  async function act(fn: () => Promise<any>) {
    try { await fn(); setTimeout(() => { loadNow(); loadUpcoming() }, 400) } catch (e) { setNowError(e instanceof Error ? e.message : String(e)) }
  }

  async function doSearch() {
    if (!query.trim()) { setResults([]); return }
    setSearching(true)
    try { const { tracks } = await api.spotifySearch(query.trim()); setResults(tracks) }
    catch (e) { setNowError(e instanceof Error ? e.message : String(e)) }
    finally { setSearching(false) }
  }

  if (statusLoading) {
    return <SectionSpinner />
  }

  if (!status?.connected) {
    return (
      <div style={{ ...glass, borderRadius: 20, padding: '44px 28px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#000', marginBottom: 6 }}>Connect Spotify</div>
        <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.4)', maxWidth: 280, margin: '0 auto 20px', lineHeight: 1.6 })}>
          Link the cafe's Spotify account once — everyone on shift can then control the speaker from here.
        </div>
        <button onClick={connect} disabled={connecting}
          style={{ padding: '10px 24px', borderRadius: 99, border: 'none', background: '#000', color: '#fff', fontSize: 13, fontWeight: 500, cursor: connecting ? 'default' : 'pointer', opacity: connecting ? 0.6 : 1 }}>
          {connecting ? 'Waiting for sign-in…' : 'Connect Spotify'}
        </button>
        {status?.error && <div style={mono({ fontSize: 10, color: 'rgba(180,40,40,0.7)', marginTop: 14 })}>{status.error}</div>}
      </div>
    )
  }

  const item = now?.item ?? null
  const pct = item && item.durationMs > 0 ? Math.min(100, (localProgress / item.durationMs) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>
          Connected as {status.displayName ?? 'Spotify'}{status.isPremium === false ? ' · Free' : ''}
        </div>
        <button onClick={disconnect}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', color: 'rgba(0,0,0,0.4)' }}>
          Disconnect
        </button>
      </div>

      {status.isPremium === false && (
        <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
          This account isn't Spotify Premium — playback control needs Premium. You can still see what's playing once something starts.
        </div>
      )}

      {/* Now playing */}
      <div style={{ ...glassDark, borderRadius: 20, padding: 22 }}>
        {item ? (
          <>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
              <div style={{ width: 68, height: 68, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.08)' }}>
                {item.albumArt && <img src={item.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.artists}</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#fff', borderRadius: 99, transition: 'width 0.9s linear' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={mono({ fontSize: 9, color: 'rgba(255,255,255,0.4)' })}>{fmtMs(localProgress)}</span>
                <span style={mono({ fontSize: 9, color: 'rgba(255,255,255,0.4)' })}>{fmtMs(item.durationMs)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
              <button onClick={() => act(() => api.spotifyPrevious(now?.device?.id))} style={transportBtn} title="Previous">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
              </button>
              <button
                onClick={() => act(() => (now?.isPlaying ? api.spotifyPause(now?.device?.id) : api.spotifyPlay({ deviceId: now?.device?.id })))}
                style={{ ...transportBtn, width: 46, height: 46, background: '#fff' }} title={now?.isPlaying ? 'Pause' : 'Play'}>
                {now?.isPlaying
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="#000"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="#000" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <button onClick={() => act(() => api.spotifyNext(now?.device?.id))} style={transportBtn} title="Next">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" /></svg>
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Nothing playing right now</div>
            <div style={mono({ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 6 })}>Search below and queue something, or press play on a connected device.</div>
          </div>
        )}
      </div>

      {nowError && nowError !== 'not_connected' && (
        <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>{nowError}</div>
      )}

      {/* Up next */}
      {upcoming.length > 0 && (
        <div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 10 })}>Up Next</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcoming.map((t, i) => (
              <div key={`${t.id}-${i}`} style={{ ...glassSubtle, borderRadius: 12, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)', width: 14, flexShrink: 0, textAlign: 'center' })}>{i + 1}</div>
                <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'rgba(0,0,0,0.06)' }}>
                  {t.albumArt && <img src={t.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.artists}</div>
                </div>
                <span style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.3)', flexShrink: 0 })}>{fmtMs(t.durationMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Devices */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' })}>
            Playing on {now?.device?.name ?? '—'}
          </div>
          <button onClick={loadDevices}
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.5)' }}>
            Switch device
          </button>
        </div>
        {showDevices && (
          <div style={{ ...glassSubtle, borderRadius: 14, overflow: 'hidden' }}>
            {devices.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: 'rgba(0,0,0,0.4)', textAlign: 'center' }}>
                No devices found — open Spotify on a phone, speaker, or computer first.
              </div>
            )}
            {devices.map((d, i) => (
              <button key={d.id} onClick={() => act(() => api.spotifyTransfer(d.id, true))}
                style={{ width: '100%', textAlign: 'left', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: d.isActive ? 'rgba(0,0,0,0.06)' : 'transparent', cursor: 'pointer', borderBottom: i < devices.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: d.isActive ? '#000' : 'rgba(0,0,0,0.2)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: '#000' }}>{d.name}</span>
                <span style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase' })}>{d.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Volume */}
      {now?.device && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>
          <input type="range" min={0} max={100} value={volumeDraft ?? now.device.volumePercent ?? 50}
            onChange={e => setVolumeDraft(Number(e.target.value))}
            onMouseUp={e => act(() => api.spotifyVolume(Number((e.target as HTMLInputElement).value), now?.device?.id))}
            onTouchEnd={e => act(() => api.spotifyVolume(Number((e.target as HTMLInputElement).value), now?.device?.id))}
            style={{ flex: 1, accentColor: '#000' }} />
          <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', width: 28, textAlign: 'right' })}>{volumeDraft ?? now.device.volumePercent ?? 50}</span>
        </div>
      )}

      {/* Search + queue */}
      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 10 })}>Search & Queue</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search a song or artist…" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={doSearch} disabled={searching}
            style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map(t => (
              <div key={t.id} style={{ ...glass, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'rgba(0,0,0,0.06)' }}>
                  {t.albumArt && <img src={t.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.artists}</div>
                </div>
                <button
                  onClick={async () => { await act(() => api.spotifyQueue(t.uri, now?.device?.id)); setQueuedUri(t.uri); setTimeout(() => setQueuedUri(u => (u === t.uri ? null : u)), 1600) }}
                  style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: queuedUri === t.uri ? '#000' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: queuedUri === t.uri ? '#fff' : 'rgba(0,0,0,0.45)', flexShrink: 0, fontSize: 14 }}
                  title="Add to queue">
                  {queuedUri === t.uri ? '✓' : '+'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Updates: manager-only daily feed from the cafe's Microsoft 365 inbox ───
function UpdatesSection() {
  const [status, setStatus] = useState<api.MsStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [data, setData] = useState<api.MsUpdatesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(1)
  const popupRef = useRef<Window | null>(null)

  async function loadStatus() {
    setStatusLoading(true)
    try { setStatus(await api.msStatus()) } catch { setStatus({ connected: false }) }
    finally { setStatusLoading(false) }
  }

  useEffect(() => { loadStatus() }, [])

  async function load() {
    setLoading(true); setError(null)
    try { setData(await api.msUpdates(days)) }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg === 'not_connected' ? 'Connection expired — reconnect below.' : msg)
      if (msg === 'not_connected') setStatus(s => (s ? { ...s, connected: false } : s))
    } finally { setLoading(false) }
  }

  useEffect(() => { if (status?.connected) load() }, [status?.connected, days])

  async function connect() {
    setConnecting(true)
    try {
      const { url } = await api.msAuthUrl()
      const popup = window.open(url, 'microsoft-connect', 'width=480,height=720')
      popupRef.current = popup
      const iv = setInterval(() => {
        if (!popupRef.current || popupRef.current.closed) {
          clearInterval(iv)
          setConnecting(false)
          loadStatus()
        }
      }, 700)
    } catch {
      setConnecting(false)
    }
  }

  async function disconnect() {
    try { await api.msDisconnect() } catch { /* ignore */ }
    setStatus({ connected: false })
    setData(null)
  }

  if (statusLoading) {
    return <SectionSpinner />
  }

  if (!status?.connected) {
    return (
      <div style={{ ...glass, borderRadius: 20, padding: '44px 28px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#000', marginBottom: 6 }}>Connect Microsoft 365</div>
        <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.4)', maxWidth: 300, margin: '0 auto 20px', lineHeight: 1.6 })}>
          Link the cafe's inbox once — this tab will then flag overdue bills, expenses, and anything else needing attention automatically.
        </div>
        <button onClick={connect} disabled={connecting}
          style={{ padding: '10px 24px', borderRadius: 99, border: 'none', background: '#000', color: '#fff', fontSize: 13, fontWeight: 500, cursor: connecting ? 'default' : 'pointer', opacity: connecting ? 0.6 : 1 }}>
          {connecting ? 'Waiting for sign-in…' : 'Connect Microsoft 365'}
        </button>
        {status?.error && <div style={mono({ fontSize: 10, color: 'rgba(180,40,40,0.7)', marginTop: 14 })}>{status.error}</div>}
      </div>
    )
  }

  const DAY_OPTIONS: { key: number; label: string }[] = [
    { key: 1, label: 'Today' },
    { key: 3, label: '3 Days' },
    { key: 7, label: '7 Days' },
  ]

  const timeAgo = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime()
    const mins = Math.round(diffMs / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.round(hrs / 24)}d ago`
  }

  function ItemRow({ item, tone }: { item: api.MsUpdateItem; tone: 'overdue' | 'bill' | 'update' }) {
    const accent = tone === 'overdue' ? 'rgba(180,40,40,0.9)' : tone === 'bill' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)'
    return (
      <div style={{ ...glassSubtle, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#000', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject || '(no subject)'}</div>
          {item.amount != null && (
            <span style={mono({ fontSize: 12, fontWeight: 600, color: accent, flexShrink: 0 })}>${item.amount.toFixed(2)}</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{item.preview}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={mono({ fontSize: 10, letterSpacing: '0.08em', color: 'rgba(0,0,0,0.4)' })}>{item.from}</span>
          <span style={mono({ fontSize: 10, letterSpacing: '0.08em', color: 'rgba(0,0,0,0.3)' })}>{timeAgo(item.receivedAt)}</span>
        </div>
      </div>
    )
  }

  function Group({ title, items, tone, emptyLabel }: { title: string; items: api.MsUpdateItem[]; tone: 'overdue' | 'bill' | 'update'; emptyLabel: string }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' })}>{title}</div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(0,0,0,0.3)' }}>{items.length}</div>
        </div>
        {items.length === 0 ? (
          <div style={{ ...glassSubtle, borderRadius: 12, padding: '16px', textAlign: 'center' }}>
            <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' })}>{emptyLabel}</div>
          </div>
        ) : (
          items.map(item => <ItemRow key={item.id} item={item} tone={tone} />)
        )}
      </div>
    )
  }

  // "Today" gets a digest instead of a raw list — a quick read of what needs
  // action so the manager can plan the day without scrolling every email.
  function DailyDigest({ data }: { data: api.MsUpdatesResponse }) {
    const fmt = (v: number) => `$${v.toFixed(2)}`
    const overdueTotal = data.overdueBills.reduce((sum, i) => sum + (i.amount ?? 0), 0)
    const billsTotal = data.bills.reduce((sum, i) => sum + (i.amount ?? 0), 0)
    const overdueIds = new Set(data.overdueBills.map(i => i.id))
    const actionable = [...data.overdueBills, ...data.bills.filter(i => i.amount != null)]
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
      .slice(0, 6)

    const CARDS: { label: string; value: string; dark?: boolean }[] = [
      { label: 'Total Emails', value: String(data.total), dark: true },
      { label: 'Overdue Bills', value: `${data.overdueBills.length} · ${fmt(overdueTotal)}` },
      { label: 'Expenses & Invoices', value: `${data.bills.length} · ${fmt(billsTotal)}` },
      { label: 'General Updates', value: String(data.updates.length) },
    ]

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {CARDS.map(card => (
            <div key={card.label} style={{ ...(card.dark ? glassDark : glass), borderRadius: 12, padding: '14px 16px' }}>
              <div style={mono({ fontSize: card.value.length > 10 ? 13 : 18, fontWeight: 300, color: card.dark ? '#fff' : '#000', lineHeight: 1.2 })}>{card.value}</div>
              <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: card.dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)', marginTop: 6 })}>{card.label}</div>
            </div>
          ))}
        </div>

        <div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 10 })}>Needs Your Attention Today</div>
          {actionable.length === 0 ? (
            <div style={{ ...glassSubtle, borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' })}>Nothing urgent — inbox is clear of bills and overdue items today.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actionable.map(item => (
                <div key={item.id} style={{ ...glassSubtle, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject || '(no subject)'}</div>
                    <div style={mono({ fontSize: 10, letterSpacing: '0.08em', color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>{item.from}{overdueIds.has(item.id) ? ' · Overdue' : ''}</div>
                  </div>
                  {item.amount != null && (
                    <span style={mono({ fontSize: 13, fontWeight: 600, color: overdueIds.has(item.id) ? 'rgba(180,40,40,0.9)' : 'rgba(0,0,0,0.6)', flexShrink: 0 })}>${item.amount.toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {data.updates.length > 0 && (
          <div style={{ ...glassSubtle, borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
            <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.4)' })}>+{data.updates.length} general update{data.updates.length === 1 ? '' : 's'} — nothing urgent, review anytime</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>
          Connected as {status.mail ?? status.displayName ?? 'Microsoft 365'}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2 }}>
            {DAY_OPTIONS.map(d => (
              <button key={d.key} onClick={() => setDays(d.key)}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: days === d.key ? '#000' : 'transparent', color: days === d.key ? '#fff' : 'rgba(0,0,0,0.45)' }}>
                {d.label}
              </button>
            ))}
          </div>
          <button onClick={disconnect} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 99, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', color: 'rgba(0,0,0,0.4)', cursor: 'pointer' }}>
            Disconnect
          </button>
        </div>
      </div>

      {loading && !data && <SectionSpinner />}

      {error && (
        <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: 'rgba(180,40,40,0.75)' }}>{error}</div>
      )}

      {data && (
        days === 1 ? (
          <DailyDigest data={data} />
        ) : (
          <>
            <Group title="Overdue Bills" items={data.overdueBills} tone="overdue" emptyLabel="Nothing overdue right now" />
            <Group title="Expenses & Invoices" items={data.bills} tone="bill" emptyLabel="No new invoices or receipts" />
            <Group title="General Updates" items={data.updates} tone="update" emptyLabel="Nothing else new" />
          </>
        )
      )}
    </div>
  )
}

// ── Manager View ───────────────────────────────────────────────────────────────
// ── Staff Directory (Manager > Staff > Directory) ───────────────────────────
function StaffDirectorySection({
  team, onAddTeamMember, onDeleteTeamMember, onUpdateTeamMember,
  roles, onSyncSquare, squareSyncing, squareSyncMessage, onSetPin,
}: {
  team: TeamMember[]
  onAddTeamMember: (m: Omit<TeamMember, 'id'>) => void
  onDeleteTeamMember: (id: number) => void
  onUpdateTeamMember: (id: number, patch: Partial<TeamMember>) => void
  roles: string[]
  onSyncSquare: () => void; squareSyncing: boolean; squareSyncMessage: string | null
  onSetPin: (id: number, pin: string) => Promise<void>
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState(roles[0] ?? '')
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState(roles[0] ?? '')
  const [pinEditId, setPinEditId] = useState<number | null>(null)
  const [pinValue, setPinValue] = useState('')
  const [pinSaving, setPinSaving] = useState(false)

  function addStaff() {
    if (!newName.trim()) return
    const initials = newName.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    onAddTeamMember({ name: newName.trim(), role: newRole || roles[0], clockedIn: false, avatar: initials })
    setNewName(''); setNewRole(roles[0] ?? ''); setShowAdd(false)
  }

  function removeStaff(id: number) { onDeleteTeamMember(id); setConfirmDelete(null) }

  function beginEdit(m: TeamMember) { setEditId(m.id); setEditName(m.name); setEditRole(m.role); setShowAdd(false); setConfirmDelete(null) }

  function saveEdit() {
    if (!editName.trim() || editId === null) return
    const initials = editName.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    onUpdateTeamMember(editId, { name: editName.trim(), role: editRole, avatar: initials })
    setEditId(null)
  }

  function beginPinEdit(m: TeamMember) { setPinEditId(m.id); setPinValue(''); setEditId(null); setShowAdd(false); setConfirmDelete(null) }

  async function savePin(id: number) {
    if (!/^\d{4,6}$/.test(pinValue)) return
    setPinSaving(true)
    try { await onSetPin(id, pinValue); setPinEditId(null); setPinValue('') }
    finally { setPinSaving(false) }
  }

  async function resetPin(id: number) {
    setPinSaving(true)
    try { await onSetPin(id, '1234'); setPinEditId(null) }
    finally { setPinSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button onClick={onSyncSquare} disabled={squareSyncing} title="Pull staff and roles from Square"
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: squareSyncing ? 'default' : 'pointer', transition: 'all 0.2s', background: 'rgba(0,0,0,0.07)', color: '#000', border: '1px solid rgba(0,0,0,0.12)', opacity: squareSyncing ? 0.5 : 1 }}>
          {squareSyncing ? 'Syncing…' : '⟳ Sync Square'}
        </button>
        <button onClick={() => { setShowAdd(v => !v); setEditId(null) }}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, cursor: 'pointer', transition: 'all 0.2s', background: showAdd ? '#000' : 'rgba(0,0,0,0.07)', color: showAdd ? '#fff' : '#000', border: '1px solid rgba(0,0,0,0.12)' }}>
          {showAdd ? '✕' : '+ Add'}
        </button>
      </div>

      {squareSyncMessage && (
        <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
          {squareSyncMessage}
        </div>
      )}

      {showAdd && (
        <div style={{ ...glass, borderRadius: 16, padding: '22px 22px 18px', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#000', marginBottom: 18 }}>New Staff Member</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Full Name</label>
              <input style={inputStyle} placeholder="e.g. Alice Moreau" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStaff()} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <select style={{ ...inputStyle, appearance: 'none' }} value={newRole} onChange={e => setNewRole(e.target.value)}>
                {roles.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <button onClick={addStaff} disabled={!newName.trim()}
            style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: newName.trim() ? '#000' : 'rgba(0,0,0,0.15)', color: newName.trim() ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 13, fontWeight: 500, cursor: newName.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
            Add Member
          </button>
        </div>
      )}
      {team.map(m => (
        <div key={m.id} style={{ ...glass, borderRadius: 14, overflow: 'hidden' }}>
          {editId === m.id ? (
            <div style={{ padding: '18px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }} autoFocus />
                </div>
                <div>
                  <label style={labelStyle}>Role</label>
                  <select style={{ ...inputStyle, appearance: 'none' }} value={editRole} onChange={e => setEditRole(e.target.value)}>
                    {roles.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveEdit} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Save</button>
                <button onClick={() => setEditId(null)} style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : confirmDelete === m.id ? (
            <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, fontSize: 13, color: '#000' }}>Remove <strong>{m.name}</strong>?</div>
              <button onClick={() => removeStaff(m.id)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Remove</button>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : pinEditId === m.id ? (
            <div style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 13, color: '#000', marginBottom: 10 }}>Change PIN for <strong>{m.name}</strong></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  style={{ ...inputStyle, width: 120 }}
                  placeholder="New 4-digit PIN"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinValue}
                  onChange={e => setPinValue(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') savePin(m.id); if (e.key === 'Escape') setPinEditId(null) }}
                  autoFocus
                />
                <button onClick={() => savePin(m.id)} disabled={pinSaving || !/^\d{4,6}$/.test(pinValue)}
                  style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: /^\d{4,6}$/.test(pinValue) ? '#000' : 'rgba(0,0,0,0.15)', color: /^\d{4,6}$/.test(pinValue) ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 12, fontWeight: 500, cursor: pinSaving ? 'default' : 'pointer' }}>Save</button>
                <button onClick={() => resetPin(m.id)} disabled={pinSaving}
                  style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: pinSaving ? 'default' : 'pointer' }}>Reset to 1234</button>
                <button onClick={() => setPinEditId(null)} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px' }}>
              <div style={{ width: 38, height: 38, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: '#fff', transition: 'all 0.2s', boxShadow: m.clockedIn ? `0 0 0 2px #fff, 0 0 0 4px ${BRAND_PURPLE}` : 'none' }}>{m.avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{m.name}</div>
                <div style={mono({ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>{m.role}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...mono({ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)' }), color: m.clockedIn ? '#000' : 'rgba(0,0,0,0.3)', background: m.clockedIn ? 'rgba(0,0,0,0.06)' : 'transparent' }}>
                  {m.clockedIn ? `In ${m.clockIn}` : 'Off shift'}
                </span>
                <button onClick={() => beginPinEdit(m)} title="Change PIN" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.45)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </button>
                <button onClick={() => beginEdit(m)} title="Edit" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.45)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button onClick={() => { setConfirmDelete(m.id); setEditId(null); setShowAdd(false) }} title="Remove" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.35)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Manager Finance/Growth/Staff placeholders — filled in next pass ────────
function ManagerComingSoon({ label }: { label: string }) {
  return (
    <div style={{ ...glassSubtle, borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
      <div style={mono({ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>{label}</div>
      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.35)' }}>Being rebuilt — back shortly.</div>
    </div>
  )
}
// Small animated semicircle gauge (GSAP-tweened arc fill + counting number)
// used across the Manager Overview dashboard's quick-stat tiles.
function Gauge({ pct, color = '#000', trackColor = 'rgba(0,0,0,0.08)', label, size = 88, stroke = 9 }: { pct: number; color?: string; trackColor?: string; label: string; size?: number; stroke?: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const radius = (size - stroke) / 2
  const cy = radius + stroke / 2
  const circumference = Math.PI * radius
  const filled = clamped / 100 * circumference
  const pathRef = useRef<SVGPathElement | null>(null)
  const numRef = useRef<HTMLDivElement | null>(null)
  const prevValue = useRef(0)

  useEffect(() => {
    const path = pathRef.current
    if (path) {
      gsap.killTweensOf(path)
      gsap.fromTo(path, { strokeDasharray: `0 ${circumference}` }, { strokeDasharray: `${filled} ${circumference}`, duration: 0.8, ease: 'power2.out' })
    }
    const el = numRef.current
    const match = label.match(/^-?\d+(\.\d+)?/)
    if (el && match) {
      const target = parseFloat(match[0])
      const obj = { v: prevValue.current }
      gsap.killTweensOf(obj)
      gsap.to(obj, {
        v: target,
        duration: 0.8,
        ease: 'power2.out',
        onUpdate: () => { if (numRef.current) numRef.current.textContent = label.replace(match[0], String(Math.round(obj.v))) },
      })
      prevValue.current = target
    } else if (el) {
      el.textContent = label
    }
  }, [pct, label])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={cy + stroke / 2} viewBox={`0 0 ${size} ${cy + stroke / 2}`}>
        <path d={`M ${stroke / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${cy}`} fill="none" stroke={trackColor} strokeWidth={stroke} strokeLinecap="round" />
        <path ref={pathRef} d={`M ${stroke / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${cy}`} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${filled} ${circumference}`} />
      </svg>
      <div ref={numRef} style={mono({ fontSize: 20, fontWeight: 600, color: '#000', marginTop: 2 })}>{label}</div>
    </div>
  )
}

// Combined Sales / Forecast / Expenses trend used on the Manager Overview
// dashboard — actual sales as a solid line with a soft fill, forecast
// continuing as a dashed purple line, expenses overlaid as a thin red line,
// with a shared crosshair tooltip across all three series.
function OverviewCombinedChart({ actual, forecast, expenses, currency }: { actual: { date: string; value: number }[]; forecast: { date: string; value: number }[]; expenses: { date: string; value: number }[]; currency: string }) {
  const EXPENSE_COLOR = 'rgba(180,40,40,0.85)'
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(680)
  const totalCount = actual.length + forecast.length + expenses.length
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(prev => Math.abs(w - prev) > 2 ? w : prev)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [totalCount])

  const plotWidth = width - 16
  const dates = [...actual.map(p => p.date), ...forecast.map(p => p.date)]
  const count = dates.length
  const expenseByDate: Record<string, number> = {}
  expenses.forEach(e => { expenseByDate[e.date] = e.value })
  const expenseSeries = dates.map(d => expenseByDate[d] ?? null)
  const actualValues = actual.map(p => p.value)
  const forecastValues = forecast.map(p => p.value)
  const maxValue = Math.max(1, ...actualValues, ...forecastValues, ...expenses.map(e => e.value))

  const xAt = (i: number) => count <= 1 ? 8 + plotWidth / 2 : 8 + (i / (count - 1)) * plotWidth
  const yAt = (v: number) => 212 - (v / maxValue) * 196

  const actualPoints = actualValues.map((v, i) => [xAt(i), yAt(v)] as [number, number])
  const forecastPoints = forecastValues.map((v, i) => [xAt(actualValues.length - 1 + i + 1), yAt(v)] as [number, number])
  const actualPath = actualPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const forecastPath = (actualPoints.length > 0 ? [actualPoints[actualPoints.length - 1], ...forecastPoints] : forecastPoints)
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const fillPath = actualPoints.length > 0 ? `${actualPath} L ${xAt(actualPoints.length - 1).toFixed(1)} 212 L ${xAt(0).toFixed(1)} 212 Z` : ''
  const expensePoints = expenseSeries.map((v, i) => v == null ? null : { i, x: xAt(i), y: yAt(v) }).filter((p): p is { i: number; x: number; y: number } => p !== null)
  const expensePath = expensePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  if (count === 0) {
    return (
      <div style={{ ...glassSubtle, borderRadius: 14, padding: 40, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>
        Not enough data yet to compare.
      </div>
    )
  }

  const labelBucket = Math.max(3, Math.floor(width / 70))
  const labelEvery = Math.max(1, Math.ceil(count / labelBucket))
  const fmt = (v: number) => formatMoney(v, currency)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} 240`}
        style={{ width: '100%', height: 240, display: 'block', cursor: 'crosshair' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const relX = (e.clientX - rect.left) / rect.width * width
          let best = 0, bestDist = Infinity
          for (let i = 0; i < count; i++) {
            const d = Math.abs(xAt(i) - relX)
            if (d < bestDist) { bestDist = d; best = i }
          }
          setHoverIdx(best)
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="ovwSalesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={8} x2={width - 8} y1={16 + 196 * f} y2={16 + 196 * f} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
        ))}
        {fillPath && <path d={fillPath} fill="url(#ovwSalesFill)" stroke="none" />}
        {actualPoints.length > 0 && <path d={actualPath} fill="none" stroke="#000" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />}
        {forecastPath && <path d={forecastPath} fill="none" stroke={BRAND_PURPLE} strokeWidth={1.75} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />}
        {expensePath && <path d={expensePath} fill="none" stroke={EXPENSE_COLOR} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
        {dates.map((d, i) => i % labelEvery === 0 && (
          <text key={d} x={xAt(i)} y={232} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(0,0,0,0.35)">
            {new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
          </text>
        ))}
        {hoverIdx !== null && <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={16} y2={212} stroke="rgba(0,0,0,0.25)" strokeWidth={1} strokeDasharray="3 3" />}
        {hoverIdx !== null && hoverIdx < actualValues.length && <circle cx={xAt(hoverIdx)} cy={yAt(actualValues[hoverIdx])} r={3.5} fill="#000" />}
        {hoverIdx !== null && hoverIdx >= actualValues.length && <circle cx={xAt(hoverIdx)} cy={yAt(forecastValues[hoverIdx - actualValues.length])} r={3.5} fill={BRAND_PURPLE} stroke="#fff" strokeWidth={1} />}
        {hoverIdx !== null && expenseSeries[hoverIdx] != null && <circle cx={xAt(hoverIdx)} cy={yAt(expenseSeries[hoverIdx]!)} r={3.5} fill={EXPENSE_COLOR} />}
      </svg>
      {hoverIdx !== null && (
        <div style={{ position: 'absolute', top: 4, left: `${xAt(hoverIdx) / width * 100}%`, transform: 'translateX(-50%)', ...glass, borderRadius: 10, padding: '8px 12px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 4 })}>
            {new Date(dates[hoverIdx] + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
          {hoverIdx < actualValues.length ? (
            <div style={{ fontSize: 12, color: '#000' }}>Sales: <strong>{fmt(actualValues[hoverIdx])}</strong></div>
          ) : (
            <div style={{ fontSize: 12, color: BRAND_PURPLE }}>Forecast: <strong>{fmt(forecastValues[hoverIdx - actualValues.length])}</strong></div>
          )}
          {expenseSeries[hoverIdx] != null && (
            <div style={{ fontSize: 12, color: EXPENSE_COLOR }}>Expenses: <strong>{fmt(expenseSeries[hoverIdx]!)}</strong></div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginTop: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: '#000', display: 'inline-block' }} />
          <span style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Actual Sales</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: BRAND_PURPLE, display: 'inline-block', backgroundImage: `repeating-linear-gradient(to right, ${BRAND_PURPLE} 0 4px, transparent 4px 7px)` }} />
          <span style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Sales Forecast</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: EXPENSE_COLOR, display: 'inline-block' }} />
          <span style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Expenses</span>
        </div>
      </div>
    </div>
  )
}

function ManagerOverviewDashboard({ team, stats, items, onNavigate, onGoToStock, onSyncSquare, squareSyncing }: { team: TeamMember[]; stats: { total: number; ok: number; low: number; out: number }; items: Item[]; onNavigate: (g: ManagerGroup, sub?: string) => void; onGoToStock: () => void; onSyncSquare: () => void; squareSyncing: boolean }) {
  const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date())
  const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }

  const [range, setRange] = useState<'today' | '7d' | 'thisMonth'>('7d')
  const rangeDates = useMemo(() => {
    const today = todayStr()
    if (range === 'today') return { start: today, end: today }
    if (range === 'thisMonth') return { start: today.slice(0, 7) + '-01', end: today }
    return { start: addDays(today, -6), end: today }
  }, [range])

  const [financials, setFinancials] = useState<api.FinancialsResponse | null>(null)
  const [prevPeriodGross, setPrevPeriodGross] = useState<number | null>(null)
  const [financialsLoading, setFinancialsLoading] = useState(false)
  const [pendingTimeOff, setPendingTimeOff] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  async function loadFinancials() {
    setFinancialsLoading(true)
    try {
      const days = Math.round((new Date(rangeDates.end + 'T00:00:00Z').getTime() - new Date(rangeDates.start + 'T00:00:00Z').getTime()) / 86400000) + 1
      const prevEnd = addDays(rangeDates.start, -1)
      const prevStart = addDays(rangeDates.start, -days)
      const [current, previous] = await Promise.all([
        api.squareFinancials(rangeDates.start, rangeDates.end),
        api.squareFinancials(prevStart, prevEnd),
      ])
      setFinancials(current)
      setPrevPeriodGross(previous.summary.grossSales)
    } catch (e) {
      console.warn('Overview financials load failed', e)
    } finally {
      setFinancialsLoading(false)
    }
  }
  useEffect(() => { loadFinancials() }, [rangeDates.start, rangeDates.end])

  async function loadPendingTimeOff() {
    try {
      const res = await api.managerTimeOff('pending')
      setPendingTimeOff(res.requests.length)
    } catch { /* ignore */ }
  }
  useEffect(() => { loadPendingTimeOff() }, [])

  const [forecastTotal, setForecastTotal] = useState<number | null>(null)
  const [expensesPreview, setExpensesPreview] = useState<{ fixed: number; variable: number; wages: number } | null>(null)
  const [chartActual, setChartActual] = useState<{ date: string; value: number }[]>([])
  const [chartForecast, setChartForecast] = useState<{ date: string; value: number }[]>([])
  const [chartExpenses, setChartExpenses] = useState<{ date: string; value: number }[]>([])

  async function loadForecastAndExpensesPreview() {
    try {
      const today = todayStr()
      const start60 = addDays(today, -59)
      const monthStart = today.slice(0, 7) + '-01'
      const start14 = addDays(today, -13)
      const chartStart = monthStart < start14 ? monthStart : start14
      const [fin, holidays, terms, expenses, hours] = await Promise.all([
        api.squareFinancials(start60, today),
        api.getPublicHolidays(),
        api.getSchoolHolidays(),
        api.getExpenses(),
        api.squareHours(chartStart, today),
      ])
      const launchCutoff = addDays(today, -RECENT_LAUNCH_WINDOW_DAYS)
      const recentLaunches = items.filter(it => it.createdAt && it.createdAt.slice(0, 10) >= launchCutoff).map(it => ({ date: it.createdAt!.slice(0, 10), name: it.name }))
      const forecast = computeSalesForecast({
        history: fin.series,
        horizonDays: 7,
        publicHolidays: holidays.map(h => ({ date: h.holiday_date, name: h.name })),
        schoolHolidays: terms.map(h => ({ start: h.start_date, end: h.end_date, name: h.term_name || 'School Holidays' })),
        recentItemLaunches: recentLaunches,
      })
      setForecastTotal(forecast.reduce((s, d) => s + d.adjusted, 0))

      let fixed = 0, variable = 0
      expenses.forEach(exp => {
        const occurrences = expandExpenseOccurrences(exp, monthStart, today).length
        if (occurrences === 0) return
        if (exp.cost_type === 'fixed') fixed += occurrences * exp.amount_cents
        else variable += occurrences * exp.amount_cents
      })
      const wages = Math.round(hours.daily.filter(d => d.date >= monthStart).reduce((s, d) => s + d.wageCost, 0))
      setExpensesPreview({ fixed, variable, wages })

      setChartActual(fin.series.filter(p => p.date >= start14).map(p => ({ date: p.date, value: p.grossSales })))
      setChartForecast(forecast.map(d => ({ date: d.date, value: d.adjusted })))

      const wageByDate: Record<string, number> = {}
      hours.daily.forEach(d => { wageByDate[d.date] = d.wageCost })
      const expenseByDate: Record<string, number> = {}
      expenses.forEach(exp => {
        expandExpenseOccurrences(exp, start14, today).forEach(d => { expenseByDate[d] = (expenseByDate[d] ?? 0) + exp.amount_cents })
      })
      const combinedExpenses: { date: string; value: number }[] = []
      let cursor = start14
      let guard = 0
      while (cursor <= today && guard < 40) {
        combinedExpenses.push({ date: cursor, value: (expenseByDate[cursor] ?? 0) + (wageByDate[cursor] ?? 0) })
        cursor = addDays(cursor, 1)
        guard++
      }
      setChartExpenses(combinedExpenses)
    } catch (e) {
      console.warn('Overview forecast/expenses preview load failed', e)
    }
  }
  useEffect(() => { loadForecastAndExpensesPreview() }, [items])

  const [topSellers, setTopSellers] = useState<{ name: string; qty: number }[]>([])
  const [reviewLeaders, setReviewLeaders] = useState<{ name: string; count: number }[]>([])
  async function loadLeaderboards() {
    const today = todayStr()
    const [analytics, reviews] = await Promise.all([
      api.squareAnalyticsOverview(addDays(today, -6), today).catch(() => null),
      api.reviewsScoreboard().catch(() => null),
    ])
    if (analytics) setTopSellers(analytics.leaderboard.slice(0, 3).map(e => ({ name: e.name, qty: e.qty })))
    if (reviews) setReviewLeaders(reviews.staff.filter(s => s.count > 0).slice(0, 3).map(s => ({ name: s.name, count: s.count })))
  }
  useEffect(() => { loadLeaderboards() }, [])

  async function refreshAll() {
    setRefreshing(true)
    try {
      await Promise.allSettled([loadFinancials(), loadPendingTimeOff(), loadForecastAndExpensesPreview(), loadLeaderboards()])
    } finally {
      setRefreshing(false)
    }
  }

  const summary = financials?.summary
  const currency = financials?.currency ?? 'AUD'
  const fmt = (v: number) => formatMoney(v, currency)
  const grossSales = summary?.grossSales ?? 0
  const changePct = prevPeriodGross && prevPeriodGross > 0 ? Math.round((grossSales - prevPeriodGross) / prevPeriodGross * 100) : null
  const onShiftCount = team.filter(m => m.clockedIn).length
  const lowOrOut = stats.low + stats.out
  const stockPct = stats.total > 0 ? Math.round(stats.ok / stats.total * 100) : 100
  const shiftPct = team.length > 0 ? Math.round(onShiftCount / team.length * 100) : 0
  const rangeOptions: { key: 'today' | '7d' | 'thisMonth'; label: string }[] = [{ key: 'today', label: 'Today' }, { key: '7d', label: '7 Days' }, { key: 'thisMonth', label: 'This Month' }]
  const periodLabel = range === 'today' ? 'day' : range === 'thisMonth' ? 'month' : '7 days'

  const insights: { text: string; onClick?: () => void }[] = []
  if (changePct !== null) insights.push({ text: `Sales are ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(changePct)}% vs the previous ${periodLabel}.`, onClick: () => onNavigate('finance', 'sales') })
  if (lowOrOut > 0) insights.push({ text: `${lowOrOut} item${lowOrOut === 1 ? '' : 's'} running low or out of stock.`, onClick: onGoToStock })
  if (pendingTimeOff > 0) insights.push({ text: `${pendingTimeOff} time-off request${pendingTimeOff === 1 ? '' : 's'} waiting on a decision.`, onClick: () => onNavigate('staff', 'timeoff') })
  if (onShiftCount === 0) insights.push({ text: 'No one is currently clocked in.', onClick: () => onNavigate('staff', 'directory') })
  if (topSellers[0]) insights.push({ text: `${topSellers[0].name} is the top seller this week (${topSellers[0].qty} sold).`, onClick: () => onNavigate('growth', 'analytics') })
  if (reviewLeaders[0]) insights.push({ text: `${reviewLeaders[0].name} leads the reviews board this cycle with ${reviewLeaders[0].count}.`, onClick: () => onNavigate('growth', 'reviews') })
  if (insights.length === 0) insights.push({ text: 'Everything looks steady — no urgent items right now.' })

  const tileButtonStyle: CSSProperties = { ...glass, borderRadius: 16, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }
  const quickActionStyle: CSSProperties = { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: '9px 16px', borderRadius: 99, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(0,0,0,0.05)', color: '#000', cursor: 'pointer' }

  const gaugesRef = useStaggerReveal(financials ? `loaded-${range}` : 'loading')
  const cardsRef = useStaggerReveal(`${forecastTotal ?? '—'}-${expensesPreview ? expensesPreview.fixed + expensesPreview.variable + expensesPreview.wages : '—'}`)
  const insightsRef = useStaggerReveal(insights.map(i => i.text).join('|'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...glassDark, borderRadius: 20, padding: '22px 22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' })}>Gross Sales</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={refreshAll} disabled={refreshing} title="Refresh overview data" style={{ width: 26, height: 26, borderRadius: 8, border: 'none', cursor: refreshing ? 'default' : 'pointer', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span aria-hidden style={{ display: 'inline-block', fontSize: 13, animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>⟳</span>
            </button>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2 }}>
              {rangeOptions.map(o => (
                <button key={o.key} onClick={() => setRange(o.key)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: range === o.key ? '#fff' : 'transparent', color: range === o.key ? '#000' : 'rgba(255,255,255,0.5)', fontWeight: range === o.key ? 600 : 400 }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div style={mono({ fontSize: 34, fontWeight: 300, color: '#fff', lineHeight: 1 })}>{financialsLoading && !financials ? '—' : fmt(grossSales)}</div>
          {changePct !== null && (
            <span style={{ ...mono({ fontSize: 10, fontWeight: 600 }), padding: '3px 9px', borderRadius: 99, background: changePct >= 0 ? BRAND_PURPLE : 'rgba(255,255,255,0.15)', color: changePct >= 0 ? '#000' : 'rgba(255,255,255,0.7)' }}>
              {changePct >= 0 ? '+' : ''}{changePct}%
            </span>
          )}
        </div>
        <button onClick={() => onNavigate('finance', 'sales')} style={{ ...mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }), color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 10 }}>
          View full financials →
        </button>
      </div>

      <div style={{ ...glassDark, borderRadius: 16, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: BRAND_PURPLE, display: 'inline-block' }} />
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' })}>Insights</div>
        </div>
        <div ref={insightsRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {insights.map((ins, i) => ins.onClick ? (
            <button key={i} onClick={ins.onClick} style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, textAlign: 'left', background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, font: 'inherit' }}>
              <span>{ins.text}</span>
              <span aria-hidden style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>→</span>
            </button>
          ) : (
            <div key={i} style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>{ins.text}</div>
          ))}
        </div>
      </div>

      <div ref={gaugesRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <button onClick={() => onNavigate('staff', 'directory')} style={tileButtonStyle}>
          <Gauge pct={shiftPct} color={BRAND_PURPLE} label={`${onShiftCount}/${team.length}`} />
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginTop: 6 })}>On Shift Now</div>
        </button>
        <button onClick={onGoToStock} style={tileButtonStyle}>
          <Gauge pct={stockPct} color={stats.out > 0 ? 'rgba(180,40,40,0.75)' : '#000'} label={`${lowOrOut}`} />
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginTop: 6 })}>Low / Out of Stock</div>
        </button>
        <button onClick={() => onNavigate('staff', 'timeoff')} style={tileButtonStyle}>
          <Gauge pct={pendingTimeOff > 0 ? 100 : 0} color={pendingTimeOff > 0 ? BRAND_PURPLE : 'rgba(0,0,0,0.15)'} label={`${pendingTimeOff}`} />
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginTop: 6 })}>Pending Time Off</div>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <button onClick={() => onNavigate('growth', 'analytics')} style={{ ...glass, borderRadius: 16, padding: '16px 18px', textAlign: 'left', border: 'none', cursor: 'pointer' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 8 })}>Top Sellers · This Week</div>
          {topSellers.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {topSellers.map((s, i) => (
                <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#000' }}>
                  <span>{i + 1}. {s.name}</span>
                  <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.4)' })}>{s.qty} sold</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>Loading…</div>
          )}
          <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginTop: 8 })}>Full breakdown →</div>
        </button>
        <button onClick={() => onNavigate('growth', 'reviews')} style={{ ...glass, borderRadius: 16, padding: '16px 18px', textAlign: 'left', border: 'none', cursor: 'pointer' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 8 })}>Reviews Leaderboard</div>
          {reviewLeaders.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {reviewLeaders.map((s, i) => (
                <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#000' }}>
                  <span>{i + 1}. {s.name}</span>
                  <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.4)' })}>{s.count} review{s.count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>No reviews logged this cycle yet.</div>
          )}
          <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginTop: 8 })}>Full scoreboard →</div>
        </button>
      </div>

      <div style={{ ...glass, borderRadius: 16, padding: '14px 16px 10px' }}>
        <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 8 })}>Sales vs Forecast vs Expenses · Last 14 Days</div>
        <OverviewCombinedChart actual={chartActual} forecast={chartForecast} expenses={chartExpenses} currency={currency} />
      </div>

      <div ref={cardsRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <button onClick={() => onNavigate('finance', 'forecast')} style={{ ...glass, borderRadius: 16, padding: '16px 18px', textAlign: 'left', border: 'none', cursor: 'pointer' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Sales Forecast · Next 7 Days</div>
          <div style={mono({ fontSize: 22, fontWeight: 300, color: '#000' })}>{forecastTotal === null ? '—' : fmt(forecastTotal)}</div>
          <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>Adjusted for holidays & menu launches →</div>
        </button>
        <button onClick={() => onNavigate('finance', 'expenses')} style={{ ...glass, borderRadius: 16, padding: '16px 18px', textAlign: 'left', border: 'none', cursor: 'pointer' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Expenses · This Month</div>
          <div style={mono({ fontSize: 22, fontWeight: 300, color: '#000' })}>{expensesPreview === null ? '—' : fmt(expensesPreview.fixed + expensesPreview.variable + expensesPreview.wages)}</div>
          <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>
            {expensesPreview === null ? 'Loading…' : `Fixed ${fmt(expensesPreview.fixed)} · Variable ${fmt(expensesPreview.variable)} · Wages ${fmt(expensesPreview.wages)}`}
          </div>
        </button>
      </div>

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 10 })}>Quick Actions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={onSyncSquare} disabled={squareSyncing} style={{ ...quickActionStyle, opacity: squareSyncing ? 0.5 : 1, cursor: squareSyncing ? 'default' : 'pointer' }}>
            {squareSyncing ? 'Syncing…' : '⟳ Sync Square'}
          </button>
          <button onClick={() => onNavigate('staff', 'directory')} style={quickActionStyle}>+ Add Staff</button>
          <button onClick={() => onNavigate('finance', 'expenses')} style={quickActionStyle}>+ Add Expense</button>
          <button onClick={() => onNavigate('staff', 'roster')} style={quickActionStyle}>View Roster</button>
          <button onClick={() => onNavigate('updates')} style={quickActionStyle}>View Updates</button>
          <button onClick={() => onNavigate('finance', 'setup')} style={quickActionStyle}>Payroll Setup</button>
        </div>
      </div>
    </div>
  )
}
// ── Sales Forecast ───────────────────────────────────────────────────────────
const RECENT_LAUNCH_WINDOW_DAYS = 21
const RAIN_THRESHOLD_MM = 1
interface ForecastAdjustment { kind: 'Public Holiday' | 'School Holiday' | 'New Item' | 'Rain Forecast'; label: string; multiplier: number; sampleSize: number }
interface ForecastDay { date: string; baseline: number; adjusted: number; adjustments: ForecastAdjustment[] }
interface ForecastRecentLaunch { date: string; name: string }
interface ForecastPublicHolidayInput { date: string; name: string }
interface ForecastSchoolHolidayInput { start: string; end: string; name: string }
interface ForecastWeatherPoint { date: string; rainMm: number }

function computeSalesForecast({ history, horizonDays, publicHolidays, schoolHolidays, recentItemLaunches, historicalWeather = [], weatherForecast = [] }: {
  history: api.FinancialsSeriesPoint[]
  horizonDays: number
  publicHolidays: ForecastPublicHolidayInput[]
  schoolHolidays: ForecastSchoolHolidayInput[]
  recentItemLaunches: ForecastRecentLaunch[]
  historicalWeather?: ForecastWeatherPoint[]
  weatherForecast?: ForecastWeatherPoint[]
}): ForecastDay[] {
  if (history.length === 0) return []
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const lastDate = sorted[sorted.length - 1].date
  const dow = (d: string) => new Date(d + 'T00:00:00').getDay()
  const findHoliday = (d: string) => publicHolidays.find(h => h.date === d)
  const findSchoolHoliday = (d: string) => schoolHolidays.find(h => d >= h.start && d <= h.end)
  const findLaunches = (d: string) => recentItemLaunches.filter(l => {
    const diffDays = (new Date(d + 'T00:00:00').getTime() - new Date(l.date + 'T00:00:00').getTime()) / 86400000
    return diffDays >= 0 && diffDays <= RECENT_LAUNCH_WINDOW_DAYS
  })

  const avgDaily = sorted.reduce((sum, p) => sum + p.grossSales, 0) / sorted.length
  const dowTotals = Array(7).fill(0)
  const dowCounts = Array(7).fill(0)
  sorted.forEach(p => { const d = dow(p.date); dowTotals[d] += p.grossSales; dowCounts[d]++ })
  const dowMultiplier = dowTotals.map((total, i) => dowCounts[i] > 0 && avgDaily > 0 ? total / dowCounts[i] / avgDaily : 1)

  const last7 = sorted.slice(-7)
  const prev7 = sorted.slice(-14, -7)
  let trend = 0
  if (last7.length > 0 && prev7.length > 0) {
    const avgLast = last7.reduce((s, p) => s + p.grossSales, 0) / last7.length
    const avgPrev = prev7.reduce((s, p) => s + p.grossSales, 0) / prev7.length
    if (avgPrev > 0) trend = (avgLast / avgPrev) ** (1 / 7) - 1
  }
  trend = Math.max(-0.03, Math.min(0.03, trend))

  const baselineFor = (date: string, daysAhead: number) => avgDaily * dowMultiplier[dow(date)] * (1 + trend) ** daysAhead

  function measureMultiplier(matches: (d: string) => boolean, fallback: number): { multiplier: number; sampleSize: number } {
    const matched = sorted.filter(p => matches(p.date))
    if (matched.length === 0) return { multiplier: fallback, sampleSize: 0 }
    const ratios = matched.map(p => {
      const base = avgDaily * dowMultiplier[dow(p.date)]
      return base > 0 ? p.grossSales / base : 1
    })
    return { multiplier: ratios.reduce((s, r) => s + r, 0) / ratios.length, sampleSize: matched.length }
  }

  const publicHolidayMultiplier = measureMultiplier(d => !!findHoliday(d), 1.15)
  const schoolHolidayMultiplier = measureMultiplier(d => !!findSchoolHoliday(d), 1.1)
  const newItemMultiplier = 1.05
  const rainByDate = new Map(historicalWeather.map(w => [w.date, w.rainMm]))
  const forecastRainByDate = new Map(weatherForecast.map(w => [w.date, w.rainMm]))
  const rainMultiplier = measureMultiplier(d => (rainByDate.get(d) ?? 0) > RAIN_THRESHOLD_MM, 0.87)

  const days: ForecastDay[] = []
  for (let i = 1; i <= horizonDays; i++) {
    const d = new Date(lastDate + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    const baseline = baselineFor(dateStr, i)
    let adjusted = baseline
    const adjustments: ForecastAdjustment[] = []
    const holiday = findHoliday(dateStr)
    if (holiday) { adjusted *= publicHolidayMultiplier.multiplier; adjustments.push({ kind: 'Public Holiday', label: holiday.name, multiplier: publicHolidayMultiplier.multiplier, sampleSize: publicHolidayMultiplier.sampleSize }) }
    const schoolHoliday = findSchoolHoliday(dateStr)
    if (schoolHoliday) { adjusted *= schoolHolidayMultiplier.multiplier; adjustments.push({ kind: 'School Holiday', label: schoolHoliday.name, multiplier: schoolHolidayMultiplier.multiplier, sampleSize: schoolHolidayMultiplier.sampleSize }) }
    const launches = findLaunches(dateStr)
    if (launches.length > 0) { adjusted *= newItemMultiplier; adjustments.push({ kind: 'New Item', label: launches.map(l => l.name).join(', '), multiplier: newItemMultiplier, sampleSize: 0 }) }
    const forecastRain = forecastRainByDate.get(dateStr)
    if (forecastRain !== undefined && forecastRain > RAIN_THRESHOLD_MM) { adjusted *= rainMultiplier.multiplier; adjustments.push({ kind: 'Rain Forecast', label: `${forecastRain.toFixed(1)}mm forecast`, multiplier: rainMultiplier.multiplier, sampleSize: rainMultiplier.sampleSize }) }
    days.push({ date: dateStr, baseline, adjusted, adjustments })
  }
  return days
}

function SalesForecastChart({ actual, forecast, currency }: { actual: api.FinancialsSeriesPoint[]; forecast: ForecastDay[]; currency: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [width, setWidth] = useState(680)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const totalCount = actual.length + forecast.length
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(prev => Math.abs(w - prev) > 2 ? w : prev)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [totalCount])

  const plotWidth = width - 16
  const actualValues = actual.map(p => p.grossSales)
  const forecastValues = forecast.map(p => p.adjusted)
  const count = actualValues.length + forecastValues.length
  const maxValue = Math.max(1, ...actualValues, ...forecastValues)

  if (count === 0) {
    return (
      <div style={{ ...glassSubtle, borderRadius: 14, padding: 40, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>
        Not enough sales history yet to forecast.
      </div>
    )
  }

  const xAt = (i: number) => count <= 1 ? 8 + plotWidth / 2 : 8 + (i / (count - 1)) * plotWidth
  const yAt = (v: number) => 192 - (v / maxValue) * 176

  const actualPoints = actualValues.map((v, i) => [xAt(i), yAt(v)] as [number, number])
  const forecastPoints = forecastValues.map((v, i) => [xAt(actualValues.length - 1 + i + 1), yAt(v)] as [number, number])
  const actualPath = actualPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const forecastPath = (actualPoints.length > 0 ? [actualPoints[actualPoints.length - 1], ...forecastPoints] : forecastPoints)
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')

  const allDates = [...actual.map(p => p.date), ...forecast.map(p => p.date)]
  const allValues = [...actualValues, ...forecastValues]
  const allPoints = [...actualPoints, ...forecastPoints]
  const labelBucket = Math.max(3, Math.floor(width / 70))
  const labelEvery = Math.max(1, Math.ceil(count / labelBucket))
  const fmt = (v: number) => formatMoney(v, currency)
  const currencySymbol = fmt(0).replace(/[\d.,]/g, '').trim() || '$'

  function indexFromClientX(clientX: number): number {
    const svg = svgRef.current
    if (!svg || count <= 1) return 0
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return 0
    const localX = (clientX - rect.left) * (width / rect.width)
    const raw = ((localX - 8) / plotWidth) * (count - 1)
    return Math.max(0, Math.min(count - 1, Math.round(raw)))
  }
  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) { setHoverIndex(indexFromClientX(e.clientX)) }
  function handlePointerLeave() { setHoverIndex(null) }

  const hoverIsForecast = hoverIndex !== null && hoverIndex >= actualValues.length
  const hoverAdjustments = hoverIsForecast && hoverIndex !== null ? forecast[hoverIndex - actualValues.length]?.adjustments ?? [] : []
  const hoverPoint = hoverIndex !== null ? allPoints[hoverIndex] : null
  const tooltipWidth = 138
  const tooltipHeight = hoverAdjustments.length > 0 ? 54 : 40
  const tooltipX = hoverPoint ? Math.min(Math.max(hoverPoint[0] - tooltipWidth / 2, 4), width - tooltipWidth - 4) : 0
  const tooltipY = hoverPoint ? Math.max(hoverPoint[1] - tooltipHeight - 10, 4) : 0

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} 220`}
        style={{ width: '100%', height: 220, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
        onPointerUp={handlePointerLeave}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
      >
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={8} x2={width - 8} y1={16 + 176 * f} y2={16 + 176 * f} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
        ))}
        {actualPoints.length > 0 && <path d={actualPath} fill="none" stroke="#000" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />}
        <path d={forecastPath} fill="none" stroke={BRAND_PURPLE} strokeWidth={1.75} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
        {forecastPoints.map(([x, y], i) => forecast[i].adjustments.length > 0 && (
          <circle key={i} cx={x} cy={y} r={3.5} fill={BRAND_PURPLE} stroke="#fff" strokeWidth={1} />
        ))}
        {allDates.map((d, i) => i % labelEvery === 0 && (
          <text key={d} x={xAt(i)} y={212} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(0,0,0,0.35)">
            {new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
          </text>
        ))}
        {hoverPoint && hoverIndex !== null && (
          <>
            <line x1={hoverPoint[0]} x2={hoverPoint[0]} y1={16} y2={192} stroke="rgba(0,0,0,0.18)" strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" />
            <circle cx={hoverPoint[0]} cy={hoverPoint[1]} r={4.5} fill={hoverIsForecast ? BRAND_PURPLE : '#000'} stroke="#fff" strokeWidth={1.5} pointerEvents="none" />
            <g transform={`translate(${tooltipX}, ${tooltipY})`} pointerEvents="none">
              <rect width={tooltipWidth} height={tooltipHeight} rx={7} fill="rgba(20,20,20,0.92)" />
              <text x={9} y={14} fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing="0.06em" fill="rgba(255,255,255,0.6)" style={{ textTransform: 'uppercase' }}>
                {new Date(allDates[hoverIndex] + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })}
              </text>
              <text x={9} y={29} fontFamily="JetBrains Mono, monospace" fontSize="12.5" fontWeight={600} fill="#fff">
                {fmt(allValues[hoverIndex])}{hoverIsForecast ? ' · forecast' : ''}
              </text>
              {hoverAdjustments.length > 0 && (
                <text x={9} y={43} fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="rgba(255,255,255,0.55)">
                  {hoverAdjustments.map(a => a.kind).join(', ')}
                </text>
              )}
            </g>
          </>
        )}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 4, justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: '#000', display: 'inline-block' }} />
          <span style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Actual</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: BRAND_PURPLE, display: 'inline-block', backgroundImage: `repeating-linear-gradient(to right, ${BRAND_PURPLE} 0 4px, transparent 4px 7px)` }} />
          <span style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Forecast</span>
        </div>
        <div style={mono({ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(0,0,0,0.3)' })}>
          {currencySymbol} · dot = adjusted day
        </div>
      </div>
    </div>
  )
}

function ForecastSection({ items }: { items: Item[] }) {
  const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date())
  const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const [horizonDays, setHorizonDays] = useState(7)
  const [history, setHistory] = useState<api.FinancialsSeriesPoint[]>([])
  const [currency, setCurrency] = useState('AUD')
  const [publicHolidays, setPublicHolidays] = useState<api.PublicHoliday[]>([])
  const [schoolHolidays, setSchoolHolidays] = useState<api.SchoolHoliday[]>([])
  const [historicalWeather, setHistoricalWeather] = useState<{ date: string; rainMm: number }[]>([])
  const [weatherForecast, setWeatherForecast] = useState<{ date: string; rainMm: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingSchoolHolidays, setLoadingSchoolHolidays] = useState(false)
  const [newTermName, setNewTermName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [showSchoolHolidays, setShowSchoolHolidays] = useState(false)

  async function loadAll() {
    setLoading(true); setError(null)
    try {
      const end = todayStr()
      const start = addDays(end, -89)
      const [fin, holidays, terms] = await Promise.all([
        api.squareFinancials(start, end),
        api.getPublicHolidays(),
        api.getSchoolHolidays(),
      ])
      setHistory(fin.series)
      setCurrency(fin.currency)
      setPublicHolidays(holidays)
      setSchoolHolidays(terms)
      // Weather is fetched straight from Open-Meteo's free API (no key) —
      // historical for measuring the real rain effect, forecast (max ~16
      // days ahead) for applying it to the upcoming horizon.
      try {
        const hist = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=-26.6773&longitude=153.1163&start_date=${start}&end_date=${end}&daily=precipitation_sum&timezone=Australia%2FBrisbane`).then(r => r.json())
        const times: string[] = hist?.daily?.time ?? []
        const rains: number[] = hist?.daily?.precipitation_sum ?? []
        setHistoricalWeather(times.map((t, i) => ({ date: t, rainMm: rains[i] ?? 0 })))
      } catch { setHistoricalWeather([]) }
      try {
        const fc = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=-26.6773&longitude=153.1163&daily=precipitation_sum&timezone=Australia%2FBrisbane&forecast_days=16`).then(r => r.json())
        const times: string[] = fc?.daily?.time ?? []
        const rains: number[] = fc?.daily?.precipitation_sum ?? []
        setWeatherForecast(times.map((t, i) => ({ date: t, rainMm: rains[i] ?? 0 })))
      } catch { setWeatherForecast([]) }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadAll() }, [])

  async function reloadSchoolHolidays() {
    setLoadingSchoolHolidays(true)
    try {
      setSchoolHolidays(await api.getSchoolHolidays())
    } catch {} finally {
      setLoadingSchoolHolidays(false)
    }
  }
  async function addTerm() {
    if (!newStart || !newEnd || newStart > newEnd) return
    try {
      await api.addSchoolHoliday({ term_name: newTermName.trim() || null, start_date: newStart, end_date: newEnd })
      setNewTermName(''); setNewStart(''); setNewEnd('')
      reloadSchoolHolidays()
    } catch {}
  }
  async function removeTerm(id: number) {
    try { await api.deleteSchoolHoliday(id); reloadSchoolHolidays() } catch {}
  }

  const recentLaunches = useMemo(() => {
    const today = todayStr()
    const cutoff = addDays(today, -RECENT_LAUNCH_WINDOW_DAYS)
    return items.filter(it => it.createdAt && it.createdAt.slice(0, 10) >= cutoff).map(it => ({ date: it.createdAt!.slice(0, 10), name: it.name }))
  }, [items])

  const forecast = useMemo(() => computeSalesForecast({
    history,
    horizonDays,
    publicHolidays: publicHolidays.map(h => ({ date: h.holiday_date, name: h.name })),
    schoolHolidays: schoolHolidays.map(h => ({ start: h.start_date, end: h.end_date, name: h.term_name || 'School Holidays' })),
    recentItemLaunches: recentLaunches,
    historicalWeather,
    weatherForecast,
  }), [history, horizonDays, publicHolidays, schoolHolidays, recentLaunches, historicalWeather, weatherForecast])

  const fmt = (v: number) => formatMoney(v, currency)
  const forecastTotal = forecast.reduce((s, d) => s + d.adjusted, 0)
  const baselineTotal = forecast.reduce((s, d) => s + d.baseline, 0)
  const upliftPct = baselineTotal > 0 ? Math.round((forecastTotal - baselineTotal) / baselineTotal * 100) : 0
  const actualForChart = history.slice(-horizonDays)
  const horizonOptions = [{ key: 7, label: '7 Days' }, { key: 14, label: '14 Days' }, { key: 30, label: '30 Days' }]
  const adjustedDays = forecast.filter(d => d.adjustments.length > 0)

  if (loading && history.length === 0) return <SectionSpinner label="Building forecast from sales history…" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 14px', ...mono({ fontSize: 11, color: 'rgba(180,60,40,0.8)' }) }}>{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Projected Gross Sales</div>
        <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2 }}>
          {horizonOptions.map(o => (
            <button key={o.key} onClick={() => setHorizonDays(o.key)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: horizonDays === o.key ? '#000' : 'transparent', color: horizonDays === o.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: horizonDays === o.key ? 500 : 400 }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div style={{ ...glassDark, borderRadius: 14, padding: '14px 16px' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 6 })}>Forecast Total</div>
          <div style={mono({ fontSize: 20, fontWeight: 300, color: '#fff' })}>{fmt(forecastTotal)}</div>
        </div>
        <div style={{ ...glass, borderRadius: 14, padding: '14px 16px' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Seasonal Baseline</div>
          <div style={mono({ fontSize: 20, fontWeight: 300, color: '#000' })}>{fmt(baselineTotal)}</div>
        </div>
        <div style={{ ...glass, borderRadius: 14, padding: '14px 16px' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Holiday / Launch Uplift</div>
          <div style={mono({ fontSize: 20, fontWeight: 300, color: upliftPct >= 0 ? '#000' : 'rgba(180,60,40,0.8)' })}>{upliftPct >= 0 ? '+' : ''}{upliftPct}%</div>
        </div>
      </div>

      <div style={{ ...glass, borderRadius: 16, padding: '14px 16px 10px' }}>
        <SalesForecastChart actual={actualForChart} forecast={forecast} currency={currency} />
      </div>

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Adjustment Breakdown</div>
        {adjustedDays.length === 0 ? (
          <div style={{ ...glassSubtle, borderRadius: 14, padding: 20, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>
            No holidays or recent menu launches fall inside this forecast window.
          </div>
        ) : (
          <div style={{ ...glassSubtle, borderRadius: 14, overflow: 'hidden' }}>
            {adjustedDays.map((d, i) => (
              <div key={d.date} style={{ padding: '11px 16px', borderBottom: i < adjustedDays.length - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#000' }}>{new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                  <span style={mono({ fontSize: 11, color: '#000' })}>{fmt(d.adjusted)}</span>
                </div>
                {d.adjustments.map((a, j) => (
                  <div key={j} style={mono({ fontSize: 9, letterSpacing: '0.05em', color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>
                    {a.kind}: {a.label} · ×{a.multiplier.toFixed(2)}
                    {a.sampleSize > 0 ? ` (from ${a.sampleSize} past date${a.sampleSize === 1 ? '' : 's'})` : a.kind === 'New Item' ? ' (assumed — Square has no per-item sales breakdown to measure this from)' : ' (assumed — no matching past date in history yet)'}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <button onClick={() => setShowSchoolHolidays(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10 }}>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Manage School Holidays ({schoolHolidays.length})</div>
          <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', transform: showSchoolHolidays ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
        </button>
        {showSchoolHolidays && (
          <>
            <div style={{ ...glass, borderRadius: 14, padding: '16px 18px', marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>Term Name (optional)</label>
                  <input style={inputStyle} placeholder="e.g. Term 3 Holidays" value={newTermName} onChange={e => setNewTermName(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input style={inputStyle} type="date" value={newStart} onChange={e => setNewStart(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input style={inputStyle} type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
                </div>
              </div>
              <button onClick={addTerm} disabled={!newStart || !newEnd || newStart > newEnd} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: newStart && newEnd && newStart <= newEnd ? '#000' : 'rgba(0,0,0,0.15)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: newStart && newEnd ? 'pointer' : 'not-allowed' }}>
                Add School Holiday Period
              </button>
            </div>
            {loadingSchoolHolidays ? <SectionSpinner label="Loading school holidays…" /> : (
              <div style={{ ...glassSubtle, borderRadius: 14, overflow: 'hidden' }}>
                {schoolHolidays.map((h, i) => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < schoolHolidays.length - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#000' }}>{h.term_name || 'School Holidays'}</div>
                      <div style={mono({ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>
                        {new Date(h.start_date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} – {new Date(h.end_date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <button onClick={() => removeTerm(h.id)} title="Remove" style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.35)', flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                    </button>
                  </div>
                ))}
                {schoolHolidays.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No school holiday periods added yet</div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.3)', lineHeight: 1.6 })}>
        Baseline is computed from day-of-week seasonality and short-term trend across the last 90 days. Public and school holiday multipliers are measured from how those dates actually performed historically where enough data exists, and fall back to a stated assumption otherwise. New-item-launch uplift is always a flat assumption — Square's financials only report daily totals, not a per-item breakdown, so a past launch's real impact can't be measured from this data.
      </div>
    </div>
  )
}
// ── Expenses (Finance > Expenses) ───────────────────────────────────────────
function advanceRecurrenceDate(dateStr: string, recurrence: api.Expense['recurrence']): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
  else if (recurrence === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString().slice(0, 10)
}
function expandExpenseOccurrences(expense: api.Expense, start: string, end: string): string[] {
  if (expense.recurrence === 'none') return expense.expense_date >= start && expense.expense_date <= end ? [expense.expense_date] : []
  const out: string[] = []
  const cap = expense.recurrence_end_date && expense.recurrence_end_date < end ? expense.recurrence_end_date : end
  let cursor = expense.expense_date
  let guard = 0
  while (cursor <= cap && guard < 2000) {
    if (cursor >= start) out.push(cursor)
    cursor = advanceRecurrenceDate(cursor, expense.recurrence)
    guard++
  }
  return out
}

// Local folder auto-save is a progressive-enhancement convenience on top of the
// File System Access API (Chrome/Edge only). Typed loosely here since this API
// isn't in TypeScript's default DOM lib; every browser without support just
// falls back to a plain download, which is the only path on Safari/Firefox.
interface BillsFolderHandle {
  name: string
  queryPermission: (opts: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>
  requestPermission: (opts: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<{ createWritable: () => Promise<{ write: (data: Uint8Array) => Promise<void>; close: () => Promise<void> }> }>
}
const BILLS_DB_NAME = 'tt-bills-folder'
const BILLS_STORE = 'handles'
const BILLS_KEY = 'billsFolder'
function openBillsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BILLS_DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(BILLS_STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function getBillsFolderHandle(): Promise<BillsFolderHandle | null> {
  try {
    const db = await openBillsDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(BILLS_STORE, 'readonly').objectStore(BILLS_STORE).get(BILLS_KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}
async function setBillsFolderHandle(handle: BillsFolderHandle): Promise<void> {
  const db = await openBillsDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BILLS_STORE, 'readwrite')
    tx.objectStore(BILLS_STORE).put(handle, BILLS_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
async function writeBillToFolder(handle: BillsFolderHandle, filename: string, base64: string): Promise<void> {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const fileHandle = await handle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(bytes)
  await writable.close()
}
function downloadBillPdf(base64: string, filename: string): void {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function ExpensesTrendChart({ points, currency, color = '#000', emptyLabel = 'No data for this range.' }: { points: { date: string; value: number }[]; currency: string; color?: string; emptyLabel?: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(680)
  const count = points.length
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(prev => Math.abs(w - prev) > 2 ? w : prev)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [count])
  const plotWidth = width - 16
  const values = points.map(p => p.value)
  const maxValue = Math.max(1, ...values)
  const xAt = (i: number) => count <= 1 ? 8 + plotWidth / 2 : 8 + (i / (count - 1)) * plotWidth
  const yAt = (v: number) => 152 - (v / maxValue) * 136
  const fmt = (v: number) => formatMoney(v, currency)
  if (count === 0) {
    return (
      <div style={{ ...glassSubtle, borderRadius: 14, padding: 40, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>
        {emptyLabel}
      </div>
    )
  }
  const linePath = values.map((v, i) => [xAt(i), yAt(v)] as [number, number]).map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${xAt(count - 1).toFixed(1)} ${(152).toFixed(1)} L ${xAt(0).toFixed(1)} ${(152).toFixed(1)} Z`
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(3, Math.floor(width / 70))))
  const gradientId = `mtsc-${color.replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} 180`}
        style={{ width: '100%', height: 180, display: 'block', cursor: 'crosshair' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const mouseX = (e.clientX - rect.left) / rect.width * width
          let best = 0, bestDist = Infinity
          for (let i = 0; i < count; i++) {
            const dist = Math.abs(xAt(i) - mouseX)
            if (dist < bestDist) { bestDist = dist; best = i }
          }
          setHoverIndex(best)
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={8} x2={width - 8} y1={16 + 136 * f} y2={16 + 136 * f} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
        ))}
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => i % labelEvery === 0 && (
          <text key={p.date} x={xAt(i)} y={172} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(0,0,0,0.35)">
            {new Date(p.date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
          </text>
        ))}
        {hoverIndex !== null && (
          <>
            <line x1={xAt(hoverIndex)} x2={xAt(hoverIndex)} y1={16} y2={152} stroke="rgba(0,0,0,0.25)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={xAt(hoverIndex)} cy={yAt(values[hoverIndex])} r={4} fill={color} />
          </>
        )}
      </svg>
      {hoverIndex !== null && (
        <div style={{ position: 'absolute', top: 4, left: `${xAt(hoverIndex) / width * 100}%`, transform: 'translateX(-50%)', ...glass, borderRadius: 10, padding: '6px 10px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>
            {new Date(points[hoverIndex].date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>{fmt(values[hoverIndex])}</div>
        </div>
      )}
    </div>
  )
}

function ExpensesInboxImport({ onImported }: { onImported: () => void }) {
  const [candidates, setCandidates] = useState<api.InboxAttachment[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [imported, setImported] = useState<Record<string, { amountDetected: boolean; categoryDetected: boolean; category: string }>>({})
  const supportsFsAccess = typeof (window as any).showDirectoryPicker === 'function'
  const [folderName, setFolderName] = useState<string | null>(null)
  const folderHandleRef = useRef<BillsFolderHandle | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      setCandidates((await api.expensesInboxAttachments(30)).candidates)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg === 'not_connected' ? 'Connect Microsoft 365 in Updates first to pull bills from your inbox.' : msg)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!supportsFsAccess) return
    getBillsFolderHandle().then(async handle => {
      if (!handle) return
      try {
        if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') {
          folderHandleRef.current = handle
          setFolderName(handle.name)
        }
      } catch {}
    })
  }, [supportsFsAccess])

  async function chooseFolder() {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' }) as BillsFolderHandle
      folderHandleRef.current = handle
      setFolderName(handle.name)
      await setBillsFolderHandle(handle)
    } catch {}
  }

  async function importOne(candidate: api.InboxAttachment) {
    const key = `${candidate.messageId}:${candidate.attachmentId}`
    setImporting(key)
    try {
      const result = await api.expensesInboxImport(candidate.messageId, candidate.attachmentId)
      let savedToFolder = false
      if (folderHandleRef.current) {
        try {
          const granted = await folderHandleRef.current.queryPermission({ mode: 'readwrite' }) === 'granted'
            || await folderHandleRef.current.requestPermission({ mode: 'readwrite' }) === 'granted'
          if (granted) { await writeBillToFolder(folderHandleRef.current, result.filename, result.contentBytesBase64); savedToFolder = true }
        } catch {}
      }
      if (!savedToFolder) downloadBillPdf(result.contentBytesBase64, result.filename)
      setImported(prev => ({ ...prev, [key]: { amountDetected: result.amountDetected, categoryDetected: result.categoryDetected, category: result.expense.category } }))
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(null)
    }
  }

  return (
    <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>
          PDF attachments from the last 30 days. Importing reads the invoice for the real total and category.
        </div>
        {supportsFsAccess ? (
          <button onClick={chooseFolder} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'rgba(0,0,0,0.55)', whiteSpace: 'nowrap' }}>
            {folderName ? `Bills folder: ${folderName}` : 'Choose bills folder'}
          </button>
        ) : (
          <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.3)' })}>Each import downloads a copy (folder auto-save needs Chrome/Edge)</div>
        )}
      </div>
      {loading && <SectionSpinner label="Scanning inbox…" />}
      {error && <div style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.5)' })}>{error}</div>}
      {!loading && !error && candidates && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {candidates.map(c => {
            const key = `${c.messageId}:${c.attachmentId}`
            const done = imported[key]
            return (
              <div key={key} style={{ ...glassSubtle, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 12, color: '#000' }}>{c.subject || c.filename}</div>
                  <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>
                    {c.from} · {new Date(c.receivedAt).toLocaleDateString('en-AU')} · {c.filename} ({c.sizeKB}KB)
                  </div>
                  {done && (
                    <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.45)', marginTop: 3 })}>
                      {done.categoryDetected ? `Filed as ${done.category}` : 'Category needs a manual check'} · {done.amountDetected ? 'amount read from PDF' : 'amount not found — check the total'}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => importOne(c)}
                  disabled={!!done || importing === key}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: done ? 'rgba(0,0,0,0.08)' : '#000', color: done ? 'rgba(0,0,0,0.4)' : '#fff', fontSize: 10.5, cursor: done ? 'default' : 'pointer', opacity: importing === key ? 0.6 : 1 }}
                >
                  {done ? 'Imported' : importing === key ? 'Importing…' : 'Import'}
                </button>
              </div>
            )
          })}
          {candidates.length === 0 && (
            <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)' })}>No new PDF attachments in the last 30 days.</div>
          )}
        </div>
      )}
    </div>
  )
}

function ExpensesEntries({ expenses, loading, onReload, meId, todayStr, addDays }: {
  expenses: api.Expense[]
  loading: boolean
  onReload: () => void
  meId: number | null
  todayStr: () => string
  addDays: (dateStr: string, days: number) => string
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [costType, setCostType] = useState<'fixed' | 'variable'>('variable')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(todayStr())
  const [recurrence, setRecurrence] = useState<api.Expense['recurrence']>('none')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [range, setRange] = useState<'30d' | '90d' | 'all'>('30d')
  const [unpaidOnly, setUnpaidOnly] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [togglingPaidId, setTogglingPaidId] = useState<number | null>(null)
  const [showImport, setShowImport] = useState(false)

  function resetForm() {
    setEditingId(null); setDescription(''); setCategory(''); setCostType('variable'); setAmount('')
    setExpenseDate(todayStr()); setRecurrence('none'); setRecurrenceEndDate(''); setNotes(''); setDueDate(''); setShowForm(false)
  }
  function startEdit(e: api.Expense) {
    setEditingId(e.id); setDescription(e.description); setCategory(e.category); setCostType(e.cost_type)
    setAmount((e.amount_cents / 100).toString()); setExpenseDate(e.expense_date); setRecurrence(e.recurrence)
    setRecurrenceEndDate(e.recurrence_end_date ?? ''); setNotes(e.notes ?? ''); setDueDate(e.due_date ?? ''); setShowForm(true)
  }
  async function save() {
    const amountNum = Number(amount)
    if (!description.trim() || !category.trim() || !expenseDate || !(amountNum > 0)) return
    setSaving(true)
    try {
      const body = {
        description: description.trim(),
        category: category.trim(),
        cost_type: costType,
        amount_cents: Math.round(amountNum * 100),
        expense_date: expenseDate,
        recurrence,
        recurrence_end_date: recurrence !== 'none' && recurrenceEndDate ? recurrenceEndDate : null,
        notes: notes.trim() || null,
        due_date: dueDate || null,
      }
      if (editingId === null) await api.addExpense({ ...body, created_by: meId == null ? null : String(meId) })
      else await api.updateExpense(editingId, body)
      resetForm()
      onReload()
    } catch (e) {
      console.warn('Failed to save expense', e)
    } finally {
      setSaving(false)
    }
  }
  async function remove(id: number) {
    try { await api.deleteExpense(id); setConfirmDeleteId(null); onReload() } catch {}
  }
  async function togglePaid(e: api.Expense) {
    setTogglingPaidId(e.id)
    try { await api.setExpensePaid(e.id, !e.paid); onReload() } catch (err) { console.warn('Failed to update paid status', err) } finally { setTogglingPaidId(null) }
  }

  const rangeBounds = useMemo(() => {
    const end = todayStr()
    return range === 'all' ? { start: '2000-01-01', end } : { start: addDays(end, range === '30d' ? -29 : -89), end }
  }, [range])
  const chartStart = range === 'all' ? addDays(rangeBounds.end, -364) : rangeBounds.start

  const [dailyWages, setDailyWages] = useState<api.DailyWages[]>([])
  useEffect(() => {
    let cancelled = false
    api.squareHours(chartStart, rangeBounds.end).then(r => { if (!cancelled) setDailyWages(r.daily) }).catch(() => { if (!cancelled) setDailyWages([]) })
    return () => { cancelled = true }
  }, [chartStart, rangeBounds.end])

  const totalCents = useMemo(() => expenses.reduce((sum, e) => sum + expandExpenseOccurrences(e, rangeBounds.start, rangeBounds.end).length * e.amount_cents, 0), [expenses, rangeBounds])
  const fixedCents = useMemo(() => expenses.filter(e => e.cost_type === 'fixed').reduce((sum, e) => sum + expandExpenseOccurrences(e, rangeBounds.start, rangeBounds.end).length * e.amount_cents, 0), [expenses, rangeBounds])
  const variableCents = totalCents - fixedCents
  const wageCents = useMemo(() => Math.round(dailyWages.filter(d => d.date >= rangeBounds.start && d.date <= rangeBounds.end).reduce((sum, d) => sum + d.wageCost, 0)), [dailyWages, rangeBounds])
  const grandTotalCents = totalCents + wageCents

  const trendPoints = useMemo(() => {
    const byDate: Record<string, number> = {}
    expenses.forEach(e => { expandExpenseOccurrences(e, chartStart, rangeBounds.end).forEach(d => { byDate[d] = (byDate[d] ?? 0) + e.amount_cents }) })
    const wageByDate: Record<string, number> = {}
    dailyWages.forEach(d => { wageByDate[d.date] = d.wageCost })
    const out: { date: string; value: number }[] = []
    let cursor = chartStart
    let guard = 0
    while (cursor <= rangeBounds.end && guard < 400) {
      out.push({ date: cursor, value: (byDate[cursor] ?? 0) + (wageByDate[cursor] ?? 0) })
      cursor = addDays(cursor, 1)
      guard++
    }
    return out
  }, [expenses, dailyWages, chartStart, rangeBounds.end])

  const fmt = (cents: number) => formatMoney(cents, 'AUD')
  const rangeOptions: { key: '30d' | '90d' | 'all'; label: string }[] = [{ key: '30d', label: '30 Days' }, { key: '90d', label: '90 Days' }, { key: 'all', label: 'All Time' }]

  if (loading && expenses.length === 0) return <SectionSpinner label="Loading expenses…" />

  const visible = expenses.filter(e => expandExpenseOccurrences(e, rangeBounds.start, rangeBounds.end).length > 0 && (!unpaidOnly || !e.paid))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2 }}>
            {rangeOptions.map(o => (
              <button key={o.key} onClick={() => setRange(o.key)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: range === o.key ? '#000' : 'transparent', color: range === o.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: range === o.key ? 500 : 400 }}>
                {o.label}
              </button>
            ))}
          </div>
          <button onClick={() => setUnpaidOnly(v => !v)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '7px 12px', borderRadius: 99, border: unpaidOnly ? 'none' : '1px solid rgba(0,0,0,0.15)', cursor: 'pointer', background: unpaidOnly ? 'rgba(180,60,40,0.85)' : 'transparent', color: unpaidOnly ? '#fff' : 'rgba(0,0,0,0.5)', fontWeight: unpaidOnly ? 500 : 400 }}>
            Unpaid only
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowImport(v => !v)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.6)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {showImport ? 'Close import' : 'Import from inbox'}
          </button>
          <button onClick={() => { resetForm(); setShowForm(true) }} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            + Add Expense
          </button>
        </div>
      </div>

      {showImport && <ExpensesInboxImport onImported={onReload} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div style={{ ...glassDark, borderRadius: 14, padding: '14px 16px' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 6 })}>Total Expenses</div>
          <div style={mono({ fontSize: 20, fontWeight: 300, color: '#fff' })}>{fmt(grandTotalCents)}</div>
          <div style={mono({ fontSize: 8, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.35)', marginTop: 4 })}>Incl. wage cost</div>
        </div>
        <div style={{ ...glass, borderRadius: 14, padding: '14px 16px' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Fixed Costs</div>
          <div style={mono({ fontSize: 20, fontWeight: 300, color: '#000' })}>{fmt(fixedCents)}</div>
        </div>
        <div style={{ ...glass, borderRadius: 14, padding: '14px 16px' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Variable Costs</div>
          <div style={mono({ fontSize: 20, fontWeight: 300, color: '#000' })}>{fmt(variableCents)}</div>
        </div>
        <div style={{ ...glass, borderRadius: 14, padding: '14px 16px' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Wage Cost</div>
          <div style={mono({ fontSize: 20, fontWeight: 300, color: BRAND_PURPLE })}>{fmt(wageCents)}</div>
        </div>
      </div>

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Expenses Trend (incl. Wages)</div>
        <div style={{ ...glass, borderRadius: 16, padding: '14px 16px 10px' }}>
          <ExpensesTrendChart points={trendPoints} currency="AUD" emptyLabel="No expense data for this range." />
        </div>
      </div>

      {showForm && (
        <div style={{ ...glass, borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Description</label>
              <input style={inputStyle} placeholder="e.g. Weekly produce order" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <input style={inputStyle} placeholder="e.g. Ingredients, Rent, Utilities" value={category} onChange={e => setCategory(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Cost Type</label>
              <select style={{ ...inputStyle, appearance: 'none' }} value={costType} onChange={e => setCostType(e.target.value as 'fixed' | 'variable')}>
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Amount (AUD)</label>
              <input style={inputStyle} type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input style={inputStyle} type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: recurrence === 'none' ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Recurrence</label>
              <select style={{ ...inputStyle, appearance: 'none' }} value={recurrence} onChange={e => setRecurrence(e.target.value as api.Expense['recurrence'])}>
                <option value="none">One-off</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            {recurrence !== 'none' && (
              <div>
                <label style={labelStyle}>Recurs Until (optional)</label>
                <input style={inputStyle} type="date" value={recurrenceEndDate} onChange={e => setRecurrenceEndDate(e.target.value)} />
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Notes (optional)</label>
              <input style={inputStyle} placeholder="Any extra detail" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Due Date (optional)</label>
              <input style={inputStyle} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={save} disabled={saving || !description.trim() || !category.trim() || !(Number(amount) > 0)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : editingId === null ? 'Add Expense' : 'Save Changes'}
            </button>
            <button onClick={resetForm} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.6)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ ...glassSubtle, borderRadius: 14, overflow: 'hidden' }}>
        {visible.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>
            {unpaidOnly ? 'Nothing unpaid in this period' : 'No expenses in this period yet'}
          </div>
        ) : visible.map((e, i) => {
          const overdue = !e.paid && !!e.due_date && e.due_date < todayStr()
          return (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < visible.length - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#000' }}>{e.description}</span>
                  <span style={{ ...mono({ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 99 }), background: e.cost_type === 'fixed' ? 'rgba(0,0,0,0.08)' : `${BRAND_PURPLE}22`, color: e.cost_type === 'fixed' ? 'rgba(0,0,0,0.55)' : BRAND_PURPLE }}>
                    {e.cost_type}
                  </span>
                  {overdue && (
                    <span style={{ ...mono({ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 99 }), background: 'rgba(180,60,40,0.12)', color: 'rgba(180,60,40,0.85)' }}>
                      Overdue
                    </span>
                  )}
                </div>
                <div style={mono({ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 3 })}>
                  {e.category} · {new Date(e.expense_date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {e.recurrence === 'none' ? '' : ` · repeats ${e.recurrence}`}
                  {e.due_date ? ` · Due ${new Date(e.due_date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}` : ''}
                </div>
              </div>
              <div style={mono({ fontSize: 12, color: '#000', flexShrink: 0 })}>{fmt(e.amount_cents)}</div>
              <button
                onClick={() => togglePaid(e)}
                disabled={togglingPaidId === e.id}
                title={e.paid ? 'Mark as unpaid' : 'Mark as paid'}
                style={{ ...mono({ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }), flexShrink: 0, padding: '5px 10px', borderRadius: 99, border: e.paid ? 'none' : '1px solid rgba(0,0,0,0.15)', background: e.paid ? 'rgba(60,140,80,0.85)' : 'transparent', color: e.paid ? '#fff' : 'rgba(0,0,0,0.45)', cursor: togglingPaidId === e.id ? 'default' : 'pointer', opacity: togglingPaidId === e.id ? 0.6 : 1 }}
              >
                {e.paid ? 'Paid' : 'Unpaid'}
              </button>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => startEdit(e)} title="Edit" style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.5)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                </button>
                {confirmDeleteId === e.id ? (
                  <button onClick={() => remove(e.id)} style={{ padding: '0 10px', height: 26, borderRadius: 8, border: 'none', background: 'rgba(180,60,40,0.85)', color: '#fff', fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>
                    Confirm
                  </button>
                ) : (
                  <button onClick={() => setConfirmDeleteId(e.id)} title="Delete" style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.35)' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ExpensesComparison({ expenses, todayStr, addDays }: { expenses: api.Expense[]; todayStr: () => string; addDays: (dateStr: string, days: number) => string }) {
  const [salesSeries, setSalesSeries] = useState<api.FinancialsSeriesPoint[]>([])
  const [loadingSales, setLoadingSales] = useState(false)
  const [dailyWages, setDailyWages] = useState<api.DailyWages[]>([])

  useEffect(() => {
    setLoadingSales(true)
    const end = todayStr()
    const start = addDays(end, -179)
    api.squareFinancials(start, end).then(r => setSalesSeries(r.series)).catch(() => {}).finally(() => setLoadingSales(false))
    api.squareHours(start, end).then(r => setDailyWages(r.daily)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const end = todayStr()
  const thisMonthStart = end.slice(0, 7) + '-01'
  const lastMonthEndDate = addDays(thisMonthStart, -1)
  const lastMonthStart = lastMonthEndDate.slice(0, 7) + '-01'

  function expensesInRange(start: string, e: string) {
    return expenses.reduce((sum, exp) => sum + expandExpenseOccurrences(exp, start, e).length * exp.amount_cents, 0)
  }
  function salesInRange(start: string, e: string) {
    return salesSeries.filter(p => p.date >= start && p.date <= e).reduce((sum, p) => sum + p.grossSales, 0)
  }
  function wagesInRange(start: string, e: string) {
    return Math.round(dailyWages.filter(d => d.date >= start && d.date <= e).reduce((sum, d) => sum + d.wageCost, 0))
  }
  function totalCostsInRange(start: string, e: string) {
    return expensesInRange(start, e) + wagesInRange(start, e)
  }

  const thisMonthTotal = totalCostsInRange(thisMonthStart, end)
  const lastMonthTotal = totalCostsInRange(lastMonthStart, lastMonthEndDate)
  const vsLastMonthPct = lastMonthTotal > 0 ? Math.round((thisMonthTotal - lastMonthTotal) / lastMonthTotal * 100) : null
  const thisMonthRevenue = salesInRange(thisMonthStart, end)
  const ratioPct = thisMonthRevenue > 0 ? Math.round(thisMonthTotal / thisMonthRevenue * 100) : null

  const ninetyDaysAgo = addDays(end, -89)
  const byCategory = useMemo(() => {
    const totals: Record<string, number> = {}
    expenses.forEach(e => {
      const count = expandExpenseOccurrences(e, ninetyDaysAgo, end).length
      if (count !== 0) totals[e.category] = (totals[e.category] ?? 0) + count * e.amount_cents
    })
    const wages90d = Math.round(dailyWages.filter(d => d.date >= ninetyDaysAgo && d.date <= end).reduce((sum, d) => sum + d.wageCost, 0))
    if (wages90d > 0) totals['Wages'] = (totals['Wages'] ?? 0) + wages90d
    return Object.entries(totals).sort((a, b) => b[1] - a[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, dailyWages, ninetyDaysAgo, end])
  const maxCategoryCents = byCategory.length > 0 ? byCategory[0][1] : 1

  const sixMonths = useMemo(() => {
    const out: { month: string; label: string; expenseCents: number; revenueCents: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(end + 'T00:00:00Z')
      d.setUTCMonth(d.getUTCMonth() - i)
      const monthKey = d.toISOString().slice(0, 7)
      const monthStart = monthKey + '-01'
      const monthEndCalc = new Date(monthKey + '-01T00:00:00Z')
      monthEndCalc.setUTCMonth(monthEndCalc.getUTCMonth() + 1)
      monthEndCalc.setUTCDate(0)
      const monthEndFull = monthEndCalc.toISOString().slice(0, 10)
      const monthEnd = monthEndFull > end ? end : monthEndFull
      out.push({
        month: monthKey,
        label: d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
        expenseCents: totalCostsInRange(monthStart, monthEnd),
        revenueCents: salesInRange(monthStart, monthEnd),
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, salesSeries, dailyWages, end])
  const maxBarCents = Math.max(1, ...sixMonths.map(m => Math.max(m.expenseCents, m.revenueCents)))
  const fmt = (cents: number) => formatMoney(cents, 'AUD')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div style={{ ...glassDark, borderRadius: 14, padding: '14px 16px' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 6 })}>This Month</div>
          <div style={mono({ fontSize: 18, fontWeight: 300, color: '#fff' })}>{fmt(thisMonthTotal)}</div>
          <div style={mono({ fontSize: 8, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.35)', marginTop: 4 })}>Incl. wage cost</div>
        </div>
        <div style={{ ...glass, borderRadius: 14, padding: '14px 16px' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>vs Last Month</div>
          <div style={mono({ fontSize: 18, fontWeight: 300, color: vsLastMonthPct === null || vsLastMonthPct <= 0 ? '#000' : 'rgba(180,60,40,0.8)' })}>
            {vsLastMonthPct === null ? '—' : `${vsLastMonthPct >= 0 ? '+' : ''}${vsLastMonthPct}%`}
          </div>
        </div>
        <div style={{ ...glass, borderRadius: 14, padding: '14px 16px' }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 })}>Expenses / Revenue</div>
          <div style={mono({ fontSize: 18, fontWeight: 300, color: '#000' })}>{loadingSales || ratioPct === null ? '—' : `${ratioPct}%`}</div>
        </div>
      </div>

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>By Category (Last 90 Days)</div>
        {byCategory.length === 0 ? (
          <div style={{ ...glassSubtle, borderRadius: 14, padding: 20, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No expenses logged yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {byCategory.map(([cat, cents]) => (
              <div key={cat} style={{ ...glass, borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, color: '#000' }}>{cat}</span>
                  <span style={mono({ fontSize: 11, color: '#000' })}>{fmt(cents)}</span>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(cents / maxCategoryCents * 100)}%`, background: BRAND_PURPLE, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Expenses vs Revenue (Last 6 Months)</div>
        <div style={{ ...glass, borderRadius: 14, padding: '16px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140 }}>
            {sixMonths.map(m => (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: '100%', width: '100%', justifyContent: 'center' }}>
                  <div title={`Revenue: ${fmt(m.revenueCents)}`} style={{ width: 10, height: `${Math.max(2, Math.round(m.revenueCents / maxBarCents * 100))}%`, background: '#000', borderRadius: '3px 3px 0 0' }} />
                  <div title={`Expenses: ${fmt(m.expenseCents)}`} style={{ width: 10, height: `${Math.max(2, Math.round(m.expenseCents / maxBarCents * 100))}%`, background: BRAND_PURPLE, borderRadius: '3px 3px 0 0' }} />
                </div>
                <div style={mono({ fontSize: 8, letterSpacing: '0.05em', color: 'rgba(0,0,0,0.35)' })}>{m.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#000', display: 'inline-block' }} />
              <span style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Revenue</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: BRAND_PURPLE, display: 'inline-block' }} />
              <span style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>Expenses</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExpensesSection({ meId }: { meId: number | null }) {
  const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date())
  const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const [tab, setTab] = useState<'entries' | 'comparison'>('entries')
  const [expenses, setExpenses] = useState<api.Expense[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setExpenses(await api.getExpenses())
    } catch (e) {
      console.warn('Failed to load expenses', e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const tabs: { key: 'entries' | 'comparison'; label: string }[] = [{ key: 'entries', label: 'Entries' }, { key: 'comparison', label: 'Comparison' }]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2, width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: tab === t.key ? '#000' : 'transparent', color: tab === t.key ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: tab === t.key ? 500 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'entries'
        ? <ExpensesEntries expenses={expenses} loading={loading} onReload={load} meId={meId} todayStr={todayStr} addDays={addDays} />
        : <ExpensesComparison expenses={expenses} todayStr={todayStr} addDays={addDays} />}
    </div>
  )
}
function PayrollSetupSection({ sessionPin }: { sessionPin: string | null }) {
  const [pin, setPin] = useState('')
  const [managerPin, setManagerPin] = useState<string | null>(sessionPin)
  const [pinError, setPinError] = useState(false)
  const [checkingPin, setCheckingPin] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [staff, setStaff] = useState<api.ManagerStaffPay[]>([])
  const [classifications, setClassifications] = useState<api.PayrollClassificationOption[]>([])
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [saveErrors, setSaveErrors] = useState<Record<number, string>>({})
  const [confirmingClassification, setConfirmingClassification] = useState<number | null>(null)
  const [pendingClassification, setPendingClassification] = useState<Record<number, string>>({})
  const [expandedShiftsId, setExpandedShiftsId] = useState<number | null>(null)
  const [shiftsLoading, setShiftsLoading] = useState<Record<number, boolean>>({})
  const [shiftsData, setShiftsData] = useState<Record<number, api.PayrollMe | null>>({})
  const [voidedData, setVoidedData] = useState<Record<number, api.VoidedShift[]>>({})
  const [voidBusyId, setVoidBusyId] = useState<string | null>(null)

  const [holidayDate, setHolidayDate] = useState('')
  const [holidayName, setHolidayName] = useState('')
  const [holidayPartDay, setHolidayPartDay] = useState(false)
  const [holidayStart, setHolidayStart] = useState('18:00')
  const [holidayEnd, setHolidayEnd] = useState('23:59')
  const [holidays, setHolidays] = useState<api.PublicHoliday[]>([])
  const [loadingHolidays, setLoadingHolidays] = useState(false)

  async function loadStaff(pinValue: string) {
    setLoadingStaff(true)
    try {
      const res = await api.payrollManagerStaff(pinValue)
      setStaff(res.staff)
      setClassifications(res.classifications)
      setManagerPin(pinValue)
      setPinError(false)
    } catch {
      setPinError(true)
      setPin('')
      setManagerPin(null)
    } finally {
      setLoadingStaff(false)
      setCheckingPin(false)
    }
  }

  async function loadHolidays() {
    setLoadingHolidays(true)
    try {
      setHolidays(await api.getPublicHolidays())
    } catch {} finally {
      setLoadingHolidays(false)
    }
  }
  useEffect(() => { if (managerPin) loadHolidays() }, [managerPin])
  useEffect(() => { if (sessionPin) loadStaff(sessionPin) }, [])

  async function handlePin(k: string) {
    if (checkingPin) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(false); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      setCheckingPin(true)
      await loadStaff(next)
    }
  }

  async function setEmploymentType(teamId: number, value: 'casual' | 'part_time' | 'full_time') {
    if (!managerPin) return
    setSavingId(teamId); setSaveErrors(prev => ({ ...prev, [teamId]: '' }))
    try {
      await api.payrollSetEmploymentType(managerPin, teamId, value)
      setStaff(prev => prev.map(s => s.teamId === teamId ? { ...s, employmentType: value } : s))
    } catch (e) {
      setSaveErrors(prev => ({ ...prev, [teamId]: e instanceof Error ? e.message : 'Failed to save' }))
    } finally {
      setSavingId(null)
    }
  }

  async function setDob(teamId: number, dob: string) {
    if (!managerPin || !dob) return
    setSavingId(teamId); setSaveErrors(prev => ({ ...prev, [teamId]: '' }))
    try {
      await api.payrollSetDob(managerPin, teamId, dob)
      const today = new Date()
      const born = new Date(dob + 'T00:00:00')
      let age = today.getFullYear() - born.getFullYear()
      const monthDiff = today.getMonth() - born.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age--
      setStaff(prev => prev.map(s => s.teamId === teamId ? { ...s, dob, age } : s))
    } catch (e) {
      setSaveErrors(prev => ({ ...prev, [teamId]: e instanceof Error ? e.message : 'Failed to save' }))
    } finally {
      setSavingId(null)
    }
  }

  async function setClaimsTaxFreeThreshold(teamId: number, claims: boolean) {
    if (!managerPin) return
    setSavingId(teamId); setSaveErrors(prev => ({ ...prev, [teamId]: '' }))
    try {
      await api.payrollSetTaxFreeThreshold(managerPin, teamId, claims)
      setStaff(prev => prev.map(s => s.teamId === teamId ? { ...s, claimsTaxFreeThreshold: claims } : s))
    } catch (e) {
      setSaveErrors(prev => ({ ...prev, [teamId]: e instanceof Error ? e.message : 'Failed to save' }))
    } finally {
      setSavingId(null)
    }
  }

  async function lockClassification(teamId: number) {
    const key = pendingClassification[teamId]
    if (!managerPin || !key) return
    setSavingId(teamId); setSaveErrors(prev => ({ ...prev, [teamId]: '' }))
    try {
      await api.payrollSetClassification(managerPin, teamId, key)
      const option = classifications.find(c => c.key === key)
      setStaff(prev => prev.map(s => s.teamId === teamId ? { ...s, classification: key, classificationLabel: option?.label ?? key, classificationLocked: true } : s))
      setConfirmingClassification(null)
    } catch (e) {
      setSaveErrors(prev => ({ ...prev, [teamId]: e instanceof Error ? e.message : "Failed to save — it may already be locked" }))
    } finally {
      setSavingId(null)
    }
  }

  async function loadShiftsAndVoided(teamId: number) {
    setShiftsLoading(prev => ({ ...prev, [teamId]: true }))
    try {
      const [pay, voided] = await Promise.all([
        api.payrollMe(teamId, 2),
        managerPin ? api.payrollVoidedShifts(managerPin, teamId) : Promise.resolve({ voided: [] as api.VoidedShift[] }),
      ])
      setShiftsData(prev => ({ ...prev, [teamId]: pay }))
      setVoidedData(prev => ({ ...prev, [teamId]: voided.voided }))
    } catch {
      setShiftsData(prev => ({ ...prev, [teamId]: null }))
    } finally {
      setShiftsLoading(prev => ({ ...prev, [teamId]: false }))
    }
  }

  function toggleShifts(teamId: number) {
    if (expandedShiftsId === teamId) { setExpandedShiftsId(null); return }
    setExpandedShiftsId(teamId)
    if (!shiftsData[teamId] && !shiftsLoading[teamId]) loadShiftsAndVoided(teamId)
  }

  async function unvoidShift(teamId: number, timecardId: string) {
    if (!managerPin) return
    setVoidBusyId(timecardId)
    try {
      await api.payrollUnvoidShift(managerPin, teamId, timecardId)
      await loadShiftsAndVoided(teamId)
    } catch {} finally {
      setVoidBusyId(null)
    }
  }

  async function addHoliday() {
    if (!holidayDate || !holidayName.trim()) return
    try {
      await api.addPublicHoliday({
        holiday_date: holidayDate,
        name: holidayName.trim(),
        start_time: holidayPartDay ? holidayStart : null,
        end_time: holidayPartDay ? holidayEnd : null,
      })
      setHolidayDate(''); setHolidayName(''); setHolidayPartDay(false)
      loadHolidays()
    } catch {}
  }
  async function removeHoliday(id: number) {
    try { await api.deletePublicHoliday(id); loadHolidays() } catch {}
  }

  const todayStrForMaxDob = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date())

  if (!managerPin) {
    return (
      <div style={{ ...glass, borderRadius: 20, padding: '36px 28px', maxWidth: 340, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: 46, height: 46, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 4 }}>Payroll Setup</div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 28 })}>Re-enter your manager PIN</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                disabled={k === '' || checkingPin}
                onPointerDown={() => { if (k && !checkingPin) { setPressedKey(k); hapticTap() } }}
                onPointerUp={() => setPressedKey(null)}
                onPointerLeave={() => setPressedKey(null)}
                onPointerCancel={() => setPressedKey(null)}
                onClick={() => k && handlePin(k)}
                style={{ width: 58, height: 58, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.7)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.5)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 16 : 19, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checkingPin ? 0.5 : 1 }}
              >{k}</button>
            </div>
          ))}
        </div>
        {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginTop: 4 })}>Incorrect PIN — try again</div>}
        {checkingPin && !pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>Checking…</div>}
      </div>
    )
  }

  if (loadingStaff && staff.length === 0) return <SectionSpinner label="Loading staff pay setup…" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 4 })}>Fast Food Industry Award — Payroll Setup</div>
        <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', lineHeight: 1.6 })}>
          Classification is a one-time, permanent choice per staff member. Once locked it can't be changed here. Age-based rates and penalty rates still apply automatically within it. All staff are treated as overtime-exempt.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {staff.map(s => {
          const saving = savingId === s.teamId
          const confirming = confirmingClassification === s.teamId
          const shiftsOpen = expandedShiftsId === s.teamId
          const shiftsForStaff = shiftsData[s.teamId]
          const voidedForStaff = voidedData[s.teamId] ?? []
          return (
            <div key={s.teamId} style={{ ...glass, borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: 99, background: 'rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...mono({ fontSize: 10, fontWeight: 600, color: '#000' }) }}>
                  {s.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{s.name}</div>
                  <div style={mono({ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>
                    {s.role}{s.age == null ? '' : ` · Age ${s.age}`}
                  </div>
                </div>
                {saving && <span style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)' })}>Saving…</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Employment Type</label>
                  <select style={{ ...inputStyle, appearance: 'none' }} value={s.employmentType} onChange={e => setEmploymentType(s.teamId, e.target.value as 'casual' | 'part_time' | 'full_time')}>
                    <option value="casual">Casual</option>
                    <option value="part_time">Part-time</option>
                    <option value="full_time">Full-time</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date of Birth</label>
                  <input style={inputStyle} type="date" defaultValue={s.dob ?? ''} max={todayStrForMaxDob()}
                    onBlur={e => { if (e.target.value && e.target.value !== s.dob) setDob(s.teamId, e.target.value) }} />
                </div>
              </div>

              <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#000' }}>Claims tax-free threshold</div>
                  <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>
                    Drives the estimated net pay shown to {s.name.split(' ')[0]}. Off if this is a second job.
                  </div>
                </div>
                <button
                  onClick={() => setClaimsTaxFreeThreshold(s.teamId, !s.claimsTaxFreeThreshold)}
                  disabled={saving}
                  style={{ flexShrink: 0, width: 42, height: 24, borderRadius: 99, border: 'none', cursor: saving ? 'default' : 'pointer', background: s.claimsTaxFreeThreshold ? '#000' : 'rgba(0,0,0,0.15)', position: 'relative', transition: 'background 0.15s' }}
                >
                  <div style={{ position: 'absolute', top: 2, left: s.claimsTaxFreeThreshold ? 20 : 2, width: 20, height: 20, borderRadius: 99, background: '#fff', transition: 'left 0.15s' }} />
                </button>
              </div>

              <div>
                <label style={labelStyle}>Award Classification</label>
                {s.classificationLocked ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...mono({ fontSize: 11, padding: '7px 12px', borderRadius: 8 }), background: 'rgba(0,0,0,0.06)', color: '#000', flex: 1 }}>{s.classificationLabel}</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    <span style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)' })}>Locked</span>
                  </div>
                ) : confirming ? (
                  <div style={{ ...glassSubtle, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={mono({ fontSize: 10, color: 'rgba(150,60,20,0.85)', lineHeight: 1.5, marginBottom: 10 })}>
                      Lock {s.name} in as <strong>{classifications.find(c => c.key === pendingClassification[s.teamId])?.label}</strong>? This cannot be changed afterwards.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => lockClassification(s.teamId)} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: saving ? 'default' : 'pointer' }}>Confirm &amp; Lock</button>
                      <button onClick={() => setConfirmingClassification(null)} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select style={{ ...inputStyle, appearance: 'none' }} value={pendingClassification[s.teamId] ?? ''} onChange={e => setPendingClassification(prev => ({ ...prev, [s.teamId]: e.target.value }))}>
                      <option value="" disabled>Select classification…</option>
                      {classifications.map(c => <option key={c.key} value={c.key}>{c.label} (${c.minHourly.toFixed(2)}/hr min)</option>)}
                    </select>
                    <button onClick={() => setConfirmingClassification(s.teamId)} disabled={!pendingClassification[s.teamId]} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', whiteSpace: 'nowrap', background: pendingClassification[s.teamId] ? '#000' : 'rgba(0,0,0,0.15)', color: pendingClassification[s.teamId] ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 12, fontWeight: 500, cursor: pendingClassification[s.teamId] ? 'pointer' : 'not-allowed' }}>Lock</button>
                  </div>
                )}
                {!s.classificationLocked && !confirming && (
                  <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.3)', marginTop: 6, lineHeight: 1.5 })}>
                    Choose carefully. Once locked this cannot be edited or auto-changed. Age-based rate adjustments still apply.
                  </div>
                )}
              </div>

              {saveErrors[s.teamId] && <div style={mono({ fontSize: 10, color: 'rgba(180,60,40,0.75)', marginTop: 8 })}>{saveErrors[s.teamId]}</div>}

              <button
                onClick={() => toggleShifts(s.teamId)}
                style={{ marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: shiftsOpen ? 'rgba(0,0,0,0.05)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...mono({ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' }) }}
              >
                Manage shifts
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ transform: shiftsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9" /></svg>
              </button>

              {shiftsOpen && (
                <div style={{ marginTop: 10 }}>
                  {shiftsLoading[s.teamId] ? (
                    <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)', textAlign: 'center', padding: '10px 0' })}>Loading shifts…</div>
                  ) : !shiftsForStaff || shiftsForStaff.configured === false ? (
                    <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)', textAlign: 'center', padding: '10px 0' })}>No pay data yet for this cycle.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {shiftsForStaff.cycles.flatMap(c => c.shifts).length === 0 && (
                        <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)', textAlign: 'center', padding: '10px 0' })}>No shifts in this cycle or the last.</div>
                      )}
                      {shiftsForStaff.cycles.flatMap(c => c.shifts).map((shift, i) => (
                        <div key={i} style={{ ...glassSubtle, borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: 11, color: '#000' }}>{shift.date} · {shift.start}–{shift.end}</div>
                            <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)' })}>${(shift.payCents / 100).toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                      {voidedForStaff.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginBottom: 6 })}>Voided ({voidedForStaff.length})</div>
                          {voidedForStaff.map(v => (
                            <div key={v.timecard_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', ...glassSubtle, borderRadius: 8, marginBottom: 4 }}>
                              <span style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)' })}>Voided {new Date(v.voided_at).toLocaleDateString('en-AU')}</span>
                              <button onClick={() => unvoidShift(s.teamId, v.timecard_id)} disabled={voidBusyId === v.timecard_id} style={{ border: 'none', background: 'transparent', cursor: 'pointer', ...mono({ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' }) }}>Undo</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {staff.length === 0 && (
          <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No staff yet</div>
        )}
      </div>

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Public Holidays (Australia/Brisbane)</div>
        <div style={{ ...glass, borderRadius: 14, padding: '16px 18px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input style={inputStyle} type="date" value={holidayDate} onChange={e => setHolidayDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} placeholder="e.g. Ekka Show Day" value={holidayName} onChange={e => setHolidayName(e.target.value)} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={holidayPartDay} onChange={e => setHolidayPartDay(e.target.checked)} />
            <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.5)' })}>Part-day holiday (e.g. Christmas Eve 6pm–midnight)</span>
          </label>
          {holidayPartDay && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Start Time</label>
                <input style={inputStyle} type="time" value={holidayStart} onChange={e => setHolidayStart(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>End Time</label>
                <input style={inputStyle} type="time" value={holidayEnd} onChange={e => setHolidayEnd(e.target.value)} />
              </div>
            </div>
          )}
          <button onClick={addHoliday} disabled={!holidayDate || !holidayName.trim()} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: holidayDate && holidayName.trim() ? '#000' : 'rgba(0,0,0,0.15)', color: holidayDate && holidayName.trim() ? '#fff' : 'rgba(0,0,0,0.3)', fontSize: 12, fontWeight: 500, cursor: holidayDate && holidayName.trim() ? 'pointer' : 'not-allowed' }}>
            Add Holiday
          </button>
        </div>
        {loadingHolidays ? <SectionSpinner label="Loading holidays…" /> : (
          <div style={{ ...glassSubtle, borderRadius: 14, overflow: 'hidden' }}>
            {holidays.map((h, i) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < holidays.length - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#000' }}>{h.name}</div>
                  <div style={mono({ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 2 })}>
                    {new Date(h.holiday_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                    {h.start_time && h.end_time ? ` · ${h.start_time}–${h.end_time}` : ''}
                  </div>
                </div>
                <button onClick={() => removeHoliday(h.id)} title="Remove" style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.35)', flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                </button>
              </div>
            ))}
            {holidays.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>No public holidays added yet</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
const SWAP_STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
  open: { bg: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.55)', label: 'Open' },
  pending_manager: { bg: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.55)', label: 'Pending' },
  approved: { bg: '#000', color: '#fff', label: 'Approved' },
  denied: { bg: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.35)', label: 'Declined' },
  cancelled: { bg: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.35)', label: 'Cancelled' },
}
function ManagerSwapsSection({ meId, sessionPin }: { meId: number | null; sessionPin: string | null }) {
  const [pin, setPin] = useState('')
  const [managerPin, setManagerPin] = useState<string | null>(sessionPin)
  const [pinError, setPinError] = useState(false)
  const [checkingPin, setCheckingPin] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [requests, setRequests] = useState<api.ShiftSwapRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [decideError, setDecideError] = useState<string | null>(null)

  async function load(pinValue: string, filterValue: 'pending' | 'all' = filter) {
    setLoading(true)
    try {
      const res = await api.managerShiftSwaps(filterValue === 'pending' ? 'pending_manager' : undefined)
      setRequests(res.requests)
      setManagerPin(pinValue)
      setPinError(false)
    } catch {
      setPinError(true)
      setPin('')
      setManagerPin(null)
    } finally {
      setLoading(false)
      setCheckingPin(false)
    }
  }
  useEffect(() => { if (managerPin) load(managerPin, filter) }, [filter])

  async function handlePin(k: string) {
    if (checkingPin) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(false); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) { setCheckingPin(true); await load(next) }
  }

  async function decide(requestId: number, status: 'approved' | 'denied') {
    if (!managerPin) return
    setDecideError(null)
    try {
      await api.managerDecideShiftSwap(managerPin, requestId, status === 'approved', String(meId ?? 0), status === 'denied' && note.trim() ? note.trim() : undefined)
      setReviewingId(null); setNote('')
      await load(managerPin, filter)
    } catch (e) {
      setDecideError(e instanceof Error ? e.message : 'Could not save decision — try again.')
    }
  }

  const fmtDay = (d: string) => new Date(d).toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })
  const fmtRange = (start: string, end: string) => `${new Date(start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}–${new Date(end).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}`

  if (!managerPin) {
    return (
      <div style={{ ...glass, borderRadius: 20, padding: '40px 32px', textAlign: 'center', maxWidth: 340, margin: '0 auto' }}>
        <div style={{ width: 46, height: 46, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 4 }}>Manager PIN required</div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 28 })}>Approving reassigns the live roster</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                disabled={k === '' || checkingPin}
                onPointerDown={() => { if (k && !checkingPin) { setPressedKey(k); hapticTap() } }}
                onPointerUp={() => setPressedKey(null)}
                onPointerLeave={() => setPressedKey(null)}
                onPointerCancel={() => setPressedKey(null)}
                onClick={() => k && handlePin(k)}
                style={{ width: 58, height: 58, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.7)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.5)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 16 : 19, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checkingPin ? 0.5 : 1 }}
              >{k}</button>
            </div>
          ))}
        </div>
        {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginTop: 4 })}>Incorrect PIN — try again</div>}
        {checkingPin && !pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>Checking…</div>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2, alignSelf: 'flex-start' }}>
        {(['pending', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: filter === f ? '#000' : 'transparent', color: filter === f ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: filter === f ? 500 : 400 }}>
            {f === 'pending' ? 'Pending' : 'All'}
          </button>
        ))}
      </div>
      {decideError && <div style={mono({ fontSize: 10, color: 'rgba(180,40,40,0.75)' })}>{decideError}</div>}
      {loading && requests.length === 0 ? (
        <SectionSpinner label="Loading…" />
      ) : requests.length === 0 ? (
        <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>
          {filter === 'pending' ? 'No swap requests waiting on you.' : 'No shift swap activity yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map(r => {
            const meta = SWAP_STATUS_META[r.status]
            return (
              <div key={r.id} style={{ ...glass, borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 99, background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: '#000' }}>
                    {r.requester?.avatar ?? '??'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{r.requester?.name ?? 'Unknown'}'s shift</div>
                    <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>{fmtDay(r.shift_start_at)} · {fmtRange(r.shift_start_at, r.shift_end_at)}</div>
                    {r.coverer && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 4 })}>Covered by {r.coverer.name}</div>}
                    {r.reason && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>{r.reason}</div>}
                  </div>
                  <span style={{ ...mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }), padding: '5px 10px', borderRadius: 7, background: meta.bg, color: meta.color, flexShrink: 0 }}>{meta.label}</span>
                </div>
                {r.status === 'pending_manager' && (reviewingId === r.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input style={inputStyle} placeholder="Optional note (shown if declining)" value={note} onChange={e => setNote(e.target.value)} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => decide(r.id, 'approved')} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Approve</button>
                      <button onClick={() => decide(r.id, 'denied')} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: 'rgba(0,0,0,0.6)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Decline</button>
                      <button onClick={() => { setReviewingId(null); setNote('') }} style={{ padding: '8px 12px', borderRadius: 7, border: 'none', background: 'transparent', color: 'rgba(0,0,0,0.35)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setReviewingId(r.id)} style={{ alignSelf: 'flex-start', padding: '7px 16px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.15)', background: 'rgba(0,0,0,0.04)', color: '#000', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Review</button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const TIMEOFF_STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.55)', label: 'Pending' },
  approved: { bg: '#000', color: '#fff', label: 'Approved' },
  denied: { bg: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.35)', label: 'Declined' },
}
function ManagerTimeOffSection({ meId, team }: { meId: number | null; team: TeamMember[] }) {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [requests, setRequests] = useState<api.TimeOffRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [showLogForm, setShowLogForm] = useState(false)
  const [logTeamId, setLogTeamId] = useState<number | ''>('')
  const [logStart, setLogStart] = useState('')
  const [logEnd, setLogEnd] = useState('')
  const [logReason, setLogReason] = useState('')
  const [logSaving, setLogSaving] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await api.managerTimeOff(filter === 'pending' ? 'pending' : undefined)
      setRequests(res.requests)
    } catch (e) {
      console.warn('Failed to load time off requests', e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [filter])

  async function decide(requestId: number, status: 'approved' | 'denied') {
    try {
      await api.managerDecideTimeOff(requestId, status, String(meId ?? 0), status === 'denied' && note.trim() ? note.trim() : undefined)
      setReviewingId(null); setNote('')
      await load()
    } catch (e) {
      console.warn('Failed to decide time off request', e)
    }
  }

  async function logApproved() {
    if (!logTeamId || !logStart || !logEnd) { setLogError('Pick a staff member and both dates.'); return }
    setLogSaving(true); setLogError(null)
    try {
      await api.managerCreateTimeOff(logTeamId, logStart, logEnd > logStart ? logEnd : logStart, logReason.trim(), String(meId ?? 0))
      setShowLogForm(false); setLogTeamId(''); setLogStart(''); setLogEnd(''); setLogReason('')
      if (filter === 'pending') setFilter('all')
      else await load()
    } catch {
      setLogError('Save failed — try again.')
    } finally {
      setLogSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ ...glassSubtle, borderRadius: 8, padding: '3px 4px', display: 'flex', gap: 2, alignSelf: 'flex-start' }}>
          {(['pending', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: filter === f ? '#000' : 'transparent', color: filter === f ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: filter === f ? 500 : 400 }}>
              {f === 'pending' ? 'Pending' : 'All'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setShowLogForm(v => !v); setLogError(null) }} style={{ padding: '8px 14px', borderRadius: 8, border: showLogForm ? 'none' : '1px solid rgba(0,0,0,0.15)', background: showLogForm ? '#000' : 'rgba(0,0,0,0.04)', color: showLogForm ? '#fff' : '#000', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
          {showLogForm ? 'Cancel' : '+ Log approved time off'}
        </button>
      </div>

      {showLogForm && (
        <div style={{ ...glass, borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={mono({ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' })}>
            For time off already approved outside the app (e.g. in Square). Square doesn't give us an API to pull this automatically, so it needs entering once here.
          </div>
          <select value={logTeamId} onChange={e => setLogTeamId(e.target.value ? Number(e.target.value) : '')} style={{ ...inputStyle, appearance: 'none' }}>
            <option value="">Select staff member…</option>
            {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={logStart} onChange={e => setLogStart(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <input type="date" value={logEnd} onChange={e => setLogEnd(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>
          <input placeholder="Reason (optional)" value={logReason} onChange={e => setLogReason(e.target.value)} style={inputStyle} />
          {logError && <div style={mono({ fontSize: 10, color: 'rgba(180,40,40,0.8)' })}>{logError}</div>}
          <button onClick={logApproved} disabled={logSaving} style={{ alignSelf: 'flex-start', padding: '8px 18px', borderRadius: 7, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {logSaving ? 'Saving…' : 'Save as approved'}
          </button>
        </div>
      )}

      {loading && requests.length === 0 ? (
        <SectionSpinner label="Loading…" />
      ) : requests.length === 0 ? (
        <div style={{ ...glassSubtle, borderRadius: 14, padding: 24, textAlign: 'center', ...mono({ fontSize: 11, color: 'rgba(0,0,0,0.3)' }) }}>
          {filter === 'pending' ? 'No pending requests.' : 'No time off requests yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map(r => {
            const meta = TIMEOFF_STATUS_META[r.status]
            return (
              <div key={r.id} style={{ ...glass, borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 99, background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: '#000' }}>
                    {r.tt_team?.avatar ?? '??'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{r.tt_team?.name ?? 'Unknown'}</div>
                    <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>{r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`}</div>
                    {r.reason && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 4 })}>{r.reason}</div>}
                  </div>
                  <span style={{ ...mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }), padding: '5px 10px', borderRadius: 7, background: meta.bg, color: meta.color, flexShrink: 0 }}>{meta.label}</span>
                </div>
                {r.status === 'pending' && (reviewingId === r.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input style={inputStyle} placeholder="Optional note (shown if declining)" value={note} onChange={e => setNote(e.target.value)} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => decide(r.id, 'approved')} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Approve</button>
                      <button onClick={() => decide(r.id, 'denied')} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: 'rgba(0,0,0,0.6)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Decline</button>
                      <button onClick={() => { setReviewingId(null); setNote('') }} style={{ padding: '8px 12px', borderRadius: 7, border: 'none', background: 'transparent', color: 'rgba(0,0,0,0.35)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setReviewingId(r.id)} style={{ alignSelf: 'flex-start', padding: '7px 16px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.15)', background: 'rgba(0,0,0,0.04)', color: '#000', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Review</button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
function ManagerReviewsSection({ team, sessionPin }: { team: TeamMember[]; sessionPin: string | null }) {
  const [pin, setPin] = useState('')
  const [managerPin, setManagerPin] = useState<string | null>(sessionPin)
  const [pinError, setPinError] = useState(false)
  const [checkingPin, setCheckingPin] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [scoreboard, setScoreboard] = useState<api.ReviewScoreboard | null>(null)
  const [pending, setPending] = useState<api.PendingReview[]>([])
  const [googleStatus, setGoogleStatus] = useState<api.GoogleReviewsStatus | null>(null)
  const [assignChoice, setAssignChoice] = useState<Record<number, number>>({})
  const [assigningId, setAssigningId] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const popupRef = useRef<Window | null>(null)
  const [claimingKey, setClaimingKey] = useState<string | null>(null)

  const [showBulkForm, setShowBulkForm] = useState(false)
  const [bulkTeamId, setBulkTeamId] = useState<number | ''>('')
  const [bulkCount, setBulkCount] = useState('')
  const [bulkDate, setBulkDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date()))
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)

  const [showSingleForm, setShowSingleForm] = useState(false)
  const [singleTeamId, setSingleTeamId] = useState<number | ''>('')
  const [singleRating, setSingleRating] = useState(5)
  const [singleReviewerName, setSingleReviewerName] = useState('')
  const [singleDate, setSingleDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date()))
  const [singleText, setSingleText] = useState('')
  const [singleSaving, setSingleSaving] = useState(false)
  const [singleError, setSingleError] = useState<string | null>(null)

  async function load(pinValue: string) {
    setLoading(true)
    try {
      const [board, pendingRes, status] = await Promise.all([
        api.managerReviewsScoreboard(pinValue),
        api.managerReviewsPending(pinValue),
        api.googleReviewsStatus(),
      ])
      setScoreboard(board)
      setPending(pendingRes.reviews)
      setGoogleStatus(status)
      setManagerPin(pinValue)
      setPinError(false)
    } catch {
      setPinError(true)
      setPin('')
      setManagerPin(null)
    } finally {
      setLoading(false)
      setCheckingPin(false)
    }
  }

  async function handlePin(k: string) {
    if (checkingPin) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(false); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) { setCheckingPin(true); await load(next) }
  }

  useEffect(() => { if (sessionPin) load(sessionPin) }, [])

  async function connectGoogle() {
    setConnecting(true); setConnectError(null)
    try {
      const { url } = await api.googleReviewsAuthUrl()
      const popup = window.open(url, 'google-reviews-connect', 'width=480,height=720')
      if (!popup) {
        setConnecting(false)
        setConnectError('Your browser blocked the sign-in popup — allow popups for this site and try again.')
        return
      }
      popupRef.current = popup
      const timer = setInterval(() => {
        if (!popupRef.current || popupRef.current.closed) {
          clearInterval(timer)
          setConnecting(false)
          api.googleReviewsStatus().then(setGoogleStatus).catch(() => {})
        }
      }, 700)
    } catch (e) {
      setConnecting(false)
      setConnectError(e instanceof Error ? e.message : 'Could not start Google sign-in')
    }
  }
  async function disconnectGoogle() {
    try { await api.googleReviewsDisconnect() } catch {}
    setGoogleStatus({ connected: false })
  }
  async function syncNow() {
    if (!managerPin) return
    setSyncing(true); setSyncMessage(null)
    try {
      const res = await api.managerReviewsSync(managerPin)
      setSyncMessage(`Pulled ${res.fetched} reviews — ${res.imported} new`)
      const pendingRes = await api.managerReviewsPending(managerPin)
      setPending(pendingRes.reviews)
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }
  async function assign(reviewId: number) {
    if (!managerPin) return
    const teamId = assignChoice[reviewId]
    if (!teamId) return
    setAssigningId(reviewId)
    try {
      await api.managerReviewsAssign(reviewId, managerPin, teamId)
      setPending(prev => prev.filter(r => r.id !== reviewId))
      setScoreboard(await api.managerReviewsScoreboard(managerPin))
    } catch {} finally {
      setAssigningId(null)
    }
  }
  async function claimTier(teamId: number, tier: number) {
    if (!managerPin) return
    const key = `${teamId}-${tier}`
    setClaimingKey(key)
    try {
      await api.managerReviewsClaim(managerPin, teamId, tier)
      setScoreboard(await api.managerReviewsScoreboard(managerPin))
    } catch {} finally {
      setClaimingKey(null)
    }
  }
  async function saveBulk() {
    const count = Number(bulkCount)
    if (!managerPin || !bulkTeamId || !Number.isFinite(count) || count < 1) return
    setBulkSaving(true); setBulkError(null); setBulkMessage(null)
    try {
      const res = await api.managerReviewsManualBulk({ pin: managerPin, teamId: bulkTeamId, count, reviewDate: bulkDate })
      setBulkMessage(`Added ${res.inserted} review${res.inserted === 1 ? '' : 's'}`)
      setBulkCount('')
      setScoreboard(await api.managerReviewsScoreboard(managerPin))
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : 'Failed to save — try again')
    } finally {
      setBulkSaving(false)
    }
  }
  async function saveSingle() {
    if (!managerPin || !singleTeamId) return
    setSingleSaving(true); setSingleError(null)
    try {
      await api.managerReviewsManual({ pin: managerPin, teamId: singleTeamId, rating: singleRating, reviewText: singleText || undefined, reviewerName: singleReviewerName || undefined, reviewDate: singleDate })
      setSingleReviewerName(''); setSingleText(''); setShowSingleForm(false)
      setScoreboard(await api.managerReviewsScoreboard(managerPin))
    } catch (e) {
      setSingleError(e instanceof Error ? e.message : 'Failed to save — try again')
    } finally {
      setSingleSaving(false)
    }
  }

  if (!managerPin) {
    return (
      <div style={{ ...glass, borderRadius: 20, padding: '36px 28px', maxWidth: 340, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: 46, height: 46, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 17.75l-6.16 3.24 1.18-6.88L2 9.24l6.92-1L12 2l3.08 6.24 6.92 1-5.02 4.87 1.18 6.88z" /></svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 4 }}>Manager PIN required</div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 28 })}>Enter your manager PIN</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                disabled={k === '' || checkingPin}
                onPointerDown={() => { if (k && !checkingPin) { setPressedKey(k); hapticTap() } }}
                onPointerUp={() => setPressedKey(null)}
                onPointerLeave={() => setPressedKey(null)}
                onPointerCancel={() => setPressedKey(null)}
                onClick={() => k && handlePin(k)}
                style={{ width: 58, height: 58, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.7)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.5)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 16 : 19, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checkingPin ? 0.5 : 1 }}
              >{k}</button>
            </div>
          ))}
        </div>
        {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginTop: 4 })}>Incorrect PIN — try again</div>}
        {checkingPin && !pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>Checking…</div>}
      </div>
    )
  }

  if (loading) return <SectionSpinner label="Loading reviews…" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ ...glassSubtle, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>
            {googleStatus?.connected ? `Connected to ${googleStatus.businessName ?? 'Google Business Profile'}` : 'Google Business Profile not connected'}
          </div>
          <div style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.4)', marginTop: 2 })}>
            {googleStatus?.connected ? 'Sync pulls new reviews in for you to assign below.' : 'Connect to auto-pull reviews, or log them manually below.'}
          </div>
        </div>
        {googleStatus?.connected ? (
          <>
            <button onClick={syncNow} disabled={syncing} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontSize: 11.5, opacity: syncing ? 0.6 : 1 }}>{syncing ? 'Syncing…' : 'Sync now'}</button>
            <button onClick={disconnectGoogle} style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', cursor: 'pointer', fontSize: 11.5, color: 'rgba(0,0,0,0.5)' }}>Disconnect</button>
          </>
        ) : (
          <button onClick={connectGoogle} disabled={connecting} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontSize: 11.5, opacity: connecting ? 0.6 : 1 }}>{connecting ? 'Connecting…' : 'Connect Google Business Profile'}</button>
        )}
      </div>

      {syncMessage && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.45)' })}>{syncMessage}</div>}
      {connectError && <div style={{ ...glassSubtle, borderRadius: 10, padding: '10px 12px', fontSize: 11.5, color: 'rgba(150,40,30,0.85)' }}>{connectError}</div>}

      {scoreboard && (
        <div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>
            This cycle: {scoreboard.cycleStart} to {scoreboard.cycleEnd} — 10 reviews = $250 Myer card, 20 reviews = 2 nights' hotel
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {scoreboard.staff.map(s => (
              <div key={s.teamId} style={{ ...glass, borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 99, background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{s.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: '#000' }}>{s.name}</div>
                    <div style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.4)' })}>{s.count} review{s.count === 1 ? '' : 's'} this cycle</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {s.tiers.map(t => (
                    <div key={t.tier} style={{ flex: '1 1 160px', minWidth: 160 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.5)' })}>{t.label}</span>
                        <span style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.4)' })}>{Math.min(s.count, t.count)}/{t.count}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 99, background: 'rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ height: '100%', width: `${Math.min(100, s.count / t.count * 100)}%`, background: t.reached ? BRAND_PURPLE : 'rgba(191,119,246,0.35)', transition: 'width 0.3s' }} />
                      </div>
                      {t.reached && (t.claim ? (
                        <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)' })}>Given {new Date(t.claim.given_at).toLocaleDateString('en-AU')}</div>
                      ) : (
                        <button onClick={() => claimTier(s.teamId, t.tier)} disabled={claimingKey === `${s.teamId}-${t.tier}`} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#000', color: '#fff', fontSize: 10, cursor: 'pointer', opacity: claimingKey === `${s.teamId}-${t.tier}` ? 0.6 : 1 }}>
                          {claimingKey === `${s.teamId}-${t.tier}` ? 'Saving…' : 'Mark reward given'}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {scoreboard.staff.length === 0 && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)' })}>No team members yet.</div>}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Unassigned reviews ({pending.length}) — pick who earned each one</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(r => (
              <div key={r.id} style={{ ...glassSubtle, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 12.5, color: '#000' }}>
                    {'★'.repeat(r.rating ?? 0)}{'☆'.repeat(5 - (r.rating ?? 0))} <span style={{ color: 'rgba(0,0,0,0.5)' }}>{r.reviewer_name ?? 'Anonymous'}</span>
                  </div>
                  {r.review_text && <div style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.4)', marginTop: 3 })}>{r.review_text.slice(0, 140)}</div>}
                </div>
                <select value={assignChoice[r.id] ?? ''} onChange={e => setAssignChoice(prev => ({ ...prev, [r.id]: Number(e.target.value) }))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 11.5, background: '#fff' }}>
                  <option value="">Assign to…</option>
                  {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button onClick={() => assign(r.id)} disabled={!assignChoice[r.id] || assigningId === r.id} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 11, cursor: 'pointer', opacity: !assignChoice[r.id] || assigningId === r.id ? 0.5 : 1 }}>
                  {assigningId === r.id ? 'Saving…' : 'Assign'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => { setShowBulkForm(v => !v); setShowSingleForm(false) }} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.15)', background: showBulkForm ? '#000' : 'transparent', color: showBulkForm ? '#fff' : 'rgba(0,0,0,0.6)', cursor: 'pointer', fontSize: 11.5 }}>
          {showBulkForm ? 'Cancel' : '+ Add a count of reviews'}
        </button>
        <button onClick={() => { setShowSingleForm(v => !v); setShowBulkForm(false) }} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.15)', background: showSingleForm ? '#000' : 'transparent', color: showSingleForm ? '#fff' : 'rgba(0,0,0,0.6)', cursor: 'pointer', fontSize: 11.5 }}>
          {showSingleForm ? 'Cancel' : '+ Log one review'}
        </button>
      </div>

      {showBulkForm && (
        <div style={{ ...glass, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.4)', lineHeight: 1.5 })}>Backfill a known total at once — e.g. "Sam got 5 reviews" — instead of logging each one individually.</div>
          <select value={bulkTeamId} onChange={e => setBulkTeamId(e.target.value ? Number(e.target.value) : '')} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 12 }}>
            <option value="">Which staff member?</option>
            {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" min={1} max={100} placeholder="Count (e.g. 5)" value={bulkCount} onChange={e => setBulkCount(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 12, width: 120 }} />
            <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 12, flex: 1 }} />
          </div>
          {bulkError && <div style={mono({ fontSize: 10, color: 'rgba(150,40,30,0.85)' })}>{bulkError}</div>}
          {bulkMessage && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.45)' })}>{bulkMessage}</div>}
          <button onClick={saveBulk} disabled={!bulkTeamId || !bulkCount || bulkSaving} style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: '#000', color: '#fff', fontSize: 11.5, cursor: 'pointer', opacity: !bulkTeamId || !bulkCount || bulkSaving ? 0.5 : 1 }}>
            {bulkSaving ? 'Saving…' : 'Add reviews'}
          </button>
        </div>
      )}

      {showSingleForm && (
        <div style={{ ...glass, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <select value={singleTeamId} onChange={e => setSingleTeamId(e.target.value ? Number(e.target.value) : '')} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 12 }}>
            <option value="">Which staff member?</option>
            {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={singleRating} onChange={e => setSingleRating(Number(e.target.value))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 12 }}>
              {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
            </select>
            <input type="date" value={singleDate} onChange={e => setSingleDate(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 12, flex: 1 }} />
          </div>
          <input placeholder="Reviewer name (optional)" value={singleReviewerName} onChange={e => setSingleReviewerName(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 12 }} />
          <textarea placeholder="Review text (optional)" value={singleText} onChange={e => setSingleText(e.target.value)} rows={2} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 12, resize: 'vertical' }} />
          {singleError && <div style={mono({ fontSize: 10, color: 'rgba(150,40,30,0.85)' })}>{singleError}</div>}
          <button onClick={saveSingle} disabled={!singleTeamId || singleSaving} style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: '#000', color: '#fff', fontSize: 11.5, cursor: 'pointer', opacity: !singleTeamId || singleSaving ? 0.5 : 1 }}>
            {singleSaving ? 'Saving…' : 'Log review'}
          </button>
        </div>
      )}
    </div>
  )
}
function analyticsDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
function formatHour12(hour: number): string {
  const period = hour < 12 ? 'am' : 'pm'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}${period}`
}
const ANALYTICS_STAT_CARDS = (s: api.AnalyticsSummary) => [
  { label: 'Revenue', value: formatMoney(s.totalRevenue) },
  { label: 'Orders', value: String(s.totalOrders) },
  { label: 'Items sold', value: String(s.totalItemsSold) },
  { label: 'Avg order', value: formatMoney(s.avgOrderValueCents) },
  { label: 'Avg basket', value: `${s.avgBasketSize} items` },
  { label: 'Discounts given', value: formatMoney(s.totalDiscount) },
  { label: 'Sales / labor hr', value: s.salesPerLaborHourCents == null ? '—' : formatMoney(s.salesPerLaborHourCents) },
]
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function AnalyticsSection() {
  const [start, setStart] = useState(() => analyticsDaysAgo(29))
  const [end, setEnd] = useState(() => analyticsDaysAgo(0))
  const [overview, setOverview] = useState<api.AnalyticsOverview | null>(null)
  const [staff, setStaff] = useState<api.AnalyticsStaff | null>(null)
  const [customers, setCustomers] = useState<api.AnalyticsCustomers | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printRequested, setPrintRequested] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    Promise.all([
      api.squareAnalyticsOverview(start, end),
      api.squareAnalyticsStaff(start, end),
      api.squareAnalyticsCustomers(start, end),
    ]).then(([o, s, c]) => {
      if (cancelled) return
      setOverview(o); setStaff(s); setCustomers(c)
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load analytics')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [start, end])

  const presets = [{ label: 'Today', days: 0 }, { label: '7d', days: 6 }, { label: '30d', days: 29 }, { label: '90d', days: 89 }]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ ...glassSubtle, borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {presets.map(p => (
          <button key={p.label} onClick={() => { setStart(analyticsDaysAgo(p.days)); setEnd(analyticsDaysAgo(0)) }} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', fontSize: 10.5, color: 'rgba(0,0,0,0.6)' }}>
            {p.label}
          </button>
        ))}
        <input type="date" value={start} max={end} onChange={e => setStart(e.target.value)} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)', fontSize: 11 }} />
        <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)' })}>to</span>
        <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)', fontSize: 11 }} />
        <button
          onClick={() => setPrintRequested(true)}
          disabled={!overview || printRequested}
          style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 7, border: 'none', cursor: overview ? 'pointer' : 'default', background: '#000', color: '#fff', fontSize: 10.5, opacity: !overview || printRequested ? 0.5 : 1, ...mono({ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }) }}
        >
          {printRequested ? 'Preparing…' : 'Download PDF Report'}
        </button>
      </div>

      {loading && <SectionSpinner label="Crunching sales data…" />}
      {error && <div style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.5)' })}>{error}</div>}
      {printRequested && overview && (
        <PrintableAnalyticsReport
          start={start} end={end} overview={overview} staff={staff} customers={customers}
          onDone={() => setPrintRequested(false)}
        />
      )}

      {overview && !loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            {ANALYTICS_STAT_CARDS(overview.summary).map(c => (
              <div key={c.label} style={{ ...glass, borderRadius: 12, padding: '12px 14px' }}>
                <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 5 })}>{c.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#000' }}>{c.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
              <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Most popular items</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {overview.leaderboard.slice(0, 10).map((item, i) => (
                  <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#000' }}>{i + 1}. {item.name}</span>
                    <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.45)' })}>{item.qty} · {formatMoney(item.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
              <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Getting more popular</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {overview.trending.slice(0, 10).map(item => (
                  <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#000' }}>{item.name}</span>
                    <span style={mono({ fontSize: 10.5, color: item.growthPct >= 0 ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.3)' })}>{item.growthPct >= 0 ? '+' : ''}{item.growthPct}%</span>
                  </div>
                ))}
                {overview.trending.length === 0 && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>Not enough volume yet to call a trend.</div>}
              </div>
            </div>

            <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
              <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Least wanted</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {overview.leastWanted.slice(0, 8).map(item => (
                  <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#000' }}>{item.name}</span>
                    <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.4)' })}>{item.qty} sold</span>
                  </div>
                ))}
                {overview.neverSold.length > 0 && (
                  <div style={mono({ fontSize: 9.5, color: 'rgba(0,0,0,0.35)', marginTop: 6 })}>
                    Never sold this range: {overview.neverSold.slice(0, 6).join(', ')}{overview.neverSold.length > 6 ? '…' : ''}
                  </div>
                )}
              </div>
            </div>

            <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
              <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Bought together</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {overview.basketPairs.slice(0, 8).map(pair => (
                  <div key={`${pair.itemA}-${pair.itemB}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                    <span style={{ color: '#000' }}>{pair.itemA} + {pair.itemB}</span>
                    <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)' })}>×{pair.count}</span>
                  </div>
                ))}
                {overview.basketPairs.length === 0 && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>No repeated combos yet in this range.</div>}
              </div>
            </div>

            <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
              <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Popular add-ons</div>
              <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginBottom: 8, lineHeight: 1.5 })}>
                Combined by name across every product — "Nutella" on a croissant and "Nutella" on a waffle count together.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {overview.modifiers.slice(0, 10).map(m => (
                  <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#000' }}>{m.name}</span>
                    <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.45)' })}>×{m.qty} · {formatMoney(m.revenue)}</span>
                  </div>
                ))}
                {overview.modifiers.length === 0 && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>No paid add-ons/modifiers sold in this range.</div>}
              </div>
            </div>

            <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
              <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Category mix</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {overview.categoryMix.slice(0, 8).map(c => {
                  const max = overview.categoryMix[0]?.revenue || 1
                  return (
                    <div key={c.category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: '#000' }}>{c.category}</span>
                        <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)' })}>{formatMoney(c.revenue)}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${c.revenue / max * 100}%`, background: '#000' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
              <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Revenue by day of week</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {overview.dayOfWeekRevenue.map(d => {
                  const max = Math.max(...overview.dayOfWeekRevenue.map(x => x.revenue), 1)
                  return (
                    <div key={d.dow}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: '#000' }}>{DOW_LABELS[d.dow]}</span>
                        <span style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.4)' })}>{formatMoney(d.revenue)}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${d.revenue / max * 100}%`, background: '#000' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
              <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Peak selling hours</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {overview.hourlyHeatmap.slice(0, 8).map(h => {
                  const peakHour = h.hours.indexOf(Math.max(...h.hours))
                  return (
                    <div key={h.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#000' }}>{h.name}</span>
                      <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.45)' })}>peaks {formatHour12(peakHour)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
              <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Staff sales</div>
              {staff?.available ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {staff.staff.map(s => (
                    <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#000' }}>{s.name}</span>
                      <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.45)' })}>{s.transactions} sales · {formatMoney(s.revenue)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', lineHeight: 1.6 })}>{staff?.reason ?? 'Not available for this range.'}</div>
              )}
            </div>

            <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
              <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 10 })}>Customers</div>
              {customers?.available ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#000' }}>Unique customers</span>
                    <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.45)' })}>{customers.uniqueCustomers}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#000' }}>Returning (2+ visits)</span>
                    <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.45)' })}>{customers.returningInRange}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#000' }}>Single visit</span>
                    <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.45)' })}>{customers.singleVisitInRange}</span>
                  </div>
                  {customers.note && <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>{customers.note}</div>}
                </div>
              ) : (
                <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', lineHeight: 1.6 })}>{customers?.reason ?? 'Not available for this range.'}</div>
              )}
            </div>

            <WeatherImpactSection start={start} end={end} />
            <StaffShiftSection start={start} end={end} />
            <TrendDecaySection start={start} end={end} />
            <HolidayFlagSection start={start} end={end} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Printable PDF report — portalled to document.body so hiding .app-shell
// for print doesn't hide this too. Re-fetches the same data the on-screen
// sections use (cheap, read-only) rather than threading it all through
// props, so each section stays independent. Triggers the browser's print
// dialog once loaded — "Save as PDF" there is what actually produces the
// file, no PDF-generation library needed. ───────────────────────────────────
function PrintableAnalyticsReport({ start, end, overview, staff, customers, onDone }: {
  start: string; end: string; overview: api.AnalyticsOverview; staff: api.AnalyticsStaff | null; customers: api.AnalyticsCustomers | null; onDone: () => void
}) {
  const [weather, setWeather] = useState<{ rainyAvg: number; dryAvg: number; rainyCount: number; dryCount: number } | null>(null)
  const [shiftRows, setShiftRows] = useState<{ name: string; days: number; hours: number; diffPct: number }[]>([])
  const [holidayRows, setHolidayRows] = useState<{ date: string; label: string; revenue: number; typicalForDow: number }[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
    Promise.allSettled([
      Promise.all([
        api.squareAnalyticsDaily(start, end),
        fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=-26.6773&longitude=153.1163&start_date=${start}&end_date=${end}&daily=precipitation_sum&timezone=Australia%2FBrisbane`).then(r => r.json()),
      ]).then(([daily, wx]) => {
        const rainByDate = new Map<string, number>()
        const times: string[] = wx?.daily?.time ?? []; const rains: number[] = wx?.daily?.precipitation_sum ?? []
        times.forEach((t, i) => rainByDate.set(t, rains[i] ?? 0))
        const merged = daily.days.filter(d => rainByDate.has(d.date)).map(d => ({ ...d, rain: rainByDate.get(d.date)! }))
        if (merged.length < 5) return
        const rainy = merged.filter(d => d.rain > 1), dry = merged.filter(d => d.rain <= 1)
        if (!cancelled) setWeather({ rainyAvg: avg(rainy.map(d => d.revenue)), dryAvg: avg(dry.map(d => d.revenue)), rainyCount: rainy.length, dryCount: dry.length })
      }),
      api.squareAnalyticsDaily(start, end).then(async daily => {
        const shiftsRes = await api.squareAnalyticsShifts(start, end)
        const dowRevs: number[][] = Array.from({ length: 7 }, () => [])
        for (const d of daily.days) { const dow = new Date(d.date + 'T00:00:00').getDay(); dowRevs[dow].push(d.revenue) }
        const dowAvg = dowRevs.map(avg)
        const indexByDate = new Map(daily.days.map(d => { const dow = new Date(d.date + 'T00:00:00').getDay(); return [d.date, dowAvg[dow] > 0 ? d.revenue / dowAvg[dow] : 1] as [string, number] }))
        const byPerson = new Map<string, { dates: Set<string>; hours: number }>()
        for (const s of shiftsRes.shifts) { if (!s.hours || s.hours <= 0.25) continue; const rec = byPerson.get(s.name) ?? { dates: new Set<string>(), hours: 0 }; rec.dates.add(s.date); rec.hours += s.hours; byPerson.set(s.name, rec) }
        const allDates = new Set(daily.days.map(d => d.date))
        const out = [...byPerson.entries()].map(([name, rec]) => {
          const onIdx = [...rec.dates].filter(d => indexByDate.has(d)).map(d => indexByDate.get(d)!)
          const offIdx = [...allDates].filter(d => !rec.dates.has(d) && indexByDate.has(d)).map(d => indexByDate.get(d)!)
          const onAvg = avg(onIdx), offAvg = avg(offIdx)
          return { name, days: rec.dates.size, hours: Math.round(rec.hours * 10) / 10, diffPct: offAvg > 0 ? Math.round((onAvg / offAvg - 1) * 1000) / 10 : 0 }
        }).filter(r => r.days > 0).sort((a, b) => b.diffPct - a.diffPct)
        if (!cancelled) setShiftRows(out)
      }),
      Promise.all([api.squareAnalyticsDaily(start, end), api.getPublicHolidays(), api.getSchoolHolidays()]).then(([daily, publicHolidays, schoolHolidays]) => {
        const dowRevs: number[][] = Array.from({ length: 7 }, () => [])
        for (const d of daily.days) { const dow = new Date(d.date + 'T00:00:00').getDay(); dowRevs[dow].push(d.revenue) }
        const dowAvg = dowRevs.map(avg)
        const out: typeof holidayRows = []
        for (const d of daily.days) {
          const holiday = publicHolidays.find(h => h.holiday_date === d.date)
          const schoolHol = schoolHolidays.find(h => d.date >= h.start_date && d.date <= h.end_date)
          if (!holiday && !schoolHol) continue
          const dow = new Date(d.date + 'T00:00:00').getDay()
          out.push({ date: d.date, label: holiday ? holiday.name : (schoolHol!.term_name || 'School Holidays'), revenue: d.revenue, typicalForDow: dowAvg[dow] })
        }
        if (!cancelled) setHolidayRows(out)
      }),
    ]).then(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [start, end])

  useEffect(() => {
    if (!ready) return
    const afterPrint = () => onDone()
    window.addEventListener('afterprint', afterPrint)
    const t = setTimeout(() => window.print(), 150)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', afterPrint) }
  }, [ready])

  const fmt = (v: number) => formatMoney(v)
  const rangeLabel = `${new Date(start + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(end + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}`
  const section: CSSProperties = { marginBottom: 22, pageBreakInside: 'avoid' }
  const h2: CSSProperties = { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ccc', paddingBottom: 4, marginBottom: 8 }
  const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '2px 0' }

  return createPortal(
    <div className="analytics-print-report">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Tropicool Treats — Analytics Report</div>
        <div style={{ fontSize: 11, color: '#555' }}>{rangeLabel} · generated {new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      </div>

      <div style={section}>
        <div style={h2}>Summary</div>
        <div style={row}><span>Total orders</span><span>{overview.summary.totalOrders}</span></div>
        <div style={row}><span>Total revenue</span><span>{fmt(overview.summary.totalRevenue)}</span></div>
        <div style={row}><span>Average order value</span><span>{fmt(overview.summary.avgOrderValueCents)}</span></div>
        <div style={row}><span>Average basket size</span><span>{overview.summary.avgBasketSize} items</span></div>
        {overview.summary.salesPerLaborHourCents !== null && <div style={row}><span>Sales per labor hour</span><span>{fmt(overview.summary.salesPerLaborHourCents)}</span></div>}
      </div>

      <div style={section}>
        <div style={h2}>Most Popular Items</div>
        {overview.leaderboard.slice(0, 10).map((item, i) => (
          <div key={item.name} style={row}><span>{i + 1}. {item.name}</span><span>{item.qty} · {fmt(item.revenue)}</span></div>
        ))}
      </div>

      <div style={section}>
        <div style={h2}>Category Mix</div>
        {overview.categoryMix.slice(0, 8).map(c => (
          <div key={c.category} style={row}><span>{c.category}</span><span>{fmt(c.revenue)}</span></div>
        ))}
      </div>

      <div style={section}>
        <div style={h2}>Revenue by Day of Week</div>
        {overview.dayOfWeekRevenue.map(d => (
          <div key={d.dow} style={row}><span>{DOW_LABELS[d.dow]}</span><span>{fmt(d.revenue)}</span></div>
        ))}
      </div>

      <div style={section}>
        <div style={h2}>Weather Impact (Mooloolaba)</div>
        {weather ? (
          <>
            <div style={row}><span>Rainy days (&gt;1mm) · {weather.rainyCount}</span><span>{fmt(weather.rainyAvg)} avg</span></div>
            <div style={row}><span>Dry days · {weather.dryCount}</span><span>{fmt(weather.dryAvg)} avg</span></div>
          </>
        ) : <div style={{ fontSize: 11, color: '#777' }}>Not enough days in this range to compare.</div>}
      </div>

      <div style={section}>
        <div style={h2}>Staff Shift Analysis (diagnostic — not proof of individual performance)</div>
        {shiftRows.length > 0 ? shiftRows.map(r => (
          <div key={r.name} style={row}><span>{r.name} · {r.days}d, {r.hours}h</span><span>{r.diffPct >= 0 ? '+' : ''}{r.diffPct}%</span></div>
        )) : <div style={{ fontSize: 11, color: '#777' }}>Not enough shift data in this range yet.</div>}
      </div>

      <div style={section}>
        <div style={h2}>Holidays in This Range</div>
        {holidayRows.length > 0 ? holidayRows.map(r => {
          const diffPct = r.typicalForDow > 0 ? Math.round((r.revenue / r.typicalForDow - 1) * 100) : 0
          return <div key={r.date} style={row}><span>{new Date(r.date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} · {r.label}</span><span>{fmt(r.revenue)} ({diffPct >= 0 ? '+' : ''}{diffPct}%)</span></div>
        }) : <div style={{ fontSize: 11, color: '#777' }}>No public or school holidays fall in this range.</div>}
      </div>

      <div style={section}>
        <div style={h2}>Staff Sales (Square attribution)</div>
        {staff?.available ? staff.staff.map(s => (
          <div key={s.name} style={row}><span>{s.name}</span><span>{s.transactions} sales · {fmt(s.revenue)}</span></div>
        )) : <div style={{ fontSize: 11, color: '#777' }}>{staff?.reason ?? 'Not available for this range.'}</div>}
      </div>

      <div style={section}>
        <div style={h2}>Customers</div>
        {customers?.available ? (
          <>
            <div style={row}><span>Unique customers</span><span>{customers.uniqueCustomers}</span></div>
            <div style={row}><span>Returning (2+ visits)</span><span>{customers.returningInRange}</span></div>
            <div style={row}><span>Single visit</span><span>{customers.singleVisitInRange}</span></div>
          </>
        ) : <div style={{ fontSize: 11, color: '#777' }}>{customers?.reason ?? 'Not available for this range.'}</div>}
      </div>
    </div>,
    document.body
  )
}

// ── Weather correlation — Mooloolaba rainfall vs. daily revenue, fetched
// directly from Open-Meteo's free historical API (no key, public CORS) ──────
function WeatherImpactSection({ start, end }: { start: string; end: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ rainyAvg: number; dryAvg: number; rainyCount: number; dryCount: number; corr: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    Promise.all([
      api.squareAnalyticsDaily(start, end),
      fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=-26.6773&longitude=153.1163&start_date=${start}&end_date=${end}&daily=precipitation_sum&timezone=Australia%2FBrisbane`).then(r => r.json()),
    ]).then(([daily, weather]) => {
      if (cancelled) return
      const rainByDate = new Map<string, number>()
      const times: string[] = weather?.daily?.time ?? []
      const rains: number[] = weather?.daily?.precipitation_sum ?? []
      times.forEach((t, i) => rainByDate.set(t, rains[i] ?? 0))
      const merged = daily.days.filter(d => rainByDate.has(d.date)).map(d => ({ ...d, rain: rainByDate.get(d.date)! }))
      if (merged.length < 5) { setResult(null); return }
      const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
      const rainy = merged.filter(d => d.rain > 1)
      const dry = merged.filter(d => d.rain <= 1)
      const revs = merged.map(d => d.revenue), rainsArr = merged.map(d => d.rain)
      const mR = avg(revs), mW = avg(rainsArr)
      const cov = merged.reduce((s, d) => s + (d.revenue - mR) * (d.rain - mW), 0)
      const sR = Math.sqrt(merged.reduce((s, d) => s + (d.revenue - mR) ** 2, 0))
      const sW = Math.sqrt(merged.reduce((s, d) => s + (d.rain - mW) ** 2, 0))
      setResult({ rainyAvg: avg(rainy.map(d => d.revenue)), dryAvg: avg(dry.map(d => d.revenue)), rainyCount: rainy.length, dryCount: dry.length, corr: sR > 0 && sW > 0 ? cov / (sR * sW) : 0 })
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load weather data') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [start, end])

  return (
    <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
      <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 4 })}>Weather impact</div>
      <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginBottom: 10, lineHeight: 1.5 })}>Mooloolaba rainfall vs. daily revenue for this range.</div>
      {loading && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>Loading weather…</div>}
      {error && <div style={mono({ fontSize: 10, color: 'rgba(180,60,40,0.7)' })}>{error}</div>}
      {!loading && !error && !result && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>Not enough days in this range to compare.</div>}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#000' }}>Rainy days (&gt;1mm) · {result.rainyCount}</span>
            <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.45)' })}>{formatMoney(result.rainyAvg)} avg</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#000' }}>Dry days · {result.dryCount}</span>
            <span style={mono({ fontSize: 10.5, color: 'rgba(0,0,0,0.45)' })}>{formatMoney(result.dryAvg)} avg</span>
          </div>
          <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>
            Correlation: {result.corr.toFixed(2)}{result.dryAvg > 0 ? ` · rain days run ${Math.abs(Math.round((1 - result.rainyAvg / result.dryAvg) * 100))}% ${result.rainyAvg < result.dryAvg ? 'lower' : 'higher'}` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Staff/shift day-of-week-adjusted view — diagnostic only. This is
// presence correlation, not proof of individual performance: rosters put
// more people on days that are expected to be busy, so read the caveat
// in the UI before drawing conclusions from these numbers. ─────────────────
function StaffShiftSection({ start, end }: { start: string; end: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<{ name: string; days: number; hours: number; diffPct: number }[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    Promise.all([api.squareAnalyticsDaily(start, end), api.squareAnalyticsShifts(start, end)]).then(([daily, shiftsRes]) => {
      if (cancelled) return
      const dowRevs: number[][] = Array.from({ length: 7 }, () => [])
      for (const d of daily.days) { const dow = new Date(d.date + 'T00:00:00').getDay(); dowRevs[dow].push(d.revenue) }
      const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
      const dowAvg = dowRevs.map(avg)
      const indexByDate = new Map(daily.days.map(d => { const dow = new Date(d.date + 'T00:00:00').getDay(); return [d.date, dowAvg[dow] > 0 ? d.revenue / dowAvg[dow] : 1] as [string, number] }))
      const byPerson = new Map<string, { dates: Set<string>; hours: number }>()
      for (const s of shiftsRes.shifts) {
        if (!s.hours || s.hours <= 0.25) continue
        const rec = byPerson.get(s.name) ?? { dates: new Set<string>(), hours: 0 }
        rec.dates.add(s.date); rec.hours += s.hours
        byPerson.set(s.name, rec)
      }
      const allDates = new Set(daily.days.map(d => d.date))
      const out = [...byPerson.entries()].map(([name, rec]) => {
        const onIdx = [...rec.dates].filter(d => indexByDate.has(d)).map(d => indexByDate.get(d)!)
        const offIdx = [...allDates].filter(d => !rec.dates.has(d) && indexByDate.has(d)).map(d => indexByDate.get(d)!)
        const onAvg = avg(onIdx), offAvg = avg(offIdx)
        return { name, days: rec.dates.size, hours: Math.round(rec.hours * 10) / 10, diffPct: offAvg > 0 ? Math.round((onAvg / offAvg - 1) * 1000) / 10 : 0 }
      }).filter(r => r.days > 0).sort((a, b) => b.diffPct - a.diffPct)
      setRows(out)
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load shift data') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [start, end])

  return (
    <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
      <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 4 })}>Staff shift analysis</div>
      <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginBottom: 10, lineHeight: 1.5 })}>
        Day-of-week-adjusted % vs. days off. This is presence correlation, not proof of performance — rosters put more people on days expected to be busy.
      </div>
      {loading && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>Loading…</div>}
      {error && <div style={mono({ fontSize: 10, color: 'rgba(180,60,40,0.7)' })}>{error}</div>}
      {!loading && !error && rows.length === 0 && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>Not enough shift data in this range yet.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => (
          <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#000' }}>{r.name} · {r.days}d, {r.hours}h</span>
            <span style={mono({ fontSize: 10.5, color: r.diffPct >= 0 ? 'rgba(0,0,0,0.45)' : 'rgba(180,60,40,0.6)' })}>{r.diffPct >= 0 ? '+' : ''}{r.diffPct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Item trend over time — weekly quantity per item, to catch a favorite
// fading before it shows up in the overall total. ──────────────────────────
function TrendDecaySection({ start, end }: { start: string; end: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<api.ItemTrendSeries[]>([])
  const [weeks, setWeeks] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    api.squareAnalyticsItemTrend(start, end).then(res => {
      if (cancelled) return
      setWeeks(res.weeks)
      setData(res.series.slice(0, 6))
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load trend data') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [start, end])

  return (
    <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
      <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 4 })}>Item trend over time</div>
      <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginBottom: 10, lineHeight: 1.5 })}>Weekly quantity sold, top items by volume.</div>
      {loading && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>Loading…</div>}
      {error && <div style={mono({ fontSize: 10, color: 'rgba(180,60,40,0.7)' })}>{error}</div>}
      {!loading && !error && weeks.length < 2 && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>Need at least 2 weeks of history to show a trend.</div>}
      {!loading && !error && weeks.length >= 2 && data.map(item => {
        const half = Math.ceil(item.weeks.length / 2)
        const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
        const firstAvg = avg(item.weeks.slice(0, half)), secondAvg = avg(item.weeks.slice(half))
        const changePct = firstAvg > 0 ? Math.round((secondAvg / firstAvg - 1) * 100) : 0
        const max = Math.max(...item.weeks, 1)
        return (
          <div key={item.name} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
              <span style={{ color: '#000' }}>{item.name}</span>
              <span style={mono({ fontSize: 10, color: changePct >= 0 ? 'rgba(0,0,0,0.45)' : 'rgba(180,60,40,0.6)' })}>{changePct >= 0 ? '+' : ''}{changePct}%</span>
            </div>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 24 }}>
              {item.weeks.map((w, i) => (
                <div key={i} title={`${weeks[i]}: ${w}`} style={{ flex: 1, height: `${Math.max(4, w / max * 24)}px`, background: 'rgba(0,0,0,0.7)', borderRadius: 1 }} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Holiday-day flagging — cross-references the daily revenue series
// against the public/school holiday calendars already stored for the
// forecast engine, so the effect is visible here too. ──────────────────────
function HolidayFlagSection({ start, end }: { start: string; end: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<{ date: string; label: string; revenue: number; typicalForDow: number }[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    Promise.all([api.squareAnalyticsDaily(start, end), api.getPublicHolidays(), api.getSchoolHolidays()]).then(([daily, publicHolidays, schoolHolidays]) => {
      if (cancelled) return
      const dowRevs: number[][] = Array.from({ length: 7 }, () => [])
      for (const d of daily.days) { const dow = new Date(d.date + 'T00:00:00').getDay(); dowRevs[dow].push(d.revenue) }
      const dowAvg = dowRevs.map(arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0)
      const out: { date: string; label: string; revenue: number; typicalForDow: number }[] = []
      for (const d of daily.days) {
        const holiday = publicHolidays.find(h => h.holiday_date === d.date)
        const schoolHol = schoolHolidays.find(h => d.date >= h.start_date && d.date <= h.end_date)
        if (!holiday && !schoolHol) continue
        const dow = new Date(d.date + 'T00:00:00').getDay()
        out.push({ date: d.date, label: holiday ? holiday.name : (schoolHol!.term_name || 'School Holidays'), revenue: d.revenue, typicalForDow: dowAvg[dow] })
      }
      setRows(out)
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load holiday data') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [start, end])

  return (
    <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
      <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 4 })}>Holidays in this range</div>
      <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.35)', marginBottom: 10, lineHeight: 1.5 })}>Actual revenue vs. what's typical for that day of week.</div>
      {loading && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>Loading…</div>}
      {error && <div style={mono({ fontSize: 10, color: 'rgba(180,60,40,0.7)' })}>{error}</div>}
      {!loading && !error && rows.length === 0 && <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)' })}>No public or school holidays fall in this range.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => {
          const diffPct = r.typicalForDow > 0 ? Math.round((r.revenue / r.typicalForDow - 1) * 100) : 0
          return (
            <div key={r.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#000' }}>{new Date(r.date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} · {r.label}</span>
              <span style={mono({ fontSize: 10.5, color: diffPct >= 0 ? 'rgba(0,0,0,0.45)' : 'rgba(180,60,40,0.6)' })}>{formatMoney(r.revenue)} ({diffPct >= 0 ? '+' : ''}{diffPct}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ManagerLocationSection({ sessionPin }: { sessionPin: string | null }) {
  const [settings, setSettings] = useState<api.GeofenceSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (IS_DRAFT_MODE) { setSettings({ enabled: false, lat: -27.47, lng: 153.02, radiusMeters: 200, updatedAt: null }); setLoading(false); return }
    if (!sessionPin) { setLoading(false); return }
    api.managerGeofence(sessionPin).then(setSettings).catch(e => setMessage(e.message)).finally(() => setLoading(false))
  }, [sessionPin])

  async function save(enabled: boolean, location?: { lat: number; lng: number }) {
    if (!sessionPin || saving) return
    if (IS_DRAFT_MODE) {
      if (enabled && settings?.lat == null && !location) { setMessage('Set the store centre before turning this on.'); return }
      setSettings(v => v ? { ...v, enabled, lat: location?.lat ?? v.lat, lng: location?.lng ?? v.lng } : v)
      setMessage('Sample preview only. No live setting was changed.'); return
    }
    setSaving(true); setMessage(null)
    try {
      const updated = await api.saveManagerGeofence(sessionPin, enabled, location)
      setSettings(updated)
      setMessage(enabled ? 'Clock-in location check is on.' : 'Clock-in location check is off.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save location settings.') }
    finally { setSaving(false) }
  }

  async function useCurrentLocation() {
    setSaving(true); setMessage(null)
    try {
      const pos = await api.getGeoPosition(12000)
      if (!pos || pos.accuracy > 50) throw new Error('Location is not accurate enough. Move near the centre of the store and try again.')
      if (!sessionPin) throw new Error('Manager access is required.')
      if (IS_DRAFT_MODE) { setSettings(v => v ? { ...v, lat: pos.lat, lng: pos.lng } : v); setMessage('Sample preview only. No live setting was changed.'); return }
      const updated = await api.saveManagerGeofence(sessionPin, settings?.enabled ?? false, { lat: pos.lat, lng: pos.lng })
      setSettings(updated)
      setMessage('Store centre updated from this device.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not set store location.') }
    finally { setSaving(false) }
  }

  return <div style={{ width: '100%', boxSizing: 'border-box', padding: 24, borderRadius: 24, background: 'rgba(255,255,255,0.48)', border: '1px solid rgba(255,255,255,0.7)' }}>
    <div style={{ fontSize: 21, fontWeight: 600, marginBottom: 8 }}>Clock-in location</div>
    <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(0,0,0,0.58)', marginBottom: 20 }}>
      When on, staff must verify their device is within 200 m of the store to clock in. If location is unavailable, they need a manager override. Managers can still clock in from elsewhere.
    </div>
    {loading ? <div>Loading…</div> : !sessionPin ? <div>Manager session required. Lock and sign in again.</div> : settings && <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 0', borderTop: '1px solid rgba(0,0,0,0.1)', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
        <div><div style={{ fontWeight: 600 }}>Require location for clock-in</div><div style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)' }}>{settings.enabled ? 'On' : 'Off'} · 200 m radius</div></div>
        <button type="button" role="switch" aria-checked={settings.enabled} disabled={saving} onClick={() => save(!settings.enabled)} style={{ padding: '10px 18px', borderRadius: 99, border: 0, background: settings.enabled ? '#000' : '#d1d1d1', color: settings.enabled ? '#fff' : '#000', cursor: 'pointer' }}>{settings.enabled ? 'On' : 'Off'}</button>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.54)', marginTop: 20, marginBottom: 12 }}>{settings.lat != null && settings.lng != null ? 'Store centre is saved.' : 'Set the store centre before turning this on.'}</div>
      <button type="button" disabled={saving} onClick={useCurrentLocation} style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.15)', background: 'rgba(255,255,255,0.65)', cursor: 'pointer' }}>Set store centre from this device</button>
      <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 8 }}>Use this while standing near the centre of the store. Your browser will ask for location access.</div>
    </>}
    {message && <div role="status" style={{ fontSize: 12, marginTop: 14, color: 'rgba(0,0,0,0.7)' }}>{message}</div>}
  </div>
}

function brisbaneInput(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const part = (name: string) => parts.find(p => p.type === name)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

function ManagerClockoutReviewsSection({ sessionPin, managerTeamId }: { sessionPin: string | null; managerTeamId: number | null }) {
  const [reviews, setReviews] = useState<api.ClockoutReview[]>([])
  const [view, setView] = useState<'pending' | 'history'>('pending')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [actual, setActual] = useState<Record<number, string>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pushReady, setPushReady] = useState(false)
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

  async function load() {
    if (IS_DRAFT_MODE) {
      const end = new Date(Date.now() - 60 * 60 * 1000)
      setReviews(view === 'history' ? [
        { id: 3, team_id: 2, staffName: 'Sample Staff', scheduled_start_at: new Date(end.getTime() - 5 * 60 * 60 * 1000).toISOString(), scheduled_end_at: end.toISOString(), auto_end_at: new Date().toISOString(), actual_end_at: end.toISOString(), status: 'adjusted', created_at: new Date().toISOString(), reviewed_at: new Date().toISOString(), review_note: 'Verified finish from the closing log.' },
      ] : [
        { id: 1, team_id: 2, staffName: 'Sample Staff', scheduled_start_at: new Date(end.getTime() - 5 * 60 * 60 * 1000).toISOString(), scheduled_end_at: end.toISOString(), auto_end_at: new Date().toISOString(), status: 'pending', created_at: new Date().toISOString(), review_note: null },
        { id: 2, team_id: 3, staffName: 'Sample Staff B', scheduled_start_at: new Date(end.getTime() - 7 * 60 * 60 * 1000).toISOString(), scheduled_end_at: end.toISOString(), auto_end_at: new Date().toISOString(), status: 'failed', created_at: new Date().toISOString(), review_note: null },
      ])
      setLoading(false); return
    }
    if (!sessionPin) { setLoading(false); return }
    setLoading(true)
    try { setReviews((await api.managerClockoutReviews(sessionPin, view)).reviews); setMessage(null) }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not load clock-out reviews.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [sessionPin, view])

  async function enableManagerPush() {
    if (!sessionPin || !managerTeamId) return
    if (IS_DRAFT_MODE) { setMessage('Phone notifications are disabled in this sample preview.'); return }
    try {
      const enabled = await api.enablePushForTeam(managerTeamId, sessionPin)
      setPushReady(enabled)
      setMessage(enabled ? 'Manager phone alerts are enabled on this device.' : 'Notifications were not enabled on this device.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not enable manager alerts.') }
  }

  async function decide(r: api.ClockoutReview, decision: 'approve' | 'adjust' | 'resolve') {
    if (!sessionPin) return
    const value = actual[r.id]
    if (decision === 'adjust' && (!value || !reasons[r.id]?.trim())) {
      setMessage('Enter the verified actual finish time and a reason before adjusting Square.')
      return
    }
    if (decision === 'resolve' && !reasons[r.id]?.trim()) { setMessage('Enter how the Square timecard was resolved.'); return }
    setBusyId(r.id); setMessage(null)
    try {
      if (IS_DRAFT_MODE) { setReviews(v => v.filter(item => item.id !== r.id)); setMessage('Sample preview only. No Square timesheet was changed.'); return }
      await api.decideClockoutReview(sessionPin, r.id, decision, decision === 'adjust' ? `${value}:00+10:00` : undefined, reasons[r.id])
      await load()
      setMessage(decision === 'approve' ? `${r.staffName}'s automatic finish was approved.` : decision === 'adjust' ? `${r.staffName}'s actual finish was saved to Square.` : `${r.staffName}'s Square timecard was marked resolved.`)
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save the review.') }
    finally { setBusyId(null) }
  }

  return <div style={{ width: '100%', minWidth: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}><div><div style={{ fontSize: 21, fontWeight: 600 }}>Clock-out reviews</div><div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>Private manager review of automatic clock-outs.</div></div><button type="button" onClick={load} style={{ padding: '9px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.12)', cursor: 'pointer' }}>Refresh</button></div>
    {!pushReady && <button type="button" onClick={enableManagerPush} style={{ padding: '9px 14px', marginBottom: 18, borderRadius: 99, border: '1px solid rgba(0,0,0,0.14)', background: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 12 }}>Enable phone manager alerts</button>}
    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}><button type="button" onClick={() => setView('pending')} style={{ padding: '8px 12px', borderRadius: 9, border: 0, background: view === 'pending' ? '#000' : 'rgba(255,255,255,0.6)', color: view === 'pending' ? '#fff' : '#000', cursor: 'pointer' }}>Needs review</button><button type="button" onClick={() => setView('history')} style={{ padding: '8px 12px', borderRadius: 9, border: 0, background: view === 'history' ? '#000' : 'rgba(255,255,255,0.6)', color: view === 'history' ? '#fff' : '#000', cursor: 'pointer' }}>History</button></div>
    {loading ? <div>Loading…</div> : !sessionPin ? <div>Manager session required. Lock and sign in again.</div> : reviews.length === 0 ? <div style={{ padding: 24, borderRadius: 20, background: 'rgba(255,255,255,0.5)' }}>{view === 'history' ? 'No completed reviews yet.' : 'No clock-outs need review.'}</div> : reviews.map(r => <div key={r.id} style={{ padding: 20, marginBottom: 12, borderRadius: 20, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{r.staffName}</div>
      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 4 }}>Rostered finish {fmt(r.scheduled_end_at)} · Automatic clock-out {fmt(r.auto_end_at)}</div>
      {view === 'history' ? <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.6 }}><strong>{r.status === 'approved' ? 'Approved' : r.status === 'adjusted' ? 'Adjusted' : 'Resolved'}</strong>{r.actual_end_at && <> · Actual finish {fmt(r.actual_end_at)}</>}{r.review_note && <div style={{ color: 'rgba(0,0,0,0.56)' }}>{r.review_note}</div>}</div> : r.status === 'failed' ? <div style={{ fontSize: 12, color: '#a33', marginTop: 14 }}>Square needs a manual check for this timecard. Correct it in Square first, then record how it was resolved here.<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}><input aria-label="Manual resolution note" placeholder="How was this resolved in Square?" value={reasons[r.id] ?? ''} onChange={e => setReasons(v => ({ ...v, [r.id]: e.target.value }))} style={{ minWidth: 220, flex: 1, padding: 10, borderRadius: 10, border: '1px solid rgba(0,0,0,0.18)' }} /><button type="button" disabled={busyId === r.id} onClick={() => decide(r, 'resolve')} style={{ padding: '10px 14px', borderRadius: 10, border: 0, background: '#000', color: '#fff', cursor: 'pointer' }}>Mark resolved</button></div></div> : <>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}><button type="button" disabled={busyId === r.id} onClick={() => decide(r, 'approve')} style={{ padding: '10px 14px', border: 0, borderRadius: 10, background: '#000', color: '#fff', cursor: 'pointer' }}>Approve automatic finish</button></div>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.1)' }}><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Or enter the verified actual finish</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input aria-label={`${r.staffName} actual finish time`} type="datetime-local" min={brisbaneInput(r.scheduled_start_at)} max={brisbaneInput(new Date().toISOString())} value={actual[r.id] ?? ''} onChange={e => setActual(v => ({ ...v, [r.id]: e.target.value }))} style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(0,0,0,0.18)' }} /><input aria-label="Reason for correction" placeholder="Reason for correction" value={reasons[r.id] ?? ''} onChange={e => setReasons(v => ({ ...v, [r.id]: e.target.value }))} style={{ minWidth: 220, flex: 1, padding: 10, borderRadius: 10, border: '1px solid rgba(0,0,0,0.18)' }} /><button type="button" disabled={busyId === r.id} onClick={() => decide(r, 'adjust')} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.18)', background: '#fff', cursor: 'pointer' }}>Adjust timesheet</button></div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.46)', marginTop: 8 }}>Only correct the record to the time the person actually stopped working.</div>
        </div>
      </>}
    </div>)}
    {message && <div role="status" style={{ fontSize: 12, marginTop: 12 }}>{message}</div>}
  </div>
}

function AlertsSection({ sessionPin }: { sessionPin: string | null }) {
  const [pin, setPin] = useState('')
  const [managerPin, setManagerPin] = useState<string | null>(sessionPin)
  const [pinError, setPinError] = useState(false)
  const [checkingPin, setCheckingPin] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [subscribedManagers, setSubscribedManagers] = useState<number | null>(null)
  const [totalManagers, setTotalManagers] = useState<number | null>(null)
  const [sendingPush, setSendingPush] = useState(false)
  const [pushResult, setPushResult] = useState<string | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [reminderResult, setReminderResult] = useState<string | null>(null)
  const [reminderError, setReminderError] = useState<string | null>(null)

  async function load(pinValue: string) {
    setCheckingPin(true)
    try {
      const res = await api.managerStocktakeAlertStatus(pinValue)
      setSubscribedManagers(res.subscribedManagers)
      setTotalManagers(res.totalManagers)
      setManagerPin(pinValue)
      setPinError(false)
    } catch {
      setPinError(true)
      setPin('')
      setManagerPin(null)
    } finally {
      setCheckingPin(false)
    }
  }

  async function handlePin(k: string) {
    if (checkingPin) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(false); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) await load(next)
  }

  useEffect(() => { if (sessionPin) load(sessionPin) }, [])

  async function sendTestPush() {
    if (!managerPin) return
    setSendingPush(true); setPushResult(null); setPushError(null)
    try {
      const res = await api.managerStocktakeAlertTestSend(managerPin)
      setPushResult(res.sent > 0
        ? `Sent to ${res.sent} device${res.sent === 1 ? '' : 's'} — ${res.outCount} out of stock, ${res.lowCount} low stock.`
        : `Nothing sent — no manager has push notifications enabled yet. Open the app on your phone and allow notifications first.`)
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSendingPush(false)
    }
  }
  async function sendTestReminder() {
    if (!managerPin) return
    setSendingReminder(true); setReminderError(null); setReminderResult(null)
    try {
      const res = await api.managerStocktakeReminderTestSend(managerPin)
      setReminderResult(res.targeted > 0
        ? `Pushed to ${res.pushed} of ${res.targeted} device${res.targeted === 1 ? '' : 's'} for clocked-in staff + the manager. Also posted to everyone's notification bell.`
        : `No one is currently clocked in — nothing to push. Also posted to everyone's notification bell.`)
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSendingReminder(false)
    }
  }

  if (!managerPin) {
    return (
      <div style={{ ...glass, borderRadius: 20, padding: '36px 28px', maxWidth: 340, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: 46, height: 46, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 4 }}>Stocktake Alerts</div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 28 })}>Re-enter your manager PIN</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                disabled={k === '' || checkingPin}
                onPointerDown={() => { if (k && !checkingPin) { setPressedKey(k); hapticTap() } }}
                onPointerUp={() => setPressedKey(null)}
                onPointerLeave={() => setPressedKey(null)}
                onPointerCancel={() => setPressedKey(null)}
                onClick={() => k && handlePin(k)}
                style={{ width: 58, height: 58, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.7)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.5)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 16 : 19, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checkingPin ? 0.5 : 1 }}
              >{k}</button>
            </div>
          ))}
        </div>
        {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginTop: 4 })}>Incorrect PIN — try again</div>}
        {checkingPin && !pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>Checking…</div>}
      </div>
    )
  }

  const subscribed = (subscribedManagers ?? 0) > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 4 })}>Nightly Stocktake Alert — Push Notification</div>
        <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', lineHeight: 1.6 })}>
          Every night at 11:30pm, a summary of low-stock and out-of-stock items is pushed to every manager's phone through the app's own notifications. Free, no external account, same "low"/"out" definitions shown on the Overview stock gauge.
        </div>
      </div>

      <div style={{ ...glass, borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: subscribed ? '#1a9e4f' : 'rgba(0,0,0,0.25)', display: 'inline-block', flexShrink: 0 }} />
          <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>
            {subscribedManagers ?? 0} of {totalManagers ?? 0} manager{totalManagers === 1 ? '' : 's'} subscribed
          </div>
        </div>
        <button onClick={sendTestPush} disabled={sendingPush} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: BRAND_PURPLE, color: '#fff' }}>
          {sendingPush ? 'Sending…' : 'Send test now'}
        </button>
      </div>

      {!subscribed && (
        <div style={{ ...glassSubtle, borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'rgba(0,0,0,0.55)', lineHeight: 1.6 }}>
          No manager has push notifications enabled yet — sign back into the app on your phone and allow notifications when the browser prompts you. It subscribes automatically on the next sign-in.
        </div>
      )}
      {pushResult && <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.5)' })}>{pushResult}</div>}
      {pushError && <div style={mono({ fontSize: 11, color: 'rgba(180,40,40,0.75)' })}>{pushError}</div>}

      <div style={{ height: 1, background: 'rgba(0,0,0,0.08)' }} />

      <div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 4 })}>Nightly Stocktake Reminder — Push Notification</div>
        <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.35)', lineHeight: 1.6 })}>
          Every night at 9:00pm, a push notification to finish stocktake, the money count, and the closing checklist goes to whoever is currently clocked in, plus the manager — reaches their device even if the app isn't open. Also still posted to the in-app notification bell for anyone else signed in.
        </div>
      </div>

      <div style={{ ...glass, borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#000' }}>Pushes to clocked-in staff + manager</div>
        <button onClick={sendTestReminder} disabled={sendingReminder} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: BRAND_PURPLE, color: '#fff' }}>
          {sendingReminder ? 'Sending…' : 'Send now'}
        </button>
      </div>
      {reminderResult && <div style={mono({ fontSize: 11, color: 'rgba(0,0,0,0.5)' })}>{reminderResult}</div>}
      {reminderError && <div style={mono({ fontSize: 11, color: 'rgba(180,40,40,0.75)' })}>{reminderError}</div>}
    </div>
  )
}

// ── Manager nav shell: sidebar (desktop) + floating bar (mobile) ───────────
function ManagerSidebar({ group, sub, onNavigate }: { group: ManagerGroup; sub: string | null; onNavigate: (group: ManagerGroup, sub?: string) => void }) {
  const [expanded, setExpanded] = useState<ManagerGroup>(group)
  useEffect(() => { setExpanded(group) }, [group])
  return (
    <div style={{ ...glassSubtle, borderRadius: 14, padding: 10, width: 178, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
      {MANAGER_NAV.map(g => {
        const active = group === g.key
        const isExpanded = expanded === g.key && !!g.sub
        return (
          <div key={g.key}>
            <button onClick={() => { if (g.sub) { setExpanded(isExpanded ? (null as unknown as ManagerGroup) : g.key); onNavigate(g.key, sub && group === g.key ? sub : g.sub?.[0]?.key) } else onNavigate(g.key) }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer', background: active ? (g.sub ? 'rgba(0,0,0,0.06)' : '#000') : 'transparent', color: active ? (g.sub ? '#000' : '#fff') : 'rgba(0,0,0,0.6)' }}>
              {navIcon(g.key)}
              <span style={mono({ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', flex: 1 })}>{g.label}</span>
              {g.sub && <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.3)', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▾</span>}
            </button>
            {g.sub && isExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2, marginBottom: 4 }}>
                {g.sub.map(s => {
                  const subActive = active && sub === s.key
                  return (
                    <button key={s.key} onClick={() => onNavigate(g.key, s.key)}
                      style={{ textAlign: 'left', padding: '7px 10px 7px 32px', borderRadius: 8, border: 'none', cursor: 'pointer', background: subActive ? '#000' : 'transparent', color: subActive ? '#fff' : 'rgba(0,0,0,0.5)', ...mono({ fontSize: 9.5, letterSpacing: '0.04em' }) }}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ManagerMobileBar({ group, sub, onNavigate }: { group: ManagerGroup; sub: string | null; onNavigate: (group: ManagerGroup, sub?: string) => void }) {
  const activeGroup = MANAGER_NAV.find(item => item.key === group)
  return (
    <div className="manager-mobile-bar" style={{ ...glassSubtle, borderRadius: 16, padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {activeGroup?.sub && (
        <div aria-label={`${activeGroup.label} pages`} style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 1, scrollbarWidth: 'none' }}>
          {activeGroup.sub.map(item => {
            const active = sub === item.key
            return (
              <button key={item.key} onClick={() => onNavigate(group, item.key)} aria-current={active ? 'page' : undefined}
                style={{ minHeight: 40, flex: '1 0 auto', padding: '8px 14px', borderRadius: 10, border: active ? '1px solid rgba(0,0,0,0.12)' : '1px solid transparent', cursor: 'pointer', background: active ? '#000' : 'rgba(255,255,255,0.38)', color: active ? '#fff' : 'rgba(0,0,0,0.68)', ...mono({ fontSize: 9.5, letterSpacing: '0.04em' }) }}>
                {item.label}
              </button>
            )
          })}
        </div>
      )}
      <div aria-label="Manager sections" style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {MANAGER_NAV.map(g => {
          const active = group === g.key
          return (
            <button key={g.key} onClick={() => onNavigate(g.key, active ? undefined : g.sub?.[0]?.key)} aria-current={active ? 'page' : undefined}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, flex: '1 0 auto', minWidth: 58, minHeight: 48, padding: '6px', borderRadius: 10, border: 'none', cursor: 'pointer', background: active ? '#000' : 'transparent', color: active ? '#fff' : 'rgba(0,0,0,0.5)' }}>
              {navIcon(g.key, 16)}
              <span style={mono({ fontSize: 8, letterSpacing: '0.05em', textTransform: 'uppercase' })}>{g.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Manager tab: root shell ─────────────────────────────────────────────────
function ManagerView({
  team, onAddTeamMember, onDeleteTeamMember, onUpdateTeamMember,
  categories, onAddCategory, onRenameCategory, onDeleteCategory, onReorderCategories,
  roles, onAddRole, onRenameRole, onDeleteRole,
  authed, sessionPin, onAuthed, onLock,
  onSyncSquare, squareSyncing, squareSyncMessage,
  onSetPin,
  meId, stats, items, onGoToStock, roster, loadingRoster, onLoadRoster,
}: {
  team: TeamMember[]
  onAddTeamMember: (m: Omit<TeamMember, 'id'>) => void
  onDeleteTeamMember: (id: number) => void
  onUpdateTeamMember: (id: number, patch: Partial<TeamMember>) => void
  categories: string[]; onAddCategory: (v: string) => void; onRenameCategory: (o: string, n: string) => void; onDeleteCategory: (v: string) => void; onReorderCategories: (newOrder: string[]) => void
  roles: string[]; onAddRole: (v: string) => void; onRenameRole: (o: string, n: string) => void; onDeleteRole: (v: string) => void
  authed: boolean; sessionPin: string | null; onAuthed: (pin: string) => void; onLock: () => void
  onSyncSquare: () => void; squareSyncing: boolean; squareSyncMessage: string | null
  onSetPin: (id: number, pin: string) => Promise<void>
  meId: number | null
  stats: { total: number; ok: number; low: number; out: number }
  items: Item[]
  onGoToStock: () => void
  roster: RosterShift[]; loadingRoster: boolean; onLoadRoster: () => void
}) {
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [group, setGroup] = useState<ManagerGroup>(IS_DRAFT_MODE ? 'staff' : 'overview')
  const [financeSub, setFinanceSub] = useState<FinanceSub>('sales')
  const [staffSub, setStaffSub] = useState<StaffSub>(IS_DRAFT_MODE ? 'clockouts' : 'directory')
  const [growthSub, setGrowthSub] = useState<GrowthSub>('reviews')
  const [settingsSub, setSettingsSub] = useState<SettingsSub>('categories')

  function currentSub(): string | null {
    if (group === 'finance') return financeSub
    if (group === 'staff') return staffSub
    if (group === 'growth') return growthSub
    if (group === 'settings') return settingsSub
    return null
  }
  function navigate(g: ManagerGroup, sub?: string) {
    setGroup(g)
    if (sub) {
      if (g === 'finance') setFinanceSub(sub as FinanceSub)
      else if (g === 'staff') setStaffSub(sub as StaffSub)
      else if (g === 'growth') setGrowthSub(sub as GrowthSub)
      else if (g === 'settings') setSettingsSub(sub as SettingsSub)
    }
  }

  async function handlePin(k: string) {
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(false); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      try {
        // Reached via the generic "Manager Access" shortcut (not this
        // person's own profile), so this re-check is identity-scoped to
        // whoever is actually signed in — not just any manager's PIN.
        const res = meId != null ? await api.squarePinVerify(meId, next) : await api.squareVerifyManagerPin(next)
        if (res.ok) { onAuthed(next); setPin(''); setPinError(false) }
        else { setPinError(true); setPin('') }
      } catch {
        setPinError(true); setPin('')
      }
    }
  }

  // ── PIN screen ──
  if (!authed || !sessionPin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
        <div style={{ background: 'rgba(255,255,255,0.28)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', border: '1px solid rgba(255,255,255,0.55)', boxShadow: '0 8px 48px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)', borderRadius: 28, padding: '40px 36px', width: '100%', maxWidth: 360, textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 6 }}>Manager Access</div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 32 })}>Enter PIN to continue</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 28 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  disabled={k === ''}
                  onPointerDown={() => { if (k) { setPressedKey(k); hapticTap() } }}
                  onPointerUp={() => setPressedKey(null)}
                  onPointerLeave={() => setPressedKey(null)}
                  onPointerCancel={() => setPressedKey(null)}
                  onClick={() => k && handlePin(k)}
                  style={{ width: 62, height: 62, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.6)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.22)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 17 : 20, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >{k}</button>
              </div>
            ))}
          </div>
          {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginTop: 4 })}>Incorrect PIN — try again</div>}
        </div>
      </div>
    )
  }

  // ── Dashboard ──
  function renderContent() {
    if (group === 'overview') return <ManagerOverviewDashboard team={team} stats={stats} items={items} onNavigate={navigate} onGoToStock={onGoToStock} onSyncSquare={onSyncSquare} squareSyncing={squareSyncing} />
    if (group === 'finance') {
      if (financeSub === 'sales') return <FinancialsSection />
      if (financeSub === 'forecast') return <ForecastSection items={items} />
      if (financeSub === 'expenses') return <ExpensesSection meId={meId} />
      if (financeSub === 'wages') return <HoursWagesSection />
      if (financeSub === 'setup') return <PayrollSetupSection sessionPin={sessionPin} />
    }
    if (group === 'staff') {
      if (staffSub === 'directory') return <StaffDirectorySection team={team} onAddTeamMember={onAddTeamMember} onDeleteTeamMember={onDeleteTeamMember} onUpdateTeamMember={onUpdateTeamMember} roles={roles} onSyncSquare={onSyncSquare} squareSyncing={squareSyncing} squareSyncMessage={squareSyncMessage} onSetPin={onSetPin} />
      if (staffSub === 'roster') return <ManagerRosterEditSection team={team} sessionPin={sessionPin} />
      if (staffSub === 'swaps') return <ManagerSwapsSection meId={meId} sessionPin={sessionPin} />
      if (staffSub === 'timeoff') return <ManagerTimeOffSection meId={meId} team={team} />
      if (staffSub === 'training') return <TrainingSection me={team.find(member => member.id === meId) ?? null} isManager managerPin={sessionPin} team={team} />
      if (staffSub === 'clockouts') return <ManagerClockoutReviewsSection sessionPin={sessionPin} managerTeamId={meId} />
    }
    if (group === 'growth') {
      if (growthSub === 'reviews') return <ManagerReviewsSection team={team} sessionPin={sessionPin} />
      if (growthSub === 'analytics') return <AnalyticsSection />
    }
    if (group === 'updates') return <UpdatesSection />
    if (group === 'settings') {
      if (settingsSub === 'categories') return (
        <div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 16 })}>
            {categories.length} categories — renaming updates all items automatically. Drag, or use the arrows, to reorder.
          </div>
          <TagList items={categories} noun="category" onAdd={onAddCategory} onRename={onRenameCategory} onDelete={onDeleteCategory} reorderable onReorder={onReorderCategories} />
        </div>
      )
      if (settingsSub === 'roles') return (
        <div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 16 })}>
            {roles.length} roles — renaming updates all staff members automatically
          </div>
          <TagList items={roles} noun="role" onAdd={onAddRole} onRename={onRenameRole} onDelete={onDeleteRole} />
        </div>
      )
      if (settingsSub === 'alerts') return <AlertsSection sessionPin={sessionPin} />
      if (settingsSub === 'location') return <ManagerLocationSection sessionPin={sessionPin} />
    }
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <button onClick={onLock} title="Lock"
          style={{ width: 28, height: 28, borderRadius: 99, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.35)', flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </button>
      </div>

      <div className="manager-mobile-nav" style={{ display: 'none' }}>
        <ManagerMobileBar group={group} sub={currentSub()} onNavigate={navigate} />
      </div>

      <div className="manager-content-row" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div className="manager-sidebar-nav">
          <ManagerSidebar group={group} sub={currentSub()} onNavigate={navigate} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renderContent()}
        </div>
      </div>

      <style>{`
        @media (max-width: 699px) {
          .manager-sidebar-nav { display: none; }
          .manager-mobile-nav {
            display: block !important;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 50;
            padding: 6px max(8px, env(safe-area-inset-right, 0px)) max(6px, env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px));
            background: rgba(242, 242, 242, 0.84);
            border-top: 1px solid rgba(255, 255, 255, 0.88);
            box-shadow: 0 -10px 28px rgba(0, 0, 0, 0.12);
            backdrop-filter: blur(28px) saturate(180%);
            -webkit-backdrop-filter: blur(28px) saturate(180%);
          }
          .manager-mobile-bar {
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          .manager-content-row { padding-bottom: calc(132px + env(safe-area-inset-bottom, 0px)); }
        }
      `}</style>
    </div>
  )
}

// ── Manager PIN Overlay ───────────────────────────────────────────────────────
// Checks the PIN against whichever staff profile(s) are flagged as manager
// (there's no separate manager password) and signs the caller in as that
// person, so this always stays in sync with whatever PIN they set for
// themselves in the Staff section.
function ManagerPinOverlay({ onSuccess, onDismiss }: { onSuccess: (member: { teamId: number; name: string; role: string; avatar: string }, pin: string) => void; onDismiss: () => void }) {
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [checking, setChecking] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)

  async function handlePin(k: string) {
    if (checking) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(false); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      setChecking(true)
      try {
        const res = await api.squareVerifyManagerPin(next)
        if (res.ok) { onSuccess(res, next) }
        else { setPinError(true); setPin(''); setChecking(false) }
      } catch {
        setPinError(true); setPin(''); setChecking(false)
      }
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onDismiss() }}
      style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
    >
      <div style={{ position: 'relative', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', border: '1px solid rgba(255,255,255,0.82)', boxShadow: '0 24px 64px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.9)', borderRadius: 28, padding: '36px 32px', width: 320, textAlign: 'center' }}>
        <button onClick={onDismiss} style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 99, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div style={{ width: 46, height: 46, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 4 }}>Manager Access</div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 28 })}>Enter PIN to continue</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                disabled={k === '' || checking}
                onPointerDown={() => { if (k && !checking) { setPressedKey(k); hapticTap() } }}
                onPointerUp={() => setPressedKey(null)}
                onPointerLeave={() => setPressedKey(null)}
                onPointerCancel={() => setPressedKey(null)}
                onClick={() => k && handlePin(k)}
                style={{ width: 58, height: 58, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.7)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.5)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 16 : 19, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checking ? 0.5 : 1 }}
              >{k}</button>
            </div>
          ))}
        </div>
        {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginTop: 4 })}>Incorrect PIN — try again</div>}
        {checking && !pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>Checking…</div>}
      </div>
    </div>
  )
}

// ── Staff Login PIN Overlay — gates entry to a selected profile ─────────────
function LoginPinOverlay({ member, onSuccess, onCancel }: { member: TeamMember; onSuccess: (pin: string) => void; onCancel: () => void }) {
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [checking, setChecking] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)

  async function handlePin(k: string) {
    if (checking) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(false); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      setChecking(true)
      try {
        const res = await api.squarePinVerify(member.id, next)
        if (res.ok) { onSuccess(next) }
        else { setPinError(true); setPin(''); setChecking(false) }
      } catch (e) {
        setPinError(true); setPin(''); setChecking(false)
      }
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 450, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
    >
      <div style={{ position: 'relative', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', border: '1px solid rgba(255,255,255,0.82)', boxShadow: '0 24px 64px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.9)', borderRadius: 28, padding: '36px 32px', width: 320, textAlign: 'center' }}>
        <button onClick={onCancel} style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 99, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div style={{ width: 46, height: 46, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, color: '#fff' }}>
          {member.avatar}
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 4 }}>{member.name}</div>
        <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 28 })}>Enter your PIN</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                disabled={k === '' || checking}
                onPointerDown={() => { if (k && !checking) { setPressedKey(k); hapticTap() } }}
                onPointerUp={() => setPressedKey(null)}
                onPointerLeave={() => setPressedKey(null)}
                onPointerCancel={() => setPressedKey(null)}
                onClick={() => k && handlePin(k)}
                style={{ width: 58, height: 58, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.7)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.5)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 16 : 19, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checking ? 0.5 : 1 }}
              >{k}</button>
            </div>
          ))}
        </div>
        {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginTop: 4 })}>Incorrect PIN — try again</div>}
        {checking && !pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>Checking…</div>}
        <div style={mono({ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.2)', marginTop: 14 })}>Default PIN: 1234 — ask your manager to change it</div>
      </div>
    </div>
  )
}

function TrainingReminderOverlay({ trainings, onStart, onDismiss }: { trainings: api.Training[]; onStart: () => void; onDismiss: () => void }) {
  const now = Date.now()
  const overdue = trainings.some(training => { const dueAt = trainingDueAt(training); return dueAt ? now > new Date(dueAt).getTime() : false })
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div style={{ width: 'min(390px, 100%)', maxHeight: 'calc(100dvh - 36px)', overflowY: 'auto', background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(38px) saturate(180%)', WebkitBackdropFilter: 'blur(38px) saturate(180%)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 24px 70px rgba(0,0,0,0.16)', borderRadius: 26, padding: 26 }}>
        <div style={{ width: 44, height: 44, borderRadius: 99, display: 'grid', placeItems: 'center', background: overdue ? 'rgba(180,40,40,0.12)' : 'rgba(0,0,0,0.08)', marginBottom: 14 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={overdue ? 'rgba(180,40,40,0.85)' : '#000'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: '#000' }}>{overdue ? 'Training overdue' : 'Training to complete'}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(0,0,0,0.55)', marginTop: 6, marginBottom: 16 }}>
          {overdue ? 'Complete the overdue training before you clock in.' : 'Please complete your mandatory training before the deadline.'}
        </div>
        <div style={{ display: 'grid', gap: 7, marginBottom: 18 }}>
          {trainings.map(training => {
            const dueAt = trainingDueAt(training)
            const isOverdue = dueAt ? now > new Date(dueAt).getTime() : false
            return <div key={training.id} style={{ ...glassSubtle, borderRadius: 11, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{training.title}</span>
              <span style={mono({ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: isOverdue ? 'rgba(180,40,40,0.8)' : 'rgba(0,0,0,0.42)' })}>{isOverdue ? 'Overdue' : `Due ${trainingDeadlineLabel(training)}`}</span>
            </div>
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onStart} style={{ flex: 1, padding: '10px 16px', borderRadius: 9, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 500 }}>Start training</button>
          <button onClick={onDismiss} style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.14)', background: 'transparent', color: 'rgba(0,0,0,0.55)', cursor: 'pointer', fontSize: 12.5 }}>Later</button>
        </div>
      </div>
    </div>
  )
}

function TrainingBlockOverlay({ member, overdue, onOverride, onCancel }: { member: TeamMember; overdue: api.OverdueTraining[]; onOverride: (pin: string) => Promise<void>; onCancel: () => void }) {
  const [showOverride, setShowOverride] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)

  async function handlePin(k: string) {
    if (checking) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(null); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      setChecking(true)
      try {
        await onOverride(next)
      } catch (e) {
        setPinError(e instanceof Error ? e.message : 'Manager PIN is incorrect')
        setPin('')
        setChecking(false)
      }
    }
  }

  const dueLabel = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 450, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
    >
      <div style={{ position: 'relative', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', border: '1px solid rgba(255,255,255,0.82)', boxShadow: '0 24px 64px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.9)', borderRadius: 28, padding: '32px 28px', width: 340, textAlign: showOverride ? 'center' : 'left' }}>
        <button onClick={onCancel} style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 99, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {!showOverride ? (
          <>
            <div style={{ width: 44, height: 44, borderRadius: 99, background: 'rgba(180,40,40,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(180,40,40,0.85)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#000', marginBottom: 4 }}>Training required</div>
            <div style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.55)', lineHeight: 1.5, marginBottom: 16 }}>
              {member.name} can't clock in until this mandatory training is completed.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {overdue.map(t => (
                <div key={t.id} style={{ ...glassSubtle, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: '#000' }}>{t.title}</div>
                  <div style={mono({ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(180,40,40,0.7)', marginTop: 3 })}>Was due {dueLabel(t.dueAt)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowOverride(true)} style={{ flex: 1, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Manager override</button>
              <button onClick={onCancel} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#000', marginBottom: 4 }}>Manager override</div>
            <div style={mono({ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 22 })}>Enter manager PIN</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ width: 11, height: 11, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    disabled={k === '' || checking}
                    onPointerDown={() => { if (k && !checking) { setPressedKey(k); hapticTap() } }}
                    onPointerUp={() => setPressedKey(null)}
                    onPointerLeave={() => setPressedKey(null)}
                    onPointerCancel={() => setPressedKey(null)}
                    onClick={() => k && handlePin(k)}
                    style={{ width: 58, height: 58, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.7)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.5)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 16 : 19, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checking ? 0.5 : 1 }}
                  >{k}</button>
                </div>
              ))}
            </div>
            {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(180,40,40,0.7)', marginTop: 4 })}>{pinError}</div>}
            {checking && !pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>Checking…</div>}
            <button onClick={() => { setShowOverride(false); setPin(''); setPinError(null) }} style={{ marginTop: 16, padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 11, cursor: 'pointer' }}>Back</button>
          </>
        )}
      </div>
    </div>
  )
}

function GeofenceBlockOverlay({ member, distanceMeters, radiusMeters, onOverride, onCancel }: { member: TeamMember; distanceMeters: number | null; radiusMeters: number; onOverride: (pin: string) => Promise<void>; onCancel: () => void }) {
  const [showOverride, setShowOverride] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)

  async function handlePin(k: string) {
    if (checking) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setPinError(null); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      setChecking(true)
      try {
        await onOverride(next)
      } catch (e) {
        setPinError(e instanceof Error ? e.message : 'Manager PIN is incorrect')
        setPin('')
        setChecking(false)
      }
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 450, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
    >
      <div style={{ position: 'relative', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', border: '1px solid rgba(255,255,255,0.82)', boxShadow: '0 24px 64px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.9)', borderRadius: 28, padding: '32px 28px', width: 340, textAlign: showOverride ? 'center' : 'left' }}>
        <button onClick={onCancel} style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 99, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {!showOverride ? (
          <>
            <div style={{ width: 44, height: 44, borderRadius: 99, background: 'rgba(180,40,40,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(180,40,40,0.85)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#000', marginBottom: 4 }}>Too far from the store</div>
            <div style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.55)', lineHeight: 1.5, marginBottom: 16 }}>
              {distanceMeters != null
                ? `${member.name} is ${distanceMeters}m away — clock-in is only allowed within ${radiusMeters}m of the store.`
                : `${member.name}'s location couldn't be verified. Check that location access is turned on for this browser and try again.`}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowOverride(true)} style={{ flex: 1, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Manager override</button>
              <button onClick={onCancel} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 12, cursor: 'pointer' }}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#000', marginBottom: 4 }}>Manager override</div>
            <div style={mono({ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 22 })}>Enter manager PIN</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ width: 11, height: 11, borderRadius: 99, border: '1.5px solid rgba(0,0,0,0.25)', background: pin.length > i ? '#000' : 'transparent', transition: 'background 0.15s' }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    disabled={k === '' || checking}
                    onPointerDown={() => { if (k && !checking) { setPressedKey(k); hapticTap() } }}
                    onPointerUp={() => setPressedKey(null)}
                    onPointerLeave={() => setPressedKey(null)}
                    onPointerCancel={() => setPressedKey(null)}
                    onClick={() => k && handlePin(k)}
                    style={{ width: 58, height: 58, borderRadius: 99, border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.7)', background: k === '' ? 'transparent' : pressedKey === k ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.5)', backdropFilter: k === '' ? 'none' : 'blur(12px)', WebkitBackdropFilter: k === '' ? 'none' : 'blur(12px)', boxShadow: k === '' ? 'none' : pressedKey === k ? 'inset 0 2px 6px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', color: pressedKey === k ? '#fff' : '#000', fontSize: k === '⌫' ? 16 : 19, fontWeight: 400, cursor: k === '' ? 'default' : 'pointer', transform: pressedKey === k ? 'scale(0.88)' : 'scale(1)', transition: 'transform 0.08s ease, background 0.08s ease, color 0.08s ease, box-shadow 0.08s ease', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checking ? 0.5 : 1 }}
                  >{k}</button>
                </div>
              ))}
            </div>
            {pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(180,40,40,0.7)', marginTop: 4 })}>{pinError}</div>}
            {checking && !pinError && <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', marginTop: 4 })}>Checking…</div>}
            <button onClick={() => { setShowOverride(false); setPin(''); setPinError(null) }} style={{ marginTop: 16, padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', color: 'rgba(0,0,0,0.5)', fontSize: 11, cursor: 'pointer' }}>Back</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── User Select Screen ────────────────────────────────────────────────────────
function UserSelectScreen({ team, onSelect, onManager, onFaceId, faceIdBusy, faceIdError, leaving }: { team: TeamMember[]; onSelect: (member: TeamMember) => void; onManager: () => void; onFaceId?: () => void; faceIdBusy?: boolean; faceIdError?: string | null; leaving?: boolean }) {
  const [coinIdx, setCoinIdx] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'hiding' | 'showing'>('idle')
  const [faceIdSupported, setFaceIdSupported] = useState(false)

  useEffect(() => {
    (async () => {
      if (!browserSupportsWebAuthn()) return
      try { setFaceIdSupported(await platformAuthenticatorIsAvailable()) } catch { setFaceIdSupported(false) }
    })()
  }, [])

  useEffect(() => {
    if (team.length < 2) return
    const id = setInterval(() => setPhase('hiding'), 2200)
    return () => clearInterval(id)
  }, [team.length])

  function onTransitionEnd() {
    if (phase === 'hiding') {
      setCoinIdx(i => (i + 1) % team.length)
      setPhase('showing')
    } else if (phase === 'showing') {
      setPhase('idle')
    }
  }

  const coinRotate = phase === 'hiding' ? 'rotateY(90deg)' : 'rotateY(0deg)'
  const coinEasing = phase === 'hiding' ? 'ease-in' : 'ease-out'
  const coinMember = team[coinIdx]
  return (
    <div className="viewport-fixed" style={{ zIndex: 300, overflow: 'hidden', fontFamily: 'Outfit, sans-serif', transform: leaving ? 'translateY(-100%)' : 'translateY(0)', transition: leaving ? 'transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)' : 'none' }}>
      {/* Blobs — its own fixed background layer, isolated from the scrollable content below so it can never scroll away and reveal the app underneath */}
      <div style={{ position: 'absolute', inset: 0, background: '#e8e8e8', zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #f5f5f5 0%, #e2e2e2 40%, #d6d6d6 70%, #ebebeb 100%)' }} />
        <div style={{ position: 'absolute', top: '-25%', left: '10%', width: '80vw', height: '80vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.45) 35%, transparent 68%)', filter: 'blur(8px)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '70vw', height: '70vw', borderRadius: '40% 60% 55% 45% / 50% 42% 58% 50%', background: 'radial-gradient(circle, rgba(10,10,10,0.85) 0%, rgba(20,20,20,0.6) 42%, transparent 70%)', filter: 'blur(14px)' }} />
        <div style={{ position: 'absolute', top: '25%', left: '-10%', width: '42vw', height: '52vw', borderRadius: '55% 45% 48% 52% / 50% 58% 42% 50%', background: 'radial-gradient(circle, rgba(30,30,30,0.42) 0%, transparent 72%)', filter: 'blur(18px)' }} />
      </div>

      {/* Scrollable content layer — a separate sibling to the background, so scrolling it (only kicks in if the profile list is genuinely too tall for the screen) never drags the background along and exposes what's behind it */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `max(32px, calc(24px + env(safe-area-inset-top))) max(24px, env(safe-area-inset-right)) max(32px, calc(24px + env(safe-area-inset-bottom))) max(24px, env(safe-area-inset-left))` }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Single flipping coin */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ perspective: 160, width: 52, height: 52 }}>
            {coinMember && (
              <div
                onTransitionEnd={onTransitionEnd}
                style={{ width: 52, height: 52, borderRadius: '50%', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.04em', boxShadow: '0 4px 18px rgba(0,0,0,0.28)', transform: coinRotate, transition: `transform 0.28s ${coinEasing}` }}
              >
                {coinMember.avatar}
              </div>
            )}
          </div>
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={mono({ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 8 })}>Tropicool Treats</div>
          <div style={{ fontSize: 28, fontWeight: 500, color: '#000', letterSpacing: '-0.02em', marginBottom: 6 }}>Who are you?</div>
          <div style={mono({ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)' })}>Select your profile to continue</div>
        </div>

        {/* Team grid */}
        <div className="login-grid">
          {team.map(m => (
            <button
              key={m.id}
              onClick={() => onSelect(m)}
              className="login-card"
              style={{ ...glass, border: '1px solid rgba(255,255,255,0.82)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s', outline: 'none', background: 'rgba(255,255,255,0.52)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.75)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.52)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
            >
              <div className="login-avatar" style={{ borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#fff', letterSpacing: '0.04em', transition: 'all 0.2s', boxShadow: m.clockedIn ? `0 0 0 2px #fff, 0 0 0 4px ${BRAND_PURPLE}` : 'none' }}>
                {m.avatar}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="login-card-name" style={{ fontWeight: 500, color: '#000', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 3 })}>{m.role}</div>
              </div>
            </button>
          ))}
        </div>

        {faceIdSupported && onFaceId && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={onFaceId}
              disabled={faceIdBusy}
              className="login-manager-btn"
              style={{ ...glass, width: '100%', display: 'flex', alignItems: 'center', cursor: faceIdBusy ? 'default' : 'pointer', textAlign: 'left', border: '1px solid rgba(255,255,255,0.82)', background: 'rgba(255,255,255,0.38)', transition: 'all 0.18s', outline: 'none', opacity: faceIdBusy ? 0.6 : 1 }}
              onMouseEnter={e => { if (!faceIdBusy) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.62)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.38)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
            >
              <div className="login-manager-icon" style={{ borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10-4.48 10-10 10" />
                  <path d="M12 8a4 4 0 0 0-4 4v2a4 4 0 0 0 8 0v-2a4 4 0 0 0-4-4Z" />
                  <path d="M6 12v1a6 6 0 0 0 6 6" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="login-manager-title" style={{ fontWeight: 500, color: '#000', lineHeight: 1.3 }}>{faceIdBusy ? 'Waiting for Face ID…' : 'Sign in with Face ID'}</div>
                <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: faceIdError ? 'rgba(180,40,40,0.7)' : 'rgba(0,0,0,0.35)', marginTop: 3 })}>{faceIdError || 'Or fingerprint / Windows Hello'}</div>
              </div>
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.25)' })}>New staff? Ask your manager to add you first</div>
        </div>

        {/* Manager login */}
        <div style={{ marginTop: 28, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 24 }}>
          <button
            onClick={onManager}
            className="login-manager-btn"
            style={{ ...glass, width: '100%', display: 'flex', alignItems: 'center', cursor: 'pointer', textAlign: 'left', border: '1px solid rgba(255,255,255,0.82)', background: 'rgba(255,255,255,0.38)', transition: 'all 0.18s', outline: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.62)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.38)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
          >
            <div className="login-manager-icon" style={{ borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="login-manager-title" style={{ fontWeight: 500, color: '#000', lineHeight: 1.3 }}>Manager Login</div>
              <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 3 })}>PIN required</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}

// ── Notification bell — reads the tt_notifications table (nightly stocktake
// reminders and any other broadcast notices written there) and shows an
// unread count. "Unread" is tracked client-side by remembering the highest
// notification id already seen in localStorage, since the table itself has
// no per-user read state. On a brand-new device the whole existing history
// is marked as seen the first time it loads, so people aren't greeted with
// a startling "22 unread" — only genuinely new notifications count from then on.
interface AppNotification { id: number; title: string; body: string; kind: string; created_at: string }
const NOTIF_SEEN_KEY = 'tt_notif_last_seen_id'

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function NotificationBell({ sampleNotifications }: { sampleNotifications?: AppNotification[] } = {}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 320, maxHeight: 360 })
  const [lastSeenId, setLastSeenId] = useState<number>(() => {
    const v = localStorage.getItem(NOTIF_SEEN_KEY)
    return v ? Number(v) : -1
  })

  useEffect(() => {
    if (sampleNotifications) {
      setNotifications(sampleNotifications)
      return
    }
    supabase.from('tt_notifications').select('id, title, body, kind, created_at').order('id', { ascending: false }).limit(20)
      .then(({ data }) => {
        if (!data) return
        setNotifications(data as AppNotification[])
        setLastSeenId(prev => {
          if (prev !== -1 || !data.length) return prev
          const maxId = data[0].id
          localStorage.setItem(NOTIF_SEEN_KEY, String(maxId))
          return maxId
        })
      })

    const channel = supabase.channel('tt_notifications_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tt_notifications' }, payload => {
        const r = payload.new as AppNotification
        setNotifications(prev => [r, ...prev].slice(0, 20))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sampleNotifications])

  useLayoutEffect(() => {
    if (!open) return
    function positionMenu() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(360, window.innerWidth - 24)
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))
      const top = rect.bottom + 8
      setMenuPosition({ top, left, width, maxHeight: Math.max(120, Math.min(420, window.innerHeight - top - 12)) })
    }
    positionMenu()
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [open])

  const unreadCount = notifications.filter(n => n.id > lastSeenId).length

  function toggle() {
    setOpen(v => {
      const next = !v
      if (next && notifications.length) {
        const maxId = notifications[0].id
        setLastSeenId(maxId)
        localStorage.setItem(NOTIF_SEEN_KEY, String(maxId))
      }
      return next
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button ref={buttonRef} onClick={toggle} title="Notifications" aria-label="Notifications" aria-expanded={open}
        style={{ ...glass, width: 34, height: 34, minWidth: 34, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', border: '1px solid rgba(255,255,255,0.82)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 15, height: 15, borderRadius: 99, background: BRAND_PURPLE, color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', fontFamily: 'JetBrains Mono, monospace', border: '2px solid #e8e8e8' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 249 }} />
          <div role="dialog" aria-label="Notifications" style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, zIndex: 250, width: menuPosition.width, maxHeight: menuPosition.maxHeight, overflowY: 'auto', overscrollBehavior: 'contain', background: 'rgba(250,250,250,0.92)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', border: '1px solid rgba(255,255,255,0.82)', boxShadow: '0 16px 48px rgba(0,0,0,0.16)', borderRadius: 16, padding: 8 }}>
            <div style={mono({ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', padding: '6px 8px' })}>Notifications</div>
            {notifications.length === 0 ? (
              <div style={mono({ fontSize: 10, color: 'rgba(0,0,0,0.3)', padding: '16px 8px', textAlign: 'center' })}>Nothing yet</div>
            ) : notifications.map(n => (
              <div key={n.id} style={{ padding: '10px 8px', borderRadius: 10, background: n.id > lastSeenId ? 'rgba(191,119,246,0.08)' : 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#000' }}>{n.title}</div>
                  <div style={mono({ fontSize: 8, color: 'rgba(0,0,0,0.3)', whiteSpace: 'nowrap' })}>{relativeTime(n.created_at)}</div>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)', marginTop: 3, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{n.body}</div>
              </div>
            ))}
          </div>
        </>, document.body
      )}
    </div>
  )
}

// ── Chat ──────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: number
  author: string
  avatar: string
  text: string
  time: string
}

const INITIAL_MESSAGES: ChatMessage[] = [
  { id: 1, author: 'Sophie Laurent', avatar: 'SL', text: 'Morning team! Canelés are out — can someone check if we have spare batter in the cool room?', time: '07:02' },
  { id: 2, author: 'Marcus Tran',    avatar: 'MT', text: 'On it. Also heads up, oat milk delivery is delayed until 10am.', time: '07:15' },
  { id: 3, author: 'Isla Winters',   avatar: 'IW', text: 'Table 4 just asked about the pistachio sorbet — is it back on today?', time: '09:12' },
  { id: 4, author: 'James Okafor',   avatar: 'JO', text: 'Yes it\'s on! Just restocked. Qty updated in the system.', time: '09:18' },
]

function ChatPanel({ team, currentUser, onClose }: { team: TeamMember[]; currentUser: TeamMember; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Load messages + real-time subscription
  useEffect(() => {
    api.getChat().then((rows: any[]) => {
      setMessages(rows.map(r => ({
        id: r.id, author: r.author, avatar: r.avatar, text: r.text,
        time: new Date(r.created_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }),
      })))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    })

    const channel = supabase.channel('tt_chat_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tt_chat' }, payload => {
        const r = payload.new as any
        setMessages(prev => [...prev, {
          id: r.id, author: r.author, avatar: r.avatar, text: r.text,
          time: new Date(r.created_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }),
        }])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function send() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await api.postChat({ author: currentUser.name, avatar: currentUser.avatar, text })
  }

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }} />

      {/* Panel */}
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 201, width: 'min(100%, 400px)', display: 'flex', flexDirection: 'column', background: 'rgba(245,245,245,0.75)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', borderLeft: '1px solid rgba(255,255,255,0.8)', boxShadow: '-8px 0 48px rgba(0,0,0,0.12)' }}>

        {/* Panel header */}
        <div style={{ paddingTop: 'max(20px, calc(16px + env(safe-area-inset-top)))', paddingBottom: 16, paddingLeft: 20, paddingRight: 20, borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#000', letterSpacing: '-0.01em' }}>Team Chat</div>
            <div style={mono({ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginTop: 3 })}>
              {team.filter(m => m.clockedIn).length} on shift
            </div>
          </div>
          {/* Current user pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 99, padding: '5px 12px 5px 6px' }}>
            <div style={{ width: 24, height: 24, borderRadius: 99, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "JetBrains Mono, monospace", fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: '0.04em' }}>{currentUser.avatar}</div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(0,0,0,0.6)', letterSpacing: '0.06em' }}>{currentUser.name.split(' ')[0]}</span>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 99, background: 'rgba(0,0,0,0.07)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: 14, flexShrink: 0 }}>✕</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px 20px', gap: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 99, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(0,0,0,0.5)' }}>No messages yet</div>
              <div style={mono({ fontSize: 10, letterSpacing: '0.08em', color: 'rgba(0,0,0,0.3)' })}>Say hi to the team</div>
            </div>
          )}
          {messages.map((msg, i) => {
            const isMine = msg.author === currentUser.name
            const showAvatar = i === 0 || messages[i - 1].author !== msg.author
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
                {!isMine && (
                  <div style={{ width: 28, height: 28, borderRadius: 99, background: showAvatar ? '#000' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, color: '#000', letterSpacing: '0.03em' }}>
                    {showAvatar ? msg.avatar : ''}
                  </div>
                )}
                <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 3, alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                  {showAvatar && !isMine && (
                    <div style={mono({ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', paddingLeft: 2 })}>{msg.author.split(' ')[0]}</div>
                  )}
                  <div style={{ padding: '9px 13px', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMine ? '#000' : 'rgba(255,255,255,0.75)', border: isMine ? 'none' : '1px solid rgba(255,255,255,0.9)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontSize: 13, color: isMine ? '#fff' : '#000', lineHeight: 1.45 }}>
                    {msg.text}
                  </div>
                  <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.28)', paddingLeft: isMine ? 0 : 2, paddingRight: isMine ? 2 : 0 })}>{msg.time}</div>
                </div>
              </div>
            )
          })}
          <div ref={el => { bottomRef.current = el }} />
        </div>

        {/* Input */}
        <div style={{ paddingTop: 12, paddingLeft: 16, paddingRight: 16, paddingBottom: 'max(20px, calc(16px + env(safe-area-inset-bottom)))', borderTop: '1px solid rgba(0,0,0,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Message the team..."
              rows={1}
              style={{ flex: 1, resize: 'none', fontFamily: 'Outfit, sans-serif', fontSize: 13, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: 12, padding: '10px 14px', color: '#000', outline: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', lineHeight: 1.4 }}
            />
            <button
              onClick={send}
              disabled={!draft.trim()}
              style={{ width: 38, height: 38, borderRadius: 99, border: 'none', background: draft.trim() ? '#000' : 'rgba(0,0,0,0.12)', color: draft.trim() ? '#fff' : 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: draft.trim() ? 'pointer' : 'default', transition: 'all 0.2s', flexShrink: 0 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <div style={mono({ fontSize: 9, color: 'rgba(0,0,0,0.25)', marginTop: 8, textAlign: 'center', letterSpacing: '0.1em' })}>Enter to send · Shift+Enter for newline</div>
        </div>
      </div>
    </>
  )
}

// ── DB row → app type mappers ─────────────────────────────────────────────────
function dbToTeam(r: any): TeamMember {
  return { id: r.id, name: r.name, role: r.role, avatar: r.avatar, clockedIn: r.clocked_in, clockIn: r.clock_in ?? undefined, signedOff: r.signed_off ?? undefined, signedOffTime: r.signed_off_time ?? undefined, isManager: !!r.is_manager }
}
function dbToItem(r: any): Item {
  return { id: r.id, name: r.name, category: r.category, unit: r.unit, par: Number(r.par), qty: Number(r.qty), createdAt: r.created_at ?? undefined }
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const DRAFT_MODE = IS_DRAFT_MODE
  const [items, setItems] = useState<Item[]>(() => DRAFT_MODE ? draftItems as Item[] : [])
  const [team, setTeam] = useState<TeamMember[]>(() => DRAFT_MODE ? draftTeam.map(m => ({ ...m, clockIn: m.clockIn ?? undefined, signedOff: m.signedOff ? 'prev' : undefined })) : [])
  const [categories, setCategories] = useState<{ id: number; name: string; position: number }[]>(() => DRAFT_MODE ? draftCategories.map((name, position) => ({ id: position + 1, name, position })) : [])
  const [roles, setRoles] = useState<{ id: number; name: string }[]>(() => DRAFT_MODE ? draftRoles.map((name, index) => ({ id: index + 1, name })) : [])
  const [loading, setLoading] = useState(!DRAFT_MODE)
  const [minimumSplashElapsed, setMinimumSplashElapsed] = useState(false)
  const [seeded, setSeeded] = useState(false)
  // Picked once per app load (not per render) so the line doesn't shuffle
  // underneath the user while the splash screen is up.
  const [splashLine] = useState(() => pickSplashLine(
    Number(new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hour12: false, timeZone: 'Australia/Brisbane' }).format(new Date()))
  ))

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumSplashElapsed(true), 2400)
    return () => window.clearTimeout(timer)
  }, [])

  const [mainTab, setMainTab] = useState<MainTab>(DRAFT_MODE ? 'manager' : 'overview')
  const [teamDeepLink, setTeamDeepLink] = useState<TeamNavTarget | null>(null)
  const [managerAuthed, setManagerAuthed] = useState(DRAFT_MODE)
  const [managerSessionPin, setManagerSessionPin] = useState<string | null>(DRAFT_MODE ? '0000' : null)
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StockStatus | null>(null)
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(DRAFT_MODE ? { ...draftManager, clockIn: draftManager.clockIn ?? undefined, signedOff: draftManager.signedOff ? 'prev' : undefined } : null)
  const [pendingLoginUser, setPendingLoginUser] = useState<TeamMember | null>(null)
  const [loginLeaving, setLoginLeaving] = useState(false)
  const [faceIdBusy, setFaceIdBusy] = useState(false)
  const [faceIdError, setFaceIdError] = useState<string | null>(null)
  const [showManagerPin, setShowManagerPin] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [squareSyncing, setSquareSyncing] = useState(false)
  const [squareSyncMessage, setSquareSyncMessage] = useState<string | null>(null)
  const [roster, setRoster] = useState<RosterShift[]>([])
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [editItemId, setEditItemId] = useState<number | null>(null)
  const [trainingBlock, setTrainingBlock] = useState<{ member: TeamMember; overdue: api.OverdueTraining[] } | null>(null)
  const [trainingReminder, setTrainingReminder] = useState<api.Training[] | null>(null)
  const [trainingReminderDismissedFor, setTrainingReminderDismissedFor] = useState<number | null>(null)
  const [geofenceBlock, setGeofenceBlock] = useState<{ member: TeamMember; distanceMeters: number | null; radiusMeters: number; lat?: number; lng?: number; accuracy?: number } | null>(null)
  const priorTrainingOverride = useRef<number | null>(null)
  const priorGeofenceOverride = useRef<number | null>(null)
  const catScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = catScrollRef.current
    if (!el) return
    const t = setTimeout(() => {
      el.scrollTo({ left: 80, behavior: 'smooth' })
      setTimeout(() => el.scrollTo({ left: 0, behavior: 'smooth' }), 520)
    }, 700)
    return () => clearTimeout(t)
  }, [])

  const session = new Date().toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()

  async function refreshTrainingReminder(member = currentUser) {
    if (DRAFT_MODE || !member || member.isManager) { setTrainingReminder(null); return }
    try {
      const [trainings, completions] = await Promise.all([api.getTrainings(), api.getTrainingCompletions()])
      const passedIds = new Set(completions.filter(completion => completion.team_id === member.id && completion.passed).map(completion => completion.training_id))
      const pending = trainings.filter(training => training.mandatory && !passedIds.has(training.id))
      setTrainingReminder(pending.length ? pending : null)
    } catch (e) {
      console.warn('Training reminder check failed:', e)
    }
  }

  useEffect(() => {
    setTrainingReminderDismissedFor(null)
    refreshTrainingReminder(currentUser)
  }, [currentUser?.id, currentUser?.isManager])

  // ── Initial load + seed if empty ──────────────────────────────────────────
  useEffect(() => {
    if (DRAFT_MODE) return
    async function load() {
      try {
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        const [cats, rls, tm, its] = await Promise.race([
          Promise.all([api.getCategories(), api.getRoles(), api.getTeam(), api.getItems()]),
          timeout,
        ])
        if ((cats.length === 0 || tm.length === 0) && !seeded) {
          await seedDatabase()
          setSeeded(true)
          return load()
        }
        const loadedTeam = tm.map(dbToTeam)
        setCategories(cats)
        setRoles(rls)
        setTeam(loadedTeam)
        restoreRememberedProfile(loadedTeam)
        setItems(its.map(dbToItem))
      } catch (e) {
        console.warn('Supabase unavailable — using local data', e)
        // Fall back to seed data so the app is usable without the edge function
        setCategories(INITIAL_CATEGORIES.map((name, i) => ({ id: i + 1, name, position: i })))
        setRoles(INITIAL_ROLES.map((name, i) => ({ id: i + 1, name })))
        const fallbackTeam = INITIAL_TEAM.map((m, i) => ({ ...m, id: i + 1 }))
        setTeam(fallbackTeam)
        restoreRememberedProfile(fallbackTeam)
        setItems(INITIAL_ITEMS.map((it, i) => ({ ...it, id: i + 1 })))
      }
      finally { setLoading(false) }
    }
    load()
  }, [])

  async function seedDatabase() {
    const catNames = INITIAL_CATEGORIES
    const roleNames = INITIAL_ROLES
    await Promise.all(catNames.map((name, i) => api.addCategory(name, i)))
    await Promise.all(roleNames.map(name => api.addRole(name)))
    await Promise.all(INITIAL_TEAM.map(m => api.addTeamMember({ name: m.name, role: m.role, avatar: m.avatar, clocked_in: m.clockedIn, clock_in: m.clockIn ?? null })))
    await Promise.all(INITIAL_ITEMS.map(it => api.addItem({ name: it.name, category: it.category, unit: it.unit, par: it.par, qty: it.qty })))
  }

  // ── Real-time subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    if (DRAFT_MODE) return
    const channel = supabase.channel('tt_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tt_items' }, async () => {
        const data = await api.getItems()
        setItems(data.map(dbToItem))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tt_team' }, async () => {
        const data = await api.getTeam()
        setTeam(data.map(dbToTeam))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tt_categories' }, async () => {
        const data = await api.getCategories()
        setCategories(data)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tt_roles' }, async () => {
        const data = await api.getRoles()
        setRoles(data)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Keep clock-in status honest against Square, not just this app ────────
  // Staff can clock in/out through the separate Square Team App directly —
  // this app has no way to know that happened until it asks Square. Poll
  // periodically (and once right away) so the Team/Status views stay live
  // for whoever's looking, in addition to the per-login sync above. Writes
  // land in tt_team, which the realtime subscription above then fans out to
  // every open device instantly.
  useEffect(() => {
    if (DRAFT_MODE) return
    syncAllClockStatusFromSquare()
    const id = setInterval(syncAllClockStatusFromSquare, 20000)
    return () => clearInterval(id)
  }, [])

  // ── Category names as plain strings (for UI) ──────────────────────────────
  const categoryNames = categories.map(c => c.name)
  const allCategories = ['All', ...categoryNames]

  // ── Category handlers ─────────────────────────────────────────────────────
  const [saveError, setSaveError] = useState<string | null>(null)
  const tryApi = async (fn: () => Promise<any>) => {
    if (DRAFT_MODE) { setSaveError(null); return true }
    try { await fn(); setSaveError(null); return true }
    catch (e) {
      setSaveError('Could not save. Your last saved data will be restored. Please try again.')
      try { const rows = await api.getItems(); setItems(rows.map(dbToItem)) } catch {}
      return false
    }
  }

  async function handleAddCategory(name: string) {
    setCategories(prev => [...prev, { id: tempId(), name, position: prev.length }])
    tryApi(() => api.addCategory(name, categories.length))
  }
  async function handleRenameCategory(oldName: string, newName: string) {
    setCategories(prev => prev.map(c => c.name === oldName ? { ...c, name: newName } : c))
    setItems(prev => prev.map(it => it.category === oldName ? { ...it, category: newName } : it))
    if (activeCategory === oldName) setActiveCategory(newName)
    const cat = categories.find(c => c.name === oldName)
    if (!cat) return
    tryApi(async () => {
      await api.updateCategory(cat.id, { name: newName })
      const affected = items.filter(it => it.category === oldName)
      await Promise.all(affected.map(it => api.updateItem(it.id, { category: newName })))
    })
  }
  async function handleDeleteCategory(name: string) {
    setCategories(prev => prev.filter(c => c.name !== name))
    if (activeCategory === name) setActiveCategory('All')
    const cat = categories.find(c => c.name === name)
    if (cat && cat.id > 0) tryApi(() => api.deleteCategory(cat.id))
  }
  // Drag/reorder from the Categories tab — `newOrder` is the full list of
  // names in their new order; re-derive positions from that and persist.
  async function handleReorderCategories(newOrder: string[]) {
    const reordered = newOrder
      .map(name => categories.find(c => c.name === name))
      .filter((c): c is typeof categories[number] => !!c)
      .map((c, i) => ({ ...c, position: i }))
    setCategories(reordered)
    tryApi(() => Promise.all(reordered.map(c => api.updateCategory(c.id, { position: c.position }))))
  }

  // ── Role handlers ─────────────────────────────────────────────────────────
  async function handleAddRole(name: string) {
    setRoles(prev => [...prev, { id: tempId(), name }])
    tryApi(() => api.addRole(name))
  }
  async function handleRenameRole(oldName: string, newName: string) {
    setRoles(prev => prev.map(r => r.name === oldName ? { ...r, name: newName } : r))
    setTeam(prev => prev.map(m => m.role === oldName ? { ...m, role: newName } : m))
    const role = roles.find(r => r.name === oldName)
    if (!role) return
    tryApi(async () => {
      await api.updateRole(role.id, { name: newName })
      const affected = team.filter(m => m.role === oldName)
      await Promise.all(affected.map(m => api.updateTeamMember(m.id, { role: newName })))
    })
  }
  async function handleDeleteRole(name: string) {
    setRoles(prev => prev.filter(r => r.name !== name))
    const role = roles.find(r => r.name === name)
    if (role) tryApi(() => api.deleteRole(role.id))
  }

  // ── Item handlers ─────────────────────────────────────────────────────────
  async function handleSetQty(id: number, qty: number) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, qty } : it))
    if (id > 0) tryApi(() => api.updateItem(id, { qty }))
  }
  async function handleUpdateItem(id: number, patch: Partial<Omit<Item, 'id'>>) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
    if (id > 0) tryApi(() => api.updateItem(id, patch))
  }
  async function handleDeleteItem(id: number) {
    setItems(prev => prev.filter(it => it.id !== id))
    setEditItemId(null)
    if (id > 0) tryApi(() => api.deleteItem(id))
  }
  async function handleAddItem(item: Omit<Item, 'id'>) {
    setItems(prev => [...prev, { ...item, id: tempId() }])
    tryApi(() => api.addItem(item))
  }

  // ── Team handlers ─────────────────────────────────────────────────────────
  async function handleSetTeam(updater: (t: TeamMember[]) => TeamMember[]) {
    const next = updater(team)
    setTeam(next)
    for (const m of next) {
      const prev = team.find(x => x.id === m.id)
      if (prev && JSON.stringify(prev) !== JSON.stringify(m)) {
        tryApi(() => api.updateTeamMember(m.id, { clocked_in: m.clockedIn, clock_in: m.clockIn ?? null, signed_off: m.signedOff ?? null, signed_off_time: m.signedOffTime ?? null, role: m.role, name: m.name, avatar: m.avatar }))
      }
    }
  }
  async function handleAddTeamMember(member: Omit<TeamMember, 'id'>) {
    setTeam(prev => [...prev, { ...member, id: tempId() }])
    tryApi(() => api.addTeamMember({ name: member.name, role: member.role || 'Staff', avatar: member.avatar, clocked_in: member.clockedIn, clock_in: member.clockIn ?? null }))
  }
  async function handleDeleteTeamMember(id: number) {
    setTeam(prev => prev.filter(m => m.id !== id))
    if (id > 0) tryApi(() => api.deleteTeamMember(id))
  }
  async function handleUpdateTeamMember(id: number, patch: Partial<TeamMember>) {
    setTeam(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
    const dbPatch: any = {}
    if (patch.name !== undefined) dbPatch.name = patch.name
    if (patch.role !== undefined) dbPatch.role = patch.role
    if (patch.avatar !== undefined) dbPatch.avatar = patch.avatar
    if (patch.clockedIn !== undefined) dbPatch.clocked_in = patch.clockedIn
    if (patch.clockIn !== undefined) dbPatch.clock_in = patch.clockIn
    if (patch.signedOff !== undefined) dbPatch.signed_off = patch.signedOff
    if (patch.signedOffTime !== undefined) dbPatch.signed_off_time = patch.signedOffTime
    if (id > 0) tryApi(() => api.updateTeamMember(id, dbPatch))
  }

  const stats = useMemo(() => {
    const out = items.filter(it => getStatus(it.qty, it.par) === 'out').length
    const low = items.filter(it => getStatus(it.qty, it.par) === 'low').length
    return { total: items.length, out, low, ok: items.length - out - low }
  }, [items])

  const filtered = useMemo(() => items.filter(it => {
    const catMatch = activeCategory === 'All' || it.category === activeCategory
    const searchMatch = it.name.toLowerCase().includes(search.toLowerCase())
    const statusMatch = !statusFilter || getStatus(it.qty, it.par) === statusFilter
    return catMatch && searchMatch && statusMatch
  }), [items, activeCategory, search, statusFilter])

  const STAT_CARDS = [
    { label: 'Total Items', value: stats.total, filter: null,                  dark: true  },
    { label: 'In Stock',    value: stats.ok,    filter: 'ok'  as StockStatus, dark: false },
    { label: 'Low',         value: stats.low,   filter: 'low' as StockStatus, dark: false },
    { label: 'Out',         value: stats.out,   filter: 'out' as StockStatus, dark: false },
  ]

  const TAB_LABELS: Record<MainTab, string> = { overview: 'Overview', stocktake: 'Stock Levels', team: 'Team', music: 'Music', manager: 'Manager' }

  function commitUser(m: TeamMember) {
    // Selecting a profile just signs the person in — it no longer clocks
    // them in automatically. Clocking in/out happens explicitly from the
    // dedicated Clock In/Out section in the Team tab.
    setCurrentUser(m)
    rememberProfile(m.id)
    // Staff flagged as a manager already proved their identity with their
    // own PIN, so unlock the Manager tab for them too — no separate
    // "Manager" login/identity needed.
    if (m.isManager) setManagerAuthed(true)
  }

  function restoreRememberedProfile(availableTeam: TeamMember[]) {
    const rememberedId = readRememberedProfileId()
    if (rememberedId === null) return
    const rememberedMember = availableTeam.find(member => member.id === rememberedId)
    if (rememberedMember) setCurrentUser(rememberedMember)
    else forgetRememberedProfile()
  }

  // ── Web push subscription (best-effort — never blocks login) ─────────────
  async function subscribeToPush(teamId: number, managerPin?: string) {
    try {
      await api.enablePushForTeam(teamId, managerPin)
    } catch (e) {
      console.warn('Push subscription skipped:', e)
    }
  }

  async function handleSetPin(id: number, pin: string) {
    await api.squarePinSet(id, pin)
  }

  // Pull half of the two-way Square sync — called at login so a clock-in/out
  // done directly in Square (POS terminal, another device) shows up here
  // right away instead of waiting for the next manual "Sync Square". Runs
  // async after login so it never blocks or slows down signing in.
  async function syncClockStatusFromSquare(teamId: number) {
    try {
      const res = await api.squareClockStatus(teamId)
      if (!res.synced || !res.team) return
      const clockedIn = !!res.team.clocked_in
      const clockIn = res.team.clock_in ?? undefined
      setTeam(prev => prev.map(t => t.id === teamId ? { ...t, clockedIn, clockIn } : t))
      setCurrentUser(prev => (prev && prev.id === teamId ? { ...prev, clockedIn, clockIn } : prev))
    } catch (e) {
      console.warn('Square clock-status sync failed (non-fatal):', e)
    }
  }

  // Same pull, but for the whole team at once — polled on an interval so a
  // clock-in/out done through the separate Square Team App (not this app)
  // shows up on the Team/Status screens for everyone looking at them, not
  // just after that person happens to log into this app themselves.
  async function syncAllClockStatusFromSquare() {
    try {
      const res = await api.squareClockStatusAll()
      if (!res.synced || !res.team?.length) return
      const byId = new Map(res.team.map(t => [t.id, t]))
      setTeam(prev => prev.map(t => {
        const upd = byId.get(t.id)
        if (!upd) return t
        return { ...t, clockedIn: !!upd.clocked_in, clockIn: upd.clock_in ?? undefined }
      }))
      setCurrentUser(prev => {
        if (!prev) return prev
        const upd = byId.get(prev.id)
        if (!upd) return prev
        return { ...prev, clockedIn: !!upd.clocked_in, clockIn: upd.clock_in ?? undefined }
      })
    } catch (e) {
      console.warn('Square bulk clock-status sync failed (non-fatal):', e)
    }
  }

  async function handleClockToggle(m: TeamMember) {
    if (DRAFT_MODE) {
      const clockedIn = !m.clockedIn
      const clockIn = clockedIn ? formatClock12(new Date()) : undefined
      setTeam(prev => prev.map(t => t.id === m.id ? { ...t, clockedIn, clockIn } : t))
      setCurrentUser(prev => (prev && prev.id === m.id ? { ...prev, clockedIn, clockIn } : prev))
      return true
    }
    if (m.clockedIn) {
      setTeam(prev => prev.map(t => t.id === m.id ? { ...t, clockedIn: false, clockIn: undefined } : t))
      setCurrentUser(prev => (prev && prev.id === m.id ? { ...prev, clockedIn: false, clockIn: undefined } : prev))
      try {
        await api.squareClockOut(m.id)
        return true
      } catch (e) {
        setTeam(prev => prev.map(t => t.id === m.id ? { ...t, clockedIn: true, clockIn: m.clockIn } : t))
        setCurrentUser(prev => (prev && prev.id === m.id ? { ...prev, clockedIn: true, clockIn: m.clockIn } : prev))
        setSaveError("Clock-out wasn't confirmed. Please try again.")
        return false
      }
    } else {
      priorTrainingOverride.current = null
      priorGeofenceOverride.current = null
      const now = new Date()
      const clockIn = formatClock12(now)
      setTeam(prev => prev.map(t => t.id === m.id ? { ...t, clockedIn: true, clockIn } : t))
      setCurrentUser(prev => (prev && prev.id === m.id ? { ...prev, clockedIn: true, clockIn } : prev))
      // Ask for device location only when the manager has enabled the gate.
      // The server still makes the final decision for every clock-in.
      const pos = m.isManager ? null : await api.getClockInLocationIfNeeded()
      try {
        await api.squareClockIn(m.id, { lat: pos?.lat, lng: pos?.lng, accuracy: pos?.accuracy })
        return true
      } catch (e) {
        if (e instanceof api.TrainingRequiredError) {
          // Roll back the optimistic clock-in — they're actually blocked.
          setTeam(prev => prev.map(t => t.id === m.id ? { ...t, clockedIn: false, clockIn: undefined } : t))
          setCurrentUser(prev => (prev && prev.id === m.id ? { ...prev, clockedIn: false, clockIn: undefined } : prev))
          setTrainingBlock({ member: m, overdue: e.overdue })
          return false
        }
        if (e instanceof api.GeofenceBlockedError) {
          setTeam(prev => prev.map(t => t.id === m.id ? { ...t, clockedIn: false, clockIn: undefined } : t))
          setCurrentUser(prev => (prev && prev.id === m.id ? { ...prev, clockedIn: false, clockIn: undefined } : prev))
          setGeofenceBlock({ member: m, distanceMeters: e.distanceMeters, radiusMeters: e.radiusMeters, lat: pos?.lat, lng: pos?.lng, accuracy: pos?.accuracy })
          return false
        }
        setTeam(prev => prev.map(t => t.id === m.id ? { ...t, clockedIn: false, clockIn: undefined } : t))
        setCurrentUser(prev => (prev && prev.id === m.id ? { ...prev, clockedIn: false, clockIn: undefined } : prev))
        setSaveError("Clock-in wasn't confirmed. Please try again.")
        return false
      }
    }
  }

  async function handleTrainingOverride(pin: string) {
    if (!trainingBlock) return
    const m = trainingBlock.member
    const pos = await api.getClockInLocationIfNeeded()
    try {
      await api.squareClockIn(m.id, { managerOverridePin: pin, geofenceOverridePin: priorGeofenceOverride.current === m.id ? pin : undefined, lat: pos?.lat, lng: pos?.lng, accuracy: pos?.accuracy })
    } catch (e) {
      if (e instanceof api.GeofenceBlockedError) {
        priorTrainingOverride.current = m.id
        setTrainingBlock(null)
        setGeofenceBlock({ member: m, distanceMeters: e.distanceMeters, radiusMeters: e.radiusMeters, lat: pos?.lat, lng: pos?.lng, accuracy: pos?.accuracy })
        return
      }
      throw e
    }
    const now = new Date()
    const clockIn = formatClock12(now)
    setTeam(prev => prev.map(t => t.id === m.id ? { ...t, clockedIn: true, clockIn } : t))
    setTrainingBlock(null)
    priorTrainingOverride.current = null
    priorGeofenceOverride.current = null
  }

  async function handleGeofenceOverride(pin: string) {
    if (!geofenceBlock) return
    const m = geofenceBlock.member
    try {
      await api.squareClockIn(m.id, { geofenceOverridePin: pin, managerOverridePin: priorTrainingOverride.current === m.id ? pin : undefined, lat: geofenceBlock.lat, lng: geofenceBlock.lng, accuracy: geofenceBlock.accuracy })
    } catch (e) {
      if (e instanceof api.TrainingRequiredError) {
        priorGeofenceOverride.current = m.id
        setGeofenceBlock(null)
        setTrainingBlock({ member: m, overdue: e.overdue })
        return
      }
      throw e
    }
    const now = new Date()
    const clockIn = formatClock12(now)
    setTeam(prev => prev.map(t => t.id === m.id ? { ...t, clockedIn: true, clockIn } : t))
    setCurrentUser(prev => (prev && prev.id === m.id ? { ...prev, clockedIn: true, clockIn } : prev))
    setGeofenceBlock(null)
    priorTrainingOverride.current = null
    priorGeofenceOverride.current = null
  }

  async function handleSyncSquare() {
    setSquareSyncing(true)
    setSquareSyncMessage(null)
    try {
      const res = await api.squareSyncStaff()
      const unlinked = res.unlinked_local_staff ?? []
      setSquareSyncMessage(
        unlinked.length > 0
          ? `Synced ${res.synced} from Square. ${unlinked.length} local record(s) didn't match by name and may be duplicates: ${unlinked.map((u: any) => u.name).join(', ')}.`
          : `Synced ${res.synced} staff from Square.`
      )
    } catch (e) {
      setSquareSyncMessage(`Sync failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setSquareSyncing(false)
    }
  }

  async function handleLoadRoster() {
    setLoadingRoster(true)
    try {
      const res = await api.squareRoster(14)
      setRoster(res.roster ?? [])
    } catch (e) {
      console.warn('Failed to load roster', e)
    } finally {
      setLoadingRoster(false)
    }
  }

  function handleUserSelect(m: TeamMember) {
    // Don't sign in yet — first require their PIN so no one else can log
    // in under someone else's name.
    setPendingLoginUser(m)
  }

  function handlePinVerified(verifiedPin: string) {
    const m = pendingLoginUser
    if (!m) return
    // Signing in as yourself already proves who you are — if that profile is
    // a manager, that's enough to unlock the Manager tab too, with no second
    // PIN prompt. (The generic "Manager Access" shortcut below is different:
    // it doesn't know who's typing until the PIN matches, so it still asks
    // for that person's PIN again before granting real access.)
    if (m.isManager) { setManagerSessionPin(verifiedPin); setManagerAuthed(true) }
    setPendingLoginUser(null)
    setLoginLeaving(true)
    setTimeout(() => { commitUser(m); setLoginLeaving(false) }, 420)
    subscribeToPush(m.id, m.isManager ? verifiedPin : undefined)
    syncClockStatusFromSquare(m.id)
  }

  // ── Face ID / fingerprint sign-in — the biometric already proves identity,
  // so this skips the PIN step and signs the matched staff member straight
  // in, the same way handlePinVerified does.
  async function handleFaceIdLogin() {
    setFaceIdBusy(true)
    setFaceIdError(null)
    try {
      const { flowId, options } = await api.webauthnLoginOptions()
      const response = await startAuthentication({ optionsJSON: options })
      const result = await api.webauthnLoginVerify(flowId, response)
      if (!result.verified || !result.teamId) {
        setFaceIdError(result.error || "Face ID didn't match a staff profile")
        return
      }
      const m = team.find(t => t.id === result.teamId)
      if (!m) { setFaceIdError('Staff profile no longer exists'); return }
      setLoginLeaving(true)
      setTimeout(() => { commitUser(m); setLoginLeaving(false) }, 420)
      if (!m.isManager) subscribeToPush(m.id)
      syncClockStatusFromSquare(m.id)
    } catch (e) {
      if (e instanceof WebAuthnError && e.code === 'ERROR_CEREMONY_ABORTED') {
        // user cancelled the OS prompt — not an error worth surfacing
      } else {
        setFaceIdError(e instanceof Error ? e.message : 'Face ID sign-in failed')
      }
    } finally {
      setFaceIdBusy(false)
    }
  }

  function handleManagerAccess() {
    setShowManagerPin(true)
  }

  function handleManagerPinSuccess(matched: { teamId: number; name: string; role: string; avatar: string }, verifiedPin: string) {
    setShowManagerPin(false)
    setManagerSessionPin(verifiedPin)
    setLoginLeaving(true)
    setTimeout(() => {
      // Sign in as the actual matched staff profile (not a separate "Manager"
      // ghost identity) so this stays merged with their real staff account.
      const real = team.find(t => t.id === matched.teamId)
      commitUser(real ?? { id: matched.teamId, name: matched.name, role: matched.role, clockedIn: false, avatar: matched.avatar, isManager: true })
      // Deliberately NOT setting managerAuthed here — this shortcut only
      // proved *some* manager's PIN was typed, not which one. The Manager
      // tab still asks this specific person's own PIN once more (see
      // ManagerView) before unlocking anything protected.
      setMainTab('stocktake')
      setLoginLeaving(false)
    }, 420)
    syncClockStatusFromSquare(matched.teamId)
  }

  if (loading || !minimumSplashElapsed) {
    return (
      <div className="viewport-fill" style={{ background: '#e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18 }}>
        <div style={{ width: 52, height: 52, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        </div>
        <div style={{ textAlign: 'center', padding: '0 32px' }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 19, fontWeight: 600, color: '#000', letterSpacing: '-0.02em', marginBottom: 6 }}>{splashLine}</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' }}>Loading Tropicool Treats…</div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div className="viewport-fill" style={{ background: '#e8e8e8', fontFamily: 'Outfit, sans-serif', position: 'relative', overflow: 'hidden' }}>
      {(!currentUser || loginLeaving) && <UserSelectScreen team={team} onSelect={handleUserSelect} onManager={handleManagerAccess} onFaceId={handleFaceIdLogin} faceIdBusy={faceIdBusy} faceIdError={faceIdError} leaving={loginLeaving} />}
      {pendingLoginUser && <LoginPinOverlay member={pendingLoginUser} onSuccess={handlePinVerified} onCancel={() => setPendingLoginUser(null)} />}
      {showManagerPin && <ManagerPinOverlay onSuccess={handleManagerPinSuccess} onDismiss={() => setShowManagerPin(false)} />}
      {trainingReminder && currentUser && trainingReminderDismissedFor !== currentUser.id && (
        <TrainingReminderOverlay
          trainings={trainingReminder}
          onStart={() => { setTrainingReminderDismissedFor(currentUser.id); setTeamDeepLink({ section: 'training' }); setMainTab('team') }}
          onDismiss={() => setTrainingReminderDismissedFor(currentUser.id)}
        />
      )}
      {trainingBlock && (
        <TrainingBlockOverlay
          member={trainingBlock.member}
          overdue={trainingBlock.overdue}
          onOverride={handleTrainingOverride}
          onCancel={() => setTrainingBlock(null)}
        />
      )}
      {geofenceBlock && (
        <GeofenceBlockOverlay
          member={geofenceBlock.member}
          distanceMeters={geofenceBlock.distanceMeters}
          radiusMeters={geofenceBlock.radiusMeters}
          onOverride={handleGeofenceOverride}
          onCancel={() => setGeofenceBlock(null)}
        />
      )}

      {/* Background: layered mesh gradient + soft ink blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        {/* Base mesh — warm off-white to cool grey diagonal sweep */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #f5f5f5 0%, #e2e2e2 40%, #d6d6d6 70%, #ebebeb 100%)' }} />
        {/* Large soft white glow — top centre, creates a "light source" feel */}
        <div style={{ position: 'absolute', top: '-30%', left: '20%', width: '80vw', height: '80vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.5) 35%, transparent 70%)', filter: 'blur(8px)' }} />
        {/* Deep ink mass — bottom-right anchor */}
        <div style={{ position: 'absolute', bottom: '-25%', right: '-15%', width: '75vw', height: '75vw', borderRadius: '38% 62% 55% 45% / 48% 40% 60% 52%', background: 'radial-gradient(circle, rgba(10,10,10,0.88) 0%, rgba(20,20,20,0.65) 40%, transparent 72%)', filter: 'blur(12px)' }} />
        {/* Mid-tone smear — left edge */}
        <div style={{ position: 'absolute', top: '30%', left: '-12%', width: '45vw', height: '55vw', borderRadius: '60% 40% 45% 55% / 52% 60% 40% 48%', background: 'radial-gradient(circle, rgba(30,30,30,0.48) 0%, rgba(0,0,0,0.2) 50%, transparent 78%)', filter: 'blur(18px)' }} />
        {/* Soft white reflection — top-right */}
        <div style={{ position: 'absolute', top: '-5%', right: '-5%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.75) 0%, transparent 65%)', filter: 'blur(6px)' }} />
        {/* Subtle mid blob — centre */}
        <div style={{ position: 'absolute', top: '45%', left: '38%', width: '30vw', height: '30vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(180,180,180,0.4) 0%, transparent 70%)', filter: 'blur(24px)' }} />
        {/* Fine grain texture for depth */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.045, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize: '160px' }} />
      </div>

      {DRAFT_MODE && <div className="draft-banner" role="status">DRAFT PREVIEW · Sample data only · Changes stay in this browser</div>}
      <div className={`app-shell${mainTab === 'manager' ? ' manager-tab-active' : ''}`}>

        {/* Header */}
        <header className="app-header">
          {/* Row 1: brand + user */}
          <div className="app-header-row">
            <div style={mono({ fontSize: 9, letterSpacing: '0.22em', color: 'rgba(0,0,0,0.38)', textTransform: 'uppercase' })}>Tropicool Treats</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="date-chip" style={{ ...glass, borderRadius: 99, padding: '7px 14px', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 5, height: 5, borderRadius: 99, background: '#000', display: 'inline-block', flexShrink: 0 }} />
                <span style={mono({ fontSize: 9, letterSpacing: '0.14em', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase' })}>{session}</span>
              </div>
              {currentUser && <NotificationBell />}
              {currentUser && (
                <button
                  aria-label={showChat ? "Close team chat" : "Open team chat"}
                  onClick={() => setShowChat(v => !v)}
                  style={{ ...glass, width: 36, height: 36, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  {showChat ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  )}
                </button>
              )}
              {currentUser && (
                <button onClick={() => { forgetRememberedProfile(); setCurrentUser(null); setManagerAuthed(false); setManagerSessionPin(null); setMainTab('stocktake') }} title="Switch user"
                  style={{ ...glass, borderRadius: 99, padding: '5px 10px 5px 5px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  {/* Purple ring = "clocked in", same idea as an Instagram close-friends
                      story ring — a quick, glanceable confirmation of whether this
                      person is currently on shift, without reading the name text. */}
                  <div style={{ width: 24, height: 24, minWidth: 24, borderRadius: 99, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 8, fontWeight: 700, color: '#fff', boxShadow: currentUser.clockedIn ? `0 0 0 2px #fff, 0 0 0 4px ${BRAND_PURPLE}` : 'none' }}>{currentUser.avatar}</div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#000', whiteSpace: 'nowrap' }}>{currentUser.name.split(' ')[0]}</span>
                </button>
              )}
            </div>
          </div>
          {/* Row 2: title + add */}
          <div className="app-header-row">
            <div style={{ fontSize: 28, fontWeight: 600, color: '#000', letterSpacing: '-0.025em', lineHeight: 1 }}>{TAB_LABELS[mainTab]}</div>
            {mainTab === 'stocktake' && (
              <button onClick={() => setShowAddModal(true)} style={{ ...glassDark, borderRadius: 99, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,0.09)', cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>Add
              </button>
            )}
          </div>
        </header>

        {saveError && <div role="alert" className="save-error">{saveError}</div>}
        {/* Nav tabs */}
        <div className="nav-tabs" style={{ ...glass, borderRadius: 12, padding: '4px 5px' }}>
          {(['overview', 'stocktake', 'team', 'manager'] as MainTab[]).map(tab => (
            <button key={tab} onClick={() => setMainTab(tab)}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: 8, cursor: 'pointer', border: 'none', transition: 'all 0.2s', background: mainTab === tab ? '#000' : 'transparent', color: mainTab === tab ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: mainTab === tab ? 500 : 400, whiteSpace: 'nowrap' }}>
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {mainTab === 'manager' ? (
          <ManagerView
            team={team}
            onAddTeamMember={handleAddTeamMember}
            onDeleteTeamMember={handleDeleteTeamMember}
            onUpdateTeamMember={handleUpdateTeamMember}
            categories={categoryNames} onAddCategory={handleAddCategory} onRenameCategory={handleRenameCategory} onDeleteCategory={handleDeleteCategory} onReorderCategories={handleReorderCategories}
            roles={roles.map(r => r.name)} onAddRole={handleAddRole} onRenameRole={handleRenameRole} onDeleteRole={handleDeleteRole}
            authed={managerAuthed} sessionPin={managerSessionPin} onAuthed={pin => { setManagerAuthed(true); setManagerSessionPin(pin); if (currentUser?.isManager) subscribeToPush(currentUser.id, pin) }} onLock={() => { setManagerAuthed(false); setManagerSessionPin(null) }}
            onSyncSquare={handleSyncSquare} squareSyncing={squareSyncing} squareSyncMessage={squareSyncMessage}
            onSetPin={handleSetPin}
            meId={currentUser?.id ?? null} stats={stats} items={items} onGoToStock={() => setMainTab('stocktake')}
            roster={roster} loadingRoster={loadingRoster} onLoadRoster={handleLoadRoster}
          />
        ) : mainTab === 'team' ? (
          <TeamView
            team={team} onUpdateTeamMember={handleUpdateTeamMember} onClockToggle={handleClockToggle}
            meId={currentUser?.id ?? null}
            roster={roster} loadingRoster={loadingRoster} onLoadRoster={handleLoadRoster}
            deepLink={teamDeepLink} onDeepLinkConsumed={() => setTeamDeepLink(null)}
            onTrainingCompletionChanged={() => refreshTrainingReminder()}
            managerPin={managerSessionPin}
          />
        ) : mainTab === 'music' ? (
          <MusicView />
        ) : mainTab === 'overview' ? (
          currentUser?.isManager ? (
            <ManagerOverviewLanding items={items} onGoToStock={() => setMainTab('stocktake')} />
          ) : currentUser ? (
            <StaffOverviewLanding
              me={currentUser}
              roster={roster} loadingRoster={loadingRoster} onLoadRoster={handleLoadRoster}
              onGoToTeam={target => { setTeamDeepLink(target); setMainTab('team') }}
            />
          ) : null
        ) : (
          <>
            {/* Stat cards */}
            <div className="stat-grid">
              {STAT_CARDS.map(s => {
                const isActive = statusFilter === s.filter
                return (
                  <button key={s.label} onClick={() => setStatusFilter(isActive ? null : s.filter)}
                    style={{ ...(s.dark ? glassDark : glass), borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', border: isActive && !s.dark ? '1.5px solid rgba(0,0,0,0.5)' : s.dark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(255,255,255,0.85)', transform: isActive ? 'scale(0.97)' : 'scale(1)', outline: 'none', width: '100%' }}>
                    <div style={mono({ fontSize: 26, fontWeight: 300, color: s.dark ? '#fff' : '#000', lineHeight: 1 })}>{s.value.toString().padStart(2, '0')}</div>
                    <div style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)', marginTop: 6 })}>{s.label}</div>
                    {isActive && <div style={mono({ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: s.dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', marginTop: 4 })}>Filtering ✕</div>}
                  </button>
                )
              })}
            </div>

            {/* Search bar */}
            <div style={{ ...glass, borderRadius: 14, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(0,0,0,0.3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input type="text" aria-label="Search stock items" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, color: '#000', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {statusFilter && (
                <button onClick={() => setStatusFilter(null)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.2)', background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.5)' }}>
                  Clear Filter ✕
                </button>
              )}
            </div>

            {/* Category tabs */}
            <div style={{ position: 'relative', marginBottom: 20 }}>
              <div ref={catScrollRef} style={{ ...glass, borderRadius: 12, padding: '5px 6px', display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
                {allCategories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: 8, cursor: 'pointer', border: 'none', transition: 'all 0.2s', whiteSpace: 'nowrap', background: activeCategory === cat ? '#000' : 'transparent', color: activeCategory === cat ? '#fff' : 'rgba(0,0,0,0.45)', fontWeight: activeCategory === cat ? 500 : 400 }}>
                    {cat}
                  </button>
                ))}
              </div>
              <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, borderRadius: '0 12px 12px 0', background: 'linear-gradient(to right, transparent, rgba(232,232,232,0.85))', pointerEvents: 'none' }} />
            </div>

            {/* Items list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.length === 0
                ? <div style={{ ...glass, borderRadius: 16, padding: '48px 24px', textAlign: 'center', ...mono({ fontSize: 12, color: 'rgba(0,0,0,0.35)' }) }}>No items match</div>
                : filtered.map(item => {
                    const status = getStatus(item.qty, item.par)
                    const statusLabel = { ok: 'OK', low: 'LOW', out: 'OUT' }[status]
                    const dotOpacity = { ok: 1, low: 0.5, out: 0.25 }[status]
                    const badgeColor = { ok: 'rgba(0,0,0,0.45)', low: 'rgba(0,0,0,0.55)', out: '#000' }[status]
                    const isEditing = editItemId === item.id

                    return (
                      <div key={item.id} style={{ ...glass, borderRadius: 14, overflow: 'hidden', transition: 'box-shadow 0.2s' }}>

                        {/* Item row: name+bar | PAR | counter | status | edit */}
                        <div className="items-row">

                          {/* Name + category + bar — grows */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                              <span style={{ width: 6, height: 6, borderRadius: 99, background: '#000', opacity: dotOpacity, flexShrink: 0, display: 'inline-block' }} />
                              <span style={{ fontSize: 14, fontWeight: 500, color: '#000', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                            </div>
                            <div style={{ paddingLeft: 13, marginBottom: 7 }}>
                              <span style={mono({ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)' })}>{item.category}</span>
                            </div>
                            <div style={{ paddingLeft: 13 }}><QtyBar qty={item.qty} par={item.par} /></div>
                          </div>

                          {/* PAR — fixed 40px, vertically centered to match the 32px control row */}
                          <div style={{ width: 40, flexShrink: 0, textAlign: 'right', height: 32, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={mono({ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.4)', lineHeight: 1 })}>{item.par}</div>
                            <div style={mono({ fontSize: 8, letterSpacing: '0.1em', color: 'rgba(0,0,0,0.22)', textTransform: 'uppercase', marginTop: 3 })}>par</div>
                          </div>

                          {/* Counter — fixed width, never wraps */}
                          <div style={{ flexShrink: 0 }}>
                            <Counter value={item.qty} onChange={v => handleSetQty(item.id, v)} unit={item.unit} />
                          </div>

                          {/* Status badge — fixed 40px, same 32px height as counter/edit for a level row */}
                          <div style={{ width: 40, flexShrink: 0, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 8px', height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid rgba(0,0,0,${status === 'out' ? 0.35 : 0.12})`, borderRadius: 8, color: badgeColor, background: status === 'out' ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.03)', whiteSpace: 'nowrap' }}>
                              {statusLabel}
                            </span>
                          </div>

                          {/* Edit toggle — fixed 32×32, level with the counter row */}
                          <button
                            onClick={() => setEditItemId(isEditing ? null : item.id)}
                            aria-label={`${isEditing ? 'Close editor for' : 'Edit'} ${item.name}`} title={isEditing ? 'Close' : 'Edit'}
                            style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, padding: 0, boxSizing: 'border-box', flexShrink: 0, borderRadius: 8, border: `1px solid ${isEditing ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.12)'}`, background: isEditing ? '#000' : 'rgba(0,0,0,0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isEditing ? '#fff' : 'rgba(0,0,0,0.4)', transition: 'all 0.15s' }}
                          >
                            {isEditing
                              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            }
                          </button>
                        </div>

                        {/* Inline edit drawer */}
                        {isEditing && (
                          <ItemEditDrawer
                            item={item}
                            categories={categories.map(c => c.name)}
                            onSave={patch => { handleUpdateItem(item.id, patch); setEditItemId(null) }}
                            onDelete={() => handleDeleteItem(item.id)}
                            onCancel={() => setEditItemId(null)}
                          />
                        )}
                      </div>
                    )
                  })
              }
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, ...mono({ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(0,0,0,0.25)', textTransform: 'uppercase' }) }}>
              <span>{filtered.length} of {items.length} items</span>
              <span>Changes sync automatically</span>
            </div>
          </>
        )}
      </div>

      {showAddModal && <AddItemModal categories={categoryNames} onAdd={item => { handleAddItem(item); setShowAddModal(false) }} onClose={() => setShowAddModal(false)} />}
      {showChat && currentUser && <ChatPanel team={team} currentUser={currentUser} onClose={() => setShowChat(false)} />}

    </div>
  )
}

// Isolated, interactive review surface. It mounts only the three new panels,
// so a Netlify sample preview cannot reach existing live data integrations.
export function FeaturePreviewApp() {
  const [tab, setTab] = useState<'clock' | 'reviews' | 'location'>('clock')
  const [sampleStaff, setSampleStaff] = useState<TeamMember>({ id: 2, name: 'Sample Staff', role: 'Team Member', avatar: 'SS', clockedIn: true, clockIn: '10:00 am' })
  const sampleNotifications = useMemo<AppNotification[]>(() => [
    { id: 3, title: 'Stocktake reminder', body: "Please make sure tonight's stocktake, money count, and closing checklist are done before you clock off.", kind: 'reminder', created_at: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString() },
    { id: 2, title: 'Roster update', body: 'Your sample roster has been updated. Check the details before your next shift.', kind: 'roster', created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() },
    { id: 1, title: 'Team notice', body: 'This is sample notification content for checking the menu size and placement on your phone.', kind: 'notice', created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() },
  ], [])
  async function toggleSampleClock() {
    setSampleStaff(v => ({ ...v, clockedIn: !v.clockedIn, clockIn: v.clockedIn ? undefined : formatClock12(new Date()) }))
    return true
  }
  return <div style={{ minHeight: '100dvh', padding: '72px max(18px, 4vw) 64px', background: 'radial-gradient(circle at 20% 20%, #fff 0, #e9e9e9 50%, #d0d0d0 100%)', fontFamily: 'Outfit, sans-serif' }}>
    <div className="draft-banner" role="status">DRAFT PREVIEW · Sample data only · No live timecards or settings can change here</div>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={mono({ fontSize: 11, letterSpacing: '0.2em', color: 'rgba(0,0,0,0.45)', marginBottom: 8 })}>TROPICOOL TREATS</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}><div style={{ fontSize: 30, fontWeight: 650 }}>Clock-out and location review</div><NotificationBell sampleNotifications={sampleNotifications} /></div>
      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', marginBottom: 22 }}>Try the staff phone-reminder setup, manager review, and 200 m location switch. This page uses sample data.</div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 24 }}>
        {([{ key: 'clock', label: 'Staff clock' }, { key: 'reviews', label: 'Clock-out reviews' }, { key: 'location', label: 'Geolocation' }] as const).map(item =>
          <button key={item.key} type="button" onClick={() => setTab(item.key)} style={{ padding: '10px 15px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.7)', background: tab === item.key ? '#000' : 'rgba(255,255,255,0.65)', color: tab === item.key ? '#fff' : '#000', cursor: 'pointer' }}>{item.label}</button>
        )}
      </div>
      {tab === 'clock' && <div style={{ maxWidth: 560 }}><ClockSection me={sampleStaff} onClockToggle={toggleSampleClock} /></div>}
      {tab === 'reviews' && <ManagerClockoutReviewsSection sessionPin="0000" managerTeamId={1} />}
      {tab === 'location' && <ManagerLocationSection sessionPin="0000" />}
    </div>
  </div>
}
