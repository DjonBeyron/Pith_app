import { blankMatches } from './fillBlanksCheck.js'

// Авто-ответ админа в «составь предложение» (SolveCorrectButton): что
// «выбрать» в каждом пропуске. Форма — та же, что у picked в FillBlanksPanel:
// { index: текст варианта }. Берём вариант из МЕНЮ пропуска (blankOptions[i]
// — то, что ученик реально мог нажать; сверка как у проверки, blankMatches),
// а если среди вариантов answer нет (автор не добавил его в options) — сам
// answer: проверка всё равно сравнивает с ним.
export function correctPicks(blanks = [], blankOptions = []) {
  const picked = {}
  blanks.forEach((blank, i) => {
    const fromMenu = (blankOptions[i] ?? []).find(o => blankMatches(o, blank))
    picked[i] = fromMenu ?? blank.answer ?? ''
  })
  return picked
}
