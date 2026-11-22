// Модель «Таймлайна игры» (CONCEPT_TIMELINE.md): события трассы одного прохождения (shared/lib/sceneTrace.js) → отрезки дорожек. Чистые функции без React; время в результате — мс ОТ НАЧАЛА прохождения.
// Дорожки: stages (стадии: от stage-in до следующего stage-in; out — отметка «ход кончен», дальше пауза выхода), lines (реплики: Пит / Мия / диктор — слово, перевод, фраза голосом Пита),
// turns (ходы игрока: пилюля от появления до исхода), answers (точки ответов), waits (игра ждёт технику), counts (отсчёт тремя нотами), holds (игра на паузе). Паузы считает timelinePauses.js.
export const NO_END_PAD_MS = 2000  // у реплики нет события конца: кончается по своей длине, но не позже, чем через столько сверх неё
export const SILENT_DUP_MS = 1500  // «подпись без звука» и следом рот по тексту той же реплики — одна реплика, а не две

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)

/** events — события одного прохождения (как в трассе: t — performance.now). → модель дорожек */
export function buildTimeline(events = [], meta = {}) {
  const evs = (events ?? []).filter(e => e && Number.isFinite(e.t))
  const t0 = evs.length ? evs[0].t : 0
  const lastEnd = evs.findLast?.(e => e.k === 'end')
  const t1abs = lastEnd ? lastEnd.t : evs.length ? evs[evs.length - 1].t : 0
  const m = { t0, dur: 0, meta, stages: [], lines: [], turns: [], answers: [], waits: [], counts: [], holds: [], notes: [], kinds: {} }
  const openLines = [], openTurns = []
  let stage = null, hold = null, count = null

  const closeLine = (l, t, extra = {}) => { const i = openLines.indexOf(l); if (i >= 0) openLines.splice(i, 1); l.end = Math.max(l.t, t); Object.assign(l, extra) }
  const closeTurn = (u, t, res) => { const i = openTurns.indexOf(u); if (i >= 0) openTurns.splice(i, 1); u.end = Math.max(u.t, t); u.res = res }
  const findTurn = idx => (idx == null ? openTurns[openTurns.length - 1] : openTurns.findLast?.(u => u.idx === idx)) ?? null

  for (const e of evs) {
    if (e.t > t1abs) break
    const t = e.t - t0
    m.kinds[e.k] = (m.kinds[e.k] ?? 0) + 1
    switch (e.k) {
      case 'stage-in': {
        if (stage) stage.end = t
        if (hold) { hold.end = t; hold = null } // «Продолжить» перезапускает стадию: пауза игры кончилась
        openTurns.slice().forEach(u => closeTurn(u, t, 'none')) // стадия сменилась — недоигранные ходы закрыты без исхода
        stage = { t, end: null, out: null, idx: e.idx ?? null, sid: e.sid ?? '', act: e.act ?? '', type: e.type ?? '', title: e.title ?? '', line: e.line ?? null, src: e }
        m.stages.push(stage); break
      }
      case 'stage-out': if (stage && stage.out == null) stage.out = t; break
      case 'line-start': case 'line-silent': {
        const who = e.who ?? 'pit', id = e.id ?? '', silent = e.k === 'line-silent' || !!e.silent
        const dup = openLines.find(l => l.who === who && l.id === id && t - l.t <= SILENT_DUP_MS && (l.silent || silent))
        if (dup) { // «без звука» и рот по тексту / причина тишины — та же реплика, а не вторая
          dup.silent = dup.silent || silent; dup.mouth = dup.mouth || !silent; dup.reason = dup.reason ?? e.reason ?? null
          if (!dup.ms && e.ms) dup.ms = num(e.ms); if (!dup.text && e.text) dup.text = e.text
          break
        }
        if (who !== 'mia' && !silent) openLines.filter(l => l.who !== 'mia' && l.mouth).forEach(l => closeLine(l, t, { why: 'replaced' })) // рот у Пита один
        const l = { t, end: null, who, id, text: e.text ?? '', ms: num(e.ms), silent, mouth: !silent || who === 'mia', reason: e.reason ?? null, played: null, why: null, sid: stage?.sid ?? '', src: e }
        m.lines.push(l); openLines.push(l); break
      }
      case 'line-end': {
        const who = e.who ?? null, id = e.id ?? ''
        const l = openLines.findLast?.(x => x.id === id && x.mouth && (who ? x.who === who : x.who !== 'mia'))
        if (l) closeLine(l, t, { played: e.played ?? null, why: e.why ?? 'done' }); break
      }
      case 'ask': {
        if (e.phrase) { const u = { t, end: null, pillT: null, idx: e.idx ?? null, word: e.word ?? '', lane: null, what: e.what ?? null, phrase: true, demo: !!e.demo, res: null, ms: null, claimT: null, sid: stage?.sid ?? '', src: e }; m.turns.push(u); openTurns.push(u) }
        break
      }
      case 'pill': {
        const u = { t, end: null, pillT: t, idx: e.idx ?? null, word: e.word ?? '', lane: e.lane ?? null, phrase: false, demo: false, res: null, ms: null, claimT: null, sid: stage?.sid ?? '', src: e }
        m.turns.push(u); openTurns.push(u); break
      }
      case 'claim': { const u = findTurn(e.idx); if (u) { u.claimT = t; u.ms = e.ms ?? Math.round(t - u.t) } break }
      case 'answer': {
        const u = findTurn(e.idx)
        const a = { t, res: e.res ?? '', idx: e.idx ?? null, word: e.word || u?.word || '', ms: u ? Math.round(t - (u.pillT ?? u.t)) : null, final: e.final !== false, late: !!e.late, sid: stage?.sid ?? '', src: e }
        m.answers.push(a)
        if (u && a.final) closeTurn(u, t, a.late && a.res === 'win' ? 'late' : a.res)
        break
      }
      case 'wait': { const ms = num(e.ms); m.waits.push({ t: Math.max(0, t - ms), end: t, why: e.why ?? '', ms }); break } // событие пишется в КОНЦЕ ожидания, ms — сколько ждали
      case 'count': if (count) count.end = t; count = { t, end: null, what: e.what ?? '', ms: num(e.ms) }; m.counts.push(count); break
      case 'count-end': if (count) { count.end = t; count = null } break
      case 'note': m.notes.push({ t, order: e.order ?? 0 }); break
      case 'pause': {
        if (!hold) { hold = { t, end: null, why: e.why ?? '' }; m.holds.push(hold) }
        openLines.slice().forEach(l => closeLine(l, t, { why: 'pause' })); break
      }
      case 'resume': if (hold) { hold.end = t; hold = null } break
      default: break
    }
  }
  m.dur = Math.max(0, t1abs - t0)
  // незакрытое: реплика кончается по своей длине (подпись без звука конца не сообщает), остальное — концом прохождения
  for (const l of m.lines) if (l.end == null) l.end = Math.min(m.dur, l.t + (l.ms > 0 ? l.ms : 0) + (l.mouth ? NO_END_PAD_MS : 0))
  for (const l of m.lines) if (l.end < l.t) l.end = l.t
  for (const u of m.turns) if (u.end == null) { u.end = m.dur; u.res = u.res ?? 'none' }
  for (const s of m.stages) if (s.end == null) s.end = m.dur
  for (const c of m.counts) if (c.end == null) c.end = Math.min(m.dur, c.t + (c.ms || 1800))
  for (const h of m.holds) if (h.end == null) h.end = m.dur
  m.dur = Math.max(m.dur, ...m.lines.map(l => l.end), 0)
  return m
}

/** Стадия, идущая в момент t (мс от начала), или null */
export function stageAt(m, t) {
  let lo = 0, hi = m.stages.length - 1, found = null
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (m.stages[mid].t <= t) { found = m.stages[mid]; lo = mid + 1 } else hi = mid - 1 }
  return found
}

/** Отрезки [{ t, end }] → объединение без наложений, по возрастанию */
export function unionSpans(spans) {
  const s = spans.filter(x => x.end > x.t).map(x => ({ t: x.t, end: x.end })).sort((a, b) => a.t - b.t)
  const out = []
  for (const x of s) { const last = out[out.length - 1]; if (last && x.t <= last.end) last.end = Math.max(last.end, x.end); else out.push(x) }
  return out
}

/** Сколько мс отрезки spans (без наложений) занимают внутри [a, b] */
export function coverMs(spans, a, b) {
  let sum = 0
  for (const x of spans) { if (x.end <= a) continue; if (x.t >= b) break; sum += Math.min(b, x.end) - Math.max(a, x.t) }
  return sum
}
