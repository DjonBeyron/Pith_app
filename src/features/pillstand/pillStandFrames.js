// Таблица кадров для отчёта «📤 Отправить» стенда пилюль (тема «Анимация» и «Всё», CONCEPT_PILLSTAND.md): кадр записи (pillStandRecorder.js: t, i, s — снимок пилюли pillStandSnap.js, g — цель заливки,
// v — экран) → строка «t, кадр, цель, экран, слова, флаги». Прореживание: ВСЕ кадры ±MARK_WIN_MS вокруг меток, каждая смена состояния (цель, флаги, маска слов, вспышка, хлопок / дрожь, появление /
// исчезновение пилюли) вместе с кадром до неё; между ними — шаг экрана ≥ V_STEP или раз в HEARTBEAT_MS. Здесь же «рывки»: скачок экрана за кадр ≥ JERK_V — был ли голос (кусок с меткой голоса счётчика распознавания — pillStandVoice.js — или затвор открыт
// за VOICE_MS до рывка) и какое слово было перед ним. Чистые функции.
import { isVoice } from './pillStandVoice.js'

export const MARK_WIN_MS = 300
export const HEARTBEAT_MS = 500
export const V_STEP = 0.05
export const JERK_V = 0.08
export const VOICE_MS = 1500
export const MAX_ROWS = 1500
const n2 = v => (v == null ? ' —  ' : v.toFixed(2).replace('.', ','))
const SKIP_ATTR = new Set(['data-cap', 'data-mode', 'data-pass', 'data-tag', 'data-held', 'data-lane', 'data-speed'])

/** Маска слов «Скажи»: сказанное — слово, черновик — слово*, подсказка — (слово 0,40 — проявление), скрытое — ░; peek: false — без числа проявления (для подписи состояния) */
export function maskText(mask = [], peek = true) {
  return mask.map(m => (m.w === 'full' ? m.t : m.w === 'draft' ? `${m.t}*` : m.w === 'peek' ? `(${m.t}${peek && m.p ? ` ${Number(m.p).toFixed(2).replace('.', ',')}` : ''})` : '░')).join(' ')
}

const identity = v => !v || v === 'none' || v === '1' || v === 'matrix(1, 0, 0, 1, 0, 0)'
const noOutline = v => !v || /none|0px/.test(v)

/** Флаги кадра: атрибуты пилюли (lock, nudge, live, full …), хлопок (scale), дрожь (transform), обводка, вспышки, пузыри (в жидкости — «пузыри×N», вылетевшие при хлопке — «вылет×N»), «нет пилюли» */
export function flagsOf(f) {
  const s = f?.s
  if (!s) return ['нет пилюли']
  const out = Object.entries(s.a ?? {}).filter(([k]) => !SKIP_ATTR.has(k)).map(([k, v]) => (v && v !== '1' && v !== 'true' && v.length < 12 ? `${k.slice(5)}=${v}` : k.slice(5)))
  if (!identity(s.fx?.scale)) out.push(`хлопок ${Number.isFinite(Number(s.fx.scale)) ? Number(s.fx.scale).toFixed(3).replace('.', ',') : s.fx.scale}`)
  if (!identity(s.fx?.tf)) out.push('дрожь')
  if (!noOutline(s.fx?.ol)) out.push('обводка')
  if (s.fl?.length) out.push(`вспышка×${s.fl.length}`)
  if (s.bb?.n?.length) out.push(`${s.bb.out ? 'вылет' : 'пузыри'}×${s.bb.n.length}`)
  return out
}

/** Подпись состояния кадра (без экрана и проявления подсказки — они идут плавно, их ловят шаг V_STEP и HEARTBEAT_MS) */
export const stateSig = f => `${f.g == null ? '' : f.g.toFixed(3)}|${flagsOf(f).map(x => x.replace(/^хлопок (.*)$/, (_, v) => `хлопок ${Math.round(Number(v.replace(',', '.')) * 20)}`)).filter(x => !/^(пузыри|вылет)×/.test(x)).join(',')}${f.s?.bb?.n?.length ? (f.s.bb.out ? ',вылет' : ',пузыри') : ''}|${maskText(f.s?.mask, false)}` // хлопок — с шагом 0,05; пузыри — есть / вылетели / нет (их число меняется с уровнем)

