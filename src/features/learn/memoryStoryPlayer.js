import { defaultTotalMs, lineSchedule } from './memoryStoryTiming.js'

// Ход рассказа Пита без React и без DOM (чтобы проверять в консоли с фейковыми таймерами):
// сам запускает озвучку (если есть адрес) и по расписанию сообщает, какая строка сейчас.
//   onLine(i) — строка i вышла на экран;  onEnd() — рассказ закончен (последняя строка отыграла, звук кончился или «Дальше»).
// С озвучкой строки делят её длительность (loadedmetadata → duration); не загрузилась или play() отказал —
// тихо переходим на таймеры без звука. Возвращает { stop, skip }: stop снимает звук и таймеры без onEnd
export function startStory({ lines, audioUrl, onLine, onEnd, createAudio = url => new Audio(url) }) {
  let timers = []
  let audio = null
  let ended = false

  const clearTimers = () => { timers.forEach(clearTimeout); timers = [] }
  const dropAudio = () => {
    if (!audio) return
    try { audio.pause() } catch { /* уже остановлен */ }
    audio.onloadedmetadata = audio.onerror = audio.onended = null
    audio = null
  }
  function finish() {
    if (ended) return
    ended = true
    clearTimers()
    onEnd()
  }
  function run(totalMs) {
    clearTimers()
    const sched = lineSchedule(lines, totalMs)
    sched.forEach((s, i) => { timers.push(setTimeout(() => onLine(i), s.at)) })
    const last = sched[sched.length - 1]
    timers.push(setTimeout(finish, last.at + last.dur))
  }
  // Звук недоступен: гасим его и идём по таймерам с начала (случается сразу при открытии, до первой смены строки)
  function silent() {
    if (ended) return
    dropAudio()
    run(defaultTotalMs(lines))
  }

  if (!lines.length) { finish(); return { stop() {}, skip() {} } }

  if (audioUrl) {
    try {
      audio = createAudio(audioUrl)
      audio.onloadedmetadata = () => {
        const d = audio && audio.duration
        if (Number.isFinite(d) && d > 0) run(d * 1000)
        else silent()
      }
      audio.onerror = silent
      audio.onended = finish
      const p = audio.play()
      if (p && typeof p.catch === 'function') p.catch(silent)
      // Метаданные не пришли (плохая сеть) — через 3 с идём без звука
      timers.push(setTimeout(() => { if (audio && !(audio.duration > 0)) silent() }, 3000))
    } catch { silent() }
  } else {
    run(defaultTotalMs(lines))
  }

  return {
    stop() { ended = true; clearTimers(); dropAudio() },
    skip() { if (ended) return; dropAudio(); onLine(lines.length - 1); finish() },
  }
}
