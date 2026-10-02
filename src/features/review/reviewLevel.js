import { levelOf, findLadderWord } from '../learn/memoryLadder.js'

// Цвет экрана повторения — по ступени памяти слова (1 новое, 2 знакомое, 3 усвоенное): класс на
// .reviewScreen красит оттенок фона, точки закрытого слова и «худ» чата (review.css). Без ступени
// класса нет — фон нейтральный, а не чужого цвета.
export const levelClass = level => (level ? ` reviewScreen--lvl${level}` : '')

// Что откроется первым: слово и его ступень — по данным вкладки «Память», ещё до загрузки колод.
// Экран загрузки красится в цвет ступени сразу, а сессия начинает именно с этого слова
// (useReviewSession → buildSession first). focus — «Повторить сейчас» по словам; без него — слова дня
// или, если слов нет, закрепление фразы (там все слова усвоены).
// → { word, level } | null
export function startOfReview(view, focus = null) {
  if (!view?.today) return null
  const picked = view.today.picked[0]
  if (focus) {
    const step = findLadderWord(view.ladder, focus[0])?.word.step
    return step ? { word: focus[0], level: levelOf(step) } : null
  }
  if (picked) return { word: picked.word, level: levelOf(picked.step) }
  return view.today.phrase ? { word: null, level: 3 } : null
}
