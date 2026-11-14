// Эпизод «Мия» (прототип): чистая машина состояния без React и DOM. Мия приходит, когда ученик ошибается (чужое слово или «не успел») во ВТОРОМ круге
// прохода A (sprint2) или B (catch2) — один раз на проход. Сталкивает Пита (коробка падает на него), ускоряет дорожку (step.boost.k × MIA.BOOST для ещё не
// выехавших пилюль) и колет репликами (miaLines.js). Три верных подряд — Мия отпрыгивает за экран, прихватив лапами коробку, Пит свободен; круг кончился раньше — Мия
// отпускает Пита сама (фаза 'out' потом остаётся: анимация ухода доигрывает без обрыва, повторного прихода в тот же проход нет — used). Дорожка меняет цвет на время Мии (CSS .wl[data-mia], race-mia.css). Пит без голосовой реплики: слова говорит его обычная озвучка.
// reduceMia(m, ev) → { mia, say, boost }: say — реплики (id, who, delay от события, мс), boost — новое k для step.boost (null — без изменений).
// ev: { t: 'enter' | 'win' | 'miss' | 'fail', stage, now }.
import { variantOf } from './miaLines.js'

export const MIA = { BOOST: 1.15, STREAK_LEAVE: 3, OK_EVERY: 3, PUSH_AT: 200, ANNOUNCE_AT: 3000, REPLY_AT: 5200, ANNOUNCE2_AT: 7400, ANNOUNCE3_AT: 9800, BACK_AT: 2600, BACK2_AT: 5200 }

export const miaInit = () => ({ phase: 'off', act: '', used: {}, streak: 0, wins: 0, hits: 0, seq: 0, at: 0, why: '' })

/** Второй круг прохода A или B? (стадия sprint2 / catch2) */
export const isSecondCircle = st => !!st && st.type === 'student' && ['sprint', 'catch'].includes(st.act) && st.sid === `${st.act}2`

const line = (id, who, delay = 0) => ({ id, who, delay })
const leave = (m, now, why, say) => ({ mia: { ...m, phase: 'out', at: now, why, seq: m.seq + 1 }, say, boost: 1 })

export function reduceMia(m, ev) {
  const { t, stage, now = 0 } = ev
  if (t === 'enter') {
    if (m.phase === 'in' && !(isSecondCircle(stage) && stage.act === m.act)) return leave(m, now, 'end', [line('mia_end', 'mia'), line('pit_end', 'pit', 2400)]) // круг кончился: Мия отпускает Пита
    return { mia: m, say: [], boost: null }
  }
  if (!isSecondCircle(stage)) return { mia: m, say: [], boost: null }
  const word = stage.words?.[ev.idx]
  const ok = t === 'win' || (t === 'fail' && !!word?.trap)          // ловушка: верно промолчать
  const bad = t === 'miss' || (t === 'fail' && !word?.trap)
  if (m.phase === 'in') {
    if (ok) {
      const streak = m.streak + 1, wins = m.wins + 1
      if (streak >= MIA.STREAK_LEAVE) return leave({ ...m, streak, wins }, now, 'win', [line('mia_leave', 'mia'), line('pit_back_1', 'pit', MIA.BACK_AT), line('pit_back_2', 'pit', MIA.BACK2_AT)])
      const say = streak === 2 ? [line('mia_streak2', 'mia')] : wins % MIA.OK_EVERY === 1 ? [line(variantOf('mia_ok', m.hits + 1), 'mia')] : []
      return { mia: { ...m, streak, wins, hits: say.length && streak !== 2 ? m.hits + 1 : m.hits }, say, boost: null }
    }
    if (bad) return { mia: { ...m, streak: 0, hits: m.hits + 1, seq: m.seq + 1 }, say: [line(variantOf('mia_miss', m.hits + 1), 'mia')], boost: null }
    return { mia: m, say: [], boost: null }
  }
  if (bad && !m.used[stage.act]) { // первая ошибка второго круга этого прохода — Мия приходит
    return {
      mia: { ...m, phase: 'in', act: stage.act, used: { ...m.used, [stage.act]: true }, streak: 0, wins: 0, seq: m.seq + 1, at: now, why: '' },
      say: [line('mia_push', 'mia', MIA.PUSH_AT), line('mia_announce_1', 'mia', MIA.ANNOUNCE_AT), line('pit_reply', 'pit', MIA.REPLY_AT), line('mia_announce_2', 'mia', MIA.ANNOUNCE2_AT), line('mia_announce_3', 'mia', MIA.ANNOUNCE3_AT)], boost: MIA.BOOST,
    }
  }
  return { mia: m, say: [], boost: null }
}

/** Мия на экране (коробка, подсветка дорожки): пока она «в игре» или уходит */
export const miaShown = m => m.phase === 'in' || m.phase === 'out'

/** Рабочая коробка директора (useRaceActs): m — состояние машины, step — ступень, которой Мия ускорила дорожку, key — номер пачки реплик. Мутации — функциями (как raceState.putState) */
export const makeMiaBox = () => ({ m: miaInit(), step: null, key: 0 })
/** Применить результат reduceMia к рабочей коробке: состояние, ускорение дорожки (boost.k ступени; 1 — вернуть) и номер пачки реплик → вид для экрана */
export function applyMia(mb, r, stage) {
  mb.m = r.mia
  if (r.boost === 1) { if (mb.step?.boost) mb.step.boost.k = 1; mb.step = null }
  else if (r.boost != null && stage?.step?.boost) { stage.step.boost.k = r.boost; mb.step = stage.step }
  if (r.say.length) mb.key += 1
  return { mia: r.mia, cues: r.say, key: mb.key }
}
