// Данные ноды «Переверни телефон» для вертикальной игры: что за фраза (куски через «|», до трёх), как её перевести, озвучка. Слово без «|» — один кусок (игра как в первой версии).
// Поля typeData.rotate_phone: content (текст карточки), phrase (фраза с кусками через «|», латиница; пусто — берётся word), word (слово), translation (перевод — ученик получает его в финале), lang (язык распознавания, по умолчанию en-US),
// script (что произносит диктор ElevenLabs; пусто — слово трижды), file_id/waveformData/duration/wordTimings (озвучка и её тайминги), fills (таймлайн: три клипа заливки слоёв, секунды файла).
// Пустая нода (автор ещё ничего не настроил) играет встроенным словом — игра есть всегда, как и раньше.
import { normalizeFills, fillsFromTimings } from './wordLanePlan.js'
import { parsePhrase } from './wordLaneRecipe.js'
import { clipsFromFills, clipsFromTimings, phraseScript } from './wordLaneAudio.js'

// XP за каждую принятую пилюлю ученика. Пока это только показ (цифра летит вверх и копится в счётчике игры) — в профиль не начисляется, подключим отдельно
export const XP_PER_PILL = 2

export const DEMO_WORD = { word: 'try', translation: 'пытаться, пробовать' }

/** Что скажет диктор ElevenLabs по умолчанию: высказывания рецепта (у одного слова — слово трижды) */
export const defaultScript = text => phraseScript(parsePhrase(text))

export function readWordLane(tData) {
  const td = tData ?? {}
  const phrase = String(td.phrase ?? '').trim()
  const word = String(td.word ?? '').trim()
  const parsed = parsePhrase(phrase || word)
  const chunks = parsed.length ? parsed : [DEMO_WORD.word]
  const isDemo = !parsed.length
  // Клипы озвучки: у одного слова — старый таймлайн fills (по клипу на повтор) или тайминги слов, у фразы — тайминги слов по порядку высказываний (wordLaneAudio); нет — голос системы
  const hasFile = !!td.file_id
  let clips = null
  if (hasFile) {
    if (chunks.length === 1) clips = clipsFromFills(normalizeFills(td.fills)) ?? clipsFromFills(fillsFromTimings(td.wordTimings, chunks[0], td.duration))
    else clips = clipsFromTimings(td.wordTimings, chunks, td.duration)
  }
  return {
    title: String(td.content ?? '').trim() || 'Повтори за диктором',
    chunks,
    word: chunks.join(' '),
    translation: isDemo ? (String(td.translation ?? '').trim() || DEMO_WORD.translation) : String(td.translation ?? '').trim(),
    lang: String(td.lang ?? '').trim() || 'en-US',
    isDemo,
    hasAudio: hasFile,
    // громкость озвучки: по ней заливка пилюли идёт в такт речи диктора (без волны — линейно)
    audio: hasFile && td.duration ? { wave: td.waveformData ?? null, duration: td.duration } : null,
    clips,
  }
}

/** Отладочные опорные точки геометрии (WordLaneDebug.jsx): localStorage pithy_wl_debug=1 или ?wldebug в адресе */
export function isWordLaneDebug() {
  try { return globalThis.localStorage?.getItem('pithy_wl_debug') === '1' || /[?&]wldebug\b/.test(globalThis.location?.search ?? '') } catch { return false }
}

// Чувствительность пилюль к голосу максимальная: пол шума и усиление берутся жёстче общих колец (sayRealLevel: пол 0,02, усиление ×5) — пилюля откликается и на тихий голос
export const SENSITIVE_FLOOR = 0.006
export const SENSITIVE_GAIN = 16
export const sensitiveLevel = rms => Math.sqrt(Math.min(1, Math.max(0, (rms - SENSITIVE_FLOOR) * SENSITIVE_GAIN)))
