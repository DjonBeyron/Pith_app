import { getAudioSettingsRows, saveAudioSettingRow, UI_SOUND_VOLUME_KEY, EQ_SENSITIVITY_KEY } from '../api/audioSettingsApi.js'
import { setSoundVolumes, VOLUME_MAX } from './soundVolume.js'

// Глобальные настройки звука для ВСЕХ пользователей (пишет админ, читают все;
// БД: app_settings.ui_sound_volume и app_settings.eq_sensitivity):
//  - громкость каждого звука интерфейса 0..VOLUME_MAX=3 (нет ключа = 1; выше 1 —
//    усиление через Web Audio, нужно тихо записанным typing-*/xp-gain) — применяется
//    в sounds.js через soundVolume.js. Звук печатанья — ОДИН ползунок админа, но в
//    базе два ключа (typing-1 и typing-2, оба ставятся одним значением);
//  - чувствительность свечения-эквалайзера eqSensitivity 0.3…3 (1 = как есть) —
//    читает features/player/audioLevel.js.
//
// Зеркало в localStorage (pithy_ui_sound_volume / pithy_eq_sensitivity), как у
// usePlayerDebugUi.js: значение с прошлого сеанса даёт верный старт, пока ответ
// сети не пришёл; пришедший ответ молча уточняет его. Без строки в базе (миграция
// не применена) клиент работает на значениях по умолчанию; админу upsert сам
// создаст строку.

const LS_VOL = 'pithy_ui_sound_volume'
const LS_EQ = 'pithy_eq_sensitivity'
export const EQ_MIN = 0.3
export const EQ_MAX = 3
export const EQ_DEFAULT = 1

const clamp = (v, lo, hi) => (v > hi ? hi : v < lo ? lo : v)
const round2 = v => Math.round(v * 100) / 100

function cleanVolumes(raw) {
  const out = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number' && Number.isFinite(v) && v !== 1) out[k] = round2(clamp(v, 0, VOLUME_MAX))
    }
  }
  return out
}

function cleanEq(raw) {
  const v = typeof raw === 'object' && raw ? raw.value : raw
  return typeof v === 'number' && Number.isFinite(v) ? round2(clamp(v, EQ_MIN, EQ_MAX)) : EQ_DEFAULT
}

function readLs(key) {
  try { const s = localStorage.getItem(key); return s == null ? null : JSON.parse(s) } catch { return null }
}
function writeLs(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* приватный режим — сервер источник правды */ }
}

let state = { volumes: cleanVolumes(readLs(LS_VOL)), eq: cleanEq(readLs(LS_EQ)) }
setSoundVolumes(state.volumes)
let loaded = false          // ответ сервера в этом сеансе получен
let inflight = null
let dirty = false           // админ правит прямо сейчас — ответ сети его не затирает
const subs = new Set()

function commit(next) {
  state = { ...state, ...next }
  if (next.volumes) { setSoundVolumes(state.volumes); writeLs(LS_VOL, state.volumes) }
  if (next.eq !== undefined) writeLs(LS_EQ, state.eq)
  subs.forEach(fn => fn())
}

export const getAudioSettings = () => state
export const getEqSensitivity = () => state.eq
export function subscribeAudioSettings(fn) { subs.add(fn); return () => { subs.delete(fn) } }

// Прогрев на старте приложения: один запрос на оба ключа. Ошибку не бросает
export function prefetchAudioSettings() {
  if (loaded || inflight) return inflight
  inflight = getAudioSettingsRows()
    .then(rows => {
      if (!rows || dirty) return            // запрос не удался — зеркало не трогаем
      loaded = true
      const volumes = cleanVolumes(rows.volumes)
      const eq = cleanEq(rows.eq)
      if (JSON.stringify(volumes) !== JSON.stringify(state.volumes) || eq !== state.eq) commit({ volumes, eq })
    })
    .catch(() => {})
    .finally(() => { inflight = null })
  return inflight
}

// Локальные правки (применяются сразу); в базу уходит отдельно — save*()
// name — имя звука или массив имён (один ползунок на несколько файлов — «печатает»)
export function setUiSoundVolume(name, value) {
  dirty = true
  const volumes = { ...state.volumes }
  const v = round2(clamp(Number(value), 0, VOLUME_MAX))
  for (const n of Array.isArray(name) ? name : [name]) {
    if (v === 1 || !Number.isFinite(v)) delete volumes[n]
    else volumes[n] = v
  }
  commit({ volumes })
}
export function resetUiSoundVolumes() { dirty = true; commit({ volumes: {} }) }
export function setEqSensitivity(value) {
  dirty = true
  commit({ eq: cleanEq(Number(value)) })
}

// Запись в базу (RLS: только админ); бросает, если сервер не подтвердил
export async function saveUiSoundVolumes() {
  await saveAudioSettingRow(UI_SOUND_VOLUME_KEY, state.volumes)
  dirty = false
  loaded = true
}
export async function saveEqSensitivity() {
  await saveAudioSettingRow(EQ_SENSITIVITY_KEY, { value: state.eq })
  dirty = false
  loaded = true
}

// Только для тестов
export function _resetAudioSettingsForTests() {
  state = { volumes: {}, eq: EQ_DEFAULT }; loaded = false; inflight = null; dirty = false; setSoundVolumes({})
}
