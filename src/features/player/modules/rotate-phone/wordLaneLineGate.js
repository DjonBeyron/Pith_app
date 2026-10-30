import { gameStartTrace } from '../../../../shared/lib/gameStartTrace.js'
import { gameAudioWarm } from '../../../../shared/lib/gameAudioWarm.js'
import { wordSlotInfo } from './wordLaneClips.js'
import { lineKey } from './wordLaneCatLines.js'

// Отсрочка озвученной реплики кота до готовности прогрева (iPhone: «в начале кот говорит без звука»). Реплика Пита, озвученная из библиотеки слов, идёт через слот <audio>; слот годится, только когда
// (1) прогрев закончен (wakeGameAudio сделал своё, gameStartTrace.warmed()), (2) слот разбужен тишиной в жесте и звук подставлен (prepared), (3) iOS не прерывал аудиосессию уже после пробуждения слота
// (иначе слот помечен прерванным и play() молчит, пока прогрев не пройдёт заново). Если не готово — ждём (опрос раз в LINE_POLL_MS) не дольше LINE_WAIT_MS; не дождались — реплику говорит голос системы
// (useCatLines), причина уходит в журнал «[cat-voice]». Реплика без озвучки (нет url) подписью — не ждёт: звука у неё нет.
export const LINE_WAIT_MS = 1500
export const LINE_POLL_MS = 80

/** Можно ли сейчас играть озвученную реплику id? → { ready, why } (why — по-русски, что мешает) */
export function lineReadiness(id, { trace = gameStartTrace, warm = gameAudioWarm, slotOf = wordSlotInfo } = {}) {
  if (!trace.inWindow()) return { ready: true, why: null } // отсрочка нужна только в начале игры (первые 15 с с тапа); дальше реплика играет как раньше
  if (!trace.warmed()) return { ready: false, why: 'прогрев звука ещё не закончен' }
  const slot = slotOf(lineKey(id))
  if (!slot.exists) return { ready: false, why: 'слота реплики нет' }
  if (!slot.hasUrl) return { ready: false, why: 'звук слота ещё не подгружен' }
  if (slot.wokeErr) return { ready: false, why: `слот не разбужен (play() тишины отклонён: ${slot.wokeErr})` }
  if (!slot.prepared) return { ready: false, why: 'слот не разбужен или звук ещё не подставлен' }
  const last = warm.status?.().lastInterruptAt ?? 0
  if (last > 0 && slot.wokeAt > 0 && last > slot.wokeAt) return { ready: false, why: 'аудиосессию прервали после пробуждения слота' }
  return { ready: true, why: null }
}

/**
 * Ждать готовности: check() → { ready, why }. Готово сразу — onReady(0) синхронно. Иначе опрос раз в pollMs; дождались — onReady(waitedMs), не дождались за maxMs — onTimeout(waitedMs, why). → отмена.
 */
export function waitForLine(check, { onReady, onTimeout }, { maxMs = LINE_WAIT_MS, pollMs = LINE_POLL_MS, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const first = check()
  if (first.ready) { onReady(0); return () => {} }
  const t0 = now()
  let timer = 0
  let cancelled = false
  const tick = () => {
    if (cancelled) return
    const waited = Math.round(now() - t0)
    const r = check()
    if (r.ready) { onReady(waited); return }
    if (waited >= maxMs) { onTimeout(waited, `слот не успел за ${maxMs} мс: ${r.why}`); return }
    timer = setTimer(tick, pollMs)
  }
  timer = setTimer(tick, pollMs)
  return () => { cancelled = true; clearTimer(timer) }
}
