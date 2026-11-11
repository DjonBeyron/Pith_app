// Метрики по темам для отчёта «📤 Отправить» стенда пилюль (CONCEPT_PILLSTAND.md, «Отправка по теме»): по одной цели — разбор честности (pillStandHonesty.analyzeSegment), сырые события цели и её кадры →
// строки «-- метрики --» и те же данные объектом для JSON-блока. Анимация: «хлопок при заливке 1,00, через 96 мс после зачёта» (pillStandPop.js), «слово → заливка дошла», рывки экрана «на голос ли», пузыри в жидкости («сколько внутри, вырвались ли в кадре хлопка, зазор сверху»), первые кадры флагов (nudge, вспышка, хлопок, пузыри…). Распознавание: голос → первый
// черновик, черновики / повторы / перестройки (было → стало), итоги с «кто закрыл» и conf, додуманные слова, словарь, кто закрывал заходы. Зачёт и логика: засчитанные слова, откаты, неверные, итог зачёта,
// продления у края, «договорена». Честность: каждое ложное срабатывание с голосом рядом (макс. rms за VOICE_MS до, затвор) и окна доказательств ±EVIDENCE_MS. Чистые функции.
import { isVoice, voiceNote, voiceFillLine } from './pillStandVoice.js'
import { heardWords } from './pillStandWords.js'
import { jerks, flagStarts, VOICE_MS } from './pillStandFrames.js'
import { EVIDENCE_MS } from './pillStandPacks.js'
import { popMoments, popLine, bubbleStats, topGaps, bubbleLine } from './pillStandPop.js'

const q = t => `«${t ?? ''}»`
const num = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d).replace('.', ','))
const ms = v => (v == null ? '—' : `${Math.round(v)} мс`)
const plus = v => `${v >= 0 ? '+' : ''}${Math.round(v)}`
const STOP = { endpoint: 'движок сам', manual: 'кнопка «Стоп»', auto: 'авто-стоп', full: 'все слова', max: 'потолок записи' }
const CAP = 40
const cap = (list, f) => `${list.slice(0, CAP).map(f).join(' · ') || '—'}${list.length > CAP ? ` · …ещё ${list.length - CAP}` : ''}`

/** Перестройки черновика: [{ t, from, to }] (новый текст — не продолжение прошлого; итог / новый заход — с чистого листа) */
export function rebuildList(events, t0) {
  const out = []
  let prev = ''
  for (const e of events) {
    if (e.k === 'vosk-start' || e.k === 'vosk-final') { prev = ''; continue }
    if (e.k !== 'vosk-partial') continue
    const cur = heardWords(e.raw?.partial).join(' ')
    if (!cur || cur === prev) continue
    if (prev && !cur.startsWith(prev)) out.push({ t: Math.round(e.t - t0), from: prev, to: cur })
    prev = cur
  }
  return out
}

/** Голос рядом с моментом t (мс сессии): { rms — макс. за VOICE_MS до, voice — был ли в это время кусок-голос (счётчик распознавания), gate — затвор в момент t } */
export function voiceNear(events, t) {
  let rms = 0, gate = null, voice = false
  for (const e of events) { if (e.t > t) break; if (e.k === 'level' && t - e.t <= VOICE_MS) { rms = Math.max(rms, e.rms); voice ||= isVoice(e) } if (e.k === 'gate') gate = e.open }
  return { rms: Math.round(rms * 10000) / 10000, voice, gate }
}

/** Окна доказательств «Честности» (мс сессии): ±EVIDENCE_MS вокруг ложных срабатываний и первых появлений «додуманных» слов */
export function evidenceWindows(seg, events, t0) {
  const ts = seg.falses.map(f => t0 + f.t)
  for (const inv of seg.invented) {
    const e = events.find(x => (x.k === 'vosk-partial' && heardWords(x.raw?.partial).includes(inv.w)) || (x.k === 'vosk-final' && heardWords(x.raw?.text).includes(inv.w)))
    if (e) ts.push(e.t)
  }
  return ts.map(t => [t - EVIDENCE_MS, t + EVIDENCE_MS])
}

