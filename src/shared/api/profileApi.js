import { supabase } from './supabase.js'
import { getLocalXp, clearLocalXp } from '../lib/localProfile.js'

export async function getProfile() {
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .select('xp, energy, has_subscription, is_admin')
    .eq('id', user.id)
    .single()

  if (error) return null
  return data
}

export async function addXp(amount) {
  if (!amount) return

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return

  const { error } = await supabase.rpc('add_xp', { amount })
  if (error) console.error('[XP] addXp RPC error:', error.message)
}

export async function syncLocalXpToServer() {
  const localXp = getLocalXp()
  if (!localXp) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await addXp(localXp)
  clearLocalXp()
}
