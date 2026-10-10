import { holdSoundQuiet } from '../soundQuiet.js'
import { quietTailMs } from './sayHints.js'

// Окно тишины звуков приложения на одну попытку «Сказать фразу» (soundQuiet.js): open() — в тапе, close(engine) — когда попытка кончилась (итог/ошибка/стоп),
// окно закрывается через хвост quietTailMs(engine) (Vosk — сразу), dispose() — панель ушла. Закрытие проигрывает отложенные звуки (message-in, xp-gain, answer-correct).
export function createSayQuiet({ hold = holdSoundQuiet, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let release = null
  let timer = 0
  const free = () => { clearTimer(timer); timer = 0; const r = release; release = null; r?.() }
  return {
    open() { clearTimer(timer); timer = 0; if (!release) release = hold() },
    close(engine) {
      if (!release || timer) return
      const ms = quietTailMs(engine)
      if (ms > 0) timer = setTimer(free, ms); else free()
    },
    dispose: free,
  }
}
