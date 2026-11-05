// Прогресс-бар сверху «Гонки с Питом» (CONCEPT_RACE.md, «Бар живёт весь разгон»): чистая модель без DOM и часов. Бар не исчезает, пока идут слова. Сегмент = слово круга (цвет — ступень памяти слова, как при зарядке). Жизнь бара:
//  • ЗАРЯД: слова круга летят в бар снизу вверх (заставка RaceChargeRun.jsx: в начале игры, перед вторым кругом и перед «Слушай и лови»), бар полный — по сегменту на слово;
//  • РАСХОД: с каждой сыгранной пилюлей (слово принято, не успел или чужой ответ — пилюля разрешилась) исчезает один сегмент справа налево (первым гаснет самый правый, v3.3.117); слова закончились — бар пуст;
//  • перезаряд — новый круг: слова второго круга («Разгон», «Слушай и лови») или слова этапа 2 заряжают бар заново.
// Состояние бара — {key, segs, spent, done}: события 'charge' (слова круга) и 'spend' (номер пилюли; повтор события про ту же пилюлю бар не тратит), редюсер barReduce. Экран не хранит бар сам: barOf выводит его из стадии и
// результатов гонки (raceState.js: results[номер пилюли] появляется, когда пилюля принята / упущена / ошибочна), поэтому бар всегда сходится с игрой, даже если событие пришло дважды. Рисует RaceBar.jsx, стили — race-bar.css.
import { levelColor } from './raceCharge.js'

export const BAR_ACTS = ['sprint', 'catch'] // акты-очереди пилюль: в них бар расходуется
export const BAR_CORE_PX = 6                // толщина тонкого бара (как у подложки заставки, raceCharge.BAR_CORE_PX)

/** Сегменты бара по словам круга: [{ i, text, level, color, from, to }] (from / to — % ширины, в сумме ровно 100) */
export function barSegments(words = []) {
  const n = words.length, share = n ? 100 / n : 0
  return words.map((w, i) => {
    const level = Number.isFinite(w.level) ? w.level : 1
    return { i, text: w.text, level, color: levelColor(level), from: +(i * share).toFixed(3), to: i === n - 1 ? 100 : +((i + 1) * share).toFixed(3) }
  })
}

export const barNew = (words, key = '') => ({ key, segs: barSegments(words), spent: 0, done: [] })

/** Событие бара: { t: 'charge', words, key } — новый круг, бар полный; { t: 'spend', idx } — пилюля idx сыграна, исчезает следующий справа сегмент (повтор про тот же idx — ничего) */
export function barReduce(bar, ev) {
  if (ev.t === 'charge') return barNew(ev.words, ev.key)
  if (ev.t === 'spend' && bar && !bar.done.includes(ev.idx) && bar.spent < bar.segs.length) return { ...bar, spent: bar.spent + 1, done: [...bar.done, ev.idx] }
  return bar
}

/** Сколько сегментов осталось */
export const barLeft = bar => (bar ? bar.segs.length - bar.spent : 0)

/** Бар пуст? (слова закончились) */
export const barEmpty = bar => !!bar && barLeft(bar) === 0

/**
 * Бар на экране из стадии и состояния гонки (rh.race): только на ступени ученика «Разгона» / «Слушай и лови» (круг 1 — stage.sid = act, круг 2 — act + '2'); в остальных стадиях — null (бар спрятан). Расход берётся из results этого круга
 * (raceState.js: s[act].results и s[act].r2.results) — сколько пилюль уже разрешилось. → { key, segs, spent, done } или null
 */
export function barOf({ stage, race }) {
  if (stage?.type !== 'student' || !BAR_ACTS.includes(stage.act) || !stage.words?.length) return null
  const q = race?.[stage.act], second = stage.sid === `${stage.act}2`
  const results = (second ? q?.r2?.results : q?.results) ?? {}
  return Object.keys(results).map(Number).sort((a, b) => a - b).reduce((bar, idx) => barReduce(bar, { t: 'spend', idx }), barNew(stage.words, stage.sid))
}

/**
 * Слова для зарядки бара перед стадией stage (по объявлению: sprint-ann, sprint2-ann, catch-ann, catch2-ann) — слова следующей за ней ступени ученика. → [{ text, level }] или [] (бар не заряжается: другая стадия)
 * stages — все стадии, i — номер объявления. Круг 2 вписывается в ступень директором (raceExtraRound.js) ДО объявления, поэтому слова второго круга уже здесь.
 */
export function chargeWordsOf(stages, i) {
  const a = stages?.[i], n = stages?.[i + 1]
  if (a?.type !== 'announce' || n?.type !== 'student' || !BAR_ACTS.includes(n.act) || a.act !== n.act) return []
  return (n.words ?? []).map(w => ({ text: w.text, level: Number.isFinite(w.level) ? w.level : 1 }))
}

/** Слова заставки начала игры: слова первого этапа-очереди ([{ text, level }]); у плана без «Разгона» и «Слушай и лови» — null (слова плана, chargeWords) */
export function openingWords(acts) {
  const a = acts?.[0]
  return a && BAR_ACTS.includes(a.id) ? a.words.map(w => ({ text: w.text, level: w.level })) : null
}