function anim(seg, events, frames, t0) {
  const reach = events.filter(e => e.k === 'reach').map(e => ({ t: Math.round(e.t - t0), word: e.word, ms: e.ms }))
  const fills = events.filter(e => e.k === 'fill').map((e, i) => ({ t: e.t, i, v: e.shown }))
  const js = jerks(frames.length ? frames : fills, events).map(j => ({ ...j, t: Math.round(j.t - t0) }))
  const flags = flagStarts(frames).map(f => ({ ...f, t: Math.round(f.t - t0) }))
  const pops = popMoments(frames, events), bub = bubbleStats(frames, pops), gaps = topGaps(frames, pops)
  const lines = [
    ...[voiceFillLine(seg.voice)].filter(Boolean),
    popLine(pops),
    ...(frames.length ? [bubbleLine(bub, gaps)] : []),
    `слово → заливка дошла (по трассе): ${cap(seg.toFill, x => `${q(x.word)} ${x.ms} мс`)}`,
    `заливка дошла (кадр стенда): ${cap(reach, x => `${plus(x.t)} ${q(x.word)} ${x.ms} мс`)}`,
    `рывки экрана ≥ 0,08 за ${frames.length ? 'кадр' : 'шаг заливки'}: ${js.length}, без голоса ${js.filter(j => !j.voice).length}${js.length ? ` — ${cap(js, j => `${plus(j.t)} ${num(j.from)}→${num(j.to)} голос ${j.voice ? 'да' : 'НЕТ'}${j.word ? `, после ${q(j.word)} через ${j.wordMs} мс` : ''}`)}` : ''}`,
  ]
  if (frames.length) lines.push(`первые кадры флагов: ${cap(flags, f => `${plus(f.t)} ${f.flag}`)}`, `кадров цели: ${frames.length}`)
  return { lines, data: { pops: pops.map(x => ({ ...x, t: Math.round(x.t - t0) })), bubbles: { ...bub, first: bub.first == null ? null : Math.round(bub.first - t0), atPop: bub.atPop.map(x => ({ ...x, t: Math.round(x.t - t0) })) }, topGaps: gaps.map(g => ({ ...g, t: Math.round(g.t - t0) })), toFill: seg.toFill, reach, jerks: js, flags, frames: frames.length } }
}

/** Дошёл ли голос до Vosk (v3.3.186): по итогам заходов — сколько мс звука счётчик голоса назвал голосом и сколько из них затвор тишины не отдал распознавателю (voskEngine: voiceMs / gatedVoiceMs) */
export function feedLine(events) {
  const fin = events.filter(e => e.k === 'vosk-final' && e.voiceMs != null)
  if (!fin.length) return { line: '', data: null }
  const sum = k => fin.reduce((n, e) => n + (Number(e[k]) || 0), 0), voice = sum('voiceMs'), lost = sum('gatedVoiceMs'), gated = sum('gatedMs'), agc = Math.max(...fin.map(e => Number(e.agcMax) || 1))
  const line = lost > 0 ? `⚠ звук не дошёл до Vosk: затвор закрыт ${lost} мс из ${voice} мс голоса` : `звук в Vosk: голос ${voice} мс — дошёл весь; тишины не отдано ${gated} мс${agc > 1 ? `; усиление перед Vosk до ×${agc}` : ''}`
  return { line, data: { voiceMs: voice, gatedVoiceMs: lost, gatedMs: gated, agcMax: agc } }
}

function ear(seg, events, t0) {
  const rebuilds = rebuildList(events, t0)
  const same = events.filter(e => e.k === 'same').length
  const closed = {}
  for (const f of seg.finals) { const k = STOP[f.stopBy] ?? f.stopBy ?? '?'; closed[k] = (closed[k] ?? 0) + 1 }
  const grammar = events.filter(e => e.k === 'vosk-start').map(e => e.grammar)
  const fed = feedLine(events)
  const lines = [
    `голос: ${seg.voiceStart == null ? 'не было' : `+${seg.voiceStart}…+${seg.voiceEnd} мс`}${voiceNote(seg.voice)} · голос → первый черновик ${ms(seg.voiceToPartial)}`,
    `черновики: ${seg.partials.length} смен, повторов того же текста ${same}, перестроек ${rebuilds.length}${rebuilds.length ? ` — ${cap(rebuilds, r => `${plus(r.t)} ${q(r.from)} → ${q(r.to)}`)}` : ''}`,
    `итоги: ${cap(seg.finals, f => `${plus(f.t)} ${q(f.text)} (${STOP[f.stopBy] ?? f.stopBy ?? '?'})${f.conf.length ? ` [${f.conf.map(([w, c]) => `${w} ${num(c)}`).join(', ')}]` : ''}`)}`,
    `кто закрыл заходы: ${Object.entries(closed).map(([k, v]) => `${k} ×${v}`).join(', ') || '—'}`,
    `додумано Vosk (нет в цели): ${cap(seg.invented, i => `${q(i.w)}${i.partial ? ` черн.×${i.partial}` : ''}${i.final ? ` итог×${i.final}` : ''}`)} · из ${seg.heard} услышанных слов лишних ${seg.extra}`,
    `словарь: ${grammar.length ? grammar.map(g => (Array.isArray(g) ? `${g.length} слов` : 'свободный')).join(', ') : '—'}`,
    ...(fed.line ? [fed.line] : []),
  ]
  return { lines, data: { fed: fed.data, voiceStart: seg.voiceStart, voiceEnd: seg.voiceEnd, voiceToPartial: seg.voiceToPartial, partials: seg.partials, same, rebuilds, finals: seg.finals, closed, invented: seg.invented, grammar } }
}

