import { supabase } from './supabase.js'
import { viewSession } from './viewSession.js'
import { read, write } from '../lib/memory/guestMemory.js'

// Напоминание «Когда удобно учиться?» (PLAN_NEW_USER.md → A3). В аккаунте —
// RPC set_remind_time и колонки user_profiles.remind_at / remind_enabled
// (миграция 20261027120000_remind_time.sql): местное время сервер хранит вместе с
// поясом устройства и сам считает следующий момент пуша. Гостю пуш слать не на
// что — его выбор лежит в localStorage (перенос в аккаунт при входе — отдельная задача).

export const REMIND_KEY = 'pithy_remind_v1'

const pad = n => String(n).padStart(2, '0')
const valid = (hh, mm) => Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && hh < 24 && mm >= 0 && mm < 60

// Выбрать время: { hh, mm, enabled }. enabled=false — «Не нужно, загляну сам»
// (hh/mm можно не передавать, сохранённое время остаётся).
// Аккаунт: { ok: true, next_remind_at } | { ok: true, needs_tz: true } | { ok: false, reason } | null (ошибка сети/RPC).
// Гость: { ok: true, guest: true }
export async function setRemindTime({ hh, mm, enabled = true }) {
  const hasTime = hh != null && mm != null
  if (hasTime && !valid(hh, mm)) return { ok: false, reason: 'bad_time' }
  if (enabled && !hasTime) return { ok: false, reason: 'no_time' }
  if (!(await viewSession())?.user) {
    const prev = read(REMIND_KEY, null)
    write(REMIND_KEY, hasTime ? { hh, mm, enabled } : { hh: prev?.hh ?? null, mm: prev?.mm ?? null, enabled })
    return { ok: true, guest: true }
  }
  const { data, error } = await supabase.rpc('set_remind_time', {
    p_remind_at: hasTime ? `${pad(hh)}:${pad(mm)}` : null,
    p_enabled: !!enabled,
  })
  if (error) { console.error('[REMIND] set_remind_time:', error.message); return null }
  return data ?? null
}

// Текущий выбор: { hh, mm, enabled } | null (ещё не выбирал или не удалось узнать)
export async function getRemindTime() {
  const session = await viewSession()
  if (!session?.user) {
    const g = read(REMIND_KEY, null)
    return g && g.hh != null ? { hh: g.hh, mm: g.mm, enabled: !!g.enabled } : null
  }
  const { data, error } = await supabase.from('user_profiles')
    .select('remind_at, remind_enabled').eq('id', session.user.id).maybeSingle()
  if (error) { console.error('[REMIND] профиль:', error.message); return null }
  const m = /^(\d{2}):(\d{2})/.exec(data?.remind_at ?? '')
  return m ? { hh: Number(m[1]), mm: Number(m[2]), enabled: !!data.remind_enabled } : null
}
