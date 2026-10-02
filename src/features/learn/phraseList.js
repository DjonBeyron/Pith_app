import { localDate } from '../../shared/lib/memory/dailyPick.js'

// Список выученных фраз для раздела «Мои выученные фразы» вкладки «Память» (чистая
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
// → [{ id, n, title, date, words: [{ word, lessonId?, lessonTitle?, step, due, hasDeck, perm }],
//      lost: null | 'gone' | 'closed', videoUrl }], свежие выученные первыми. n — номер фразы в
// коллекции по порядку выучивания (самая первая — 1), поэтому номера не меняются, пока коллекция растёт
export function buildPhraseList(rows, moduleById, byWord, hasDeck) {
  // perm — слово в постоянной памяти (settled_on): в карточке фразы оно фиолетовое, как в пятиугольнике
  const withMemory = w => ({
    ...w, step: byWord.get(w.word)?.step ?? null, due: byWord.get(w.word)?.due_on ?? null,
    hasDeck: hasDeck(w.word), perm: !!byWord.get(w.word)?.settled_on,
  })
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
    .map((p, i, all) => ({ ...p, n: all.length - i }))
}

// «Мои начатые фразы»: модули (фразы), которые ученик начал, но не прошёл до конца — нет 100%.
// Начат = отмечен в user_module_progress (startedIds) или в нём пройден хоть один урок; процент —
// доля пройденных уроков модуля (как в «Моих уроках» и в мостике итога повторения).
// curricula — [{ id, title, video_url, lesson_ids }]; startedIds — Set id модулей; done — Set пройденных уроков.
// → [{ id, title, videoUrl, done, total, pct }], ближние к концу первыми
export function buildStartedPhrases(curricula, startedIds, done) {
  return (curricula ?? [])
    .map(m => {
      const ids = Array.isArray(m.lesson_ids) ? m.lesson_ids : []
      const n = ids.filter(id => done.has(id)).length
      return {
        id: m.id, title: (m.title ?? '').trim(), videoUrl: m.video_url ?? null,
        done: n, total: ids.length, pct: ids.length ? Math.round((n / ids.length) * 100) : 0,
      }
    })
    .filter(p => p.total > 0 && p.pct < 100 && (startedIds.has(p.id) || p.done > 0))
    .sort((a, b) => b.pct - a.pct || a.title.localeCompare(b.title))
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

// '2026-10-01' → '1 окт'; не этого года — '1 окт 2025'; даты нет — ''
export function phraseDateLabel(date, today) {
  if (!date) return ''
  const [y, m, d] = date.split('-').map(Number)
  const label = `${d} ${MONTHS[m - 1]}`
  return today && String(y) !== today.slice(0, 4) ? `${label} ${y}` : label
}

// Заботливое объяснение, если урок фразы пропал, а фраза в коллекции осталась
export const PHRASE_LOST_TEXT = {
  gone: 'Урок этой фразы сейчас недоступен — возможно, его убрали или переделали. Не переживай: фраза остаётся в твоей коллекции выученных, а её слова по-прежнему в твоей памяти. Повторять её заново не нужно.',
  closed: 'Урок этой фразы сейчас закрыт — его дорабатывают. Фраза остаётся в твоей коллекции выученных, прогресс не потерян. Когда урок снова откроется, откроется и здесь.',
}
