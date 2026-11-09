// Метрики честности стенда пилюль (CONCEPT_PILLSTAND.md, «Честность») — чистые функции над трассой (pillStandTrace.js). Трасса режется на отрезки по событию 'target' (одна цель — один отрезок).
//  • голос — куски звука с rms ≥ STAND_VOICE_RMS (2,5 × порог затвора тишины voskGate; ниже порога движка 0,03 — тихие согласные в начале слова тоже голос); начало и конец голоса отрезка;
//  • ложные срабатывания: слово / счёт слушателя / заливка без голоса (ни одного громкого куска за FALSE_WINDOW_MS и затвор закрыт), черновик Vosk без голоса, засчитанное слово, которого нет в итогах Vosk после него
//    (итогов после слова не было — зачёт по черновику, заход закрыт — это noFinal, не ложное);
//  • «додумывание»: слова черновиков и итогов, которых нет в цели (pillStandWords.js), и перестройки черновика (новый текст — не продолжение прошлого);
//  • задержки: начало голоса → первый черновик, слово → заливка на экране дошла до новой цели (FILL_EPS), конец голоса → зачёт.
import { GATE_RMS } from '../../shared/lib/vosk/voskGate.js'
import { heardWords, targetSet, inTarget } from './pillStandWords.js'

export const STAND_VOICE_RMS = GATE_RMS * 2.5 // 0,015
export const FALSE_WINDOW_MS = 1500 // слово / заливка «с голосом», если громкий кусок был не раньше столько мс назад (черновик Vosk приходит с опозданием)
export const FILL_JUMP = 0.02       // рост цели заливки меньше этого — не «срабатывание»
export const FILL_EPS = 0.012       // экран «дошёл» до цели
export const GOAL_WAIT_MS = 400     // после слова цель заливки ищем в столько мс
export const VOICE_GAP_MS = 350     // громкие куски ближе этого — один отрезок голоса (паузы внутри слова и между словами быстрой речи)

/** Трасса → отрезки целей: [{ target, events }] (события до первой цели — в отрезок без цели) */
export function segments(events) {
  const out = []
  let cur = { target: null, events: [] }
  for (const e of events) {
    if (e.k === 'target') { if (cur.target || cur.events.length) out.push(cur); cur = { target: e, events: [e] } } else cur.events.push(e)
  }
  if (cur.target || cur.events.length) out.push(cur)
  return out.filter(s => s.target && s.events.some(e => e.k === 'run')) // цель без запуска пилюли (микрофон ещё не включён, двойной монтаж StrictMode) — не в счёт
}

/** Отрезки голоса из моментов громких кусков: [{ a, b }] (куски ближе VOICE_GAP_MS — один отрезок) */
export function voicePeriods(ts, gap = VOICE_GAP_MS) {
  const out = []
  for (const t of ts) { const last = out.at(-1); if (last && t - last.b <= gap) last.b = t; else out.push({ a: t, b: t }) }
  return out
}

/** Конец голоса для зачёта в момент t: конец отрезка, начавшегося до t (речь могла идти и после зачёта — тогда «от конца голоса» отрицательное: зачёт раньше конца речи) */
export const voiceEndFor = (periods, t) => periods.filter(p => p.a <= t).at(-1)?.b ?? null

const reachAfter = (evs, t, goal) => evs.find(e => e.k === 'fill' && e.t >= t && e.shown >= goal - FILL_EPS)?.t ?? null

