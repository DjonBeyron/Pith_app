import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[supabase] Missing env vars.\n' +
    'Create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n' +
    'On Vercel: Settings → Environment Variables.'
  )
}

export const supabase = createClient(
  supabaseUrl  ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder'
)
