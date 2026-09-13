import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey as _anonKey } from '../../utils/supabase/info'

export const publicAnonKey = _anonKey

const g = globalThis as typeof globalThis & { __sb?: SupabaseClient }
if (!g.__sb) {
  g.__sb = createClient(
    `https://${projectId}.supabase.co`,
    _anonKey,
    {
      auth: { storageKey: `sb-${projectId}` },
      realtime: { params: { eventsPerSecond: 10 } },
    }
  )
}
export const supabase = g.__sb

// VITE_API_SLUG / VITE_API2_SLUG let a draft build point at a test edge
// function deployment instead of the live one, without touching production
// config — unset in normal builds, so behavior there is unchanged.
const API_SLUG = import.meta.env.VITE_API_SLUG || 'make-server-3ba8d4df'
const API2_SLUG = import.meta.env.VITE_API2_SLUG || 'make-server-3ba8d4df-2'
export const API = `https://${projectId}.supabase.co/functions/v1/${API_SLUG}`
export const API2 = `https://${projectId}.supabase.co/functions/v1/${API2_SLUG}`
