import { useState, useRef, useEffect } from 'react'
import { LINE_PAUSE_MS, LINE_COOLDOWN_MS, lineKey } from './wordLaneCatLines.js'
import { startCatLine } from './wordLaneCatSay.js'
import { lineReadiness, waitForLine, LINE_WAIT_MS } from './wordLaneLineGate.js'
import { fillLine } from '../../../rehearsal/rehearsalLines.js'
import { bufferMissing, recoverLine, nudgeCtx } from './wordLaneLineRecover.js'
import { hasWordSlot } from './wordLaneClips.js'
import { pLog } from '../../../../shared/lib/debug.js'

const TEXT_TAIL_MS = 900 // подпись держится ещё столько после конца реплики
const LATE_RESERVE_MS = 400 // отложенная реплика: Пит «занят» на задержку плюс столько — запас, пока таймер не сработал
const SKIP_LOG_MS = 1500 // «реплика пропущена: Пит занят» пишем не чаще раза в столько мс на реплику

// v3.3.84: подпись реплики на экране НЕ показывается (кот только говорит; облачко .wlSay убрано из WordLaneGame) — text живёт для комментариев владельца (commentSnapshot) и журнала.
// Реплики кота (wordLaneCatLines.js) в игре: sayLine(id) — кот говорит реплику: подпись на экране, озвучка из слота (подготовлен в тапе «Начать»), рот по буквам текста, микрофон на это время «не слушает»
// (динамик не должен засчитаться голосом). Как именно стартует звук и рот — wordLaneCatSay.js (голова спрятана — сначала выскакивает; нет озвучки — только подпись), здесь — когда: одну и ту же реплику не чаще
// LINE_COOLDOWN_MS, две подряд не накладываются. Возвращает { text, sayLine, sayLineLater, stop, reset, busyLeft, holdBusy }: text — подпись, пока реплика звучит (пусто — нет); stop — оборвать реплику (пауза);
// busyLeft() — сколько мс кот ещё занят; reset(why) — принудительно сбросить «занят» (старт игры).
// sayLine(id, vars): в тексте реплики {word} заменяется на vars.word (реплики Пита-тренера; такая реплика подписью, без озвучки — fillLine).
// sayLineLater(id, vars, delayMs, onSaid) (v3.3.113): реплика успеха «Разгона» начинается через delayMs после зачёта слова (пилюля уже взлетает). Пит занят С МОМЕНТА ЗАЧЁТА (резерв): следующая пилюля и
// перевод ждут конца реплики, а не проскакивают в задержку, пока Пит формально свободен.
// Начало игры (iPhone): озвученная реплика не стартует, пока прогрев не закончен и слот реплики не готов (wordLaneLineGate.js) — ждёт до LINE_WAIT_MS (3 с; подпись и рот появляются вместе со звуком); не дождалась —
// реплика остаётся подписью (рот по тексту, без звука; голоса системы в игре нет), причина в журнале «[cat-voice]». Для вызывающего sayLine в обоих случаях true («реплика принята»), кот занят на время ожидания.
// Страховка второго запуска (v3.3.113, wordLaneLineRecover.js): реестр прогрева не считаем правдой — нет буфера реплики в памяти, качаем заново и ждём; контекст не 'running' — подталкиваем resume(); вышло время, а
// буфер есть — всё равно пробуем играть (playGameBuffer сам сделает resume), а не молчим. Журнал: «[cat] …» (busy, пропуск реплики, докачка).
export function useCatLines({ lines, rate, catApi, listenerRef }) {
  const [text, setText] = useState('')
  const lastRef = useRef(new Map()) // id → когда последний раз говорил
  const skipRef = useRef(new Map()) // id → когда последний раз писали «пропущена» в журнал
  const busyRef = useRef(0)
  const timerRef = useRef(0)
  const riseRef = useRef(0)
  const lateRef = useRef(0) // таймер отложенной реплики (sayLineLater)
  const gateRef = useRef(null) // отмена ожидания слота
  const cancelGate = () => { gateRef.current?.(); gateRef.current = null }
  useEffect(() => () => { clearTimeout(timerRef.current); clearTimeout(riseRef.current); clearTimeout(lateRef.current); cancelGate() }, [])

  /** Принудительный сброс «занят»: начало каждой игры (из тапа) и пауза. Если флаг был поднят — строка в журнал */
  const reset = (why = 'старте') => {
    const left = busyRef.current - Date.now()
    if (left > 0) pLog(`[cat] busy сброшен при ${why} (был поднят ещё на ${Math.round(left)} мс — реплики пропускались бы как «Пит занят»)`)
    clearTimeout(timerRef.current); clearTimeout(riseRef.current); clearTimeout(lateRef.current); lateRef.current = 0; cancelGate()
    busyRef.current = 0; lastRef.current.clear()
  }
  useEffect(() => { reset('старте'); return undefined }, []) // eslint-disable-line react-hooks/exhaustive-deps -- reset берёт только рефы

  const speak = (id, line, extra = {}) => {
    gateRef.current = null
    const now = Date.now()
    clearTimeout(riseRef.current)
    const { ms, rise, timer } = startCatLine({ id, line, rate, catApi, listenerRef, ...extra })
    riseRef.current = timer
    busyRef.current = now + rise + ms + LINE_PAUSE_MS
    setText(line.caption ?? line.text) // caption: подпись длиннее озвучки (rehearsalLines.fillLine)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setText(''), rise + ms + TEXT_TAIL_MS)
  }

  const skipped = (id, why) => {
    const now = Date.now()
    if (now - (skipRef.current.get(id) ?? -Infinity) < SKIP_LOG_MS) return
    skipRef.current.set(id, now)
    pLog(`[cat] реплика «${id}» пропущена: ${why}`)
  }

  const sayLine = (id, vars = null) => {
    const line = fillLine(lines?.[id], vars)
    const now = Date.now()
    if (!line) { skipped(id, 'такой реплики нет в настройках'); return false }
    if (now < busyRef.current) { skipped(id, `Пит занят ещё ${Math.round(busyRef.current - now)} мс (busy)`); return false }
    if (now - (lastRef.current.get(id) ?? -Infinity) < LINE_COOLDOWN_MS) { skipped(id, 'кулдаун: недавно уже говорил'); return false }
    lastRef.current.set(id, now)
    if (!line.url) { speak(id, line); return true } // нет озвучки — подпись, ждать нечего
    if (bufferMissing(id)) recoverLine(id, line) // страховка: буфера нет в памяти — докачать, не доверяя реестру прогрева
    const check = () => {
      if (bufferMissing(id)) return { ready: false, why: 'буфера реплики нет в памяти (докачивается)' }
      nudgeCtx() // контекст не 'running' (iOS после фона) — подтолкнуть resume()
      return lineReadiness(id)
    }
    if (check().ready) { speak(id, line); return true }
    busyRef.current = now + LINE_WAIT_MS + 100 // ждём слот: другие реплики не лезут вперёд
    cancelGate()
    gateRef.current = waitForLine(check, {
      onReady: waited => speak(id, line, { waitedMs: waited }),
      onTimeout: (waited, why) => {
        if (hasWordSlot(lineKey(id))) { pLog(`[cat] реплика «${id}»: ожидание готовности вышло (${why}), но буфер есть — пробую играть`); speak(id, line, { waitedMs: waited, why }) } // лучше попытка (playGameBuffer сам сделает resume), чем тишина
        else { pLog(`[cat] реплика «${id}»: звука нет в памяти за ${waited} мс (${why}) — только подпись`); speak(id, line, { voice: 'none', waitedMs: waited, why }) }
      },
    })
    return true
  }

  /** Реплика успеха через delayMs (зачёт слова → пилюля взлетает → потом голос Пита). Пит занят с этого момента; не вышло сказать — «занят» снимается. → принята ли (резерв поставлен) */
  const sayLineLater = (id, vars, delayMs, onSaid = null) => {
    const line = fillLine(lines?.[id], vars)
    const now = Date.now()
    if (!line || now < busyRef.current || now - (lastRef.current.get(id) ?? -Infinity) < LINE_COOLDOWN_MS) return false
    clearTimeout(lateRef.current)
    const until = now + delayMs + LATE_RESERVE_MS
    busyRef.current = until
    pLog(`[cat] очередь: реплика «${id}» через ${delayMs} мс (Пит занят с зачёта)`)
    lateRef.current = setTimeout(() => {
      lateRef.current = 0
      if (busyRef.current === until) busyRef.current = 0 // резерв снят: sayLine сама поставит настоящую занятость
      const said = sayLine(id, vars)
      try { onSaid?.(said) } catch { /* журнал не мешает игре */ }
    }, delayMs)
    return true
  }

  /** Пауза: реплика обрывается — подпись и таймеры сняты, «занят» сброшен (после «Продолжить» кот снова может говорить); звук слота гасит releaseClips, рот и взгляд — catApi.freeze */
  const stop = () => { clearTimeout(timerRef.current); clearTimeout(riseRef.current); clearTimeout(lateRef.current); lateRef.current = 0; cancelGate(); busyRef.current = 0; setText('') }

  const busyLeft = () => Math.max(0, busyRef.current - Date.now())

  /** Пит занят ещё ms (+ короткая пауза): говорит слово не репликой (перевод «Разгона») — следующая пилюля ждёт, реплики не лезут вперёд */
  const holdBusy = ms => { busyRef.current = Math.max(busyRef.current, Date.now() + ms + 80) }

  return { text, sayLine, sayLineLater, stop, reset, busyLeft, holdBusy }
}
