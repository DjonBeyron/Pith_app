import { PAIR_PRESETS, pairSpec, diffKeys } from './voskGrammar.js'
import { latestRun, pairOf, MODE_LABEL } from './voskSeries.js'
import { RunCard, SayRow } from './VoskCards.jsx'

// C. Пары форм других слов: go/goes, has/have, am/is/are, play/played, cat/cats. Выбираем пару и режим, правим фразы при желании
export default function VoskPairsBlock({ rec, can }) {
  const { state, patch, run, stop, live } = rec
  const pair = pairOf(state, state.pair)
  const keys = diffKeys(pair.ok, pair.bad)
  const valid = pair.ok.trim() && pair.bad.trim() && keys.okKey !== keys.badKey
  const spec = pairSpec(pair, state.mode, state.style)
  const edit = (field, v) => patch({ pairs: { ...state.pairs, [pair.id]: { ok: pair.ok, bad: pair.bad, [field]: v } } })
  return (<>
    <div className="aspChips" role="group" aria-label="Пара форм">
      {PAIR_PRESETS.map(p => (
        <button key={p.id} className={`aspChip${p.id === state.pair ? ' aspChipOn' : ''}`} disabled={!!live} aria-pressed={p.id === state.pair} onClick={() => patch({ pair: p.id })}>{p.label}</button>
      ))}
    </div>
    <div className="aspRow" role="group" aria-label="Режим пары">
      {['error', 'control'].map(m => (
        <button key={m} className={`aspChip${m === state.mode ? ' aspChipOn' : ''}`} disabled={!!live} aria-pressed={m === state.mode} onClick={() => patch({ mode: m })}>{MODE_LABEL[m].replace(' (try …)', '')}</button>
      ))}
    </div>
    <RunCard id="pair" spec={spec} run={latestRun(state.runs, { kind: 'pair', step: pair.id, mode: state.mode, style: state.style })} on busy={!!live} />
    <SayRow label={`Сказать: ${pair.label}`} can={can && valid} live={live} onSay={() => run(spec)} onStop={stop} />
    <details className="apMore">
      <summary>Изменить фразы пары</summary>
      <label className="aspLabel">Правильно<input className="aspInput" value={pair.ok} disabled={!!live} onChange={e => edit('ok', e.target.value)} spellCheck={false} autoCapitalize="off" /></label>
      <label className="aspLabel">С ошибкой<input className="aspInput" value={pair.bad} disabled={!!live} onChange={e => edit('bad', e.target.value)} spellCheck={false} autoCapitalize="off" /></label>
      <p className="aspHint">Ключевое слово: «{keys.okKey}» (верно) и «{keys.badKey}» (ошибка).{valid ? '' : ' Фразы должны различаться словом.'}</p>
      <button className="aeRefresh" disabled={!!live || !state.pairs[pair.id]} onClick={() => patch({ pairs: Object.fromEntries(Object.entries(state.pairs).filter(([k]) => k !== pair.id)) })}>Вернуть пресет</button>
    </details>
  </>)
}
