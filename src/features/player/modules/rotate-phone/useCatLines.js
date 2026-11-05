import { useState, useRef, useEffect } from 'react'
import { LINE_PAUSE_MS, LINE_COOLDOWN_MS, lineKey } from './wordLaneCatLines.js'
import { startCatLine } from './wordLaneCatSay.js'
import { lineReadiness, waitForLine, LINE_WAIT_MS, LINE_POLL_MS } from './wordLaneLineGate.js'
import { fillLine } from '../../../rehearsal/rehearsalLines.js'
import { bufferMissing, recoverLine, nudgeCtx } from './wordLaneLineRecover.js'
import { hasWordSlot } from './wordLaneClips.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { raceStart } from '../../../pitrace/raceStartTrace.js'

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
export function useCatLines({ lines, rate, catApi, listenerRef, waitMs = LINE_WAIT_MS }) { // waitMs — «Гонка»: реплика в начале ждёт слот не дольше 1,5 с (raceStartTrace.RACE_LINE_WAIT_MS)
  const [text, setText] = useState('')
  const lastRef = useRef(new Map()) // id → когда последний раз говорил
  const skipRef = useRef(new Map()) // id → когда последний раз писали «пропущена» в журнал
  const busyRef = useRef(0)
  const timerRef = useRef(0)
  const riseRef = useRef(0)
  const lateRef = useRef(0) // таймер отложенной реплики (sayLineLater)
  const armRef = useRef(null) // ждущая взлёта похвала: запускает отсчёт её задержки (praiseTakeoff)
  const stopRef = useRef(new Set()) // подписчики на остановку (пауза, выход): секвенсор речи гонки сбрасывает свои таймеры
  const gateRef = useRef(null) // отмена ожидания слота
  const cancelGate = () => { gateRef.current?.(); gateRef.current = null }
  useEffect(() => () => { clearTimeout(timerRef.current); clearTimeout(riseRef.current); clearTimeout(lateRef.current); cancelGate() }, [])

  /** Принудительный сброс «занят»: начало каждой игры (из тапа) и пауза. Если флаг был поднят — строка в журнал */
  const reset = (why = 'старте') => {
    const left = busyRef.current - Date.now()
    if (left > 0) pLog(`[cat] busy сброшен при ${why} (был поднят ещё на ${Math.round(left)} мс — реплики пропускались бы как «Пит занят»)`)
    clearTimeout(timerRef.current); clearTimeout(riseRef.current); clearTimeout(lateRef.current); lateRef.current = 0; armRef.current = null; cancelGate()
    busyRef.current = 0; lastRef.current.clear()
  }
  useEffect(() => { reset('старте'); return undefined }, []) // eslint-disable-line react-hooks/exhaustive-deps -- reset берёт только рефы

  const speak = (id, line, extra = {}) => {
    gateRef.current = null
    const now = Date.now()
    clearTimeout(riseRef.current)
    const { onSpeak, onEnd, pause = LINE_PAUSE_MS, ...say } = extra // onSpeak({ ms, voiced }) — реплика пошла; onEnd — звук доиграл; pause — занятость после конца (секвенсор гонки: 0, отступ ведёт он сам)
    const done = () => { if (pause === 0) busyRef.current = Math.min(busyRef.current, Date.now()); try { onEnd?.() } catch { /* секвенсор не ломает звук */ } } // реальный конец: «занят» снимается сразу, а не по оценке
    const { ms, rise, timer, voiced } = startCatLine({ id, line, rate, catApi, listenerRef, onSound: () => raceStart.line(), onEnd: done, ...say }) // «Гонка»: строка «[race] старт: …» — по ФАКТУ начала звука первой реплики
    if (!voiced) { raceStart.line(); if (onEnd) setTimeout(done, rise + ms) } // звука не будет (только подпись): конец — по оценке
    try { onSpeak?.({ ms: rise + ms, voiced }) } catch { /* журнал не мешает */ }
    riseRef.current = timer
    busyRef.current = now + rise + ms + pause
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

  const sayLine = (id, vars = null, opts = null) => { // opts (v3.3.117): { onSpeak, onEnd, pause, noRise } — секвенсор гонки (raceSpeech.js)
    const line = fillLine(lines?.[id], vars)
    const now = Date.now()
    if (!line) { skipped(id, 'такой реплики нет в настройках'); return false }
    if (now < busyRef.current) { skipped(id, `Пит занят ещё ${Math.round(busyRef.current - now)} мс (busy)`); return false }
    if (now - (lastRef.current.get(id) ?? -Infinity) < LINE_COOLDOWN_MS) { skipped(id, 'кулдаун: недавно уже говорил'); return false }
    lastRef.current.set(id, now)
    const o = opts ?? {}
    if (!line.url) { speak(id, line, o); return true } // нет озвучки — подпись, ждать нечего
    if (bufferMissing(id)) recoverLine(id, line) // страховка: буфера нет в памяти — докачать, не доверяя реестру прогрева
    const check = () => {
      if (bufferMissing(id)) return { ready: false, why: 'буфера реплики нет в памяти (докачивается)' }
      nudgeCtx() // контекст не 'running' (iOS после фона) — подтолкнуть resume()
      return lineReadiness(id)
    }
    if (check().ready) { speak(id, line, o); return true }
    busyRef.current = now + waitMs + 100 // ждём слот: другие реплики не лезут вперёд
    if (waitMs !== LINE_WAIT_MS) catApi?.current?.peek?.(waitMs + 600) // «Гонка»: пока реплика ждёт звук, голова Пита наверху (не прячется)
    cancelGate()
    gateRef.current = waitForLine(check, {
      onReady: waited => speak(id, line, { ...o, waitedMs: waited }),
      onTimeout: (waited, why) => {
        if (hasWordSlot(lineKey(id))) { pLog(`[cat] реплика «${id}»: ожидание готовности вышло (${why}), но буфер есть — пробую играть`); speak(id, line, { ...o, waitedMs: waited, why }) } // лучше попытка (playGameBuffer сам сделает resume), чем тишина
        else { pLog(`[cat] реплика «${id}»: звука нет в памяти за ${waited} мс (${why}) — только подпись`); speak(id, line, { ...o, voice: 'none', waitedMs: waited, why }) }
      },
    }, { maxMs: waitMs, pollMs: waitMs === LINE_WAIT_MS ? LINE_POLL_MS : 30 }) // «Гонка»: опрос чаще — реплика стартует по готовности, а не на следующем тике
    return true
  }

  /** Реплика успеха через delayMs. Пит занят с этого момента (резерв): следующая пилюля и перевод ждут. armMs > 0 (v3.3.115, «Гонка»): задержка отсчитывается не от зачёта, а от ВЗЛЁТА пилюли — её запускает
   *  praiseTakeoff() (win движка); взлёта нет дольше armMs — идёт отсчёт сам (страховка). Не вышло сказать — «занят» снимается. → принята ли (резерв поставлен) */
  const sayLineLater = (id, vars, delayMs, onSaid = null, armMs = 0) => {
    const line = fillLine(lines?.[id], vars)
    const now = Date.now()
    if (!line || now < busyRef.current || now - (lastRef.current.get(id) ?? -Infinity) < LINE_COOLDOWN_MS) return false
    clearTimeout(lateRef.current); armRef.current = null
    const r = { until: now + armMs + delayMs + LATE_RESERVE_MS }
    busyRef.current = r.until
    pLog(`[cat] очередь: реплика «${id}» через ${delayMs} мс${armMs ? ' после взлёта пилюли' : ''} (Пит занят с зачёта)`)
    const fire = () => {
      lateRef.current = 0
      if (busyRef.current === r.until) busyRef.current = 0 // резерв снят: sayLine сама поставит настоящую занятость
      const said = sayLine(id, vars)
      try { onSaid?.(said) } catch { /* журнал не мешает игре */ }
    }
    const start = why => { // начало отсчёта задержки: от зачёта (без armMs) или от взлёта
      armRef.current = null; clearTimeout(lateRef.current)
      r.until = Date.now() + delayMs + LATE_RESERVE_MS; busyRef.current = r.until
      pLog(`[race] похвала через ${delayMs} мс${why ? ` (${why})` : ''}; зачёт был ${Math.round(Date.now() - now)} мс назад`)
      lateRef.current = setTimeout(fire, delayMs)
    }
    if (armMs > 0) { armRef.current = () => start('от взлёта пилюли'); lateRef.current = setTimeout(() => start('взлёта не было, отсчёт от зачёта'), armMs) } else start('')
    return true
  }

  /** Пилюля взлетает (win движка): отсчёт задержки ждущей похвалы начинается с этого мгновения; ждущей нет — ничего */
  const praiseTakeoff = () => { armRef.current?.() }

  /** Пауза: реплика обрывается — подпись и таймеры сняты, «занят» сброшен (после «Продолжить» кот снова может говорить); звук слота гасит releaseClips, рот и взгляд — catApi.freeze */
  const stop = () => { clearTimeout(timerRef.current); clearTimeout(riseRef.current); clearTimeout(lateRef.current); lateRef.current = 0; armRef.current = null; cancelGate(); busyRef.current = 0; setText(''); stopRef.current.forEach(fn => { try { fn() } catch { /* подписчик не мешает паузе */ } }) }
  /** Подписка на остановку реплик (stop): → отписка */
  const onStop = fn => { stopRef.current.add(fn); return () => stopRef.current.delete(fn) }

  const busyLeft = () => Math.max(0, busyRef.current - Date.now())

  /** Пит занят ещё ms (+ короткая пауза): говорит слово не репликой (перевод «Разгона») — следующая пилюля ждёт, реплики не лезут вперёд */
  const holdBusy = ms => { busyRef.current = Math.max(busyRef.current, Date.now() + ms + 80) }

  return { text, sayLine, sayLineLater, praiseTakeoff, stop, onStop, reset, busyLeft, holdBusy }
}
