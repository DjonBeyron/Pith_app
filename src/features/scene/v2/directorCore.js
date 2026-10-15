// Ядро «режиссёра» сцены v2 — без React, чтобы тестировать порядок реплик,
// паузу и рестарт как чистую логику. Хук useSceneDirectorV2 лишь оборачивает
// его в состояние компонента.
//
// createDirector({ timeline, playLine, onChange, loop })
//   playLine(line, index, { onEnd, once }) → cancel()   — проигрывает одну реплику
//     (once=true — это playOnce «Ещё раз»: scenePlayLine играет только оригинал)
//   onChange({ index, status, run })                 — при каждом изменении
// status: 'idle' | 'playing' | 'paused' | 'ended'.
// Пауза отменяет текущую реплику; продолжение начинает её с начала
// (speechSynthesis.pause() ненадёжен на iOS/Chrome, а для озвучки файлом
// перезапуск реплики — честнее, чем рот без звука).

export function createDirector({ timeline = [], playLine, onChange, loop = false }) {
  let index = 0
  let status = 'idle'
  let run = 0 // счётчик запусков — различает повторный старт той же реплики
  let cancel = null
  let destroyed = false
  let once = false // playOnce: после конца реплики — пауза, а не следующая

  const state = () => ({ index, status, run, total: timeline.length, line: timeline[index] ?? null })
  const emit = () => { if (!destroyed) onChange?.(state()) }

  function stopCurrent() {
    const c = cancel
    cancel = null
    c?.()
  }

  function startLine() {
    stopCurrent()
    const line = timeline[index]
    if (!line) { status = 'ended'; emit(); return }
    run += 1
    const myRun = run
    emit()
    cancel = playLine(line, index, {
      once,
      onEnd: () => {
        // Поздний onEnd отменённой/перезапущенной реплики игнорируем
        if (destroyed || myRun !== run || status !== 'playing') return
        cancel = null
        if (once) { once = false; status = 'paused'; emit(); return }
        advance()
      },
    }) ?? null
  }

  function advance() {
    if (index >= timeline.length - 1) {
      if (loop) { index = 0; startLine(); return }
      status = 'ended'
      emit()
      return
    }
    index += 1
    startLine()
  }

  const api = {
    getState: state,
    // play(from) — начать с реплики from (перенос реплики между лентой и полным экраном ноды урока)
    play(from = null) {
      if (destroyed || status === 'playing') return
      if (status === 'ended') { index = 0 }
      if (Number.isInteger(from) && from >= 0 && from < timeline.length) index = from
      once = false
      status = 'playing'
      startLine()
    },
    // Проиграть одну реплику i и встать на паузу на ней («Послушать ещё раз» в задании ленты)
    playOnce(i) {
      if (destroyed || i < 0 || i >= timeline.length) return
      stopCurrent()
      index = i
      once = true
      status = 'playing'
      startLine()
    },
    pause() {
      if (status !== 'playing') return
      stopCurrent()
      status = 'paused'
      emit()
    },
    toggle() {
      if (status === 'playing') api.pause()
      else api.play()
    },
    restart() {
      stopCurrent()
      once = false
      index = 0
      status = 'playing'
      startLine()
    },
    goTo(i) {
      if (i < 0 || i >= timeline.length) return
      stopCurrent()
      index = i
      if (status === 'playing') startLine()
      else emit()
    },
    destroy() {
      stopCurrent()
      destroyed = true
    },
  }
  return api
}
