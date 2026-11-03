// Подписи дорожек сверху (WordLaneHeads): чистые решения без React — что показывать и что считать «новой подписью». Хуки состояния — useLaneLabels.js; раскладку подписей на стадии даёт labelsFor (wordLaneStages.js).
//  • «Сборка с конца» (акт build, v3.3.101): подписи НАКАПЛИВАЮТСЯ — ступень [2] → [1,2] → [0,1,2]: показаны куски, которые уже звучали в акте, и только новый добавляется. Раньше подписи считались заново на каждой стадии
//    (тихий экран пока Пит говорит реплику стадии и раскладка «только эта стадия» гасили их, а потом они появлялись снова). Теперь «были показаны» помнит память акта (nextLabels), а пока Пит говорит, показанные остаются;
//  • «новая подпись» (nextFrames): на дорожке появился текст, которого там не было (пусто → текст или другой текст) — вокруг подписи на время рамка цветом дорожки (WordLaneHeads, word-lane-label-frame.css).
export const FRAME_MS = 1300       // рамка висит: 1,2 с анимации + запас на последний кадр, потом data-new снимается
export const FRAME_LITE_MS = 1000  // слабое устройство: рамка без анимации на 1 с
export const ACCUMULATE_ACTS = ['build']

const EMPTY = () => ({ text: '', on: false })
export const blankLabels = () => [EMPTY(), EMPTY(), EMPTY()]
export const EMPTY_MEM = { act: null, acc: [null, null, null] }

/** Дорожки, которые к стадии stage (включительно) уже звучали в её акте: объединение step.active стадий акта от начала до неё. Подряд идущие стадии одного акта в списке лежат подряд */
export function builtLanes(stages, stage) {
  if (!stage?.act) return []
  const lanes = new Set()
  for (let j = stage.idx; j >= 0 && stages[j]?.act === stage.act; j--) (stages[j].step?.active ?? []).forEach(k => lanes.add(k))
  return [...lanes].sort()
}

const same = (a, b) => (a === b) || (!!a && !!b && a.text === b.text && a.on === b.on)

/**
 * Подписи с памятью акта. mem — { act, acc }, base — подписи стадии как есть ({ text, on }[3], пусто — подписи нет, в том числе когда Пит говорит), act — акт стадии, reached — дорожки, дошедшие до стадии.
 * В акте накопления: показанная подпись остаётся, пока акт идёт (даже если base на миг пустой), новая добавляется, когда её дорожка «дошла» (reached); подписи, до которых акт ещё не дошёл, не показываются.
 * В остальных актах — как есть (base). → { mem, labels }: mem тот же объект, если запоминать нечего (пустой рендер не пересоздаёт состояние).
 */
export function nextLabels(mem, { base, act, reached }) {
  if (!act || !ACCUMULATE_ACTS.includes(act)) return { mem: mem.act === null ? mem : EMPTY_MEM, labels: base }
  const acc = mem.act === act ? mem.acc : EMPTY_MEM.acc
  const out = acc.map((prev, i) => (base[i].text && reached.includes(i) ? { text: base[i].text, on: base[i].on } : prev))
  const unchanged = mem.act === act && out.every((x, i) => same(x, acc[i]))
  return { mem: unchanged ? mem : { act, acc: out }, labels: out.map(x => x ?? EMPTY()) }
}

/**
 * Рамка новых подписей. st — { prev (тексты, что были на экране), nw (0 / 1 / 2 на дорожку: рамка идёт; 1 и 2 чередуются, чтобы анимация началась заново, если текст сменился до конца прошлой), at (номер события, поставившего рамку), seq }.
 * heads — то, что показано сейчас ({ text }[3]). → st (тот же объект, если ничего не изменилось). Текст исчез — рамка снимается сразу; тот же текст — рамки нет («не у прежних»).
 */
export function nextFrames(st, heads) {
  const texts = heads.map(h => h.text)
  if (texts.every((t, i) => t === st.prev[i])) return st
  const changed = texts.map((t, i) => !!t && t !== st.prev[i])
  const seq = changed.some(Boolean) ? st.seq + 1 : st.seq
  return {
    prev: texts, seq,
    nw: st.nw.map((v, i) => (!texts[i] ? 0 : changed[i] ? (v === 1 ? 2 : 1) : v)),
    at: st.at.map((a, i) => (changed[i] ? seq : a)),
  }
}

export const initFrames = heads => ({ prev: heads.map(h => h.text), nw: [0, 0, 0], at: [0, 0, 0], seq: 0 })

/** Снять рамки, поставленные событием seq и раньше (последний таймер живёт от последнего события: прежние рамки заканчиваются вместе с ним) */
export function clearFrames(st, seq) {
  if (!st.at.some((a, i) => a <= seq && st.nw[i])) return st
  return { ...st, nw: st.nw.map((v, i) => (st.at[i] <= seq ? 0 : v)) }
}
