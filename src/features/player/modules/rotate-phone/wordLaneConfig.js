// Данные ноды «Переверни телефон» для вертикальной игры: что за слово, как его перевести. Пока слово одно (проверка концепции) — несколько слов позже, цикл по списку.
// Поля typeData.rotate_phone: content (текст карточки), word (слово, латиница), translation (перевод — ученик получает его в финале), lang (язык распознавания, по умолчанию en-US),
// script (что произносит диктор ElevenLabs; пусто — слово трижды), file_id/waveformData/duration/wordTimings (озвучка и её тайминги), fills (таймлайн: три клипа заливки слоёв, секунды файла).
// Пустая нода (автор ещё ничего не настроил) играет встроенным словом — игра есть всегда, как и раньше.
import { normalizeFills } from './wordLanePlan.js'

// XP за каждую принятую пилюлю ученика. Пока это только показ (цифра летит вверх и копится в счётчике игры) — в профиль не начисляется, подключим отдельно
export const XP_PER_PILL = 2

export const DEMO_WORD = { word: 'try', translation: 'пытаться, пробовать' }

/** Что скажет диктор по умолчанию: слово трижды — по числу слоёв */
export const defaultScript = word => [word, word, word].map(w => `${w}.`).join(' ')

export function readWordLane(tData) {
  const td = tData ?? {}
  const word = String(td.word ?? '').trim()
  return {
    title: String(td.content ?? '').trim() || 'Повтори за диктором',
    word: word || DEMO_WORD.word,
    translation: word ? String(td.translation ?? '').trim() : (String(td.translation ?? '').trim() || DEMO_WORD.translation),
    lang: String(td.lang ?? '').trim() || 'en-US',
    isDemo: !word,
    hasAudio: !!td.file_id,
    // громкость озвучки: по ней заливка пилюли идёт в такт речи диктора (без волны — линейно)
    audio: td.file_id && td.duration ? { wave: td.waveformData ?? null, duration: td.duration } : null,
    fills: td.file_id ? normalizeFills(td.fills) : null, // озвучка без нормального таймлайна играет по расписанию по умолчанию
  }
}

/** Отладочные опорные точки геометрии (WordLaneDebug.jsx): localStorage pithy_wl_debug=1 или ?wldebug в адресе */
export function isWordLaneDebug() {
  try { return globalThis.localStorage?.getItem('pithy_wl_debug') === '1' || /[?&]wldebug\b/.test(globalThis.location?.search ?? '') } catch { return false }
}
