import { normalizeAnswerText } from './tableCellMatch.js'

// Автоподсказка «Напечатай слово» по ПЕРВОМУ неверному слову фразы («talk to Masha»): чистая логика без React.
// Ориентир — слово урока (его название, «To»): ошибка в нём — дело текста автора (responseWrong, сигналы),
// а вот ошибка в остальных словах (имя, город, глагол) получает мягкую подсказку ровно про это слово.
// Называем только искомое слово, остальную фразу не раскрываем.

const toWords = text => normalizeAnswerText(text).split(' ').filter(Boolean)

// Расстояние Левенштейна — отличить опечатку («Parys») от другого слова
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

// kind: 'wrong' (слово не то) | 'typo' (то же, но с опечаткой) | 'partial' (слово недописано) | 'missing' (слова нет).
// null — подсказки нет: фраза из одного слова, лишние слова в конце, ошибка в слове урока или всё верно.
// expected — слово так, как его написал автор (с заглавной у имён и городов)
export function wordHint(typed, word, lessonTitle = '') {
  const want = toWords(word)
  if (want.length < 2) return null
  const got = toWords(typed)
  const raw = word.trim().split(/\s+/)
  const lesson = new Set(toWords(lessonTitle))
  const make = (kind, index) => (lesson.has(want[index])
    ? null
    : { kind, index, total: want.length, expected: raw[index] ?? want[index] })

  for (let i = 0; i < got.length; i++) {
    if (i >= want.length) return null
    if (got[i] === want[i]) continue
    if (i === got.length - 1 && want[i].startsWith(got[i])) return make('partial', i)
    const typo = want[i].length >= 4 && editDistance(got[i], want[i]) <= 2
    return make(typo ? 'typo' : 'wrong', i)
  }
  return got.length < want.length ? make('missing', got.length) : null
}

// Текст подсказки в чат (слева, от учителя): мягко, без пола, только про искомое слово
export function wordHintText(h) {
  if (!h) return ''
  const w = `«${h.expected}»`
  if (h.kind === 'typo') return `Почти) проверь написание слова ${w}`
  if (h.kind === 'partial') return 'Слово ещё не дописано, там есть ещё буквы'
  if (h.kind === 'missing') return `Начало верное 👍 не хватает слова ${w}`
  if (h.index === 0) return `Давай по шагам: начни со слова ${w}`
  if (h.index === h.total - 1) return `Начало верное 👍 в конце слово ${w}`
  return `Пока верно 👍 на этом месте слово ${w}`
}
