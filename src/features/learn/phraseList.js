import { localDate } from '../../shared/lib/memory/dailyPick.js'

// Список закреплённых фраз для раздела «Фразы» вкладки «Память» (чистая
// функция без сети). Фраза = модуль; запись о закреплении — phrase_memory
// (module_id, consolidated_at и снимок phrase_title / phrase_words на момент
// закрепления). Прогресс ученика не зависит от модуля, поэтому фраза остаётся
// в списке, даже если урок убрали или переделали (lost):
//   'gone'   — модуля больше нет (убрали / не найден);
//   'closed' — модуль есть, но слов-уроков в нём не осталось.
// Для таких фраз название и слова берём из снимка, слова по-прежнему
// показываем с их силой (память слов от уроков не зависит).
// rows — [{ module_id, consolidated_at, phrase_title, phrase_words }];
// moduleById — Map id → { id, title, videoUrl, words: [{ word, lessonId, lessonTitle }] };
// byWord — Map слово → строка word_memory; hasDeck — слово с колодой повтора.
// → [{ id, title, date, words: [{ word, lessonId?, lessonTitle?, step, due, hasDeck }],
//      lost: null | 'gone' | 'closed', videoUrl }], свежие закрепления первыми
export function buildPhraseList(rows, moduleById, byWord, hasDeck) {
  const withMemory = w => ({ ...w, step: byWord.get(w.word)?.step ?? null, due: byWord.get(w.word)?.due_on ?? null, hasDeck: hasDeck(w.word) })
  return (rows ?? [])
    .filter(r => r?.module_id)
    .map(r => {
      const m = moduleById.get(r.module_id)
      const live = m && m.words.length > 0
      const lost = !m ? 'gone' : live ? null : 'closed'
      const words = live ? m.words : (r.phrase_words ?? []).map(word => ({ word }))
      return {
        id: r.module_id,
        title: (m?.title || r.phrase_title || '').trim(),
        date: r.consolidated_at ? localDate(r.consolidated_at) : null,
        words: words.map(withMemory),
        lost,
        videoUrl: m?.videoUrl ?? null,
      }
    })
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title))
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

// '2026-10-01' → '1 окт'; не этого года — '1 окт 2025'; даты нет — ''
export function phraseDateLabel(date, today) {
  if (!date) return ''
  const [y, m, d] = date.split('-').map(Number)
  const label = `${d} ${MONTHS[m - 1]}`
  return today && String(y) !== today.slice(0, 4) ? `${label} ${y}` : label
}

// Заботливое объяснение, если урок фразы пропал, а закрепление осталось
export const PHRASE_LOST_TEXT = {
  gone: 'Урок этой фразы сейчас недоступен — возможно, его убрали или переделали. Не переживай: фраза остаётся закреплённой, а её слова по-прежнему в твоей памяти. Повторять её заново не нужно.',
  closed: 'Урок этой фразы сейчас закрыт — его дорабатывают. Фраза остаётся закреплённой, прогресс не потерян. Когда урок снова откроется, откроется и здесь.',
}