function logic(seg, events) {
  const logs = events.filter(e => e.k === 'log').map(e => e.text)
  const grace = logs.filter(t => /продлён/.test(t)).length, through = logs.filter(t => /договорена/.test(t)).length, noLast = logs.filter(t => /без последнего слова/.test(t)).length
  const r = seg.result
  const lines = [
    `засчитано: ${cap(seg.words, w => `${w.index + 1} ${q(w.text)} +${w.t}${w.draft ? ' (черн.)' : ''}`)}${seg.noFinal ? ` — без итога Vosk после слова: ${seg.noFinal}` : ''}`,
    `откаты: ${cap(seg.backs, b => `${b.index + 1} ${q(b.text)} +${b.t}`)} · неверные слова: ${cap(seg.wrongs, w => `${q(w.word)} вместо ${q(w.expect)} +${w.t}`)}`,
    `решения слушателя фраз: «договорена» ×${through}, «без последнего слова» ×${noLast}, продлений у края ×${grace}`,
    `итог: ${r ? `${r.ok ? 'зачёт ✓' : 'нет зачёта'} ratio ${num(r.ratio)}, ${r.clean ? 'чисто' : 'нечисто'}, +${r.t} мс, ${r.afterVoice == null ? 'голоса не было' : `${r.afterVoice} мс от конца голоса`}` : 'нет (цель сменили раньше или отрезок кончился)'}`,
  ]
  return { lines, data: { words: seg.words, backs: seg.backs, wrongs: seg.wrongs, noFinal: seg.noFinal, through, noLast, grace, result: r } }
}

function honest(seg, events, t0) {
  const falses = seg.falses.map(f => ({ ...f, ...voiceNear(events, t0 + f.t) }))
  const lines = [
    `ложные срабатывания: ${falses.length}${falses.length ? ` — ${cap(falses, f => `+${f.t} ${f.kind}${f.text ? ` ${q(f.text)}` : ''} (rms макс. за 1,5 с до ${num(f.rms, 4)}${f.voice ? ' — голос' : ''}, затвор ${f.gate == null ? '—' : f.gate ? 'открыт' : 'закрыт'})`)}` : ''}`,
    `додумано Vosk: ${cap(seg.invented, i => `${q(i.w)}${i.partial ? ` черн.×${i.partial}` : ''}${i.final ? ` итог×${i.final}` : ''}`)} · перестроек черновика ${seg.rebuilds} из ${seg.changes} смен`,
    `засчитано без итога Vosk после слова: ${seg.noFinal} · голос → черновик ${ms(seg.voiceToPartial)} · слово → заливка ${seg.toFill.map(x => x.ms).join(', ') || '—'} мс`,
  ]
  return { lines, data: { falses, invented: seg.invented, rebuilds: seg.rebuilds, changes: seg.changes, noFinal: seg.noFinal } }
}

/** Метрики темы topic по цели: seg — analyzeSegment, events — сырые события цели в отрезке, frames — её кадры, t0 — появление цели → { lines, data } */
export function topicMetrics(topic, { seg, events, frames = [], t0 }) {
  if (topic === 'anim') return anim(seg, events, frames, t0)
  if (topic === 'ear') return ear(seg, events, t0)
  if (topic === 'logic') return logic(seg, events)
  if (topic === 'honesty') return honest(seg, events, t0)
  return { lines: [], data: {} }
}
