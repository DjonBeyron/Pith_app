import { describe, it, expect } from 'vitest'
import { sandboxKey, isNewbieSim } from './newbieSim.js'

// Режим «новенький»: какие ключи localStorage уходят в песочницу (nb:), а какие общие
describe('режим «новенький»: песочница ключей', () => {
  it('прогресс и «уже видел» — в песочницу', () => {
    for (const k of ['pithy_memory_intro_v1', 'pithy_completed_v1', 'pithy_guest_memory_v1', 'pithy_xp', 'pithy_sound_v1', 'pithy_lesson_progress_abc']) {
      expect(sandboxKey(k)).toBe('nb:' + k)
    }
  })

  it('админка, отладка, настройки устройства и служебные — общие, не трогаются', () => {
    for (const k of [
      'pithy_newbie_sim_v1', 'pithy_user_mode_v1', 'pithy_admin_sub_v1', 'pithy_player_debug_ui_v1', 'pithy_debug',
      'pithy_weak_device_v6', 'pithy_motion_ok_v1', 'pithy_anon_id', 'pithy_events_queue', 'pithy_lazy_reload_foo',
    ]) expect(sandboxKey(k)).toBe(k)
  })

  it('чужие ключи (сессия Supabase и др.) не перенаправляются; без окна режим выключен', () => {
    expect(sandboxKey('sb-127-auth-token')).toBe('sb-127-auth-token')
    expect(sandboxKey(undefined)).toBe(undefined)
    expect(isNewbieSim()).toBe(false)
  })
})
