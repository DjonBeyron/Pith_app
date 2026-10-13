import { buildCellTargets, matchWordTimingsToTargets } from './autoMontage.js'

// Автомонтаж таймлайна авто-таблицы без редактора — для пакетной генерации озвучки:
// по готовым wordTimings (ElevenLabs) расставляет клипы ячеек так же, как кнопка «🪄 Смонтировать».
// Слои: подсветка + проявление на ячейку (не прозвучавшую — подсветка выключена) и «Проверить» в конце.
// Чистая функция: возвращает { timeline, timelineLen } для typeData.table.

const uid = () => crypto.randomUUID()

export function buildAutoTimeline({ cells, wordTimings, duration }) {
  const dur = duration || 1
  const timelineLen = Math.max(1, Math.round(dur + 10))
  const matches = matchWordTimingsToTargets(wordTimings, buildCellTargets(cells))
  const layers = (cells ?? []).map(c => {
    const m = matches.get(c.id)
    const base = { id: uid(), cellId: c.id, visible: true, collect: true }
    if (!m) return { ...base, highlightOn: false, clips: [{ start: 0, end: Math.min(1, dur) }, { start: 0, end: timelineLen }] }
    return { ...base, highlightOn: true, clips: [{ start: m.start, end: m.end ?? timelineLen }, { start: 0, end: timelineLen }] }
  })
  layers.push({ id: uid(), isCheck: true, visible: true, clips: [{ start: Math.max(0, dur - 0.3), end: dur }] })
  return { timeline: { layers }, timelineLen }
}
