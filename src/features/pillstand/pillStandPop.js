// «Хлопок при заливке …» для отчёта «📤 Отправить» стенда пилюль (тема «Анимация», CONCEPT_PILLSTAND.md): по каждой цели — где была заливка НА ЭКРАНЕ в кадре, когда стартовали хлопок / вспышка
// (должно быть ≈ 1,00: щелчок идёт только после доезда заливки, wordLaneStudent.stepLocks / racePhraseScene), и сколько мс прошло от зачёта (слово — событие pill claim; фраза — onPhrase с ratio ≥
// PHRASE_OK) до хлопка. Источник: кадры записи (первый кадр с флагом «хлопок» или «вспышка» — pillStandFrames.flagsOf), а без записи — события трассы (pill snap / win и ближайший кадр заливки fill).
// Здесь же — пузыри в жидкости (wordLaneBubbles.js): сколько плавало внутри, вылетели ли они в кадре хлопка (а не раньше), и «зазор сверху» — кадры засчитанной пилюли после хлопка, где заливка не 100 %
// или пилюля не помечена полной (data-full). Чистые функции.
import { flagsOf } from './pillStandFrames.js'
import { PHRASE_OK } from '../pitrace/racePhraseListener.js'

export const POP_FULL = 0.97   // заливка в кадре старта хлопка ниже — «раньше доезда»
const FRAME_MS = 20            // событие и его кадр заливки — в пределах одного кадра
const num = v => (v == null ? '—' : Number(v).toFixed(2).replace('.', ','))
const isPop = f => flagsOf(f).some(x => x.startsWith('хлопок') || x.startsWith('вспышка'))
const isClaim = e => (e.k === 'pill' && e.type === 'claim') || (e.k === 'phrase' && e.ratio >= PHRASE_OK)

/** Хлопки цели: frames — кадры записи (может не быть), events — события цели → [{ t — мс сессии, v — заливка на экране в кадре старта, ms — от зачёта (null — зачёта в отрезке нет), frame — номер кадра | null, src }].
 *  Кадры — главный источник; хлопки трассы берутся там, где записи не было (до её начала и после конца) */
export function popMoments(frames = [], events = []) {
  const claims = events.filter(isClaim)
  const since = t => { const c = claims.filter(e => e.t <= t + FRAME_MS); const last = c.at(-1); if (!last) return null; const first = c.find(e => last.t - e.t < 600) ?? last; return Math.round(t - first.t) } // фраза: несколько onPhrase подряд — считаем от первого
  const out = []
  const fills = events.filter(e => e.k === 'fill'), from = frames[0]?.t ?? Infinity, to = frames.at(-1)?.t ?? -Infinity
  const snaps = events.filter(e => e.k === 'pill' && e.type === 'snap'), pops = snaps.length ? snaps : events.filter(e => e.k === 'pill' && e.type === 'win')
  frames.forEach((f, i) => {
    if (!isPop(f) || (i > 0 && isPop(frames[i - 1]))) return
    const ev = pops.filter(e => e.t <= f.t + FRAME_MS && f.t - e.t <= 2 * FRAME_MS).at(-1) // событие щелчка этого кадра: запись снимает кадр до шага движка, поэтому видит щелчок кадром позже — мс считаем от события
    out.push({ t: f.t, v: f.v ?? null, ms: since(ev?.t ?? f.t), frame: f.i + 1, src: 'кадр' })
  })
  for (const e of pops) {
    if (e.t >= from - FRAME_MS && e.t <= to + FRAME_MS) continue
    const near = fills.filter(f => Math.abs(f.t - e.t) <= FRAME_MS).at(-1) ?? fills.filter(f => f.t <= e.t).at(-1)
    out.push({ t: e.t, v: near?.shown ?? null, ms: since(e.t), frame: null, src: 'трасса' })
  }
  return out.sort((x, y) => x.t - y.t)
}

/** Строка метрик: «хлопок при заливке 1,00, через 96 мс после зачёта (кадр 299)»; заливка ниже POP_FULL — пометка «РАНЬШЕ ДОЕЗДА» */
export function popLine(pops) {
  if (!pops.length) return 'хлопок: не было'
  return `хлопок ${pops.map(p => `при заливке ${num(p.v)}${p.v != null && p.v < POP_FULL ? ' ⚠ РАНЬШЕ ДОЕЗДА' : ''}, ${p.ms == null ? 'зачёта в отрезке нет' : `через ${p.ms} мс после зачёта`} (${p.frame != null ? `кадр ${p.frame}` : 'по трассе'})`).join(' · ')}`
}

/** Пузыри в кадрах: { max — больше всего внутри жидкости за кадр, frames — в скольких кадрах были внутри, first — t первого (мс сессии) | null, out — кадров с вылетевшими, outMax — больше всего вылетевших за кадр,
 *  early — кадров, где пузыри уже снаружи, а хлопка ещё не было (должно быть 0), atPop — [{ t, n }] сколько вылетело у каждого хлопка (в его кадре или следующем) } */
export function bubbleStats(frames = [], pops = []) {
  let max = 0, n = 0, first = null, out = 0, outMax = 0, early = 0
  const popT = pops.map(p => p.t)
  for (const f of frames) {
    const k = f.s?.bb?.n?.length ?? 0
    if (!k) continue
    if (f.s.bb.out) { out++; outMax = Math.max(outMax, k); if (!popT.some(t => t <= f.t + FRAME_MS)) early++ } else { n++; max = Math.max(max, k); first ??= f.t }
  }
  const atPop = pops.filter(p => p.frame != null).map(p => ({ t: p.t, n: frames.find(f => f.t >= p.t - 1 && f.t <= p.t + 2 * FRAME_MS && f.s?.bb?.out)?.s.bb.n.length ?? 0 }))
  return { max, frames: n, first, out, outMax, early, atPop }
}

/** «Зазор сверху»: кадры после старта хлопка, где у засчитанной пилюли (data-lock) заливка ниже 100 % или нет data-full (признак проверяется у снимков v3.3.186+ — у них есть поле ink) → [{ t, frame, v }] (норма — пусто) */
export function topGaps(frames = [], pops = []) {
  const out = []
  for (const p of pops) {
    if (p.frame == null) continue
    for (const f of frames) if (f.t >= p.t && f.t <= p.t + 1500 && f.s?.a?.['data-lock'] != null && ((f.v != null && f.v < 0.999) || (f.s.ink !== undefined && f.s.a['data-full'] == null))) { out.push({ t: f.t, frame: f.i + 1, v: f.v ?? null }); break }
  }
  return out
}

/** Строка метрик про пузыри и зазор: «пузыри в жидкости: до 8 за кадр, в 120 кадрах · в кадре хлопка вырвались 8 · зазор сверху: нет» */
export function bubbleLine(b, gaps) {
  const inside = b.max ? `до ${b.max} за кадр, в ${b.frames} кадрах` : 'не было'
  const burst = b.atPop.length ? `в кадре хлопка вырвались ${b.atPop.map(x => x.n).join(', ')}${b.early ? ` ⚠ НАРУЖУ ДО ХЛОПКА: ${b.early} кадров` : ''}` : b.out ? `вылетали в ${b.out} кадрах` : 'наружу не вылетали'
  return `пузыри в жидкости: ${inside} · ${burst} · зазор сверху: ${gaps.length ? `⚠ ${gaps.map(g => `кадр ${g.frame} заливка ${num(g.v)}`).join(', ')}` : 'нет'}`
}
