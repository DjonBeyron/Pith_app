import { useState, useEffect } from 'react'
import { createWordLaneDebug, debugEnabled, collectDevice, NO_DEBUG } from './wordLaneDebug.js'
import { createDebugRecorder, describeStream } from './wordLaneDebugRecorder.js'
import { prepareAudio } from './wordLaneDebugExport.js'
import { setStudentDebug } from './wordLaneStudent.js'
import { probe as sharedProbe } from './wordLaneDebugProbe.js'
import { getPlayerDebugUiValue } from '../../../../shared/lib/usePlayerDebugUi.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import * as gameMicLib from '../../../../shared/lib/gameMic.js'
import { getPlayerLines } from '../../../../shared/lib/debug.js'
import { soundEvents } from '../../../../shared/lib/soundLog.js'
import { straceLines } from '../../../../shared/lib/soundGestureTrace.js'

// «Скачать отладку» в игре «Повтори за диктором» — связка журнала (wordLaneDebug), записи микрофона (wordLaneDebugRecorder) и игры. Включено, только если админ включил «Отладочный интерфейс»
// (usePlayerDebugUi) или localStorage pithy_wl_debug_v1 = '1'; иначе useWordLaneDebug отдаёт NO_DEBUG — пустые функции, ни записи, ни подписок. Журнал живёт в обычном объекте (не в состоянии React):
// событий тысячи, перерисовывать из-за них нечего.
const round2 = v => Math.round(v * 100) / 100

/** События шага конвейера ученика (wordLaneStudent: setStudentDebug) → записи журнала: id пилюли, кусок, tk (сколько слов цели произнесено), счёт seq/misses, недосказанная цель tail, уровень после ворот */
export function logPillEvents(log, events, input = {}) {
  const common = { misses: input.misses ?? 0, seq: input.seq?.length ?? 0, tail: input.tail ? { target: input.tail.target, tokens: input.tail.tokens } : null, lvl: round2(input.level ?? 0), conf: !!input.confirmed }
  for (const e of events) {
    const rep = e.rep ? { rep: e.rep.idx, tk: e.rep.tk, tries: e.rep.tries } : {}
    const piece = e.pill ? { pill: e.pill.id, piece: e.pill.piece } : {}
    const d = { ...rep, ...piece, ...common }
    if (e.type === 'spawn') log.pill('spawn', { ...d, pills: e.pills.map(p => p.id), lanes: e.pills.map(p => p.lane) })
    else if (e.type === 'claim') log.pill('claim', { ...d, order: e.order, lock: e.rep.pills.filter(p => p.state === 'lock').map(p => p.id) })
    else if (e.type === 'fail') log.pill('fail', { ...d, lost: e.lost, pills: e.pills.map(p => p.id) })
    else if (e.type === 'miss') log.pill('miss', { ...d, wrong: !!e.wrong })
    else if (e.type === 'snap') log.pill('snap', { ...d, full: !!e.full })
    else if (e.type === 'win') log.pill('win', { ...d, last: !!e.last })
    else if (e.type === 'done') log.pill('done', { ...d, locked: e.locked })
    else log.pill(e.type, d) // piece-ok, late
  }
}

function describeGame() {
  const key = 'describeGameMic' // экспорт может появиться в gameMic.js позже: обращаемся по ключу, чтобы сборка не ругалась на отсутствие
  try { const f = gameMicLib[key]; if (typeof f === 'function') return f() } catch { /* ниже — запасной путь */ }
  try { const s = gameMicLib.getGameMic(); return s ? { tracks: describeStream(s) } : null } catch { return null }
}

const LOG_TAIL = 400
/** Чужие журналы приложения в dump: журнал плеера (pLog: «[mic] игровой поток открыт», «[rotate] … микрофон granted»), журнал звуков, трасса жеста включения звука */
function playerExtras() {
  const pick = fn => { try { return fn() } catch { return [] } }
  return { playerLog: pick(getPlayerLines).slice(-LOG_TAIL), soundLog: pick(soundEvents), gestureTrace: pick(straceLines) }
}

/** Сессия отладки: журнал + рекордер + выгрузка. enabled=false → NO_DEBUG. Зависимости подставляются в тестах */
export function createDebugSession({ enabled, now, weak = null, getStream = () => null, recorderDeps = {}, probe = sharedProbe, extras = playerExtras } = {}) {
  if (!enabled) return NO_DEBUG
  let recorder = null
  const base = createWordLaneDebug({ enabled: true, now, device: collectDevice({ weak }), describeMic: () => ({ game: describeGame(), recorder: recorder?.describe() ?? null }), extras })
  recorder = createDebugRecorder({ log: base, getStream, ...recorderDeps })
  let prep = null
  let unsub = null
  let imported = false
  const sink = (events, g, input) => { try { logPillEvents(base, events, input) } catch { /* отладка не мешает игре */ } }
  return {
    ...base,
    recorder,
    /** Слушатель (onDebug): всё в журнал; «Слушаю…» — старт записи на текущем потоке */
    listen(kind, d) {
      try { base.listen(kind, d); if (kind === 'status' && d?.status === 'listening') recorder.attach() } catch { /* отладка не мешает распознаванию */ }
    },
    /** На старте игры, до слушателя: запоминать потоки распознавателя и ловить события пилюль */
    arm() {
      recorder.arm(); setStudentDebug(sink)
      probe.install() // отладка могла включиться уже после старта приложения; повторный вызов безопасен
      const take = ev => { const { at, kind, ...d } = ev; base.ext(at, 'probe', kind, d) }
      if (!imported) { imported = true; probe.snapshot().forEach(take) } // всё, что было до игры: запрос микрофона при старте урока, тап «Начать»
      unsub ??= probe.subscribe(take)
    },
    /** Выход из игры (и ложное размонтирование StrictMode): отписаться и остановить запись; финальная выгрузка (prepare) от этого не портится */
    disarm() { setStudentDebug(null); unsub?.(); unsub = null; recorder.stop() },
    /** Финал: запись остановлена, аудио готово к выгрузке (один раз; Promise → части записи [{ mime, base64, startedAtMs }]) */
    prepare() { return (prep ??= Promise.all([recorder.stop(), probe.queryPermission('end')]).then(() => prepareAudio(recorder)).catch(() => [])) },
  }
}

/** Что писать про стадию: номер, раунд, ступень, текст ступени */
const stageInfo = (idx, o) => ({ idx, ...(o?.round ? { round: o.round.kind } : {}), ...(o?.step ? { step: o.step.id, text: o.step.text, reps: o.step.reps?.length } : {}) })

export function useWordLaneDebug({ chunks, translation, lang, stage, idx, stageObj }) {
  const [dbg] = useState(() => createDebugSession({ enabled: debugEnabled({ toggle: getPlayerDebugUiValue() }), weak: isWeakDevice(), getStream: gameMicLib.getGameMic }))
  useEffect(() => {
    if (!dbg.enabled) return undefined
    dbg.meta({ phrase: chunks.join(' | '), chunks, translation, lang })
  }, [dbg, chunks, translation, lang])
  useEffect(() => {
    if (!dbg.enabled) return undefined
    dbg.arm()
    return () => dbg.disarm()
  }, [dbg])
  useEffect(() => {
    if (!dbg.enabled) return
    dbg.stage(stage === 'run' ? stageObj?.type ?? 'run' : stage, stageInfo(idx, stageObj))
    if (stage === 'reveal') dbg.prepare() // финал: запись остановлена, пока ученик читает перевод
  }, [dbg, stage, idx, stageObj])
  return dbg
}
