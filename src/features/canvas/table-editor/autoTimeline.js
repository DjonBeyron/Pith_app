import { buildCellTargets, matchWordTimingsToTargets } from './autoMontage.js'

// Автомонтаж таймлайна авто-таблицы без редактора — для пакетной генерации озвучки:
// по готовым wordTimings (ElevenLabs) расставляет клипы ячеек так же, как кнопка «🪄 Смонтировать».
// Слои: подсветка + проявление на ячейку (не прозвучавшую — подсветка выключена) и «Проверить» в конце.
// Чистая функция: возвращает { timeline, timelineLen } для typeData.table.

const uid = () => crypto.randomUUID()

export function buildAutoTimeline({ cells, wordTimings, duration }) {
  const matches = matchWordTimingsToTargets(wordTimings, buildCellTargets(cells))
  // Длина аудио не определилась (проба не отдала число) — берём конец последнего
  // сошедшегося слова. Раньше тут стояла 1с, и «Проверить» ложилась на 0.7–1с:
  // таблица закрывалась на второй секунде, пока диктор ещё говорил
  let lastEnd = 0
  for (const m of matches.values()) lastEnd = Math.max(lastEnd, m.end ?? m.start ?? 0)
  const dur = duration || (lastEnd > 0 ? lastEnd + 0.5 : 1)
  const timelineLen = Math.max(1, Math.round(dur + 10))
  const layers = (cells ?? []).map(c => {
    const m = matches.get(c.id)
    const base = { id: uid(), cellId: c.id, visible: true, collect: true }
    if (!m) return { ...base, highlightOn: false, clips: [{ start: 0, end: Math.min(1, dur) }, { start: 0, end: timelineLen }] }
    return { ...base, highlightOn: true, clips: [{ start: m.start, end: m.end ?? timelineLen }, { start: 0, end: timelineLen }] }
  })
  layers.push({ id: uid(), isCheck: true, visible: true, clips: [{ start: Math.max(0, dur - 0.3), end: dur }] })
  return { timeline: { layers }, timelineLen }
}
