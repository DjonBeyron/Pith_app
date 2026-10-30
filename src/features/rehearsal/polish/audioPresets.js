// «Режим звука» для запуска этапов («Шлифовка репетиции», Админ → «Голос»): хрип голоса Пита на iPhone без наушников — голосовая обработка iOS при открытом микрофоне. Три рычага уже есть отдельными настройками
// (gameAudioSettings.js: тип аудиосессии и дорожка микрофона на речь Пита; gameMic.js: обработка микрофона системой); здесь они собраны в восемь пресетов A…H, чтобы пройти все режимы подряд и прислать журнал.
// Выбор хранится в localStorage (PRESET_KEY) и применяется ПЕРЕД запуском этапа, в том же тапе (applySelected); настройки в игре (HUD ⚙, окно 💬) можно менять и дальше — тогда пресет «custom».
// Чистые функции: хранилище, запись в журнал и чтение настроек подставляются в тестах.
import { readAudioSessionMode, readMicHoldMode, writeAudioSessionMode, writeMicHoldMode } from '../../../shared/lib/gameAudioSettings.js'
import { isMicProcessingOn, setMicProcessingOn } from '../../../shared/lib/gameMic.js'
import { pLog } from '../../../shared/lib/debug.js'

export const PRESET_KEY = 'pithy_rh_audio_preset_v1'
export const CUSTOM = 'custom'
export const DEFAULT_PRESET = 'A'

const P = (id, title, session, hold, processing) => ({ id, title, session, hold, processing })
/** id, подпись, тип аудиосессии, дорожка микрофона на речь Пита, обработка микрофона системой (эхо/шум) */
export const AUDIO_PRESETS = [
  P('A', 'Запись+воспр., не глушить, обработка выкл', 'play-and-record', 'none', false),
  P('B', 'Запись+воспр., выключать дорожку на речь Пита', 'play-and-record', 'enabled-false', false),
  P('C', 'Запись+воспр., закрывать микрофон на речь Пита', 'play-and-record', 'close', false),
  P('D', 'Авто-сессия, не глушить', 'auto', 'none', false),
  P('E', 'По фазам, не глушить', 'phases', 'none', false),
  P('F', 'По фазам, закрывать микрофон', 'phases', 'close', false),
  P('G', 'Обработка микрофона системой ВКЛ, не глушить', 'play-and-record', 'none', true),
  P('H', 'Обработка ВКЛ, закрывать микрофон', 'play-and-record', 'close', true),
]
export const PRESET_IDS = AUDIO_PRESETS.map(p => p.id)
export const presetById = id => AUDIO_PRESETS.find(p => p.id === id) ?? null

/** Что внутри пресета тремя значениями настроек: «сессия play-and-record · дорожка close · обработка выкл» */
export const presetInner = p => (p ? `сессия ${p.session} · дорожка ${p.hold} · обработка ${p.processing ? 'ВКЛ' : 'выкл'}` : '')

/** Какому пресету соответствуют три настройки ({ session, hold, processing }); никакому — 'custom' */
export function presetIdOf({ session, hold, processing } = {}) {
  return AUDIO_PRESETS.find(p => p.session === session && p.hold === hold && p.processing === !!processing)?.id ?? CUSTOM
}

/** Пресет, соответствующий настройкам браузера сейчас (или 'custom') */
export function currentPresetId(store = globalThis.localStorage) {
  return presetIdOf({ session: readAudioSessionMode(store), hold: readMicHoldMode(store), processing: isMicProcessingOn(store) })
}

/** Записать три настройки пресета. → пресет или null (незнакомый id — ничего не меняет) */
export function applyPreset(id, store = globalThis.localStorage) {
  const p = presetById(id)
  if (!p) return null
  writeAudioSessionMode(p.session, store); writeMicHoldMode(p.hold, store); setMicProcessingOn(p.processing, store)
  return p
}

/** Подпись для людей: «C — Запись+воспр., закрывать микрофон на речь Пита»; custom — «свой набор (настройки изменены вручную)» */
export function describePreset(id) {
  const p = presetById(id)
  return p ? `${p.id} — ${p.title}` : 'свой набор (настройки изменены вручную)'
}

/** Выбранный для запуска пресет; нет записи / мусор — A */
export function readSelectedPreset(store = globalThis.localStorage) {
  try { const v = store?.getItem(PRESET_KEY); return presetById(v) ? v : DEFAULT_PRESET } catch { return DEFAULT_PRESET }
}
export function writeSelectedPreset(id, store = globalThis.localStorage) {
  if (!presetById(id)) return
  try { store?.setItem(PRESET_KEY, id) } catch { /* приватный режим — живёт до перезагрузки */ }
}

/** Применить выбранный пресет перед запуском этапа и записать в журнал плеера. → { id, preset, line } */
export function applySelected({ store = globalThis.localStorage, log = pLog } = {}) {
  const id = readSelectedPreset(store)
  const preset = applyPreset(id, store)
  const line = `[audio-mode] пресет ${id}: ${preset.title} (${presetInner(preset)})`
  try { log(line) } catch { /* журнал недоступен — режим всё равно применён */ }
  return { id, preset, line }
}

/**
 * Режим звука для экспорта: { id (какому пресету соответствуют настройки), launched (пресет, с которым запускали), title, custom, line }.
 * launched — подставить, если пресет запуска уже прочитан. game — описание микрофона игры из журнала (dump.mic.game: audioSessionMode, micHoldMode, processing) — настройки на момент выгрузки; нет — берём из браузера сейчас
 */
export function audioModeInfo({ game = null, store = globalThis.localStorage, launched: given = null } = {}) {
  const fromGame = game && game.audioSessionMode != null
  const id = fromGame ? presetIdOf({ session: game.audioSessionMode, hold: game.micHoldMode, processing: game.processing }) : currentPresetId(store)
  const launched = presetById(given) ? given : readSelectedPreset(store)
  const custom = id === CUSTOM
  const line = custom ? `${describePreset(CUSTOM)}; запускали в режиме ${describePreset(launched)}` : describePreset(id)
  return { id, launched, title: presetById(id)?.title ?? describePreset(CUSTOM), custom, line }
}
