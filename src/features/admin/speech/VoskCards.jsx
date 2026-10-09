import { verdictOf, wordLine } from './voskClassify.js'
import { timeLine } from './voskTiming.js'
import { condLabel } from './voskSeries.js'
import { STYLE_LABEL } from './voskGrammar.js'

const TONE = { ok: 'apV-ok', warn: 'apV-fixed', bad: 'apV-deaf', none: '' }

// Карточка одного прогона Vosk: что нужно сказать, «Услышали» крупно, вывод простыми словами, слова с уверенностью и временем, тайминги.
// run = null — ещё не говорили. onPick — кнопка-метка выбирает шаг (у ловушек её нет).
export function RunCard({ id, spec, run, on, busy, onPick }) {
  const v = verdictOf(run)
  return (
    <div className={`apStepCard${on ? ' apStepOn' : ''}`} data-testid={`vk-card-${id}`}>
      <div className="apStepHead">
        {onPick
          ? <button className={`aspChip${on ? ' aspChipOn' : ''}`} disabled={busy} onClick={onPick}>{spec.tag}</button>
          : <span className="aspChip aspChipOn">{spec.tag}</span>}
        <span className="apStepTitle">— {spec.kind === 'silence' ? 'молчать 3 с (или пошуметь)' : `нужно сказать: «${spec.said}»`}</span>
      </div>
      <div className={`apHeard${run ? '' : ' apHeardNone'}`}>{run ? `Услышали: «${run.heard || '—'}»` : 'ещё не говорили'}</div>
      {v.text && <div className={`apVerdict ${TONE[v.tone]}`}>{v.text}</div>}
      {run && (run.ws.length
        ? <ul className="vkWords" aria-label="Слова: уверенность и время">{run.ws.map((w, i) => <li key={i}>{wordLine(w)}</li>)}</ul>
        : <div className="aspHint">слов с уверенностью движок не дал</div>)}
      {run && <div className="aspHint">{timeLine(run.tm, run.ws)}</div>}
      {run && <div className="aspHint">условие: {condLabel(run.cond)} · словарь: {STYLE_LABEL[run.style]}{run.ses ? ` · аудиосессия ${run.ses}` : ''}</div>}
    </div>
  )
}

// «Сказать» / «Стоп» + пометка записи; can — движок загружен и свободен; live — идёт запись
export function SayRow({ label, can, live, onSay, onStop, children }) {
  return (
    <div className="aspRow">
      <button className="aspSay apSmall" disabled={!can || !!live} onClick={onSay}>{label}</button>
      {children}
      <button className="aspStop" disabled={!live} onClick={onStop}>Стоп</button>
      {live && <span className="aspRec"><i className="aspDot" />идёт запись…</span>}
    </div>
  )
}

// Живая строка: во время записи «Слышу: «…»» (текущий partial) или «Слушаю… говорите»
export function LivePartial({ live }) {
  if (!live) return null
  return <div className={`apLive ${live.partial ? 'apLive-live' : 'apLive-wait'}`} data-testid="vk-live" aria-live="polite">{live.partial ? `Слышу: «${live.partial}»` : 'Слушаю… говорите'}</div>
}
