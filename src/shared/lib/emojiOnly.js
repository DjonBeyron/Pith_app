// Определяет сообщения, которые целиком состоят из смайликов (как в
// Телеграме) — такие пузыри рисуются без фона и крупнее обычного текста.

const EMOJI_CLUSTER_RE = /\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic}(?:️)?)*/gu
const NON_EMOJI_RE = /[^\p{Extended_Pictographic}️‍\s]/u

// Чем меньше смайликов — тем крупнее рисуем; после 6 разница уже не читается
// глазом, а полотно огромных эмодзи выглядит неряшливо — там просто обычный размер.
const SIZE_BY_COUNT = { 1: 64, 2: 52, 3: 44, 4: 36, 5: 36, 6: 36 }

// Возвращает { only, size } — only=true, если text состоит исключительно
// из смайликов (и пробелов), size — px для шрифта, либо null, если размер
// не нужно менять (сообщение слишком «толпой» из смайликов).
export function emojiOnlyInfo(text) {
  const trimmed = (text ?? '').trim()
  if (!trimmed || NON_EMOJI_RE.test(trimmed)) return { only: false, size: null }
  const matches = trimmed.match(EMOJI_CLUSTER_RE) ?? []
  if (!matches.length) return { only: false, size: null }
  return { only: true, size: SIZE_BY_COUNT[matches.length] ?? null }
}
