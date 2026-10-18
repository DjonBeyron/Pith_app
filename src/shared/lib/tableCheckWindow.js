import { layerShots } from './tableDictatorTiming.js'

// Окно «Проверить» с поправкой на недомонтированный таймлайн. Автомонтаж без
// известной длины аудио ставил проверку на 0.7–1с, а то и на нулевую секунду, —
// до того как отыграла первая ячейка. Плеер честно запускал проверку там:
// таблица уезжала, результат показывался и модуль закрывался на второй секунде,
// пока диктор ещё говорил. Проверка не может стоять раньше последнего клипа
// сборки (ячейка или слово) плюс зазор: иначе она сдвигается за него с тем же
// размером окна. shifted: true — метка стояла не там, и запускать проверку по
// ходу аудио нельзя, её назначит хвост после конца записи (dictatorPostAudio.js).
const CHECK_AFTER_CONTENT_S = 0.6
const MAX_SHOT_GLOW_S = 3

export function checkWindow(layers, checkAt, checkOut) {
  if (checkAt == null) return { checkAt, checkOut, shifted: false }
  let floor = 0
  for (const l of layers ?? []) {
    if (l.visible === false || l.isCheck || l.isClear || l.collect === false) continue
    if (l.highlightOn === false || (!l.cellId && !l.word)) continue
    // Конец клипа без реального конца автомонтаж ставит на край композиции —
    // длину свечения ограничиваем, иначе проверка уезжала бы за аудио
    for (const s of layerShots(l)) {
      if (s.end <= s.start) continue
      floor = Math.max(floor, s.start + Math.min(s.end - s.start, MAX_SHOT_GLOW_S))
    }
  }
  const earliest = floor > 0 ? floor + CHECK_AFTER_CONTENT_S : 0
  if (checkAt >= earliest) return { checkAt, checkOut, shifted: false }
  const hold = checkOut != null ? Math.max(0, checkOut - checkAt) : null
  return { checkAt: earliest, checkOut: hold != null ? earliest + hold : null, shifted: true }
}
