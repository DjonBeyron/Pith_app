import { tagLabel } from '../../player/review-marks/reviewMarks.js'

// Золотой набор («Разбор» как цикл оценки, PROJECT.md 2026-10-22, шаг B): чистые функции сборки записи для lessonExamplesApi
// и JSON-выгрузки для Claude. Запись: kind 'pair' (автор исправил текст: before → after), 'bad' (пример как нельзя, с
// замечаниями), 'good' (образец как можно). Это материал для примеров в промпте автора и калибровки судьи

// Из окна замечания: before — оригинал на момент открытия, after — как стало, comments — замечания автора к ноде
export function exampleFromNote({ lessonId = null, lessonTitle = '', ref, seq = null, type = '', branch = 'основная', before = '', after = '', comments = [], kind = 'auto', ruleTitle = '' }) {
  const b = String(before ?? ''), a = String(after ?? '')
  const list = (comments ?? []).map(c => (typeof c === 'string' ? c : [c.template, c.comment].filter(Boolean).join(': '))).filter(Boolean)
  const k = kind !== 'auto' ? kind : b !== a ? 'pair' : list.length ? 'bad' : 'good'
  return { lessonId, lessonTitle, ref, seq, type, branch, kind: k, before: b, after: k === 'pair' ? a : b, comments: list, tags: [], ruleTitle, source: 'review' }
}

// Из пометки с телефона (reviewMarksApi): 👍 — образец «хорошо», остальное — «плохо» с тегом и комментарием
export function exampleFromMark(mark, { lessonTitle = '', ref = null } = {}) {
  const good = mark.tag === 'great'
  const comment = [tagLabel(mark.tag), mark.comment].filter(Boolean).join(': ')
  return {
    lessonId: mark.lessonId ?? null, lessonTitle, ref: ref ?? mark.nodeId, seq: mark.seq ?? null, type: mark.type ?? '', branch: 'основная',
    kind: good ? 'good' : 'bad', before: mark.text ?? '', after: mark.text ?? '', comments: good ? [] : [comment], tags: [mark.tag], ruleTitle: '', source: `phone:${mark.device || '?'}`,
  }
}

// Выгрузка для Claude (lesson-drafts/examples.json): по одной записи, без служебных id
export function goldenJson(examples) {
  return {
    format: 'pithy-golden-set',
    version: 1,
    hint: 'kind: pair — автор исправил текст (before → after), bad — как нельзя (comments — почему), good — образец как можно. type — тип ноды, branch — ветка ленты',
    examples: (examples ?? []).map(e => ({ kind: e.kind, lesson: e.lessonTitle, ref: e.ref, seq: e.seq, type: e.type, branch: e.branch, before: e.before, after: e.after, comments: e.comments, tags: e.tags, rule: e.ruleTitle, source: e.source })),
  }
}
