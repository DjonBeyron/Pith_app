import { pLog } from '../../../../shared/lib/debug.js'
import { normalizeAnswerText as normalize } from '../../../../shared/lib/tableCellMatch.js'


// Сборка итоговой фразы из собранных ячеек + extra-слов по порядку токенов ответа
// и сверка с эталоном. Вынесено из TableDictatorPanel ради лимита 400 строк.
export function evaluateDictator({ tokens, assembled, extrasAssembled, answer }) {
  let ci = 0
  const eWords   = extrasAssembled.map(t => t.value)
  const tokenStr = tokens.map(t => t.type === 'cell' ? 'CELL' : `ext:"${t.value}"`).join(' ')

  // Слова вне таблицы ставим на свои места ПО ЗНАЧЕНИЮ, а не по очереди
  // прилёта в бокс: автор может поставить несколько слов на одно время, и
  // тогда порядок их появления зависит от раскладки таймлайна, а не от ответа.
  // Каждое собранное слово используется один раз — повтор в ответе требует
  // и двух собранных слов.
  const takenExtras = new Set()
  const takeExtra = want => {
    const i = eWords.findIndex((w, idx) => !takenExtras.has(idx) && normalize(w) === normalize(want))
    if (i === -1) return ''
    takenExtras.add(i)
    return eWords[i]
  }

  const phrase = tokens.map(tok => {
    if (tok.type === 'cell')  return assembled[ci++] ?? ''
    if (tok.type === 'extra') return takeExtra(tok.value)
    return ''
  }).filter(w => w).join(' ').trim()

  // Лишнее собранное слово (например, слово-ловушка) в фразу не попадает —
  // но ответ от этого верным не становится
  const extraLeftovers = eWords.length - takenExtras.size
  const isCorrect = !answer || (normalize(phrase) === normalize(answer) && extraLeftovers === 0)
  if (extraLeftovers > 0) pLog(`[td-auto] check лишних слов в боксе: ${extraLeftovers}`)
  pLog(`[td-auto] check TOKENS: ${tokenStr}`)
  pLog(`[td-auto] check ASSEMBLED cells=[${assembled.join('|')}] extras=[${eWords.join('|')}]`)
  pLog(`[td-auto] check PHRASE="${phrase}" ANSWER="${answer}" correct=${isCorrect}`)
  return { phrase, isCorrect }
}
