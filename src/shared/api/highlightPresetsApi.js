import { supabase } from './supabase.js'

const PRESET_ID = 'global'

export async function loadFavoriteColors() {
  const { data, error } = await supabase
    .from('highlight_color_presets')
    .select('colors')
    .eq('id', PRESET_ID)
    .maybeSingle()
  if (error) return []
  return data?.colors ?? []
}

export async function saveFavoriteColors(colors) {
  await supabase
    .from('highlight_color_presets')
    .upsert({ id: PRESET_ID, colors })
}
