// Авто-ответ админа в «собери фразу» (SolveCorrectButton): какие чипы и в
// каком порядке положить в строку ответа, чтобы checkAnswer (usePhraseAssembly)
// увидел полностью верную фразу. Форма элементов — та же, что кладёт pickChip:
// { shuffleIdx, word, distractorId }.
//
// Сверка слова с чипом — как у проверки (регистр не важен). Каждый чип
// берётся один раз: повтор слова в фразе требует двух одинаковых чипов. Не
// нашлось чипа под слово (данные ноды разошлись) — null, панель не трогаем.
const same = (a, b) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

export function correctPlacement(shuffled = [], words = []) {
  const used = new Set()
  const placed = []
  for (const word of words) {
    const idx = shuffled.findIndex((chip, i) => !used.has(i) && same(chip.text, word))
    if (idx === -1) return null
    used.add(idx)
    placed.push({ shuffleIdx: idx, word: shuffled[idx].text, distractorId: shuffled[idx].distractorId ?? null })
  }
  return placed
}
