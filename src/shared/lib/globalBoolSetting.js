import { useSyncExternalStore } from 'react'
import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'

// Фабрика глобального булева тумблера админки — одна на все «включено для
// всех уроков сразу» настройки (app_settings.<key> = {on}). Повторяет
// устройство useAudioStaticWaveform.js (зеркало в localStorage, чтобы первый
// кадр плеера рисовался раньше ответа сервера; запись — только после
// подтверждения сервера, иначе UPDATE, отсечённый RLS, выглядел бы успехом),
// но без копирования 70 строк под каждый новый флаг.
//
// makeGlobalBoolSetting({ key, ls }) → { prefetch, set, get, use }
export function makeGlobalBoolSetting({ key, ls }) {
  const readLs = () => { try { return localStorage.getItem(ls) === '1' } catch { return false } }
  const writeLs = on => {
    try { if (on) localStorage.setItem(ls, '1'); else localStorage.removeItem(ls) } catch { /* приватный режим */ }
  }
  let value = readLs()
  let loaded = false
  let inflight = null
  const subs = new Set()

  function apply(on) {
    writeLs(on)
    if (on === value) return
    value = on
    subs.forEach(fn => fn())
  }

  async function read() {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
    if (error) { dbg(`[DB ERROR] ${key} read`, error.message); return null }
    return !!data?.value?.on
  }

  async function save(on) {
    dbg('[DB WRITE] app_settings', key, on)
    const { data, error } = await supabase.from('app_settings')
      .upsert({ key, value: { on: !!on }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select('key')
    if (error) { dbg(`[DB ERROR] ${key} save`, error.message); throw error }
    if (!data?.length) throw new Error('Сохранение не применилось: сервер не подтвердил запись')
  }

  function prefetch() {
    if (loaded || inflight) return inflight
    inflight = read()
      .then(on => { loaded = true; if (on !== null) apply(on) })
      .catch(() => {})
      .finally(() => { inflight = null })
    return inflight
  }

  async function set(on) {
    await save(on)
    loaded = true
    apply(!!on)
  }

  const get = () => value
  const subscribe = fn => { subs.add(fn); return () => subs.delete(fn) }
  const use = () => useSyncExternalStore(subscribe, get, () => false)

  return { prefetch, set, get, use }
}
