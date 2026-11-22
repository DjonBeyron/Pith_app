// «Черновик правок» монтажа (CONCEPT_TIMELINE.md, «Черновик правок»): правки — ОТДЕЛЬНЫЙ слой поверх прохождения. applyEdits(исходный монтаж, список правок) → новый монтаж; исходный не меняется никогда.
// Правка — «тишина перед клипом стала другой»: { key (клип: «кто:id#N»), mode, from, to, …якоря }. from / to — зазор в мс от конца предыдущего звука (любого говорящего) до начала клипа.
//  • mode 'ripple' — сдвиг со шлейфом: всё, что после клипа, едет вместе с ним (игра короче / длиннее). Укорочение ВЫРЕЗАЕТ время из кусков «игра молчит» / «анимация» этого промежутка (с конца к началу);
//    куски «ждём игрока», «отсчёт», «ждём технику», «игра на паузе» не трогаются — от монтажа они не зависят (locked): короче них зазор не сделать. Удлинение вставляет тишину прямо перед клипом.
//    Зазор меньше нуля — клип наезжает на предыдущий звук ДРУГОГО говорящего (разрешено, клип помечен over); на свой предыдущий звук — нельзя (limitsFor).
//  • mode 'solo' — только этот клип: остальные стоят, клип ходит между своими соседями (предыдущая и следующая реплика того же говорящего).
// Все правки заданы в координатах ИСХОДНОГО прохождения, поэтому порядок в списке на результат не влияет, а «убрать одну правку» не ломает остальные. Чистые функции без React.
import { finish, clipByKey, groupBefore, FLEX_KINDS } from './montageModel.js'
import { stageTitle } from '../timelineStageNames.js'

export const SNAP_MS = 50          // шаг привязки при перетаскивании (с Shift — свободно)
export const MAX_ADD_MS = 30000    // длиннее исходного зазор можно сделать не больше чем на столько
export const MIN_CHANGE_MS = 1     // правка меньше — не правка
const R = n => Math.round(n)

/** Привязка к шагу */
export const snap = (ms, step = SNAP_MS) => (step > 0 ? Math.round(ms / step) * step : ms)

/** Что известно о тишине перед клипом в ИСХОДНОМ монтаже: { clip, prev, from, flex, locked, inside (несдвигаемые куски), cuts (куски, из которых можно вырезать) } или null — такого клипа нет */
export function gapInfo(base, key) {
  const clip = clipByKey(base, key)
  if (!clip) return null
  const grp = groupBefore(base, clip), prev = clip.prev ? clipByKey(base, clip.prev) : null
  const cuts = grp ? grp.pieces.filter(p => FLEX_KINDS.includes(p.kind)) : clip.gap > 0 ? [{ t: clip.t - clip.gap, end: clip.t }] : []
  return { clip, prev, from: clip.gap, flex: grp ? grp.flex : Math.max(0, clip.gap), locked: grp ? grp.locked : 0, cuts, inside: grp ? grp.pieces.filter(p => !FLEX_KINDS.includes(p.kind)).map(p => ({ kind: p.kind, ms: R(p.ms) })) : [] }
}

/** Новая правка с якорями (по ним её найдёт разработчик в коде и в другой игре): кто и что до, кто и что после, стадия, исходный и новый зазор */
export function makeEdit(base, key, mode, to) {
  const info = gapInfo(base, key)
  if (!info) return null
  const { clip, prev } = info
  return {
    key, mode: mode === 'solo' ? 'solo' : 'ripple', from: R(info.from), to: R(to), who: clip.who, id: clip.id, text: clip.text, at: R(clip.t), sid: clip.sid, stage: stageTitle(clip.sid || null),
    prev: prev ? { who: prev.who, id: prev.id, text: prev.text } : null, locked: R(info.locked), inside: info.inside,
  }
}

/** Список правок с новой правкой: правка того же клипа заменяется на месте; «вернула как было» — правка исчезает */
export function setEdit(edits, edit) {
  const same = edits.findIndex(e => e.key === edit.key), keep = Math.abs(edit.to - edit.from) >= MIN_CHANGE_MS
  if (same < 0) return keep ? [...edits, edit] : edits
  return keep ? edits.map((e, i) => (i === same ? edit : e)) : edits.filter((_, i) => i !== same)
}

/** Список без правки клипа key */
export const dropEdit = (edits, key) => edits.filter(e => e.key !== key)

