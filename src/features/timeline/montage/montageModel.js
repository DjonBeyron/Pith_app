// «Монтаж» таймлайна (CONCEPT_TIMELINE.md, «Монтаж»): модель прохождения (timelineModel.buildTimeline) → дорожки монтажного стола. Чистые функции без React; время — мс от начала прохождения.
//  • клип (clips) — одна реплика на дорожке говорящего: { key, who, id, text, t, end, sound, tail, silent, sid, gap, prev }. sound — сколько мс РЕАЛЬНО звучало аудио: длина буфера озвучки (ms из line-start —
//    рот открывается по факту старта источника звука), но не больше отрезка от line-start до line-end (реплику оборвали — звучало меньше). tail — «хвост»: от конца звука до line-end (рот закрывается кадром
//    позже звука — до 82 мс; у реплики без события конца — запас NO_END_PAD_MS). key — «кто:id#N» (N-е появление этой реплики в игре): по нему правка находит клип и в другой игре.
//    gap — тишина перед клипом: от конца предыдущего звука ЛЮБОГО говорящего (prev — его key) до начала клипа; отрицательная — клип начался, пока тот ещё говорил.
//  • зазор (gaps) — кусок времени, когда никто не говорит: { t, end, ms, kind, long, g }; kind: dead «игра молчит», anim «идёт анимация без речи» (стадия-анимация из timelineStageNames),
//    player «ждём игрока», count «отсчёт нотами», wait «ждём технику», paused «игра на паузе». g — номер промежутка между соседними звуками (groups): один промежуток может состоять из нескольких кусков.
//  • промежуток (groups) — { g, t, end, ms, pieces, flex (мс, которые можно убрать: dead + anim), locked (мс, которые от игры не зависят: игрок, отсчёт, техника, пауза) }.
import { unionSpans, stageAt } from '../timelineModel.js'
import { causeSpans, cutBy, ORDER, MIN_PIECE_MS } from '../timelinePauses.js'
import { stageInfo, stageTitle } from '../timelineStageNames.js'
import { DEFAULT_THRESHOLD } from '../timelineFormat.js'

export const TAIL_MIN_MS = 30 // хвост короче не рисуем
export const FLEX_KINDS = ['dead', 'anim']

/** Сколько мс реплика реально звучала: длина озвучки (ms), но не больше отрезка «начало — конец» */
export const soundMs = l => { const len = Math.max(0, l.end - l.t); return l.ms > 0 ? Math.min(len, l.ms) : len }

/** Реплики модели → клипы (по времени начала) */
export function clipsOf(m) {
  const seen = new Map()
  return m.lines.map(l => {
    const k0 = `${l.who}:${l.id}`, n = (seen.get(k0) ?? 0) + 1, len = Math.max(0, l.end - l.t), sound = soundMs(l)
    seen.set(k0, n)
    return { key: `${k0}#${n}`, who: l.who, id: l.id, text: l.text || l.id, t: l.t, end: l.end, sound, tail: len - sound, silent: !!l.silent, why: l.why ?? null, sid: l.sid ?? '', ref: l }
  }).sort((a, b) => a.t - b.t)
}

