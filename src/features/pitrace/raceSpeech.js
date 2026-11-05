// Секвенсор речи «Гонки с Питом» (v3.3.117, CONCEPT_RACE.md, «Секвенсор речи и отступы»). Замечание владельца: «Пит говорит рано после успеха — следующее слово или похвалу без отступа». Причина: отступы считались по ОЦЕНКАМ
// (lineMs, длина файла), а события речи приходили из разных мест (зачёт, взлёт, очередь кота, holdAll через busyLeft). Теперь один автомат ведёт всю цепочку «зачёт → похвала → перевод следующего слова → выезд пилюли»,
// а за конец речи принимает РЕАЛЬНЫЙ конец воспроизведения (ended источника Web Audio / <audio>), оценка нужна только как страховка. Чистая машина состояний: часы, таймеры, журнал и команды приходят аргументами.
//
// ВХОД (события):
//   claim(praise)      — слово засчитано; praise — id похвалы (raceGood.js) или null (похвалы нет)
//   riseStart()        — пилюля начала взлёт (fx.win → rec('win'))
//   pillGone(why)      — пилюля ушла: 'missed' («не успел», fail движка) запускает отступ; 'rise' (улетевшая вверх) — только журнал
//   speechEnd(kind)    — РЕАЛЬНЫЙ конец речи: 'praise' (ended реплики) или 'trans' (ended перевода); нет его за «оценка + END_GUARD_MS» — машина сама считает речь оконченной (страховка 'guard')
//   translation(ms)    — перевод следующего слова начал звучать (ms — оценка длины; 0 — озвучки нет, молча); praiseStarted(ms) — реплика пошла (известна оценка длины)
// ПРАВИЛА (отступы):
//   с похвалой:   riseStart + GOOD_DELAY_MS → ПОХВАЛА; speechEnd(praise) + AFTER_GOOD_GAP_MS → ПЕРЕВОД РАЗРЕШЁН
//   без похвалы:  riseStart + PRE_SAY_GAP_MS → ПЕРЕВОД РАЗРЕШЁН;   «не успел»: pillGone('missed') + PRE_SAY_GAP_MS → ПЕРЕВОД РАЗРЕШЁН
//   нет взлёта за GOOD_ARM_MS после зачёта — отсчёт идёт от зачёта (страховка, как раньше); похвалу сказать не вышло (Пит занят, нет реплики) — она считается оконченной сразу
// ВЫХОД (команды): say.praise(id, h) — сказать похвалу (h.onSpeak / h.onEnd приводит адаптер); holdMs() — сколько мс движку считать Пита занятым: LOCK_MS, пока перевод запрещён (движок не посылает 'pre' и не выкатывает пилюлю),
//   0 — перевод разрешён (движок шлёт 'pre' → fx.pre → translation()); дальше выезд пилюли считает сам движок: за halfTravelMs до ожидаемого конца перевода (spawnEarly), а т. к. перевод разрешён только после speechEnd
//   похвалы, пилюля не выезжает раньше него. Журнал «[speech] +N мс …»: N — от зачёта; каждый переход с причиной.
import { GOOD_DELAY_MS, GOOD_ARM_MS } from './raceGood.js'
import { PRE_SAY_GAP_MS } from './raceStageKit.js'

export const AFTER_GOOD_GAP_MS = 350 // перевод следующего слова — через столько после РЕАЛЬНОГО конца похвалы (на слух: «сказал и выдохнул»)
export const END_GUARD_MS = 800      // страховка: нет speechEnd за «оценка + столько» — речь считается оконченной (источник не прислал ended: контекст прерван, элемент оборван)
export const PRAISE_WAIT_MS = 1600   // похвала может ждать слот звука (useCatLines, waitMs 1,5 с): пока реплика не пошла, страховка отсчитывается от этого запаса, а не от оценки
export const PRAISE_GUESS_MS = 3000  // пока оценка длины неизвестна (реплика ещё не пошла), считаем похвалу такой длины
export const PRAISE_TYPICAL_MS = 1500 // типичная длина похвалы — только для оценки занятости Пита директором стадий (pendingMs)
export const LOCK_MS = 60000         // holdMs, пока перевод запрещён: «Пит занят надолго» — движок ждёт (spawnEarly при таком pitMs ложно)

