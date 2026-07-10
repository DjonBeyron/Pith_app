import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// ── Золотые билеты: клиентский API ──
// Выдача — после прохождения Финала модуля (award_module_ticket),
// списание — при входе в супер-урок гонки (start_race). Балансом
// владеет только сервер (user_profiles.tickets), клиент читает его
// через getProfile.

// Выдать билет за Финал модуля. Возвращает jsonb сервера:
// { ok, tickets?, clean, reason?: 'hints' | 'already' | 'final_not_done' | ... }.
// clean=true — прохождение без единой подсказки (достижение «Чистый финал»).
export async function awardModuleTicket(moduleId, hints) {
  const { data, error } = await supabase.rpc('award_module_ticket', {
    p_module_id: moduleId, p_hints: hints,
  })
  if (error) { console.error('[TICKET] award_module_ticket:', error.message); return null }
  dbg('[TICKET] award(модуль', moduleId, ', подсказок', hints, ') →', data)
  return data ?? null
}

// Вход в супер-урок гонки: сервер списывает 1 билет (повторный вход в ту же
// гонку — бесплатно, админ — бесплатно). { ok, tickets?, already?, reason? }.
export async function startRace(raceId) {
  const { data, error } = await supabase.rpc('start_race', { p_race_id: raceId })
  if (error) { console.error('[TICKET] start_race:', error.message); return { ok: false, reason: error.message } }
  dbg('[TICKET] start_race →', data)
  return data ?? { ok: false }
}

// Потрачен ли мой билет на эту гонку (race_ticket_spends, RLS — своя строка).
// true — вход уже оплачен: попап-шлагбаум пускает без билета.
export async function fetchMyRaceSpend(raceId) {
  const { data, error } = await supabase
    .from('race_ticket_spends').select('race_id')
    .eq('race_id', raceId).maybeSingle()
  if (error) { console.error('[TICKET] fetchMyRaceSpend:', error.message); return false }
  dbg('[TICKET] билет на гонку', raceId, data ? 'уже потрачен' : 'не тратился')
  return !!data
}
