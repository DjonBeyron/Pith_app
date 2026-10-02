import { supabase } from './supabase.js'
import { isNewbieSim } from '../lib/newbieSim.js'

// Сессия «глазами приложения» — всё, что решает «гость или вошёл», спрашивает её, а не supabase.auth напрямую.
// Обычно это настоящая сессия; в режиме «новенький» (админка, newbieSim.js) — null: приложение ведёт себя как
// у гостя, но сама сессия Supabase остаётся жива, и админка работает. → session | null
export async function viewSession() {
  if (isNewbieSim()) return null
  return (await supabase.auth.getSession()).data.session
}
