// Отчёт «📤 Отправить» стенда пилюль одним .txt (CONCEPT_PILLSTAND.md, «Отправка по теме»): шапка (версия, устройство, дата, режим / язык / сид, темы, отрезок, цели с номерами, метки кадров, звук, состав) →
// комментарий владельца → по каждой цели отрезка: хроника по выбранным темам («+мс от появления цели», события отбирает pillStandPacks.js), таблица кадров (Анимация / Всё, pillStandFrames.js), метрики тем
// (pillStandPackMetrics.js) → журнал игры по теме → машиночитаемый блок «---JSON---» с теми же данными (для «Всё» — полная трасса отрезка и все кадры). Имя: pithy-stand-<темы>-<дата>.txt.
// Текст для «Скопировать текстом» — тот же отчёт без JSON-блока (и без таблиц кадров, если длиннее COPY_MAX). Чистые функции (дата и данные — аргументами).
import { analyzeSegment, totalsOf } from './pillStandHonesty.js'
import { normTopics, packEvents, journalFor, wantsFrames, TOPIC_TITLE, TOPIC_SLUG } from './pillStandPacks.js'
import { resolveSpan, sliceEvents, sliceFrames, parseJournal, journalIn, inAudio } from './pillStandSpan.js'
import { pickFrames, frameRows } from './pillStandFrames.js'
import { topicMetrics, evidenceWindows } from './pillStandPackMetrics.js'
import { chronLine } from './pillStandChron.js'
import { MODE_TITLE, LEN_TITLE } from './pillStandSummary.js'

export const JSON_MARK = '---JSON---'
export const WARN_BYTES = 2 * 1024 * 1024
export const WARN_ALL_BYTES = 15 * 1024 * 1024
export const COPY_MAX = 150000
const METRIC_TOPICS = ['anim', 'ear', 'logic', 'honesty']
const pad = n => String(n).padStart(2, '0')
const sec = ms => (ms / 1000).toFixed(3).replace('.', ',')
const q = t => `«${t ?? ''}»`

