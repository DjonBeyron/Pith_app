// Вопрос ноды «Сказать фразу» в ленте — обычный текстовый пузырь учителя (TextModule): фраза на английском, ниже
// спокойной серой строкой просьба «Скажите фразу вслух»; перевод (если задан) — кнопкой на пузыре, как у любого текста
// с переводом. После проверки слова фразы в пузыре подсвечиваются (tones из sayChatTones.js): услышанные зелёным, пропущенные
// красным — тот же цвет, что раньше был в панели. Модуль ленты не тянет код распознавания (он в ленивом чанке панели) —
// только этот файл. Строим «текстовую» ноду из данных ноды: свой вид пузыря не заводим.
export const SAY_PROMPT = 'Скажите фразу вслух'
const PHRASE_COLOR = '#ffffff'
const PROMPT_COLOR = '#9aa0b4'
export const TONE_COLORS = { ok: '#b6fe3b', miss: '#f87171' }

/** Смещения слов фразы (по пробельным группам) — для покраски отрезков текста */
function wordRanges(phrase) {
  return [...phrase.matchAll(/\S+/g)].map(m => ({ start: m.index, end: m.index + m[0].length }))
}

export function sayPromptNode(node, data, tones = null) {
  const content = `${data.phrase}\n${SAY_PROMPT}`
  const split = data.phrase.length
  const toneHighlights = tones
    ? wordRanges(data.phrase).flatMap((r, i) => (TONE_COLORS[tones[i]]
      ? [{ start: r.start, end: r.end, color: TONE_COLORS[tones[i]], mode: 'text', opacity: 1 }] : []))
    : []
  return {
    ...node,
    type: 'text',
    typeData: {
      text: {
        content,
        highlights: [
          { start: 0, end: split, color: PHRASE_COLOR, mode: 'text', opacity: 1 },
          { start: 0, end: split, mode: 'bold' },
          { start: split + 1, end: content.length, color: PROMPT_COLOR, mode: 'text', opacity: 1 },
          ...toneHighlights, // идут последними: перекрашивают слова поверх белого
        ],
        ...(data.translation ? { pro: true, proText: data.translation } : {}),
      },
    },
  }
}
