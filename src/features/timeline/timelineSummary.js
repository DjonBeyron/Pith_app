// Сводка «Таймлайна игры»: длительность прохождения, по этапам (подряд идущие стадии одного акта) — длительность, сколько говорил каждый ведущий и сколько «игра молчала». Чистые функции.
import { unionSpans, coverMs } from './timelineModel.js'

const WHOS = ['pit', 'mia', 'dictor']

/** Стадии → этапы: подряд идущие стадии с одним act. → [{ act, title, t, end, stages }] */
export function actsOf(m) {
  const out = []
  for (const s of m.stages) {
    const last = out[out.length - 1]
    if (last && last.act === s.act) { last.end = s.end; last.stages += 1; if (!last.title && s.title) last.title = s.title } else out.push({ act: s.act, title: s.title, t: s.t, end: s.end, stages: 1 })
  }
  return out
}

/** m — модель, pauses — куски пауз (timelinePauses.buildPauses) → { dur, speak: { pit, mia, dictor }, dead, deadLong, longCount, player, acts: [{ act, title, t, end, dur, speak, dead, longCount }] } */
export function buildSummary(m, pauses) {
  const by = Object.fromEntries(WHOS.map(w => [w, unionSpans(m.lines.filter(l => l.who === w))]))
  const dead = pauses.filter(p => p.kind === 'dead'), sum = (list, a, b) => list.reduce((n, p) => n + Math.max(0, Math.min(b, p.end) - Math.max(a, p.t)), 0)
  const part = (a, b) => ({ speak: Object.fromEntries(WHOS.map(w => [w, Math.round(coverMs(by[w], a, b))])), dead: Math.round(sum(dead, a, b)), longCount: dead.filter(p => p.long && p.t >= a && p.t < b).length })
  return {
    dur: Math.round(m.dur), ...part(0, m.dur + 1),
    deadLong: Math.round(dead.filter(p => p.long).reduce((n, p) => n + p.ms, 0)),
    player: Math.round(pauses.filter(p => p.kind === 'player').reduce((n, p) => n + p.ms, 0)),
    lines: m.lines.length, turns: m.turns.filter(u => !u.demo).length,
    acts: actsOf(m).map(a => ({ ...a, dur: Math.round(a.end - a.t), ...part(a.t, a.end) })),
  }
}