/** Индексы кадров для таблицы (в порядке): marks — [{ t }] */
export function pickFrames(frames, marks = []) {
  const keep = new Set()
  let lastT = -Infinity, lastV = null, prevSig = null
  frames.forEach((f, i) => {
    const sig = stateSig(f)
    const near = marks.some(m => Math.abs(f.t - m.t) <= MARK_WIN_MS)
    const changed = prevSig != null && sig !== prevSig
    if (changed && i > 0) keep.add(i - 1)
    if (i === 0 || i === frames.length - 1 || near || changed || f.t - lastT >= HEARTBEAT_MS || (f.v != null && lastV != null && Math.abs(f.v - lastV) >= V_STEP)) { keep.add(i); lastT = f.t; lastV = f.v ?? lastV }
    prevSig = sig
  })
  return [...keep].sort((a, b) => a - b)
}

/** Строки таблицы: t0 — момент появления цели (мс сессии), marks — [{ t, n }] (метка ставится на ближайший кадр) */
export function frameRows(frames, idxs, t0, marks = [], max = MAX_ROWS) {
  const at = new Map()
  for (const m of marks) { let best = -1, d = Infinity; frames.forEach((f, i) => { const x = Math.abs(f.t - m.t); if (x < d) { d = x; best = i } }); if (best >= 0 && d <= MARK_WIN_MS) at.set(best, [...(at.get(best) ?? []), m.n]) }
  const head = '      +мс   кадр  цель  экран  слова · флаги'
  const rows = idxs.slice(0, max).map(i => {
    const f = frames[i], ms = Math.round(f.t - t0)
    const mk = at.has(i) ? ` ◆ МЕТКА ${at.get(i).join(',')}` : ''
    const words = maskText(f.s?.mask)
    return `${(ms >= 0 ? `+${ms}` : String(ms)).padStart(9)} ${String(f.i + 1).padStart(6)}  ${n2(f.g)}  ${n2(f.v)}  ${words ? `${words} · ` : ''}${flagsOf(f).join(' ') || '—'}${mk}`
  })
  if (idxs.length > max) rows.push(`… ещё ${idxs.length - max} строк (все кадры — в JSON-блоке)`)
  return [head, ...rows]
}

/** Рывки экрана за кадр: [{ t, i, from, to, voice, word, wordMs }]; events — сырая трасса (rms, затвор, слова) */
export function jerks(frames, events) {
  const out = []
  const levels = events.filter(e => e.k === 'level' && isVoice(e)).map(e => e.t)
  const gates = events.filter(e => e.k === 'gate')
  const words = events.filter(e => (e.k === 'word' && !e.gone) || (e.k === 'pill' && e.type === 'claim'))
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i]
    if (a.v == null || b.v == null || Math.abs(b.v - a.v) < JERK_V) continue
    const gate = gates.filter(g => g.t <= b.t).at(-1)?.open ?? false
    const voice = gate || levels.some(t => t <= b.t && b.t - t <= VOICE_MS)
    const w = words.filter(e => e.t <= b.t).at(-1)
    out.push({ t: b.t, i: b.i, from: a.v, to: b.v, voice, word: w ? (w.text ?? '?') : null, wordMs: w ? Math.round(b.t - w.t) : null })
  }
  return out
}

/** События пилюли из кадров: первый кадр каждого флага (nudge, вспышка, хлопок, обводка …) → [{ t, i, flag }] */
export function flagStarts(frames) {
  const out = []
  let prev = new Set()
  for (const f of frames) {
    const cur = new Set(flagsOf(f).map(x => (x === 'нет пилюли' ? x : x.replace(/[ =].*$/, '').replace(/×\d+$/, ''))))
    for (const x of cur) if (!prev.has(x)) out.push({ t: f.t, i: f.i, flag: x })
    prev = cur
  }
  return out
}