/** Один отрезок → метрики */
export function analyzeSegment({ target, events }) {
  const t0 = target.t
  const rel = t => (t == null ? null : Math.round(t - t0))
  const voiced = events.filter(e => e.k === 'level' && e.rms >= STAND_VOICE_RMS).map(e => e.t)
  const result = events.find(e => e.k === 'result') ?? null
  const voiceStart = voiced[0] ?? null
  const voiceEnd = result ? voiceEndFor(voicePeriods(voiced), result.t) : voiced.at(-1) ?? null
  let gateOpen = false
  const gateAt = new Map()
  for (const e of events) { if (e.k === 'gate') gateOpen = e.open; gateAt.set(e, gateOpen) }
  const voicedNear = (e, ms = FALSE_WINDOW_MS) => gateAt.get(e) || voiced.some(v => v <= e.t && e.t - v <= ms)
  const set = targetSet(target.say)
  const partials = [], finals = [], invented = new Map(), falses = [], words = [], backs = [], wrongs = [], toFill = []
  let prev = '', changes = 0, rebuilds = 0, heard = 0, extra = 0, lastGoal = 0, lastCause = -Infinity
  const note = (w, where) => { const v = invented.get(w) ?? { partial: 0, final: 0 }; v[where] += 1; invented.set(w, v) }
  for (const e of events) {
    if (e.k === 'vosk-start' || e.k === 'vosk-final') prev = ''
    if (e.k === 'vosk-partial') {
      const ws = heardWords(e.raw?.partial), cur = ws.join(' ')
      if (cur && cur !== prev) {
        changes++; if (prev && !cur.startsWith(prev)) rebuilds++
        partials.push({ t: rel(e.t), text: cur })
        const before = new Set(heardWords(prev))
        for (const w of ws) if (!before.has(w)) { heard++; if (!inTarget(w, set)) { extra++; note(w, 'partial') } }
        if (!voicedNear(e)) falses.push({ t: rel(e.t), kind: 'черновик без голоса', text: cur })
      }
      prev = cur
    } else if (e.k === 'vosk-final') {
      const ws = heardWords(e.raw?.text)
      finals.push({ t: rel(e.t), text: ws.join(' '), stopBy: e.stopBy ?? null, conf: (e.raw?.result ?? []).map(r => [r.word, Math.round((r.conf ?? 0) * 100) / 100]) })
      for (const w of ws) { heard++; if (!inTarget(w, set)) { extra++; note(w, 'final') } }
    } else if (e.k === 'word' && e.gone) backs.push({ t: rel(e.t), index: e.index, text: e.text })
    else if (e.k === 'word') {
      lastCause = e.t
      if (!words.some(w => w.index === e.index)) {
        words.push({ t: rel(e.t), index: e.index, text: e.text, draft: !!e.draft })
        const goal = Math.max(lastGoal, ...events.filter(f => f.k === 'fill' && f.t >= e.t && f.t <= e.t + GOAL_WAIT_MS).map(f => f.goal))
        const at = goal > lastGoal + 1e-4 ? reachAfter(events, e.t, goal) : null
        if (at != null) toFill.push({ word: e.text, ms: Math.round(at - e.t) })
      }
      if (!voicedNear(e)) falses.push({ t: rel(e.t), kind: 'слово без голоса', text: e.text })
    } else if (e.k === 'listen' && e.seq?.length > (words.at(-1)?.seq ?? 0)) {
      lastCause = e.t
      words.push({ t: rel(e.t), index: e.seq.length - 1, text: target.say, seq: e.seq.length, draft: false })
      if (!voicedNear(e)) falses.push({ t: rel(e.t), kind: 'счёт слова без голоса', text: e.heard ?? '' })
    } else if (e.k === 'pill' && (e.type === 'claim' || e.type === 'win')) {
      lastCause = e.t
      if (e.type === 'claim') { const at = reachAfter(events, e.t, 0.99); if (at != null) toFill.push({ word: target.say, ms: Math.round(at - e.t) }) }
    } else if (e.k === 'phrase') lastCause = e.t
    else if (e.k === 'log' && /неверное слово «([^»]*)», ждём «([^»]*)»/.test(e.text)) { const m = /неверное слово «([^»]*)», ждём «([^»]*)»/.exec(e.text); wrongs.push({ t: rel(e.t), word: m[1], expect: m[2] }) }
    else if (e.k === 'fill') {
      if (e.goal > lastGoal + FILL_JUMP && !voicedNear(e) && e.t - lastCause > FALSE_WINDOW_MS) falses.push({ t: rel(e.t), kind: 'заливка без голоса', text: `цель ${e.goal.toFixed(2).replace('.', ',')}` })
      lastGoal = e.goal
    }
  }
  let noFinal = 0
  for (const w of words) { // слово сверяется с итогами, пришедшими ПОСЛЕ него; итога не было (зачёт по черновику, заход закрыт) — не ложное, а «без итога»
    const later = finals.filter(f => f.t >= w.t)
    if (!later.length) { noFinal++; continue }
    const fw = new Set(later.flatMap(f => heardWords(f.text))), need = heardWords(w.text)
    if (need.length && !need.every(x => inTarget(x, fw) || [...fw].some(f => targetSet(f).has(x)))) falses.push({ t: w.t, kind: 'слова нет в итоге Vosk', text: w.text })
  }
  const firstPartial = partials.find(p => p.t >= rel(voiceStart ?? -Infinity)) ?? null
  return {
    n: target.n, say: target.say, shown: target.shown, mode: target.mode, lang: target.lang,
    voiceStart: rel(voiceStart), voiceEnd: rel(voiceEnd), noFinal, partials, finals, words, backs, wrongs, changes, rebuilds,
    invented: [...invented].map(([w, v]) => ({ w, ...v })), heard, extra, falses: falses.sort((a, b) => a.t - b.t),
    voiceToPartial: voiceStart != null && firstPartial ? firstPartial.t - rel(voiceStart) : null,
    toFill, result: result ? { ok: !!result.ok, ratio: result.ratio ?? null, clean: !!result.clean, t: rel(result.t), afterVoice: voiceEnd != null ? Math.round(result.t - voiceEnd) : null } : null,
  }
}

const med = list => { const s = list.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }

/** Вся трасса → { segs, totals } */
export function honesty(events) {
  const segs = segments(events).map(analyzeSegment)
  const sum = f => segs.reduce((a, s) => a + f(s), 0)
  const heard = sum(s => s.heard), extra = sum(s => s.extra)
  return {
    segs,
    totals: {
      targets: segs.length, wins: segs.filter(s => s.result?.ok).length, falses: sum(s => s.falses.length), rebuilds: sum(s => s.rebuilds), changes: sum(s => s.changes),
      heard, extra, extraPct: heard ? Math.round((extra / heard) * 100) : 0, backs: sum(s => s.backs.length), wrongs: sum(s => s.wrongs.length),
      voiceToPartial: med(segs.map(s => s.voiceToPartial)), toFill: med(segs.flatMap(s => s.toFill.map(x => x.ms))), afterVoice: med(segs.map(s => s.result?.afterVoice ?? null)),
    },
  }
}
