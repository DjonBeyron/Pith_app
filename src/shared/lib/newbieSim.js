// Режим «новенький» (админка → переключатель): админ видит приложение так, как увидит его человек,
// впервые открывший его, — без удаления данных. Выключил — всё твоё на месте.
//
// Как устроено (две части, обе обратимы):
//  1. Локальная «песочница». Пока режим включён, все ключи localStorage, которые начинаются с pithy_
//     (подсказки и знакомства «уже видел», локальный прогресс, память гостя, настройки интерфейса), читаются и пишутся
//     под приставкой nb: — приложение видит чистое хранилище. Настоящие ключи не трогаются.
//     Не перенаправляются: сам флаг, режим пользователя, вкладка админки, отладочные и устройственные
//     настройки (SHARED) — их «новенький» не сбрасывает.
//  2. «Взгляд гостя». Приложение считает, что вход не выполнен: профиль пуст (XP, уровень), пройденных
//     уроков, памяти слов, фраз и закладок нет (viewSession.js, useAuth, getProfile). Сессия Supabase остаётся
//     жива — админка по-прежнему работает, а выключение режима возвращает всё как было.
// Прогресс «новенького» копится отдельно — в песочнице; при каждом включении она начинается с нуля.
// Переключение перезагружает страницу: песочница подключается один раз при старте (newbieBoot.js).
const FLAG = 'pithy_newbie_sim_v1'
const NB = 'nb:'

// Эти ключи живут одни на всех: админский интерфейс, отладка, настройки устройства и служебные охранники
const SHARED = new Set([
  FLAG, 'pithy_user_mode_v1', 'pithy_admin_sub_v1',
  'pithy_player_debug_ui_v1', 'pithy_audio_static_waveform_v1', 'pithy_word_choice_voice_v1', 'pithy_debug', 'pithy_perf_flags',
  'pithy_weak_device_v5', 'pithy_motion_ok_v1',
  'pithy_anon_id', 'pithy_events_queue', 'pithy_login_guard_v1',
  'pithy_last_edited_lesson', 'pithy_last_editor_mode', 'pithy_table_templates',
])
const SHARED_PREFIX = ['pithy_lazy_reload_']

// Настоящее хранилище — до того, как песочница подменит методы
const real = (() => {
  try {
    const s = window.localStorage
    return { get: s.getItem.bind(s), set: s.setItem.bind(s), remove: s.removeItem.bind(s), key: s.key.bind(s), size: () => s.length }
  } catch { return null }
})()

// Включён ли режим — читаем настоящий флаг (он в SHARED, песочница его не подменяет)
export function isNewbieSim() {
  try { return real?.get(FLAG) === '1' } catch { return false }
}

// Ключ → ключ в песочнице (или тот же, если он общий)
export function sandboxKey(k) {
  if (typeof k !== 'string' || !k.startsWith('pithy_') || SHARED.has(k) || SHARED_PREFIX.some(p => k.startsWith(p))) return k
  return NB + k
}

// Подключить песочницу — один раз при старте, до чтения хранилища приложением. Только если режим включён
let installed = false
export function installNewbieSandbox() {
  if (installed || !real || !isNewbieSim()) return
  installed = true
  const proto = Object.getPrototypeOf(window.localStorage)
  const { getItem, setItem, removeItem } = proto
  const mine = self => self === window.localStorage
  proto.getItem = function (k) { return getItem.call(this, mine(this) ? sandboxKey(k) : k) }
  proto.setItem = function (k, v) { return setItem.call(this, mine(this) ? sandboxKey(k) : k, v) }
  proto.removeItem = function (k) { return removeItem.call(this, mine(this) ? sandboxKey(k) : k) }
}

// Очистить песочницу — чтобы «новенький» начинался с чистого листа (при включении и выключении)
function clearSandbox() {
  if (!real) return
  const keys = []
  for (let i = 0; i < real.size(); i++) {
    const k = real.key(i)
    if (k?.startsWith(NB)) keys.push(k)
  }
  keys.forEach(k => real.remove(k))
}

// Включить/выключить и перезагрузить страницу: песочница подключается только на старте
export function setNewbieSim(on) {
  if (!real) return
  clearSandbox()
  if (on) real.set(FLAG, '1')
  else real.remove(FLAG)
  window.location.reload()
}
