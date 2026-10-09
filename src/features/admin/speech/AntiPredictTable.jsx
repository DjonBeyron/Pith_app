import { useMemo, useState } from 'react'
import { analyzeAttempt, saidKind } from './antiPredictRules.js'
import { comparisonText, verdictRows, fmtConfPct } from './antiPredictReport.js'
import { tokenize } from '../../../shared/lib/speech/speechMatch.js'
import { buildJsgf } from './antiPredictModes.js'

const yn = v => (v == null ? 'нет данных' : v ? 'да' : 'нет')

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* пробуем старый способ */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

function Applied({ view }) {
  const ap = view.applied
  const rows = [
    ['Режимы', view.extra?.modes?.length ? view.extra.modes.join(', ') : 'обычный'],
    ['Язык (lang)', ap?.lang ?? view.lang], ['maxAlternatives', ap?.maxAlternatives ?? '—'], ['continuous', yn(ap?.continuous)],
    ['processLocally', yn(ap?.processLocally)], ['phrases (шт.)', ap?.phrases ?? 'нет'], ['grammars (шт.)', ap?.grammars ?? 'нет'],
  ]
  return (
    <table className="aspTable apKv"><tbody>
      {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{String(v)}</td></tr>)}
      {ap?.skipped?.length > 0 && <tr><th>Не применилось</th><td className="apWrap">{ap.skipped.join(' | ')}</td></tr>}
    </tbody></table>
  )
}

// Диагностика под результатом: применённые способы, N-лучших, история interim, «исправил ли движок», вердикты правил (п. 9)
export default function AntiPredictTable({ view, said, caps }) {
  const [note, setNote] = useState('')
  const wrong = view.extra?.wrong
  const an = useMemo(() => (view.final
    ? analyzeAttempt({ reference: view.reference, wrong: wrong ?? [], final: view.final, alternatives: view.alternatives, history: view.history, lastInterim: view.lastInterim })
    : null), [view.final, view.alternatives, view.history, view.lastInterim, view.reference, wrong])
  if (!view.runNo || !view.extra?.modes?.length) return null // без включённых режимов проба выглядит как раньше
  const kind = saidKind(said, an)
  const f = an?.flip
  const grammarOn = view.extra.settings?.grammar
  const inGrammar = view.final && [view.reference, ...(wrong ?? [])].some(p => tokenize(p).join(' ') === tokenize(view.final.text).join(' '))

  async function copy() {
    setNote((await copyText(comparisonText({ view, said, analysis: an, caps }))) ? 'Сравнение скопировано' : 'Не удалось скопировать — выделите текст вручную')
  }

  return (
    <div className="apDiag" aria-label="Диагностика экспериментов">
      <h4 className="aspH">Диагностика{view.extra.oneWord ? ' (одно слово без контекста)' : ''}</h4>
      <Applied view={view} />
      {!an && <p className="aspHint">Итога нет — разбирать нечего.</p>}
      {an && (<>
        <div className="aspPair"><span className="aspPairKey">Top-1 final</span><span className="aspFinalText">«{view.final.text}»</span><span className="aspHint">{fmtConfPct(view.final.confidence)}</span></div>
        <div className="aspTableWrap"><table className="aspTable" aria-label="N-лучших">
          <thead><tr><th>№</th><th>Гипотеза (N-best)</th><th>Conf.</th><th>Литерально</th></tr></thead>
          <tbody>{an.nbest.map((a, i) => (
            <tr key={i} className={a.literal.length ? 'apHit' : ''}><td>{i + 1}</td><td>{a.text}</td><td>{fmtConfPct(a.confidence)}</td><td>{a.literal.length ? `«${a.literal.join('/')}»` : '—'}</td></tr>
          ))}</tbody>
        </table></div>
        {an.nbest.length < 2 && <p className="aspHint">Альтернатив нет — включите «Больше альтернатив», чтобы увидеть N-best.</p>}
        {view.segments?.length > 0 && (
          <div className="aspTableWrap"><table className="aspTable" aria-label="Сегменты">
            <thead><tr><th>Сегмент</th><th>Текст</th><th>isFinal</th><th>Conf.</th><th>мс</th></tr></thead>
            <tbody>{view.segments.map((s, i) => (
              <tr key={i}><td>{i + 1}</td><td>{s.text}</td><td>{s.isFinal ? 'да' : 'нет'}</td><td>{fmtConfPct(s.confidence)}</td><td>{s.isFinal ? s.tFinal : s.t}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        {an.timeline.length > 0 ? (
          <div className="aspTableWrap"><table className="aspTable" aria-label="История interim">
            <thead><tr><th>мс</th><th>Текст по ходу речи</th><th>Пометка</th></tr></thead>
            <tbody>{an.timeline.map((h, i) => (
              <tr key={i} className={h.literal.length ? 'apHit' : ''}>
                <td>{h.t}</td><td>{h.text}</td>
                <td>{h.final ? 'итог (final)' : 'interim'}{h.literal.length ? ` · литерально «${h.literal.join('/')}»` : ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="aspHint">Истории interim нет (движок не присылал промежуточных текстов).</p>}
        <div className="aspPair"><span className="aspPairKey">Слово изменено движком</span><span>
          <b>{an.engineFixed ? 'да' : 'нет'}</b>
          {f && ` — «${f.wrong}» → «${f.key}» между ${f.fromT} и ${f.toT} мс (${f.toFinal ? 'только в итоговом ответе' : 'уже в промежуточном тексте'})`}
          {!f && an.engineFixed && ' — слово появилось только в итоге, а в последнем interim его не было'}
        </span></div>
        <div className="aspPair"><span className="aspPairKey">Литеральная форма встречалась</span><span>
          <b>{an.literalSeen ? 'да' : 'нет'}</b>{an.literalSeen && ` — ${an.where.join('; ')}`}
        </span></div>
        {grammarOn && <p className="aspHint">Грамматика: {view.applied?.grammars ? (inGrammar ? 'результат совпал с одним из вариантов списка (применена — или совпало случайно)' : 'результат ВНЕ списка — движок грамматику игнорирует') : 'движок не принял грамматику'}. Список: <code>{buildJsgf(view.reference, wrong ?? [])}</code></p>}
        <div className="aspTableWrap"><table className="aspTable" aria-label="Вердикты правил">
          <thead><tr><th>Правило (п. 9)</th><th>Слово</th><th>Оценка</th><th>Пояснение</th></tr></thead>
          <tbody>{verdictRows(an, kind).map(r => (
            <tr key={r.id}><td>{r.name}</td><td className={r.ok ? 'aspOk' : 'aspBad'}>{r.ok ? 'подтверждено' : 'НЕ подтверждено'}</td>
              <td className={r.judge?.good ? 'aspOk' : r.judge ? 'aspBad' : ''}>{r.judge?.label ?? '—'}</td><td className="apWrap">{r.note || '—'}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="aspHint">{kind ? 'Оценка — по полю «Что я сказал».' : 'Впишите в поле «Что я сказал» (например «try»), и у каждого правила появится оценка: поймало ошибку или нет.'} «Подтверждено» = движок считает, что форма эталона произнесена верно.</p>
      </>)}
      <div className="aspRow"><button className="aeRefresh" onClick={copy}>Скопировать сравнение</button></div>
      {note && <p className="aeHint">{note}</p>}
    </div>
  )
}
