// Разметка рта для СВОЕГО файла озвучки (voskAlign.js): голосовые участки записи по громкости и ДОСТРОЙКА слов, которые Vosk не нашёл. Чистые функции — проверяются тестами.
//  • Голосовые участки (voiceSpans): RMS по окнам 20 мс, порог от шума записи и её пика; короткие провалы (смычка согласной) склеиваются, щелчки отбрасываются.
//  • Достройка (fillWords): ненайденные слова расставляются между найденными соседями пропорционально весу слова (тот же вес, что у рта: shared/lib/visemeLetters.wordWeight — гласные длиннее),
//    и только там, где в записи есть голос (пауза в записи = пауза рта); в начале и в конце — в пределах голосовых участков. Vosk не нашёл ничего — все слова по голосовым участкам ('level');
//    голоса в записи не видно — равномерно на всю длину ('even').
//  • Гарантии итога (их же проверяет checkWords): слов столько же, сколько в тексте; времена возрастают и не выходят за длину файла; слова не перекрываются; у каждого длительность > 0.
//    Времена — в секундах с сотыми, как у озвучки ElevenLabs. Метка слова a: 'v' — время от Vosk, 'f' — достроено между найденными, 'l' — по громкости, 'e' — равномерно.
import { wordWeight } from '../visemeLetters.js'

export const WIN_MS = 20          // окно уровня
export const JOIN_GAP_S = 0.12    // провал короче — тот же голосовой участок
export const MIN_SPAN_S = 0.05    // участок короче — щелчок, не голос
export const MIN_PEAK = 0.002     // запись тише — голоса в ней нет
export const MIN_WORD_CS = 4      // наименьшая длина слова, сотые секунды
export const TIGHT = 0.6           // места под ненайденные слова меньше этой доли нужного — занимаем у растянутого соседа
export const APPROX_BELOW = 0.6   // найдено меньше этой доли слов — разметка «приблизительная»
const SLOT_USE = 0.92             // слово занимает такую долю своего места (остальное — пауза перед следующим)

/** Сэмплы (Float32Array, моно) → уровни RMS по окнам winMs: { levels, step (с) } */
export function rmsLevels(samples, rate, winMs = WIN_MS) {
  const win = Math.max(1, Math.round((rate * winMs) / 1000)), n = Math.floor((samples?.length ?? 0) / win)
  const levels = new Float32Array(n)
  for (let i = 0; i < n; i++) { let s = 0; for (let j = i * win, to = j + win; j < to; j++) s += samples[j] * samples[j]; levels[i] = Math.sqrt(s / win) }
  return { levels, step: win / rate }
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0)

/** Уровни → голосовые участки [{ from, to }] в секундах (по возрастанию, без наложений); голоса нет → [] */
export function voiceSpans(levels, step) {
  const sorted = Array.from(levels ?? []).sort((a, b) => a - b)
  const noise = pct(sorted, 0.1), peak = pct(sorted, 0.95)
  if (!(peak >= MIN_PEAK)) return []
  const thr = Math.max(MIN_PEAK * 0.75, noise * 3, peak * 0.1)
  if (thr >= peak) return [] // шум на уровне пика (музыка, гул): участков не различить
  const raw = []
  let from = -1
  for (let i = 0; i <= levels.length; i++) {
    const on = i < levels.length && levels[i] >= thr
    if (on && from < 0) from = i
    if (!on && from >= 0) { raw.push({ from: from * step, to: i * step }); from = -1 }
  }
  const out = []
  for (const s of raw) { const last = out.at(-1); if (last && s.from - last.to <= JOIN_GAP_S) last.to = s.to; else out.push({ ...s }) }
  return out.filter(s => s.to - s.from >= MIN_SPAN_S)
}

/** Вес слова для раскладки по времени (нет букв — как одна гласная: «5») */
export const tokenWeight = w => wordWeight(w) || 1

// Куски [lo, hi), где есть голос; голоса там нет (или почти нет) — весь отрезок одним куском
function pieces(spans, lo, hi) {
  const cut = spans.map(s => ({ from: Math.max(lo, s.from), to: Math.min(hi, s.to) })).filter(s => s.to - s.from > 0.02)
  const voiced = cut.reduce((a, s) => a + s.to - s.from, 0)
  return voiced > 0.04 ? cut : [{ from: lo, to: hi }]
}

