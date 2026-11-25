import { useCallback, useEffect, useRef, useState } from 'react'
import { createBoxFree, FREE_WINDOW_MS, FREE_WATCHDOG_MS, nudgeInit, nudgeStep, createTimers } from './miaBoxFree.js'
import { waitCircleSpeech } from './miaCircleEnd.js'
import { scenePush } from '../../../shared/lib/sceneTrace.js' // трасса сцены («Таймлайн игры»): только запись

// Пит в коробке без Мии (директор гонки, useRaceActs; v3.3.290): Мия выпрыгнула одна (RaceMia → onStuck) → Пит просит помочь; касания по коробке (onHit) считает createBoxFree: два подряд — коробка снята (событие free,
// отлетает без Мии, Пит благодарит), одно без второго — «попробуй быстрее». Конец финала (стадия boss-end) держится, пока коробку не сняли и Пит не договорил (afterCount опрашивает), но не дольше сторожа.
// Игрок бездействует — Пит повторяет просьбу (событие nudge; правило — miaBoxFree.nudgeStep: после NUDGE_IDLE_MS тишины без касаний, не больше NUDGE_MAX раз). miaEvent(ev) — вход в машину Мии, mb — её рабочая коробка, rhAfter — обычный afterCount директора репетиции.
export const FREE_LEAVE_MS = 1300 // отлёт коробки (miaMotion.LEAVE.END) до реплики благодарности
export const FREE_TAIL_MS = 400   // после благодарности Пита до следующей стадии
export const SPEECH_POLL_MS = 120 // как часто смотрим, договорили ли Мия и Пит

export function useMiaBoxFree({ mb, miaEvent, mspeech, running, rhAfter, log }) {
  const bf = useRef(null), done = useRef(false), lockUntil = useRef(0), touchedAt = useRef(-Infinity), armRef = useRef(null)
  const [timers] = useState(createTimers), later = timers.later
  // ПАУЗА И ВЫХОД ИЗ СТАДИИ СНИМАЮТ ВСЕ ТАЙМЕРЫ (running пуст на паузе; журнал владельца 2026-11-25: под окном комментария сторож «снял» коробку и стадия ушла без просьбы). После «Продолжить» на той же
  // стадии Пит всё ещё в коробке (solo 'stuck') — сторож и повтор просьбы заводятся ЗАНОВО, с нуля. Правило: любая очередь «по таймеру / по концу звука» снимается на паузе.
  const free = useCallback(why => {
    if (mb.m.solo !== 'stuck') return
    log(`[mia] коробка снята (${why}): отлетает без Мии`); scenePush('answer', { res: 'win', idx: 'box', word: `коробка снята (${why})`, final: true })
    miaEvent({ t: 'free', stage: running })
    const said = () => { if (mspeech.pending() > 0) later(said, SPEECH_POLL_MS); else later(() => { done.current = true }, FREE_TAIL_MS) } // стадию отпускает РЕАЛЬНЫЙ конец благодарности Пита (очередь речи пуста), а не оценка её длины
    later(said, FREE_LEAVE_MS + 150)
  }, [mb, miaEvent, mspeech, running, later, log])
  const onTry = useCallback(() => { // Мия ушла, Пит говорит «Она ушла? Попробую выбраться»; вернуть длину реплики (мс): RaceMia начнёт трясти коробку, когда он договорит
    if (mb.m.solo !== 'keep') return 0
    log('[mia] Пит: «она ушла? попробую выбраться», дальше трясёт коробку')
    miaEvent({ t: 'try', stage: running })
    return mspeech.msOf('boss_pit_try', 'pit')
  }, [mb, miaEvent, mspeech, running, log])
  const onStuck = useCallback(() => {
    if (mb.m.solo !== 'keep') return
    bf.current = createBoxFree(); done.current = false
    log('[mia] Мия выпрыгнула одна: Пит просит помочь, ждём два касания по коробке'); scenePush('ask', { idx: 'box', what: 'задание игроку', word: 'сними коробку с Пита (два касания)', phrase: true })
    miaEvent({ t: 'stuck', stage: running })
    armRef.current?.()
  }, [mb, miaEvent, running, log])
  useEffect(() => { // сторож и повтор просьбы: заводятся, когда Пит попросил помочь (onStuck) и заново после паузы
    armRef.current = why => {
      if (why) log(`[mia] Пит в коробке (${why}): сторож и повтор просьбы заведены заново`)
      bf.current ??= createBoxFree(); done.current = false
      later(() => free('сторож: касаний не было'), FREE_WATCHDOG_MS)
      let st = nudgeInit(performance.now()); touchedAt.current = -Infinity
      const poll = () => { // повтор просьбы при бездействии: от конца речи и последнего касания
        if (mb.m.solo !== 'stuck') return
        const r = nudgeStep(st, { now: performance.now(), busy: mspeech.pending() > 0, touchedAt: touchedAt.current }); st = r.st
        if (r.say) { log(`[mia] касаний нет: Пит повторяет просьбу (${st.n})`); miaEvent({ t: 'nudge', stage: running }) }
        later(poll, SPEECH_POLL_MS * 2)
      }
      later(poll, SPEECH_POLL_MS * 2)
    }
  })
  useEffect(() => { // стоит ПОСЛЕ эффекта выше: завод после паузы берёт свежие free / running
    if (running?.mia === 'end' && mb.m.solo === 'stuck') armRef.current?.('после паузы')
    return () => timers.clear()
  }, [running, mb, timers])
  const onHit = useCallback(() => {
    if (mb.m.solo !== 'stuck' || !bf.current || performance.now() < lockUntil.current) return // пока Пит говорит «можешь сильнее её поддеть», касания не считаются (владелец)
    touchedAt.current = performance.now()
    const r = bf.current.hit(performance.now())
    if (r === 'free') free('касания')
    else if (r === 'one') later(() => { if (bf.current?.expired(performance.now())) { log('[mia] одно касание без второго: «можешь сильнее её поддеть», касания заблокированы, пока Пит договаривает'); lockUntil.current = performance.now() + mspeech.msOf('boss_pit_faster', 'pit') + 900; miaEvent({ t: 'faster', stage: running }) } }, FREE_WINDOW_MS + 60)
  }, [mb, miaEvent, mspeech, running, later, free, log])
  /** Обычный конец стадии — rhAfter; Пит в коробке — ждём, пока коробку снимут и Пит договорит (опрос раз в 300 мс) */
  const afterCount = useCallback(fn => {
    if (!mb.m.solo) { waitCircleSpeech({ st: running, m: mb.m, pending: () => mspeech.pending(), later, go: () => rhAfter(fn) }); return } // «Допрос» пройден без ошибок: стадия-конец ждёт РЕАЛЬНЫЙ конец «твоя взяла…» и «спасибо за помощь…» (mia/miaCircleEnd.js); экзамен — как был
    const t0 = performance.now()
    const poll = () => { if (done.current || performance.now() - t0 > FREE_WATCHDOG_MS + 15000) rhAfter(fn); else later(poll, 300) }
    poll()
  }, [mb, rhAfter, later, mspeech, running])
  return { onTry, onStuck, onHit, afterCount }
}
