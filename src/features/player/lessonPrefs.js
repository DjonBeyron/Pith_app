import { useSyncExternalStore } from 'react'
import { setSoundFilter } from '../../shared/lib/sounds.js'

// Личные настройки из шестерёнки в шапке урока (LessonSettingsMenu.jsx).
// Общие для всех уроков и приложения, хранятся в localStorage устройства.
//
// Для всех (по умолчанию всё ВКЛЮЧЕНО):
//   typing — звук «учитель печатает» (typing-1 / typing-2);
//   xp     — звук получения XP (xp-gain: в уроке и каждый шарик в итогах);
//   equalizer — свечение-эквалайзер снизу чата (AudioGlow).
// Только для админа:
//   hud — датчик fps и штамп версии поверх урока.
//
// «Выкл» гасит ТОЛЬКО вывод: звук не играет / свечение не рисуется. Анимации и
// тайминги (точки печатанья, шарики XP, XpFloat) идут как обычно.
//
// Чистое состояние без React + useSyncExternalStore, как lessonVolume.js.
// Фильтр звуков регистрируется в sounds.js при загрузке модуля (shared/lib
// фичи не импортирует) — поэтому модуль подключён из app/App.jsx.
export const PREF_KEYS = {
  typing:    'pithy_pref_typing_sound',
  xp:        'pithy_pref_xp_sound',
  equalizer: 'pithy_pref_equalizer',
  hud:       'pithy_lesson_hud',
}

// Какой звук какой настройкой отключается; остальные звуки пользователь не
// отключает (ответы, сообщения, уровень, закреп)
export const SOUND_PREF = {
  'typing-1': 'typing',
  'typing-2': 'typing',
  'xp-gain':  'xp',
}

function readStore(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, value) } catch { /* приватный режим / нет storage */ }
}

// Записано '0' — выключено; нет записи, мусор, ошибка storage — включено
const prefs = {}
for (const name of Object.keys(PREF_KEYS)) prefs[name] = readStore(PREF_KEYS[name]) !== '0'

const listeners = new Set()
function emit() { listeners.forEach(fn => fn()) }

export function subscribeLessonPrefs(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getPref(name) { return prefs[name] !== false }
export function setPref(name, value) {
  if (!(name in PREF_KEYS)) return
  const next = !!value
  if (next === prefs[name]) return
  prefs[name] = next
  writeStore(PREF_KEYS[name], next ? '1' : '0')
  emit()
}

export function usePref(name) {
  return useSyncExternalStore(subscribeLessonPrefs, () => getPref(name), () => true)
}

// Принудительное включение эквалайзера модулем (счётчик: модулей может быть несколько). «Сказать фразу» включает его на время
// попытки записи — свечение реагирует на голос ученика, даже если в шестерёнке эквалайзер выключен; сама настройка не меняется
// (в localStorage ничего не пишется) и снова действует, как только модуль отпустил (forceEqualizer() возвращает функцию-отпускание)
let forced = 0
export function forceEqualizer() {
  let released = false
  forced += 1
  emit()
  return () => {
    if (released) return
    released = true
    forced = Math.max(0, forced - 1)
    emit()
  }
}
export const isEqualizerForced = () => forced > 0

/** Чистое правило: свечение включено, если оно включено в шестерёнке ИЛИ его принудительно держит модуль */
export const equalizerOn = (pref, forcedCount) => !!pref || forcedCount > 0

export function useEqualizerEnabled() {
  const pref = usePref('equalizer')
  const isForced = useSyncExternalStore(subscribeLessonPrefs, isEqualizerForced, () => false)
  return equalizerOn(pref, isForced ? 1 : 0)
}

// Единственная точка решения «играть ли звук»: её регистрирует setSoundFilter,
// и playSound (sounds.js) молчит, если пользователь отключил этот звук
export function isSoundEnabledByUser(name) {
  const pref = SOUND_PREF[name]
  return !pref || getPref(pref)
}
setSoundFilter(isSoundEnabledByUser)

// Датчик fps и штамп версии в уроке. Переключатель — только у админа: ученик
// (и админ в «режиме пользователя», где isAdmin = false) видит их по прежним
// правилам — решает useShowDebugUi, а выключатель на них не влияет
export function hudVisible(isAdmin, hudOn) {
  return !isAdmin || !!hudOn
}
