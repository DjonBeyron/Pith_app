// Эпизод «Мия» (прототип): чистая машина состояния без React и DOM. Мия приходит ВМЕСТО обычного дополнительного круга (разгон ×1,1): когда по итогам прохода A (sprint) или B (catch)
// слабых слов две и больше (raceExtraRound.extraTarget), директор идёт не на «а теперь давай повысим скорость» и круг 2, а на скрытую стадию-церемонию `${act}3-ann` (stage.mia === 'ann',
// raceStageKit.queueStages) — один раз за игру. Там Пит начинает репликой «Некоторые слова забылись…», на ней падает коробка (MIA.DROP_AT), Пит мечется и мяукает, Мия запрыгивает
// на крышку и говорит вступительные реплики; три ноты и круг ждут конца речи. Потом круг с Мией `${act}3` (stage.mia === 'round'): слова дополнительного круга в новом порядке,
// дорожка быстрее (step.boost.k × MIA.BOOST — ускоряет её Мия, а не обычный разгон) и колкие реплики. Три верных подряд — Мия отпрыгивает за экран, прихватив лапами коробку, Пит свободен;
// круг кончился раньше — Мия отпускает Пита сама (фаза 'out' потом остаётся: анимация ухода доигрывает без обрыва, повторного прихода за игру нет — used). Дорожка меняет цвет на время круга с Мией (fast; CSS .wl[data-mia], race-mia.css). Слова и переводы говорит Пит (его озвучка), Мия только колет.
// reduceMia(m, ev) → { mia, say, boost }: say — реплики (id, who, delay от события, мс), boost — новое k для step.boost (null — без изменений).
// ev: { t: 'enter' | 'win' | 'miss' | 'fail', stage, now }.
import { variantOf } from './miaLines.js'

export const MIA = { BOOST: 1.15, STREAK_LEAVE: 3, OK_EVERY: 3, DROP_AT: 1600, PUSH_AT: 1800, PANIC_AT: 4600, ANNOUNCE_AT: 6500, REPLY_AT: 8800, ANNOUNCE2_AT: 10800, ANNOUNCE3_AT: 13000, BACK_AT: 2600, BACK2_AT: 5200 }

export const miaInit = () => ({ phase: 'off', act: '', fast: false, used: {}, streak: 0, wins: 0, hits: 0, seq: 0, at: 0, why: '' })

/** Стадия эпизода: 'ann' — церемония прихода, 'round' — круг с Мией */
export const isMiaStage = st => st?.mia === 'ann' || st?.mia === 'round'

const line = (id, who, delay = 0) => ({ id, who, delay })
const none = m => ({ mia: m, say: [], boost: null })
const leave = (m, now, why, say) => ({ mia: { ...m, phase: 'out', fast: false, at: now, why, seq: m.seq + 1 }, say, boost: 1 })
const ceremony = () => [line('mia_push', 'mia', MIA.PUSH_AT), line('pit_panic', 'pit', MIA.PANIC_AT), line('mia_announce_1', 'mia', MIA.ANNOUNCE_AT), line('pit_reply', 'pit', MIA.REPLY_AT), line('mia_announce_2', 'mia', MIA.ANNOUNCE2_AT), line('mia_announce_3', 'mia', MIA.ANNOUNCE3_AT)]

export function reduceMia(m, ev) {
  const { t, stage, now = 0 } = ev
  if (t === 'enter') {
    if (stage?.mia === 'ann') { // церемония: Пит начинает репликой стадии, через DROP_AT падает коробка (at — момент падения), Мия запрыгивает, вступительные реплики (три ноты ждут их конца)
      if (m.phase === 'in' && m.act === stage.act) return none(m)
      return { mia: { ...m, phase: 'in', act: stage.act, used: { ...m.used, [stage.act]: true }, streak: 0, wins: 0, seq: m.seq + 1, at: now + MIA.DROP_AT, why: '', fast: false }, say: ceremony(), boost: null }
    }
    if (stage?.mia === 'round') return m.phase === 'in' && m.act === stage.act ? { mia: m.fast ? m : { ...m, fast: true }, say: [], boost: MIA.BOOST } : none(m) // круг с Мией: дорожка быстрее и меняет цвет (fast) — с этого круга, а не с церемонии
    if (m.phase === 'in') return leave(m, now, 'end', [line('mia_end', 'mia'), line('pit_end', 'pit', 2400)]) // круг кончился: Мия отпускает Пита
    return none(m)
  }
  if (stage?.mia !== 'round' || m.phase !== 'in') return none(m)
  const word = stage.words?.[ev.idx]
  const ok = t === 'win' || (t === 'fail' && !!word?.trap)          // ловушка: верно промолчать
  const bad = t === 'miss' || (t === 'fail' && !word?.trap)
  if (ok) {
    const streak = m.streak + 1, wins = m.wins + 1
    if (streak >= MIA.STREAK_LEAVE) return leave({ ...m, streak, wins }, now, 'win', [line('mia_leave', 'mia'), line('pit_back_1', 'pit', MIA.BACK_AT), line('pit_back_2', 'pit', MIA.BACK2_AT)])
    const say = streak === 2 ? [line('mia_streak2', 'mia')] : wins % MIA.OK_EVERY === 1 ? [line(variantOf('mia_ok', m.hits + 1), 'mia')] : []
    return { mia: { ...m, streak, wins, hits: say.length && streak !== 2 ? m.hits + 1 : m.hits }, say, boost: null }
  }
  if (bad) return { mia: { ...m, streak: 0, hits: m.hits + 1, seq: m.seq + 1 }, say: [line(variantOf('mia_miss', m.hits + 1), 'mia')], boost: null }
  return none(m)
}

/** Мия на экране (коробка, подсветка дорожки): пока она «в игре» или уходит */
export const miaShown = m => m.phase === 'in' || m.phase === 'out'

/** Рабочая коробка директора (useRaceActs): m — состояние машины, step — ступень, которой Мия ускорила дорожку, key — номер пачки реплик. Мутации — функциями (как raceState.putState) */
export const makeMiaBox = () => ({ m: miaInit(), step: null, key: 0, entered: '' })
/** Стадия с этой отметкой уже обработана эпизодом (true — первый раз) */
export function markMiaEntered(mb, key) { if (mb.entered === key) return false; mb.entered = key; return true }
/** Применить результат reduceMia к рабочей коробке: состояние, ускорение дорожки (boost.k ступени; 1 — вернуть) и номер пачки реплик → вид для экрана */
export function applyMia(mb, r, stage) {
  mb.m = r.mia
  if (r.boost === 1) { if (mb.step?.boost) mb.step.boost.k = 1; mb.step = null }
  else if (r.boost != null && stage?.step?.boost) { stage.step.boost.k = r.boost; mb.step = stage.step }
  if (r.say.length) mb.key += 1
  return { mia: r.mia, cues: r.say, key: mb.key }
}
