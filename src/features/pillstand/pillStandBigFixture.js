// Синтетическая сессия «как присланная» (только для тестов сжатия отчёта, pillStandCompact.test.js): 2 цели «Быстро» по 20 с (всего 40 с), грамматика Vosk из 585 вариантов на каждый заход
// (заход ≈ 3,5 с — «vosk-start» и «grammar» слушателя каждый раз), уровень каждые 43 мс, черновики и их повторы на каждый кусок звука, затвор, итоги, заливка, строки журнала модулей игры.
// События идут через настоящую трассу стенда (pillStandTrace.js) — её журнал «[stand] …» копится в строки gameJournal (метка performance.now). → { events, journal: { lines, t0abs, dropped } }.
import { createStandTrace } from './pillStandTrace.js'

export const BIG_T0 = 100000
const WORDS = ['where', 'are', 'you', 'from', 'nice', 'to', 'meet', 'see', 'later', 'thank']

export function bigSession({ seconds = 40, variants = 585 } = {}) {
  let now = BIG_T0
  const lines = []
  const stamp = () => `${now.toFixed(1).padStart(9)} 14:03:${String(Math.floor((now - BIG_T0) / 1000) % 60).padStart(2, '0')}.000`
  const trace = createStandTrace({ now: () => now, log: s => lines.push(`${stamp()} ${s}`), max: 1e9 })
  const game = s => { lines.push(`${stamp()} ${s}`); trace.line(s) }
  const grammar = Array.from({ length: variants }, (_, i) => [WORDS[i % 10], WORDS[(i * 7) % 10], WORDS[(i * 3) % 10]].slice(0, 1 + (i % 3)).join(' '))
  const per = (seconds * 1000) / 2
  for (let n = 0; n < 2; n++) {
    const say = n ? 'see you later' : 'where are you from'
    trace.push('target', { n, mode: 'fast', lang: 'en', say, shown: say, gen: 0 })
    trace.push('run', { mode: 'fast', n })
    const end = (n + 1) * per
    let session = -Infinity, partial = '', k = 0
    for (; now - BIG_T0 < end; now += 43, k++) {
      if (now - session >= 3500) {
        session = now
        trace.push('vosk-start', { grammar, gate: true })
        trace.push('wl', { kind: 'grammar', targets: say.split(' '), grammar: JSON.stringify(grammar) })
        trace.push('vosk-ready', { micMs: 4 })
      }
      const ph = (now - BIG_T0) % 3500, voice = ph > 600 && ph < 1900
      trace.push('level', { rms: voice ? 0.12 + (k % 5) * 0.01 : 0.0021 })
      if (ph > 600 && ph < 650) { trace.push('gate', { open: true, rms: 0.12 }); game(`[gate] открыт +${Math.round(ph)} мс (rms 0,120)`) }
      if (ph > 2200 && ph < 2250) { trace.push('gate', { open: false, rms: 0.002 }); game(`[gate] закрыт +${Math.round(ph)} мс (rms 0,002)`) }
      if (voice) {
        const p = say.split(' ').slice(0, 1 + Math.floor((ph - 600) / 350)).join(' ')
        if (p !== partial) { partial = p; trace.push('vosk-partial', { raw: { partial: p } }); trace.push('wl', { kind: 'partial', raw: p, seq: [], misses: 0 }); game(`[phrase-ear] черновик «${p}» +${Math.round(ph)} мс`) } else trace.push('same', { raw: { partial: p } })
        trace.push('fill', { goal: +(p.split(' ').length / 4).toFixed(4), shown: +((k % 20) / 20).toFixed(4), level: 0.5, confirmed: true })
      }
      if (ph > 3400 && ph < 3450) { trace.push('vosk-final', { raw: { text: partial, result: partial.split(' ').map((w, i) => ({ word: w, conf: 1, start: i * 0.3, end: i * 0.3 + 0.25 })) }, stopBy: 'auto', resultMs: 3400 }); trace.push('wl', { kind: 'session-end', by: 'result' }); partial = '' }
      if (k % 25 === 0) game(`[perf] кадр ${16 + (k % 3)} мс, долгих 0`)
    }
    trace.push('run-stop', { n })
  }
  return { events: trace.events(), journal: { lines, t0abs: BIG_T0, dropped: 0 } }
}
