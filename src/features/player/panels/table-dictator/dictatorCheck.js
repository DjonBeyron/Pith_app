import { pLog } from '../../../../shared/lib/debug.js'

// Сборка итоговой фразы из собранных ячеек + extra-слов по порядку токенов ответа
// и сверка с эталоном. Вынесено из TableDictatorPanel ради лимита 400 строк.
export function evaluateDictator({ tokens, assembled, extrasAssembled, answer }) {
  let ci = 0, ei = 0
  const eWords   = extrasAssembled.map(t => t.value)
  const tokenStr = tokens.map(t => t.type === 'cell' ? 'CELL' : `ext:"${t.value}"`).join(' ')
  const phrase = tokens.map(tok => {
    if (tok.type === 'cell')  return assembled[ci++] ?? ''
    if (tok.type === 'extra') return eWords[ei++] ?? ''
    return ''
  }).filter(w => w).join(' ').trim()
  const isCorrect = !answer || phrase.toLowerCase() === answer.toLowerCase()
  pLog(`[td-auto] check TOKENS: ${tokenStr}`)
  pLog(`[td-auto] check ASSEMBLED cells=[${assembled.join('|')}] extras=[${eWords.join('|')}]`)
  pLog(`[td-auto] check PHRASE="${phrase}" ANSWER="${answer}" correct=${isCorrect}`)
  return { phrase, isCorrect }
}