/** Клипы + причины + стадии → куски тишины и промежутки между звуками */
export function gapsOf({ clips, dur, causes, stages, thr = DEFAULT_THRESHOLD }) {
  const speech = unionSpans(clips)
  let pieces = [], at = 0
  for (const s of speech) { if (s.t > at) pieces.push({ t: at, end: s.t, kind: null }); at = Math.max(at, s.end) }
  if (dur > at) pieces.push({ t: at, end: dur, kind: null })
  for (const k of ORDER) pieces = cutBy(pieces, causes[k] ?? [], k)
  const gaps = [], groups = []
  let j = 0, grp = null
  for (const p of pieces) {
    while (j < speech.length && speech[j].t < p.end - 0.001) j++ // номер промежутка — номер звука, который идёт за ним
    const ms = p.end - p.t, st = stageAt({ stages }, p.t + 1), kind = p.kind ?? (stageInfo(st?.sid)?.kind === 'animation' ? 'anim' : 'dead')
    if (!grp || grp.g !== j) { grp = { g: j, t: p.t, end: p.end, ms: 0, pieces: [], flex: 0, locked: 0 }; groups.push(grp) }
    grp.end = p.end; grp.ms += ms
    if (FLEX_KINDS.includes(kind)) grp.flex += ms; else grp.locked += ms
    if (ms < MIN_PIECE_MS) continue // кусок-шум не рисуем, но в длину промежутка он входит
    const gap = { t: p.t, end: p.end, ms, kind, long: kind === 'dead' && ms >= thr, g: j, sid: st?.sid ?? '', stage: stageTitle(st) }
    gaps.push(gap); grp.pieces.push(gap)
  }
  return { gaps, groups: groups.filter(g => g.ms >= MIN_PIECE_MS) }
}

/** Части монтажа → готовый монтаж: у клипов посчитаны «тишина перед» и наложения, собраны зазоры */
export function finish(parts, thr = DEFAULT_THRESHOLD) {
  let best = null // клип с самым поздним концом среди начавшихся раньше
  const last = {} // последний клип каждого говорящего
  const clips = parts.clips.slice().sort((a, b) => a.t - b.t).map(c => {
    const same = last[c.who] ?? null
    const over = best && best.who !== c.who && best.end - c.t > TAIL_MIN_MS ? best.key : null // звучит одновременно с другим говорящим
    const out = { ...c, prev: best?.key ?? null, gap: c.t - (best?.end ?? 0), over, clash: !!same && same.end - c.t > 1 } // clash — наложился на СВОЮ же предыдущую реплику (так нельзя)
    if (!best || c.end > best.end) best = out
    last[c.who] = out
    return out
  })
  const dur = Math.max(parts.dur, ...clips.map(c => c.end), 0)
  return { ...parts, clips, dur, thr, ...gapsOf({ clips, dur, causes: parts.causes, stages: parts.stages, thr }) }
}

/** Модель таймлайна → монтаж (исходный, без правок) */
export function buildMontage(m, thr = DEFAULT_THRESHOLD) {
  const stages = m.stages.map(s => ({ t: s.t, end: s.end, out: s.out, sid: s.sid, act: s.act, type: s.type, title: stageTitle(s), anim: stageInfo(s.sid)?.kind === 'animation', ref: s }))
  const pills = m.turns.filter(u => !u.demo).map(u => ({ t: u.pillT ?? u.t, end: u.end, word: u.word, res: u.res, phrase: !!u.phrase, ref: u }))
  const answers = m.answers.map(a => ({ t: a.t, end: a.t, res: a.late && a.res === 'win' ? 'late' : a.res, word: a.word, ref: a }))
  const marks = [...m.counts.map(c => ({ t: c.t, end: c.end, kind: 'count', text: 'отсчёт — три ноты' })), ...m.waits.map(w => ({ t: w.t, end: w.end, kind: 'wait', text: w.why || 'ждём технику' })),
    ...m.holds.map(h => ({ t: h.t, end: h.end, kind: 'hold', text: 'игра на паузе' }))].sort((a, b) => a.t - b.t)
  const notes = m.notes.map(n => ({ t: n.t, end: n.t, order: n.order }))
  return finish({ dur: m.dur, clips: clipsOf(m), stages, pills, answers, marks, notes, causes: causeSpans(m) }, thr)
}

/** Клип по ключу */
export const clipByKey = (mont, key) => mont.clips.find(c => c.key === key) ?? null
/** Промежуток тишины прямо перед клипом (кончается в его начале) или null — клип начался встык или поверх другого */
export const groupBefore = (mont, clip) => mont.groups.find(g => Math.abs(g.end - clip.t) < 1) ?? null
