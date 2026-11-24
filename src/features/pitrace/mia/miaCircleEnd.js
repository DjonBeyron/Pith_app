// Конец круга «Допрос у Мии» (стадия `${act}3-end`) и переход от него дальше: всё, что идёт «после реплики», ждёт РЕАЛЬНЫЙ конец звука (очередь речи mia/miaSpeech.js), а не оценку длины реплик.
// Раньше стадию держала формула boss/raceEndHold.js: длина «твоя взяла…» + срок BACK2_AT + длина pit_back_2 + 800 — после замены текстов (владелец 2026-11-24) она давала ≈ 2,5–3 с тишины после последней реплики.
//  • circleHoldMs — минимум стадии: все слова верны — пока Мия отпрыгивает с коробкой (LEAVE.END), дальше стадию отпускает waitCircleSpeech; есть ошибки — короткий, стадию держит снятие коробки (useMiaBoxFree).
//  • waitCircleSpeech — переход к следующей стадии, когда очередь речи опустела (Мия «твоя взяла…» и Пит «спасибо за помощь…» договорили).
//  • revLineAfterMia — «Допрос» после прохода A пройден без ошибок: реплику разворота конвейера «теперь наоборот, секунду, переключаюсь на русский» (race_reverse) заменяет pit_back_2 «Едем дальше, теперь я говорю
//    по-английски, а ты называешь перевод» (решение владельца: одна реплика вместо пары). Пит говорит её ВМЕСТЕ с анимацией разворота (стадия catch-rev), а не до неё — без тишины и без двух «теперь наоборот» подряд.
//    В тапе (race_reverse_tap «теперь наоборот, тапай перевод») и после прохода B (дальше фразы, а не реверс) pit_back_2 не звучит: её текст туда не подходит.
//  • jumpAfterPush — Мия запрыгивает на коробку не раньше, чем договорит реплику из-за края экрана (mia_push): срок прыжка ARR.JUMP был подобран под прежнюю, более короткую реплику.
import { circleAll } from './raceMia.js'
import { ARR, LEAVE } from './miaMotion.js'

export const CIRCLE_KEEP_HOLD_MS = 600  // есть ошибки: стадию держит снятие коробки учеником (useMiaBoxFree.afterCount)
export const CIRCLE_WIN_TAIL_MS = 200   // все верно: после отлёта Мии с коробкой
export const CIRCLE_POLL_MS = 120
export const CIRCLE_WAIT_CAP_MS = 20000 // страховка: речь не должна держать стадию вечно
export const REV_LINE = 'race_reverse'
export const REV_LINE_AFTER_MIA = 'pit_back_2'
export const JUMP_PAD_MS = 150          // Мия договорила из-за края → прыжок

/** Стадия-конец круга «Допрос у Мии» (не экзамен) */
export const isCircleEnd = st => st?.mia === 'end' && st.act !== 'boss'

/** Минимум стадии-конца круга, мс (st.preWait — Мия договаривает последнюю колкость круга) */
export const circleHoldMs = (st, m) => (st?.preWait ?? 0) + (circleAll(m) ? Math.round(LEAVE.END * 1000) + CIRCLE_WIN_TAIL_MS : CIRCLE_KEEP_HOLD_MS)

/** Идти дальше (go), когда очередь речи опустела; не конец круга «Допроса» — сразу. later(fn, ms) — таймер вызывающего (снимается при выходе) */
export function waitCircleSpeech({ st, m, pending, later, go, now = () => performance.now() }) {
  if (!isCircleEnd(st) || m?.why !== 'win') { go(); return }
  const t0 = now()
  const poll = () => { if (pending() > 0 && now() - t0 < CIRCLE_WAIT_CAP_MS) later(poll, CIRCLE_POLL_MS); else go() }
  poll()
}

/** После стадии-конца cur: «Допрос» после прохода A пройден без ошибок, проход B голосом — реплика разворота становится pit_back_2. → true, если заменили */
export function revLineAfterMia(stages, cur, m) {
  if (!isCircleEnd(cur) || cur.act !== 'sprint' || m?.why !== 'win') return false
  const rev = (stages ?? []).find(x => x.sid === 'catch-rev')
  if (rev?.line !== REV_LINE) return false
  rev.line = REV_LINE_AFTER_MIA
  return true
}

/** Мия начала реплику из-за края (c: { id, ms }) на церемонии «Допроса»: прыжок — не раньше её конца. → новое состояние машины Мии или null (менять нечего). now — performance.now */
export function jumpAfterPush(m, c, now = performance.now()) {
  if (c?.id !== 'mia_push' || m?.phase !== 'in' || m.act === 'boss' || !(c.ms > 0)) return null
  const end = (now + c.ms + JUMP_PAD_MS - m.at) / 1000
  return end > (m.jump ?? ARR.JUMP) ? { ...m, jump: +end.toFixed(2) } : null
}

/** То же для рабочей коробки директора (mb.m — состояние машины): срок прыжка сдвинут → новое состояние (для экрана), иначе null */
export function syncJump(mb, c, now = performance.now()) {
  const m = jumpAfterPush(mb?.m, c, now)
  if (m) mb.m = m
  return m
}
