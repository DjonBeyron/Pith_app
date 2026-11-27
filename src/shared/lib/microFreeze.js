// Микро-фризы возле пилюль (просьба владельца 2026-11-27, Android A50: «ещё микро-фризы, когда пилюля улетает вверх или только выезжает»). Длинные кадры трассера [lag] (на слабом ≥ 50 мс) такие фризы не ловят:
// это 1–2 пропущенных кадра (34–50 мс). Здесь кадры считаются от 25 мс и ТОЛЬКО в окне −100…+500 мс вокруг события: «пилюля выезд» (pill), «пилюля улёт» (answer win), «слово принято» (claim);
// отдельно — доля кадров ≥ 25 мс вне всех окон (контроль: если и вне окон столько же, виновата не пилюля, а устройство).
// Цена: на кадр — проверка ≤ 6 открытых окон и запись в кольцо из 16 чисел; без DOM, без строк, без своего rAF (кадры даёт useLagTrace из общего gameFrame). Память не растёт: окна закрываются по +500 мс.
// Строка «[micro] …» — раз в MICRO_EVERY_MS игрового времени, если появились закрытые окна; «[micro] итог: …» — в конце игры (summary).
import { pLog } from './debug.js'

export const MICRO_MS = 25, MICRO_PRE = 100, MICRO_POST = 500, MICRO_EVERY_MS = 15000, MICRO_SKIP_MS = 3000
const RING = 16, THR = [MICRO_MS, 34, 50], KINDS = ['pill', 'gone', 'claim']
const NAMES = { pill: 'выезд', gone: 'улёт', claim: 'слово принято' }

/** Событие трассы сцены → вид окна или null */
export const microKind = ev => (ev?.k === 'pill' ? 'pill' : ev?.k === 'claim' ? 'claim' : ev?.k === 'answer' && ev.res === 'win' ? 'gone' : null)

const freshKind = () => ({ n: 0, hit: [0, 0, 0], fr: [0, 0, 0], worst: 0 })
const freshAll = () => ({ kinds: { pill: freshKind(), gone: freshKind(), claim: freshKind() }, inF: 0, in25: 0, outF: 0, out25: 0, playMs: 0 })
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

export function createMicroFreeze({ log = pLog } = {}) {
  let st = freshAll(), last = 0, paused = false, open = [], sinceLine = 0, unreported = 0, head = 0, filled = 0
  const rTs = new Float64Array(RING), rGap = new Float64Array(RING), rIn = new Uint8Array(RING)
  const give = (e, gap) => { // кадр попал в окно события e
    for (let i = 0; i < 3; i++) if (gap >= THR[i]) { e.fr[i]++; e.hit[i] = 1 }
    if (gap > e.worst) e.worst = gap
  }
  const close = e => {
    const k = st.kinds[e.kind]; k.n++; unreported++
    for (let i = 0; i < 3; i++) { k.hit[i] += e.hit[i]; k.fr[i] += e.fr[i] }
    if (e.worst > k.worst) k.worst = e.worst
  }
  function line(tag) {
    const parts = KINDS.map(n => { const k = st.kinds[n]; return k.n ? `${NAMES[n]} ×${k.n}: с фризом ${k.hit[0]} (${pct(k.hit[0], k.n)}%), кадров ≥${THR[0]}/${THR[1]}/${THR[2]} мс: ${k.fr.join('/')}, худший ${Math.round(k.worst)} мс` : `${NAMES[n]} ×0` })
    return `[micro] ${tag}${parts.join(' · ')} · в окнах кадров ${st.inF} (≥${THR[0]} мс: ${st.in25}, ${pct(st.in25, st.inF)}%) · вне окон кадров ${st.outF} (≥${THR[0]} мс: ${st.out25}, ${pct(st.out25, st.outF)}%)`
  }
  return {
    /** Кадр игры (ts — метка rAF). Зовёт useLagTrace после трассера */
    frame(ts) {
      const gap = last ? ts - last : 0
      last = ts
      if (paused || gap <= 0 || gap > MICRO_SKIP_MS) return
      st.playMs += gap; sinceLine += gap
      let inWin = 0
      for (let i = open.length - 1; i >= 0; i--) {
        const e = open[i]
        if (ts > e.t + MICRO_POST) { close(e); open.splice(i, 1); continue }
        give(e, gap); inWin = 1
      }
      rTs[head] = ts; rGap[head] = gap; rIn[head] = inWin; head = (head + 1) % RING; if (filled < RING) filled++
      if (inWin) { st.inF++; if (gap >= THR[0]) st.in25++ } else { st.outF++; if (gap >= THR[0]) st.out25++ }
      if (sinceLine >= MICRO_EVERY_MS && unreported) { sinceLine = 0; unreported = 0; try { log(line('')) } catch { /* журнал недоступен */ } }
    },
    /** Событие трассы сцены (sceneTrace.onEvent) */
    event(ev) {
      const kind = microKind(ev); if (!kind || paused || !last) return
      const e = { kind, t: ev.t, fr: [0, 0, 0], hit: [0, 0, 0], worst: 0 }
      for (let j = 1; j <= filled; j++) { // кадры за 100 мс до события, уже сосчитанные как «вне окон», переходят в окно
        const i = (head - j + RING) % RING
        if (rTs[i] < ev.t - MICRO_PRE) break
        if (rTs[i] > ev.t) continue
        give(e, rGap[i])
        if (!rIn[i]) { rIn[i] = 1; st.outF--; st.inF++; if (rGap[i] >= THR[0]) { st.out25--; st.in25++ } }
      }
      open.push(e); if (open.length > 6) close(open.shift())
    },
    pause(on) { if (paused === !!on) return; paused = !!on; last = 0 },
    /** Итог игры → строка «[micro] итог: …» (если игра шла ≥ 2 с и окна были) и сброс счёта */
    summary() {
      for (const e of open) close(e)
      open = []
      const had = KINDS.some(n => st.kinds[n].n), out = st.playMs >= 2000 && had ? line('итог: ') : null
      if (out) { try { log(out) } catch { /* журнал недоступен */ } }
      st = freshAll(); sinceLine = 0; unreported = 0; head = 0; filled = 0
      return out
    },
    stats: () => st,
  }
}
