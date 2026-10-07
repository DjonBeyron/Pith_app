import { normalizeAnswerText as normalize } from '../../../../shared/lib/tableCellMatch.js'

// Авто-ответ админа в диктанте (SolveCorrectButton): конечное состояние
// бокса, к которому прогон пришёл бы сам к моменту проверки — в форме,
// которую держит TableDictatorPanel: assembled — значения ячеек строками по
// порядку токенов ответа, extrasAssembled — { value, key:'extra-N' } по
// индексу чипа в shuffledExtras (тот же ключ, что ставит RAF/легаси-сборка),
// usedCellIds — какие ячейки «отыграли» (затемняются). evaluateDictator
// (dictatorCheck.js) на таком состоянии даёт верный ответ. Слово вне таблицы
// без своего чипа (данные ноды разошлись) — null, панель не трогаем.
export function dictatorSolvedState({ tokens = [], shuffledExtras = [] }) {
  const cellToks = tokens.filter(t => t.type === 'cell')
  const used = new Set()
  const extrasAssembled = []
  for (const tok of tokens) {
    if (tok.type !== 'extra') continue
    const idx = shuffledExtras.findIndex((w, i) => !used.has(i) && normalize(w) === normalize(tok.value))
    if (idx === -1) return null
    used.add(idx)
    extrasAssembled.push({ value: shuffledExtras[idx], key: `extra-${idx}` })
  }
  return {
    assembled: cellToks.map(t => t.value),
    usedCellIds: cellToks.map(t => t.cellId),
    extrasAssembled,
  }
}