/** Исходный монтаж + правки → новый монтаж (исходный не меняется): { …монтаж, base, applied, missing, moved (key → сдвиг начала, мс) } */
export function applyEdits(base, edits = []) {
  const ops = [], solo = new Map(), applied = [], missing = []
  for (const e of edits ?? []) {
    const info = gapInfo(base, e?.key)
    if (!info || !Number.isFinite(e.to)) { if (e) missing.push(e); continue } // клипа нет (другая игра) — правка не применена, но в списке остаётся
    const to = info.locked > 0 ? Math.max(e.to, info.locked) : e.to // ожидание игрока / отсчёт / техника вырезать нельзя
    const d = to - info.from
    applied.push({ ...e, from: R(info.from), to: R(to) })
    if (e.mode === 'solo') { solo.set(e.key, d); continue }
    if (d > 0) { ops.push({ p: info.clip.t, n: d }); continue }
    let need = -d
    for (let i = info.cuts.length - 1; i >= 0 && need > 0; i--) { const c = Math.min(need, info.cuts[i].end - info.cuts[i].t); ops.push({ a: info.cuts[i].end - c, b: info.cuts[i].end }); need -= c }
    if (need > 0) ops.push({ p: info.clip.t, n: -need }) // тишины не хватило: клип (и всё после него) наезжает на предыдущий звук
  }
  if (!ops.length && !solo.size) return { ...base, base, applied, missing, moved: new Map() }
  const map = t => { let s = 0; for (const o of ops) s += o.n != null ? (t >= o.p ? o.n : 0) : -Math.min(Math.max(t - o.a, 0), o.b - o.a); return t + s } // момент исходной игры → момент после правок
  const span = x => { const t = map(x.t); return { ...x, t, end: Math.max(t, map(x.end)) } }
  const moved = new Map()
  const clips = base.clips.map(c => { const t = Math.max(0, map(c.t) + (solo.get(c.key) ?? 0)); if (Math.abs(t - c.t) >= MIN_CHANGE_MS) moved.set(c.key, t - c.t); return { ...c, t, end: t + (c.end - c.t) } }) // клип жёсткий: длина звука не меняется
  const causes = Object.fromEntries(Object.entries(base.causes).map(([k, v]) => [k, v.map(span).filter(x => x.end > x.t)]))
  const out = finish({
    dur: map(base.dur), clips, causes, stages: base.stages.map(s => ({ ...span(s), out: s.out == null ? null : map(s.out) })),
    pills: base.pills.map(span), answers: base.answers.map(span), marks: base.marks.map(span), notes: base.notes.map(span),
  }, base.thr)
  return { ...out, base, applied, missing, moved }
}

/**
 * В каких пределах можно поставить зазор перед клипом key (с учётом остальных правок): { from, min, max, why }.
 * why — почему нельзя меньше: 'player' (внутри ждём игрока / отсчёт / технику — их не вырезать), 'same' (упёрся в свою же предыдущую реплику), 'order' (раньше начала предыдущего клипа не поставить), 'start' (начало игры).
 */
export function limitsFor(base, edits, key, mode = 'ripple') {
  const info = gapInfo(base, key)
  if (!info) return null
  const cur = applyEdits(base, dropEdit(edits, key)), c = clipByKey(cur, key), i = cur.clips.indexOf(c)
  const before = cur.clips.slice(0, i), same = before.findLast(x => x.who === c.who) ?? null, prev = before[before.length - 1] ?? null
  const lows = [[-c.t, 'start']]
  if (info.locked > 0) lows.push([-info.flex, 'player'])
  if (same) lows.push([same.end - c.t, 'same'])
  if (prev) lows.push([prev.t + SNAP_MS - c.t, 'order'])
  const [dMin, why] = lows.reduce((r, x) => (x[0] > r[0] ? x : r))
  const nextSame = cur.clips.slice(i + 1).find(x => x.who === c.who) ?? null
  const dMax = mode === 'solo' ? Math.max(0, (nextSame ? nextSame.t : cur.dur) - c.end) : MAX_ADD_MS
  return { from: info.from, min: info.from + Math.min(0, dMin), max: info.from + dMax, why, locked: info.locked, inside: info.inside }
}

/** Зазор to в допустимые пределы: → { to, hit: null | 'min' | 'max' } */
export function clampTo(lim, to) {
  if (to < lim.min) return { to: lim.min, hit: 'min' }
  if (to > lim.max) return { to: lim.max, hit: 'max' }
  return { to, hit: null }
}

/** Итог черновика: длина игры до и после, сколько тишины убрано (отрицательное — добавлено), сколько правок применено */
export function editsSummary(base, edited) {
  return { before: base.dur, after: edited.dur, removed: base.dur - edited.dur, count: edited.applied?.length ?? 0, missing: edited.missing?.length ?? 0 }
}