/** «2026-11-09_14-03-27» — для имени файла */
export const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
const dayText = d => { const o = -d.getTimezoneOffset(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} (UTC${o >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)})` }
export const audioExt = type => (/mp4|aac|m4a/.test(type ?? '') ? 'm4a' : /ogg/.test(type ?? '') ? 'ogg' : 'webm')

/** Имя файла: pithy-stand-anim-vosk-2026-11-09_14-03-27.txt */
export const packName = (topics, d) => `pithy-stand-${normTopics(topics).map(t => TOPIC_SLUG[t]).join('-') || 'none'}-${stamp(d)}.txt`

/** События отрезка → группы по целям: [{ target | null, events }] */
export function byTarget(events) {
  const out = []
  let cur = null
  for (const e of events) {
    if (e.k === 'target') { cur = { target: e, events: [e] }; out.push(cur) } else { if (!cur) { cur = { target: null, events: [] }; out.push(cur) } cur.events.push(e) }
  }
  return out
}

const markEvents = marks => marks.map(m => ({ t: m.t, k: 'mark', n: m.n, i: m.i ?? null, ...(m.note ? { note: m.note } : {}) }))
const merge = (a, b) => [...a, ...b].sort((x, y) => x.t - y.t)
const lean = f => ({ ...f, e: f.e ? { p: f.e.p, f: f.e.f } : undefined }) // кадр для «Анимации»: панель Vosk — только тексты (без rms и затвора)

/**
 * Отчёт: topics — выбор тем; span — { kind, sec }; ab — [a, b] плеера; at — «сейчас» (мс сессии); comment; marks — [{ t, i }]; meta — usePillStand.meta(); events — трасса; frames — кадры записи;
 * audio — { type, startMs, blob } записи; journal — { lines (gameJournal.lines), t0abs (старт трассы, performance.now), dropped }; sound — приложить звук; now — дата
 * → { name, text, copy, json, bytes, warn, audioName, span, counts }
 */
export function buildPack({ topics, span: want = { kind: 'session' }, ab = null, at, comment = '', marks = [], meta = {}, events, frames = [], audio = null, journal = null, sound = false, now = new Date() }) {
  const ts = normTopics(topics), all = ts[0] === 'all'
  const metricTopics = all ? METRIC_TOPICS : ts.filter(t => METRIC_TOPICS.includes(t))
  const span = resolveSpan({ kind: want.kind, sec: want.sec, events, at, ab })
  const evs = sliceEvents(events, span), fr = sliceFrames(frames, span)
  const mk = marks.map((m, i) => ({ ...m, n: i + 1 })).filter(m => m.t >= span.from && m.t <= span.to)
  const groups = byTarget(evs)
  const tgs = groups.filter(g => g.target).map(g => g.target)
  const per = groups.map((g, gi) => {
    const t0 = g.target?.t ?? span.from, t1 = groups[gi + 1]?.target?.t ?? Infinity
    const seg = g.target ? analyzeSegment(g) : null
    const frames = fr.filter(f => f.t >= t0 && f.t < t1)
    const metrics = seg ? Object.fromEntries(metricTopics.map(t => [t, topicMetrics(t, { seg, events: g.events, frames, t0 })])) : {}
    return { ...g, t0, t1, seg, frames, metrics, windows: seg ? evidenceWindows(seg, g.events, t0) : [] }
  })
  const packed = merge(packEvents(ts, evs, { windows: per.flatMap(p => p.windows) }), markEvents(mk))
  const jAll = journal ? journalIn(parseJournal(journal.lines ?? [], journal.t0abs ?? 0), span) : []
  const traceLogs = new Set(evs.filter(e => e.k === 'log').map(e => e.text))
  const jLines = journalFor(ts, jAll).filter(l => all || !traceLogs.has(l.text))
  const fileName = packName(ts, now)
  const withSound = !!(sound && audio?.blob)
  const audioName = withSound ? fileName.replace(/\.txt$/, `.${audioExt(audio.type)}`) : null
  const inSnd = audio ? inAudio(audio, span) : null
  const tot = totalsOf(per.filter(p => p.seg && (p.t0 < span.from || p.events.some(e => e.k === 'run'))).map(p => p.seg)) // по целям отрезка с запуском пилюли (он мог быть и до отрезка)
  const shownRows = new Map()

  const head = [
    `Pithy · стенд пилюль · замечание: ${ts.map(t => TOPIC_TITLE[t]).join(' + ') || '—'}`,
    `версия ${meta.version ?? '?'} · ${meta.device ?? '?'} · ${dayText(now)}`,
    `режим ${MODE_TITLE[meta.mode] ?? meta.mode ?? '?'} · язык ${String(meta.lang ?? '?').toUpperCase()} · длина ${LEN_TITLE[meta.len] ?? meta.len ?? '?'} · сид ${meta.seed ?? '?'}${meta.auto != null ? ` · авто ${meta.auto ? `${String((meta.autoMs ?? 0) / 1000).replace('.', ',')} с` : 'выкл.'}` : ''}`,
    `отрезок: ${span.label}`,
    `цели: ${tgs.map(t => `#${(t.n ?? 0) + 1} ${q(t.say)}${t.shown && t.shown !== t.say ? ` (на пилюле ${q(t.shown)})` : ''} ${MODE_TITLE[t.mode] ?? t.mode} ${String(t.lang ?? '').toUpperCase()} с ${sec(t.t)} с`).join(' · ') || 'нет'}`,
    `метки кадров: ${mk.map(m => `◆${m.n} ${sec(m.t)} с${m.i != null ? ` (кадр ${m.i + 1})` : ''}`).join(' · ') || 'нет'}`,
    `звук: ${!audio ? 'записи со звуком не было' : withSound ? `файл ${audioName} (${audio.type}), вся запись; отрезок в звуке ${inSnd ? `${String(inSnd[0]).replace('.', ',')}–${String(inSnd[1]).replace('.', ',')} с` : 'не попадает'}` : 'не прикладывается'}`,
    `итог честности отрезка: целей ${tot.targets}, зачётов ${tot.wins}, ложных срабатываний ${tot.falses}, додумано ${tot.extra} из ${tot.heard} слов, перестроек ${tot.rebuilds}, откатов ${tot.backs}, неверных ${tot.wrongs}`,
  ]
  const body = noFrames => per.filter(p => !(p.target && p.events.length === 1 && p.t1 < Infinity)).flatMap(p => { // пустая цель (сразу сменили, двойной монтаж StrictMode) — без блока
    const lines = ['', p.target ? `== Цель #${(p.target.n ?? 0) + 1} ${q(p.target.say)}${p.target.shown && p.target.shown !== p.target.say ? ` (на пилюле ${q(p.target.shown)})` : ''} — ${String(p.target.lang ?? '').toUpperCase()}, ${MODE_TITLE[p.target.mode] ?? p.target.mode}, появилась ${sec(p.t0)} с ==` : '== До первой цели ==']
    const chron = packed.filter(e => e.t >= p.t0 && e.t < p.t1 && !(e.k === 'target' && e === p.target))
    lines.push(`-- хроника (+мс от появления цели; ${chron.length} строк) --`, ...(chron.length ? chron.map(e => chronLine(e, p.t0)) : ['   (событий темы нет)']))
    if (wantsFrames(ts) && p.frames.length && !noFrames) {
      const idx = pickFrames(p.frames, mk)
      shownRows.set(p, idx.length)
      lines.push(`-- кадры (${p.frames.length}, в таблице ${idx.length}: все ±300 мс вокруг меток и смен состояния; слова: сказано · черновик* · (подсказка 0,20 — проявление) · ░ скрыто) --`, ...frameRows(p.frames, idx, p.t0, mk))
    } else if (wantsFrames(ts) && !p.frames.length && p.target) lines.push('-- кадры: записи на этом отрезке нет («● Запись» на стенде) --')
    for (const t of metricTopics) if (p.metrics[t]) lines.push(`-- ${TOPIC_TITLE[t]}: метрики --`, ...p.metrics[t].lines.map(l => `  ${l}`))
    return lines
  })
  const jText = ['', `== Журнал игры (${all ? 'все строки' : 'строки по теме'} за отрезок: ${jLines.length}${journal?.dropped ? `; из журнала вытеснено старых строк: ${journal.dropped}` : ''}) ==`, ...(jLines.length ? jLines.map(l => `${sec(l.t).padStart(10)} ${l.day} ${l.text}`) : ['   (строк нет)'])]
  const make = lines => [...head, `состав: событий ${evs.length} (в хронике ${packed.length}), кадров ${fr.length}${wantsFrames(ts) ? ` (в таблице ${[...shownRows.values()].reduce((a, b) => a + b, 0)})` : ' (не нужны теме)'}, строк журнала ${jLines.length}`, '', '== Комментарий ==', comment.trim() || '(без комментария)', ...lines, ...jText].join('\n')
  const full = body(false) // таблицы считаются до шапки (строка «состав»)
  const readable = make(full)
  const data = {
    kind: 'pithy-stand-pack', v: 1,
    header: { version: meta.version ?? null, device: meta.device ?? null, deviceInfo: meta.deviceInfo ?? null, date: now.toISOString(), mode: meta.mode ?? null, lang: meta.lang ?? null, len: meta.len ?? null, seed: meta.seed ?? null, topics: ts, span, audio: audio ? { file: audioName, type: audio.type, startMs: audio.startMs, inAudio: inSnd, attached: withSound } : null },
    comment: comment.trim(), marks: mk, targets: tgs,
    events: all ? evs : packed,
    frames: wantsFrames(ts) ? (all ? fr : fr.map(lean)) : [],
    metrics: per.filter(p => p.target).map(p => ({ n: p.target.n, say: p.target.say, t: p.t0, ...Object.fromEntries(Object.entries(p.metrics).map(([k, v]) => [k, v.data])) })),
    honesty: tot, journal: jLines,
  }
  const json = JSON.stringify(data)
  const text = `${readable}\n\n${JSON_MARK}\n${json}\n`
  const bytes = utf8Len(text)
  const copy = readable.length > COPY_MAX ? make(body(true)) : readable
  const warn = bytes > (all ? WARN_ALL_BYTES : WARN_BYTES) ? `файл ${(bytes / 1048576).toFixed(1).replace('.', ',')} МБ — больше ${all ? 15 : 2} МБ` : ''
  return { name: fileName, text, copy, json, bytes, warn, audioName, span, counts: { events: evs.length, chron: packed.length, frames: fr.length, journal: jLines.length, targets: tgs.length } }
}

/** Длина строки в UTF-8 (байты) */
export function utf8Len(s) {
  let n = 0
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3 }
  return n
}

/** JSON-блок обратно из текста отчёта */
export const readPackJson = text => JSON.parse(text.slice(text.indexOf(JSON_MARK) + JSON_MARK.length).trim())
