// Поля журнала и текст «Скопировать сравнение» для экспериментов против домысливания движка (проба «Голос»). Чистые функции.
import { analyzeAttempt, saidKind, judge } from './antiPredictRules.js'
import { generateWrongForms } from './antiPredictModes.js'

/** Дополнительные поля записи журнала (третий аргумент logFields контроллера: { view, extra }) */
export function antiPredictLogFields({ view, extra } = {}) {
  const an = view?.final
    ? analyzeAttempt({
      reference: view.reference, wrong: extra?.wrong ?? generateWrongForms(view.reference),
      final: view.final, alternatives: view.alternatives, history: view.history, lastInterim: view.lastInterim,
    })
    : null
  return {
    antipredict: extra?.modes ?? [], nAlts: view?.alternatives?.length ?? 0,
    engineFixed: an ? an.engineFixed : null, literalSeen: an ? an.literalSeen : null,
  }
}

const yn = v => (v == null ? '—' : v ? 'да' : 'нет')

/** Колонка журнала: «обычный · 3 альт. · исправил: нет · литерально: нет»; старые записи без поля → «—» */
export function fmtAntiPredict(e) {
  if (!Array.isArray(e?.antipredict)) return '—'
  const parts = [e.antipredict.length ? e.antipredict.join('+') : 'обычный']
  if (e.nAlts) parts.push(`${e.nAlts} альт.`)
  if (e.engineFixed != null) parts.push(`исправил: ${yn(e.engineFixed)}`)
  if (e.literalSeen != null) parts.push(`литерально: ${yn(e.literalSeen)}`)
  return parts.join(' · ')
}

export const fmtConfPct = c => (typeof c === 'number' ? `${Math.round(c * 100)}%` : 'нет')

const verdictWord = ok => (ok ? 'подтверждено' : 'НЕ подтверждено')

export function verdictRows(an, kind) {
  const v = an.verdicts
  const rows = [
    { id: 'top1', name: 'top-1 final', ok: v.top1.ok, note: v.top1.missed.length ? `нет слов: ${v.top1.missed.join(', ')}` : '' },
    { id: 'consensus', name: 'консенсус interim+final', ok: v.consensus.ok,
      note: !v.consensus.used ? 'interim короче итога — решил один final' : v.consensus.missed.length ? `нет слов: ${v.consensus.missed.join(', ')}` : v.consensus.fixed.length ? `исправлено движком: ${v.consensus.fixed.join(', ')}` : '' },
    { id: 'strict', name: 'N-best строго', ok: v.strict.ok,
      note: !v.strict.used ? 'альтернатив нет (включите «Больше альтернатив»)' : v.strict.blockers.length ? `ошибочная форма в №${v.strict.blockers.map(b => b.no).join(', №')} с confidence не ниже итога` : v.strict.suspect ? 'ошибочная форма есть среди альтернатив, но с меньшей уверенностью' : '' },
    { id: 'all', name: 'все три вместе', ok: v.all, note: '' },
  ]
  return rows.map(r => ({ ...r, judge: judge(kind, r.ok) }))
}

/** Компактный текст для отправки разработчику: эталон, что говорилось, режимы, гипотезы, таймлайн, вердикты */
export function comparisonText({ view, said, analysis, caps }) {
  const ex = view.extra || {}
  const ap = view.applied
  const L = [`Эталон: «${view.reference}»`, `Что говорилось: «${String(said || '').trim() || 'не указано'}»`]
  L.push(`Режимы: ${ex.modes?.length ? ex.modes.join(', ') : 'обычный'}${ex.oneWord ? ' (одно слово без контекста)' : ''}`)
  if (ap) L.push(`Применено: lang ${ap.lang}; maxAlternatives ${ap.maxAlternatives}; continuous ${yn(ap.continuous)}; processLocally ${yn(ap.processLocally)}; phrases ${ap.phrases ?? '—'}; grammars ${ap.grammars ?? '—'}${ap.skipped?.length ? `; не применилось: ${ap.skipped.join(' | ')}` : ''}`)
  if (!analysis) { L.push(`Итога нет (${view.error || 'остановлено'})`); return L.join('\n') }
  const kind = saidKind(said, analysis)
  L.push(`Top-1 final: «${view.final.text}» (${fmtConfPct(view.final.confidence)})${view.usedInterim ? ' [взят interim]' : ''}`)
  L.push(`Гипотезы (${analysis.nbest.length}): ${analysis.nbest.map((a, i) => `${i + 1}. «${a.text}» ${fmtConfPct(a.confidence)}${a.literal.length ? ` [литерально: ${a.literal.join('/')}]` : ''}`).join(' | ')}`)
  if (view.segments?.length) L.push(`Сегменты: ${view.segments.map(s => `«${s.text}»${s.isFinal ? ` final ${s.tFinal} мс` : ' interim'}`).join(' + ')}`)
  L.push(`Interim (мс): ${analysis.timeline.length ? analysis.timeline.map(h => `${h.t} «${h.text}»${h.final ? ' [final]' : ''}`).join(' → ') : 'нет'}`)
  const f = analysis.flip
  L.push(`Слово изменено движком: ${analysis.engineFixed ? `да${f ? ` — «${f.wrong}» → «${f.key}» между ${f.fromT} и ${f.toT} мс (${f.toFinal ? 'в final' : 'уже в interim'})` : ' — слово появилось только в final'}` : 'нет'}`)
  L.push(`Литеральная форма встречалась: ${analysis.literalSeen ? `да — ${analysis.where.join('; ')}` : 'нет'}`)
  L.push(`Вердикты (подтверждено = форма принята):${kind ? ` [говорил: ${kind === 'wrong' ? 'ошибочную форму' : 'верную форму'}]` : ''}`)
  for (const r of verdictRows(analysis, kind)) L.push(`  ${r.name}: ${verdictWord(r.ok)}${r.judge ? ` — ${r.judge.label}` : ''}${r.note ? ` (${r.note})` : ''}`)
  if (caps?.uaShort) L.push(`Устройство: ${caps.uaShort}`)
  return L.join('\n')
}
