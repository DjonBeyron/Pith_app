// Данные ноды «Переверни телефон» для вертикальной игры: что за фраза (куски через «|», до трёх), как её перевести, озвучка. Слово без «|» — один кусок (игра как в первой версии).
// Поля typeData.rotate_phone: content (текст карточки), phrase (фраза с кусками через «|», латиница; пусто — берётся word), word (слово), translation (перевод — ученик получает его в финале), lang (язык распознавания, по умолчанию en-US),
// script (что произносит диктор ElevenLabs; пусто — слово трижды), confusers (слова-запутыватели по кускам фразы: [[«tying», «drying»], [], []] — у куска с запутывателями появляется раунд «Различи»), file_id/waveformData/duration/wordTimings (озвучка и её тайминги), fills (таймлайн: три клипа заливки слоёв, секунды файла).
// Пустая нода (автор ещё ничего не настроил) играет встроенным словом — игра есть всегда, как и раньше.
import { normalizeFills, fillsFromTimings } from './wordLanePlan.js'
import { parsePhrase, normalizeConfusers } from './wordLaneRecipe.js'
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
    if (chunks.length === 1) clips = clipsFromFills(normalizeFills(td.fills)) ?? clipsFromFills(fillsFromTimings(td.wordTimings, chunks[0], td.duration)) ?? clipsFromTimings(td.wordTimings, chunks, td.duration)
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
    confusers: normalizeConfusers(td.confusers, chunks),
  }
}

/** Отладочные опорные точки геометрии (WordLaneDebug.jsx): localStorage pithy_wl_debug=1 или ?wldebug в адресе */
export function isWordLaneDebug() {
  try { return globalThis.localStorage?.getItem('pithy_wl_debug') === '1' || /[?&]wldebug\b/.test(globalThis.location?.search ?? '') } catch { return false }
}

// Громкость голоса ученика → 0..1 для колец микрофона и пилюль. Лог-кривая без насыщения: log1p(K·(rms − пол)) / log1p(K·SPAN). Раньше корень упирался в 1,0 уже на rms ≈ 0,07 и между слогами
// динамики не было. Теперь тихая речь (0,02) ≈ 0,47, обычная (0,05) ≈ 0,75, громкая (0,08) ≈ 0,89, от 0,12 и крик — 1,0 (K подобран так, чтобы тихий голос оставался чувствительным, как требует wordLaneFx.test); пол 0,006 — шум комнаты даёт ноль.
export const SENSITIVE_FLOOR = 0.006
export const SENSITIVE_K = 300
export const SENSITIVE_SPAN = 0.11
export const GAME_LEVEL_DECAY_MS = 120 // спад уровня после куска звука (куски по 23 мс): кольца гаснут вслед за голосом; у «Сказать фразу» остаётся 300
export const sensitiveLevel = rms => {
  const x = rms - SENSITIVE_FLOOR
  return x > 0 ? Math.min(1, Math.log1p(SENSITIVE_K * x) / Math.log1p(SENSITIVE_K * SENSITIVE_SPAN)) : 0
}
sensitiveLevel.decayMs = GAME_LEVEL_DECAY_MS // createRmsLevel({ fromRms: sensitiveLevel }) берёт спад отсюда
