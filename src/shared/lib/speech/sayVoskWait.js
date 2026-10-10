// Админский режим «Только Vosk» (тестовый, ученикам недоступен): если к тапу Vosk ещё не готов, на системное распознавание НЕ уходим — запускаем прогрев и ждём его до WAIT_MS,
// показывая админу в серой плашке над панелью этап («грузится библиотека (4 с)»). Готово — плашка просит нажать ещё раз (микрофон открывается только в самом тапе: iPhone требует жест, а за 20 с
// ожидания он «протухает», AudioContext остался бы выключенным); ошибка / таймаут / нет модели — короткая причина. Микрофон здесь не трогается. Без React; таймеры подставляются в тестах.
import { pickEngine } from './sayEnginePick.js'
import { STAGE_TEXT } from '../vosk/voskWarmStages.js'

export const WAIT_MS = 20000
export const WAIT_TICK_MS = 1000
const NOT_READY = ['no-model', 'loading', 'not-loaded', 'no-lib', 'broken']

/** Нужно ли ждать Vosk на этот тап: режим «Только Vosk», фраза годится для Vosk, но он не готов. data — readSayData шага; snap — runtime.snapshot() */
export function needsVoskWait({ mode, phrase, snap, now }) {
  if (mode !== 'vosk') return false
  const p = pickEngine({ mode, phrase, ...snap, now })
  return p.engine === 'system' && NOT_READY.includes(p.reason)
}

const whole = ms => `${Math.max(0, Math.round(ms / 1000))} с`

/** Подпись текущего этапа для плашки: «грузится библиотека (4 с)» */
export function waitStageText(info, now) {
  const text = STAGE_TEXT[info.stage] ?? info.stage
  return info.stage === 'idle' || info.stage === 'failed' ? text : `${text} (${whole(now - (info.stageAt || now))})`
}

const line = (text, note = 'движок: Vosk (режим «Только Vosk»)') => ({ text: `Админ: ${text}`, note, title: '' })

/**
 * Запустить ожидание. onNote(строка плашки | null) вызывается раз в секунду и по итогу. Возвращает cancel().
 * runtime — voskRuntime (warmNow / whenSettled / info / snapshot).
 */
export function startVoskWait({ runtime, onNote, ms = WAIT_MS, setTimer = setInterval, clearTimer = clearInterval, now = Date.now }) {
  let over = false
  const tick = () => { if (!over) onNote(line(`Vosk ещё не готов — ${waitStageText(runtime.info(), now())}…`)) }
  runtime.warmNow('tap')
  tick()
  const id = setTimer(tick, WAIT_TICK_MS)
  const stop = () => { over = true; clearTimer(id) }
  runtime.whenSettled(ms).then(r => {
    if (over) return
    stop()
    onNote(r.ok
      ? line('Vosk готов — нажмите на микрофон ещё раз')
      : line(`Vosk не включился — ${r.text}. Системное НЕ запускаю (режим «Только Vosk»)`, 'смените режим на «Авто», если нужно системное'))
  })
  return stop
}