// Слова с весами ws → отрезки по кускам ps (подряд, пропорционально весу). Слово, попавшее на границу кусков, остаётся в том, где его больше
function layOut(ws, ps) {
  const total = ps.reduce((a, p) => a + p.to - p.from, 0), sum = ws.reduce((a, b) => a + b, 0) || 1
  const starts = []
  let acc = 0
  for (const p of ps) { starts.push(acc); acc += p.to - p.from }
  const at = u => { let k = ps.length - 1; while (k > 0 && u < starts[k]) k--; return { k, t: ps[k].from + Math.min(u - starts[k], ps[k].to - ps[k].from) } }
  const out = []
  let u = 0
  for (const w of ws) {
    const len = (total * w) / sum, a = at(u), b = at(u + len * SLOT_USE - 1e-9)
    if (a.k === b.k) out.push({ t: a.t, e: Math.max(a.t, b.t) })
    else if (ps[a.k].to - a.t >= b.t - ps[b.k].from) out.push({ t: a.t, e: ps[a.k].to })
    else out.push({ t: ps[b.k].from, e: b.t })
    u += len
  }
  return out
}

/** Сотые секунды → без наложений, каждое слово не короче MIN_WORD_CS, всё внутри [0, dcs]. Места меньше, чем нужно словам, — равномерно */
export function repairCs(list, dcs) {
  const n = list.length
  if (!n) return []
  if (n * MIN_WORD_CS > dcs) return list.map((_, i) => ({ t: (i * dcs) / n, e: ((i + 1) * dcs) / n }))
  const out = list.map(x => ({ t: Math.max(0, Math.round(x.t)), e: Math.round(x.e) }))
  for (let i = 0; i < n; i++) { if (i) out[i].t = Math.max(out[i].t, out[i - 1].e); out[i].e = Math.max(out[i].e, out[i].t + MIN_WORD_CS) }
  for (let i = n - 1, lim = dcs; i >= 0; i--) { if (out[i].e > lim) out[i].e = lim; if (out[i].t > out[i].e - MIN_WORD_CS) out[i].t = out[i].e - MIN_WORD_CS; lim = out[i].t }
  return out
}

/**
 * Слова текста + времена найденных (times: { t, e } | null, секунды) + голосовые участки + длина файла → { words: [{ w, t, e, a }], method: 'vosk' | 'vosk+fill' | 'level' | 'even' }.
 * tokens — [{ w }] (voskAlignText.alignTokens); duration — секунды (> 0).
 */
export function fillWords(tokens, times, spans, duration) {
  const n = tokens.length, D = duration > 0 ? duration : 1
  if (!n) return { words: [], method: 'even' }
  const ws = tokens.map(t => tokenWeight(t.w))
  const got = tokens.map(() => null)
  let prev = 0
  for (let i = 0; i < n; i++) { // найденные: внутри файла и строго по порядку (остальные — в достройку)
    const f = times?.[i]
    if (!f || !Number.isFinite(f.t) || !Number.isFinite(f.e)) continue
    const t = Math.max(prev, Math.min(D, f.t)), e = Math.min(D, f.e)
    if (e - t >= 0.01) { got[i] = { t, e }; prev = e }
  }
  const found = got.filter(Boolean).length
  const sp = (spans ?? []).filter(s => s.to > s.from)
  const vLo = sp.length ? Math.max(0, sp[0].from) : 0, vHi = sp.length ? Math.min(D, sp.at(-1).to) : D
  const rates = got.map((g, i) => (g ? (g.e - g.t) / ws[i] : null)).filter(x => x != null).sort((a, b) => a - b)
  const rate = rates.length ? rates[Math.floor(rates.length / 2)] : 0.08 // секунд на единицу веса — по найденным словам
  const mark = found ? 'f' : sp.length ? 'l' : 'e'
  const res = got.map(g => (g ? { ...g, a: 'v' } : null))
  for (let i = 0; i < n;) {
    if (res[i]) { i++; continue }
    let j = i
    while (j < n && !res[j]) j++ // пробел [i, j): слева сосед i-1 (или начало голоса), справа сосед j (или конец голоса)
    const run = ws.slice(i, j), need = run.reduce((a, b) => a + b, 0) * rate
    let lo = i ? res[i - 1].e : vLo, hi = j < n ? res[j].t : vHi
    if (!i && j < n && lo >= hi) lo = Math.max(0, hi - need)        // голос «начинается» позже первого найденного слова — отступаем от него назад
    if (i && j >= n && hi <= lo) hi = Math.min(D, lo + need)        // после последнего найденного голоса не видно — сколько нужно словам, до конца файла
    if (hi < lo) hi = lo
    if (hi - lo < need * TIGHT) { // места почти нет: Vosk растянул соседа на пропущенное слово — берём у соседа то, что сверх его обычной длины (сосед обычной длины не трогается)
      let want = need - (hi - lo)
      const spare = q => Math.max(0, res[q].e - res[q].t - ws[q] * rate * 1.15)
      if (i && res[i - 1].a === 'v') { const d = Math.min(want, spare(i - 1)); res[i - 1].e -= d; lo -= d; want -= d }
      if (j < n && res[j].a === 'v' && want > 0) { const d = Math.min(want, spare(j)); res[j].t += d; hi += d }
    }
    layOut(run, pieces(sp, lo, hi)).forEach((x, k) => { res[i + k] = { ...x, a: mark } })
    i = j
  }
  const fixed = repairCs(res.map(x => ({ t: x.t * 100, e: x.e * 100 })), Math.max(1, Math.floor(D * 100)))
  const r3 = v => Math.round(v * 10) / 1000
  return {
    words: tokens.map((t, i) => ({ w: t.w, t: r3(fixed[i].t), e: r3(fixed[i].e), a: res[i].a })),
    method: found === n ? 'vosk' : found ? 'vosk+fill' : sp.length ? 'level' : 'even',
  }
}