export function createRaceSpeech({ say = {}, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, log = () => {} } = {}) {
  let phase = 'idle'   // idle (перевод разрешён / идёт) | claimed (ждём взлёта) | praise-wait (до похвалы) | praise (похвала звучит) | gap (отступ до перевода)
  let c = null         // цикл после зачёта: { at, praise }
  let timer = 0
  let guard = 0
  let praiseAt = 0     // когда реплика пошла (для журнала «длиннее оценки»)
  let praiseEst = 0
  const clear = () => { clearTimer(timer); timer = 0 }
  const clearGuard = () => { clearTimer(guard); guard = 0 }
  const since = () => (c ? `+${Math.round(now() - c.at)} мс` : '—')
  const note = text => { try { log(`[speech] ${since()} ${text}`) } catch { /* журнал не мешает игре */ } }
  const go = (next, why) => { if (next !== phase) { note(`${phase} → ${next}: ${why}`); phase = next } }

  const open = why => { clear(); go('idle', `перевод следующего слова разрешён (${why})`) }
  const after = (ms, fn) => { clear(); timer = setTimer(() => { timer = 0; fn() }, ms) }
  const armGuard = (ms, why) => { clearGuard(); guard = setTimer(() => { guard = 0; note(`speech-end не пришёл за ${Math.round(ms)} мс (${why}) — страховка: речь окончена`); self.speechEnd('praise', true) }, ms) }

  const firePraise = () => {
    clear(); go('praise', `похвала «${c.praise}» — через ${GOOD_DELAY_MS} мс после взлёта`)
    armGuard(PRAISE_WAIT_MS + PRAISE_GUESS_MS + END_GUARD_MS, 'реплика ещё не пошла')
    let said = false
    try { said = say.praise?.(c.praise, { onSpeak: o => self.praiseStarted(o?.ms ?? 0), onEnd: () => self.speechEnd('praise') }) !== false } catch { said = false }
    if (!said) { note('похвалу сказать не вышло (Пит занят или реплики нет) — считаю оконченной'); self.speechEnd('praise', true) }
  }

  const self = {
    /** Слово засчитано. praise — id похвалы или null */
    claim(praise = null) {
      clear(); clearGuard(); c = { at: now(), praise: praise || null }
      go('claimed', praise ? `зачёт, похвала «${praise}» ждёт взлёта` : 'зачёт, похвалы нет')
      timer = setTimer(() => { timer = 0; note(`взлёта пилюли не было за ${GOOD_ARM_MS} мс — отсчёт от зачёта`); self.riseStart(true) }, GOOD_ARM_MS)
    },
    /** Пилюля начала взлёт (fx.win). late — страховка по таймеру */
    riseStart(late = false) {
      if (phase !== 'claimed') { if (!late && phase !== 'idle') note(`взлёт вне цикла зачёта (${phase}) — игнорирую`); return }
      clear()
      if (c.praise) { go('praise-wait', `взлёт${late ? ' (по страховке)' : ''}, похвала через ${GOOD_DELAY_MS} мс`); after(GOOD_DELAY_MS, firePraise) }
      else { go('gap', `взлёт${late ? ' (по страховке)' : ''}, без похвалы: перевод через ${PRE_SAY_GAP_MS} мс`); after(PRE_SAY_GAP_MS, () => open('без похвалы')) }
    },
    /** Реплика пошла (адаптер знает её длину): страховка отсчитывается от этого мгновения. ms — оценка с учётом выскакивания головы */
    praiseStarted(ms) {
      if (phase !== 'praise') return
      praiseAt = now(); praiseEst = ms
      armGuard(ms + END_GUARD_MS, `оценка ${Math.round(ms)} мс + ${END_GUARD_MS}`)
      note(`похвала пошла, оценка ${Math.round(ms)} мс`)
    },
    /** Пилюля ушла. 'missed' — не успел: отступ PRE_SAY_GAP_MS до перевода (если Пит не говорит похвалу); 'rise' — улетевшая, журнал */
    pillGone(why = 'missed') {
      if (why !== 'missed') { note('пилюля ушла вверх (взлёт окончен)'); return }
      if (phase === 'claimed' || phase === 'praise-wait' || phase === 'praise') { note('не успел, но зачёт / похвала ещё впереди — отступ после неё'); return }
      c = { at: now(), praise: null }
      go('gap', `не успел: перевод через ${PRE_SAY_GAP_MS} мс`); after(PRE_SAY_GAP_MS, () => open('после «не успел»'))
    },
    /** Реальный конец речи. kind 'praise' — запускает отступ AFTER_GOOD_GAP_MS; 'trans' — конец перевода (журнал). guard — по страховке */
    speechEnd(kind = 'praise', guarded = false) {
      if (kind === 'trans') { note('speech-end: перевод доиграл'); return }
      if (phase !== 'praise') return
      clearGuard()
      const real = praiseAt ? Math.round(now() - praiseAt) : null
      note(`speech-end: похвала ${guarded ? 'считается оконченной' : 'доиграла'}${real != null ? ` за ${real} мс (оценка ${Math.round(praiseEst)})` : ''}; перевод через ${AFTER_GOOD_GAP_MS} мс`)
      praiseAt = 0
      go('gap', `после похвалы отступ ${AFTER_GOOD_GAP_MS} мс`); after(AFTER_GOOD_GAP_MS, () => open('после похвалы'))
    },
    /** Перевод начал звучать (fx.pre): ms — оценка длины, 0 — озвучки нет. Дальше пилюлю держит Пит (busy) — выезд считает движок */
    translation(ms) {
      if (phase !== 'idle') { note(`перевод сказан вне отступа (${phase}) — без ожидания`); clear(); clearGuard(); phase = 'idle' }
      note(ms > 0 ? `перевод пошёл, оценка ${Math.round(ms)} мс` : 'перевода нет (озвучки нет) — пилюля выезжает сразу')
    },
    /** Сколько мс движку считать Пита занятым: LOCK_MS, пока перевод запрещён; 0 — разрешён */
    holdMs: () => (phase === 'idle' ? 0 : LOCK_MS),
    /** Грубо: сколько мс секвенсор ещё займёт Пита (для расписания реплик этапа, useRehearsalActs.timingOf): похвала впереди / звучит / отступ */
    pendingMs() {
      if (phase === 'idle') return 0
      if (phase === 'claimed') return c?.praise ? GOOD_DELAY_MS + PRAISE_TYPICAL_MS : PRE_SAY_GAP_MS
      if (phase === 'praise-wait') return GOOD_DELAY_MS + PRAISE_TYPICAL_MS
      if (phase === 'praise') return Math.max(200, (praiseEst || PRAISE_TYPICAL_MS) - (praiseAt ? now() - praiseAt : 0)) + AFTER_GOOD_GAP_MS
      return AFTER_GOOD_GAP_MS
    },
    phase: () => phase,
    /** Пауза / выход / смена этапа: всё сброшено */
    reset(why = 'сброс') { clear(); clearGuard(); if (phase !== 'idle') note(`${why}: ${phase} → idle`); phase = 'idle'; c = null; praiseAt = 0 },
  }
  return self
}
