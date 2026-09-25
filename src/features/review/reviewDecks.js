import { wordLessonsOf } from '../../shared/lib/memory/wordLessons.js'

// Колоды повторения по словам: карточки ВСЕХ уроков слова (одно слово в
// разных модулях = одна память, PROJECT.md → «Память слова»). Фраза для
// спойлер-заголовка — название модуля, где слово встретилось первым;
// modules — все модули слова (мостик «Продолжить фразу», reviewBridge.js).
// У карточки — поля учителя её урока (teacher → resolveTeacher: свой
// учитель урока или общий).
//
// curricula: [{ id, title, lesson_ids }] (loadCurricula); lessons: [{ id, title,
// cards, teacherMode, teacherName, teacherLogo, teacherLogoCrop }] (listLessonCards)
// → Map(word → { phrase, modules: [{ id, title }], cards: [{ id, nodes, files, lessonId, teacher }] })
const teacherOf = l => ({
  teacherMode: l.teacherMode ?? null, teacherName: l.teacherName ?? null,
  teacherLogo: l.teacherLogo ?? null, teacherLogoCrop: l.teacherLogoCrop ?? null,
})

// Файлы карточки из самих нод (ссылки вписаны при сохранении — injectR2Urls):
// прогреву следующей карточки (ReviewWarmup) нужен список файлов, а ходить за
// ним в таблицу files незачем. [{ id, r2Url, size: 0 }]
export function cardFiles(nodes) {
  const out = new Map()
  for (const n of nodes ?? []) {
    if (n.type === 'photo_choice') {
      for (const ph of n.typeData?.photo_choice?.photos ?? []) {
        if (ph.fileId && ph.photoUrl) out.set(ph.fileId, { id: ph.fileId, r2Url: ph.photoUrl, size: 0 })
      }
      continue
    }
    const d = n.typeData?.[n.type]
    if (d?.file_id && d.r2Url) out.set(d.file_id, { id: d.file_id, r2Url: d.r2Url, size: 0 })
  }
  return [...out.values()]
}

export function buildDecks(curricula, lessons) {
  const decks = new Map()
  for (const [word, entries] of wordLessonsOf(curricula, lessons)) {
    const cards = entries.flatMap(({ lesson }) =>
      (Array.isArray(lesson.cards) ? lesson.cards : [])
        .filter(c => c?.id && c.nodes?.length)
        .map(c => ({ id: c.id, nodes: c.nodes, files: cardFiles(c.nodes), lessonId: lesson.id, teacher: teacherOf(lesson) })))
    const modules = [...new Map(entries.map(({ module: m }) => [m.id, { id: m.id, title: m.title ?? '' }])).values()]
    decks.set(word, { phrase: modules[0].title, modules, cards })
  }
  return decks
}

// Сегодня по часам устройства — 'YYYY-MM-DD' (как ждёт pickToday)
export function localToday(now = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}
