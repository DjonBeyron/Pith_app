// Проверки «баланса» урока: доля голоса и текста, одиночные смайлики (текст или стикер), повторы реплик, заголовки таблиц, голос в ветке ошибки.
// Чистые функции на формате обмена ({ ref, type, data, triggers }) после applyMarkup, возвращают строки-замечания.
import { wrongOnlySet, isEmojiOnly } from './lessonLintFlow.js'

const textOf = n => String(n.data?.content ?? n.data?.text ?? n.data?.caption ?? '').trim()
const VOICE_SHARE = [0.3, 0.7]  // голосовые сообщения среди (текст + голос): 50% ± 20%
const EMOJI_TEXT_SHARE = [0.25, 0.55] // среди одиночных смайликов текстом ~40%, стикером ~60%

/** Голосовых (audio) и текстовых сообщений примерно поровну: 30–70% голоса */
function checkVoiceShare(nodes) {
  const wrong = wrongOnlySet(nodes, /wrong|skip/)
  const main = nodes.filter(n => !wrong.has(n.ref))
  const voice = main.filter(n => n.type === 'audio').length
  const texts = main.filter(n => n.type === 'text' && textOf(n) && !isEmojiOnly(n)).length
  const total = voice + texts
  if (total < 12) return []
  const share = voice / total
  return share < VOICE_SHARE[0] || share > VOICE_SHARE[1]
    ? [`[R-voice-share] голосовых ${Math.round(share * 100)}% среди текстов и голосовых (${voice} из ${total}) — нужно примерно 50% ± 20%: ${share < VOICE_SHARE[0] ? 'озвучь часть объяснений и вызовов (audio)' : 'часть голосовых замени текстом'}`]
    : []
}

/** В ветке ошибки подсказка всегда текстом: голос там не прослушать с первого раза и нечем перечитать */
function checkWrongAudio(nodes) {
  const wrong = wrongOnlySet(nodes, /wrong|skip/)
  return nodes.filter(n => n.type === 'audio' && wrong.has(n.ref))
    .map(n => `[R-wrong-audio] ${n.ref}: голосовое сообщение в ветке ошибки — подсказку при ошибке пиши текстом`)
}

/** Одиночные смайлики: ~40% отдельным текстом, ~60% стикером (с imagePrompt) */
function checkEmojiShare(nodes) {
  const emoji = nodes.filter(isEmojiOnly).length
  const stickers = nodes.filter(n => n.type === 'sticker').length
  const total = emoji + stickers
  if (total < 5) return []
  const share = emoji / total
  return share < EMOJI_TEXT_SHARE[0] || share > EMOJI_TEXT_SHARE[1]
    ? [`[R-emoji-share] одиночных смайликов текстом ${Math.round(share * 100)}% (${emoji} из ${total}), нужно примерно 40% текстом и 60% стикерами (sticker + imagePrompt)`]
    : []
}

/** Одинаковые реплики дословно (кроме коротких) — чередуй формулировки: «а ну-ка на слух», «давай на слух» */
function checkRepeats(nodes) {
  const seen = new Map()
  const out = []
  for (const n of nodes.filter(m => m.type === 'text' && !isEmojiOnly(m))) {
    const t = textOf(n).toLowerCase().replace(/[^a-zа-яё0-9 ]/gi, '').trim()
    if (t.length < 8) continue
    if (seen.has(t)) out.push(`[R-repeat] ${n.ref}: реплика дословно повторяет ${seen.get(t)} — чередуй формулировки («а ну-ка на слух», «давай на слух»)`)
    else seen.set(t, n.ref)
  }
  return out
}

/** У таблиц разные заголовки в чате (chatCaption) — под контекст каждой, а не один на все */
function checkTableTitles(nodes) {
  const by = new Map()
  for (const n of nodes.filter(m => m.type === 'table')) {
    const c = String(n.data?.chatCaption ?? '').trim()
    if (c) by.set(c, [...(by.get(c) ?? []), n.ref])
  }
  return [...by].filter(([, refs]) => refs.length > 1)
    .map(([c, refs]) => `[R-table-title] ${refs.join(', ')}: у таблиц одинаковый заголовок «${c}» — назови каждую по контексту шага`)
}

export function checkMix(nodes) {
  return [...checkVoiceShare(nodes), ...checkWrongAudio(nodes), ...checkEmojiShare(nodes), ...checkRepeats(nodes), ...checkTableTitles(nodes)]
}
