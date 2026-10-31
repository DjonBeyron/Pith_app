// Мини-HUD настроек в игре «Повтори за диктором» (WordLaneHud.jsx): чистая часть — ключи, чтение и запись настроек, строки «что сейчас». Ничего из React здесь нет, поэтому проверяется тестами.
// Где что применяется (HUD помечает это у каждого пункта): сразу — безопасные слои пилюль (класс wl--safe на корне игры), звук и громкость награды, глушение дорожки (читается на каждом окне речи),
// тип аудиосессии (переприменяется на лету); «после «Игра заново»» — обработка микрофона (поток открывается заново) и скорость голоса (план диктора строится на старте); «после перезагрузки» — lite (решение
// isWeakDevice считается один раз при загрузке страницы).
import { writeAudioSessionMode } from '../../../../shared/lib/gameAudioSettings.js'
import { gameAudioSession } from '../../../../shared/lib/gameMicSession.js'
import { getWhiskerMode } from '../../../scene/v2/whiskerWrite.js'

export const PILL_SAFE_KEY = 'pithy_wl_pill_safe_v1' // '1' — «безопасные слои» пилюль iOS; читает движок пилюль, здесь только пишем и ставим класс wl--safe
export const WEAK_KEY = 'pithy_weak_device_v6'       // решение deviceTier: '1' слабое (lite), '0' обычное
export const TAP_KEY = 'pithy_wl_tap_v1'              // '1' — «тап вместо речи» (админ, проверка механики и анимаций): тап по дорожке в очереди ученика = следующая цель сказана; Vosk при этом слушает как обычно

const read = (key, store) => { try { return store?.getItem(key) ?? null } catch { return null } }
const write = (key, value, store) => { try { if (value == null) store?.removeItem(key); else store?.setItem(key, value) } catch { /* приватный режим — живёт до перезагрузки */ } }

export const readPillSafe = (store = globalThis.localStorage) => read(PILL_SAFE_KEY, store) === '1'
export const writePillSafe = (on, store = globalThis.localStorage) => write(PILL_SAFE_KEY, on ? '1' : null, store)
export const readTapMode = (store = globalThis.localStorage) => read(TAP_KEY, store) === '1'
export const writeTapMode = (on, store = globalThis.localStorage) => write(TAP_KEY, on ? '1' : null, store)
/** Класс на корне игры (.wl): ставит и снимает сам HUD, минуя React, чтобы пилюли и кот не перерисовывались */
export function applyPillSafe(root, on) { root?.classList?.toggle('wl--safe', !!on) }

/** Что записано в pithy_weak_device_v6: true (lite) | false | null (не определено) */
export const readWeakStored = (store = globalThis.localStorage) => { const v = read(WEAK_KEY, store); return v === '1' ? true : v === '0' ? false : null }
export const writeWeakStored = (on, store = globalThis.localStorage) => write(WEAK_KEY, on ? '1' : '0', store)

/** Тип аудиосессии: записать настройку и сразу применить к идущей игре (вернуть прежний тип и поставить новый по настройке) */
export function applyAudioSessionMode(mode, session = gameAudioSession, store = globalThis.localStorage) {
  writeAudioSessionMode(mode, store)
  if (session.active) { session.end(); session.begin() }
}

const yn = v => (v ? 'да' : 'нет')

/** Строка про дорожки игрового микрофона: «live» / «live, muted» / «не открыт» */
export function micLine(info) {
  const tracks = info?.tracks
  if (!info?.open || !tracks?.length) return 'не открыт'
  return tracks.map(t => `${t.readyState}${t.muted ? ', muted' : ''}${t.enabled ? '' : ', выключена'}`).join('; ')
}

/** Строка про Vosk из voskRuntime.snapshot(): готов / грузится / пауза после сбоя / нет модели */
export function voskLine(snap) {
  if (!snap) return '—'
  if (snap.loaded) return 'готов (модель в памяти)'
  if (snap.broken) return `сбой${snap.brokenWhy ? `: ${snap.brokenWhy}` : ''}`
  if (snap.loading) return `грузится (${snap.stage ?? '…'})`
  return snap.cached === false ? 'модели нет в кэше' : `не в памяти (${snap.stage ?? 'idle'})`
}

/** Текущие значения для шапки HUD: тип аудиосессии, дорожка, Vosk, версия, lite, способ записи угла усов. Всё читается заново при каждом вызове */
export function describeHud({ session = () => gameAudioSession.describe(), mic = () => null, vosk = () => null, weak = () => false, whiskers = getWhiskerMode, version = '' } = {}) {
  const safe = fn => { try { return fn() } catch { return null } }
  const s = safe(session)
  return {
    audioSession: s ? (s.supported ? (s.type ?? '—') : 'нет API') : '—',
    mic: micLine(safe(mic)),
    vosk: voskLine(safe(vosk)),
    lite: yn(safe(weak)),
    whiskers: safe(whiskers) ?? '—',
    version,
  }
}