/** Проверка гарантий: [] — всё в порядке, иначе строки для человека. count — сколько слов должно быть (слов текста) */
export function checkWords(words, duration, count = null) {
  const bad = []
  if (!Array.isArray(words)) return ['разметка не массив']
  if (count != null && words.length !== count) bad.push(`слов ${words.length}, а в тексте ${count}`)
  words.forEach((x, i) => {
    if (!Number.isFinite(x?.t) || !Number.isFinite(x?.e)) { bad.push(`слово ${i + 1}: нет времени`); return }
    if (!(x.e > x.t)) bad.push(`слово ${i + 1}: длительность не больше нуля`)
    if (x.t < 0 || x.e > duration + 1e-6) bad.push(`слово ${i + 1}: за пределами файла`)
    if (i && x.t < words[i - 1].e - 1e-9) bad.push(`слово ${i + 1}: накладывается на предыдущее`)
  })
  return bad
}

/**
 * Что известно о разметке по самим словам реплики (метки a переживают перезагрузку — они лежат в настройках вместе с таймингами):
 * → { has (тайминги есть), own (размечал свой файл; false — озвучка ElevenLabs), found, total, method, approx (найдено меньше 60 %), missing (слова без времени от Vosk) }
 */
export function alignInfo(words) {
  const list = Array.isArray(words) ? words : []
  if (!list.length) return { has: false, own: false, found: 0, total: 0, method: null, approx: false, missing: [] }
  const own = list.some(x => typeof x?.a === 'string'), total = list.length
  if (!own) return { has: true, own: false, found: total, total, method: 'tts', approx: false, missing: [] }
  const found = list.filter(x => x.a === 'v').length
  const method = found === total ? 'vosk' : found ? 'vosk+fill' : list.some(x => x.a === 'l') ? 'level' : 'even'
  return { has: true, own: true, found, total, method, approx: found < total * APPROX_BELOW, missing: list.filter(x => x.a !== 'v').map(x => String(x.w ?? '')) }
}

const quote = list => list.map(w => `«${w}»`).join(', ')

/** «рот размечен: 9 слов из 9 (Vosk)» — одна строка итога для человека (карточка, сообщение после загрузки) */
export function alignLine(r) {
  if (!r || !r.total) return 'разметки рта нет'
  if (r.method === 'tts') return 'рот размечен (озвучка ElevenLabs)'
  if (r.method === 'vosk') return `рот размечен: ${r.found} слов из ${r.total} (Vosk)`
  if (r.method === 'vosk+fill') return `рот размечен${r.approx ? ' приблизительно' : ''}: найдено ${r.found} из ${r.total}, остальные расставлены по записи (не найдены: ${quote(r.missing)})`
  if (r.method === 'level') return 'рот по громкости записи: Vosk не узнал слова'
  return 'разметки рта нет'
}
