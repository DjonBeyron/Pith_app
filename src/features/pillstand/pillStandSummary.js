// Сводка стенда пилюль текстом (CONCEPT_PILLSTAND.md): владелец копирует её кнопкой «Скопировать сводку» и вставляет в чат. Шапка (версия, устройство, режим, язык, сид), итог по честности
// (pillStandHonesty.js) и по каждой цели: голос, черновики и итоги Vosk с мс от появления цели, засчитанные слова, откаты, неверные слова, «додуманные» слова, ложные срабатывания, зачёт и задержки. Чистые функции.
import { honesty } from './pillStandHonesty.js'
import { voiceNote, voiceFillLine } from './pillStandVoice.js'

export const MODE_TITLE = { word: 'Вертикальная (слово)', words: 'По словам (проход 1)', fast: 'Быстро (проход 2)' }
export const LEN_TITLE = { short: 'короткие', long: 'длинные', any: 'любые' }
export const MAX_PARTIALS = 24
const num = v => (v == null ? '—' : String(v).replace('.', ','))
const ms = v => (v == null ? '—' : `${Math.round(v)} мс`)
const q = t => `«${t}»`
const STOP = { endpoint: 'движок сам', manual: 'кнопка «Стоп»', auto: 'авто-стоп', full: 'все слова', max: 'потолок записи', ear: 'правило слова' }

const afterText = v => (v == null ? 'голоса не было' : v < 0 ? `за ${-v} мс до конца голоса` : `${v} мс от конца голоса`)

/** Пометка зачёта под пилюлей: «зачёт ✓ ratio 1,00, чисто, 420 мс от конца голоса» */
export function resultLine(r) {
  if (!r) return ''
  return `${r.ok ? 'зачёт ✓' : 'нет зачёта ✗'} ratio ${num(typeof r.ratio === 'number' ? r.ratio.toFixed(2) : r.ratio)}, ${r.clean ? 'чисто' : 'нечисто'}, ${afterText(r.endMs ?? r.afterVoiceMs)}`
}

/** Строки одной цели */
export function segmentLines(s) {
  const out = [`#${s.n + 1} ${q(s.say)}${s.shown && s.shown !== s.say ? ` (на пилюле ${q(s.shown)})` : ''} — ${s.lang.toUpperCase()}, ${MODE_TITLE[s.mode] ?? s.mode}`]
  out.push(`  голос: ${s.voiceStart == null ? 'не было' : `+${s.voiceStart}…+${s.voiceEnd} мс`}${voiceNote(s.voice)}`)
  if (voiceFillLine(s.voice)) out.push(`  ${voiceFillLine(s.voice)}`)
  const ps = s.partials.slice(0, MAX_PARTIALS).map(p => `+${p.t} ${q(p.text)}`)
  out.push(`  черновики (${s.partials.length}, перестроек ${s.rebuilds}): ${ps.join(' · ') || '—'}${s.partials.length > MAX_PARTIALS ? ` · …ещё ${s.partials.length - MAX_PARTIALS}` : ''}`)
  out.push(`  итоги: ${s.finals.map(f => `+${f.t} ${q(f.text)} (${STOP[f.stopBy] ?? f.stopBy ?? '?'})${f.conf.length ? ` [${f.conf.map(([w, c]) => `${w} ${num(c)}`).join(', ')}]` : ''}`).join(' · ') || '—'}`)
  out.push(`  засчитано: ${s.words.map(w => `${w.index + 1} ${q(w.text)} +${w.t}${w.draft ? ' (черн.)' : ''}`).join(' · ') || '—'}${s.noFinal ? ` — без итога Vosk после слова: ${s.noFinal}` : ''}`)
  if (s.backs.length) out.push(`  откаты: ${s.backs.map(b => `${b.index + 1} ${q(b.text)} +${b.t}`).join(' · ')}`)
  if (s.wrongs.length) out.push(`  неверные слова: ${s.wrongs.map(w => `${q(w.word)} вместо ${q(w.expect)} +${w.t}`).join(' · ')}`)
  if (s.invented.length) out.push(`  додумано Vosk (нет в цели): ${s.invented.map(i => `${q(i.w)}${i.partial ? ` черн.×${i.partial}` : ''}${i.final ? ` итог×${i.final}` : ''}`).join(', ')}`)
  out.push(`  ложные срабатывания: ${s.falses.map(f => `+${f.t} ${f.kind}${f.text ? ` ${q(f.text)}` : ''}`).join(' · ') || 'нет'}`)
  const r = s.result
  out.push(`  итог: ${r ? `${r.ok ? 'зачёт ✓' : 'нет зачёта'} ratio ${num(r.ratio?.toFixed?.(2) ?? r.ratio)}, ${r.clean ? 'чисто' : 'нечисто'}, +${r.t} мс, ${afterText(r.afterVoice)}` : 'нет (цель сменили раньше)'}`)
  out.push(`  задержки: голос → черновик ${ms(s.voiceToPartial)}; слово → заливка ${s.toFill.map(x => `${q(x.word)} ${x.ms}`).join(', ') || '—'}`)
  return out
}

/** Вся сводка: meta — { version, device, seed, mode, lang, len, audio }, events — трасса */
export function summaryText(meta, events) {
  const { segs, totals: t } = honesty(events)
  const head = [
    'Стенд пилюль — сводка',
    `версия ${meta.version ?? '?'} · ${meta.device ?? '?'} · сид ${meta.seed ?? '?'} · ${MODE_TITLE[meta.mode] ?? meta.mode ?? '?'} · ${String(meta.lang ?? '?').toUpperCase()} · длина ${LEN_TITLE[meta.len] ?? meta.len ?? '?'}${meta.audio ? ` · звук ${meta.audio}` : ''}`,
    `целей ${t.targets}, зачётов ${t.wins}; ложных срабатываний ${t.falses}; додумано ${t.extra} из ${t.heard} услышанных слов (${t.extraPct} %); перестроек черновика ${t.rebuilds} из ${t.changes} смен; откатов ${t.backs}; неверных слов ${t.wrongs}`,
    `задержки (медиана): голос → первый черновик ${ms(t.voiceToPartial)}, слово → заливка дошла ${ms(t.toFill)}, конец голоса → зачёт ${ms(t.afterVoice)}`,
  ]
  return [...head, '', ...segs.flatMap(s => [...segmentLines(s), ''])].join('\n').trimEnd()
}
