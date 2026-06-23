import { supabase } from './supabase.js'
import { pLog } from '../lib/debug.js'

const PRESET_ID = 'global'

export async function loadFavoriteColors() {
  const { data, error } = await supabase
    .from('highlight_color_presets')
    .select('colors')
    .eq('id', PRESET_ID)
    .single()
  if (error) { pLog('[ColorPresets] load error:', error.message); return [] }
  pLog('[ColorPresets] loaded:', data?.colors)
  return data?.colors ?? []
}

export async function saveFavoriteColors(colors) {
  const { error } = await supabase
    .from('highlight_color_presets')
    .upsert({ id: PRESET_ID, colors })
  if (error) pLog('[ColorPresets] save error:', error.message)
  else pLog('[ColorPresets] saved:', colors)
}
