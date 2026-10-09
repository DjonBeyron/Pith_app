import { ctxSpec } from './voskGrammar.js'
import { latestRun, MODE_LABEL } from './voskSeries.js'
import { RunCard, SayRow } from './VoskCards.jsx'

// A. Контекст: те же 4 шага, что в «Тесте 1» («trying» → … → «I'm trying to please both»), в двух режимах — «с ошибкой» (try …) и «правильно» (контроль)
export default function VoskCtxPanel({ rec, can }) {
  const { state, patch, run, stop, live } = rec
  const specs = [0, 1, 2, 3].map(i => ctxSpec(i, state.mode, state.style))
  return (<>
    <div className="aspRow" role="group" aria-label="Режим">
      {['error', 'control'].map(m => (
        <button key={m} className={`aspChip${m === state.mode ? ' aspChipOn' : ''}`} disabled={!!live} aria-pressed={m === state.mode} data-testid={`vk-mode-${m}`} onClick={() => patch({ mode: m })}>{MODE_LABEL[m]}</button>
      ))}
    </div>
    {specs.map((sp, i) => (
      <RunCard key={i} id={`ctx-${i + 1}`} spec={sp} run={latestRun(state.runs, { kind: 'ctx', step: i, mode: state.mode, style: state.style })}
        on={state.step === i} busy={!!live} onPick={() => patch({ step: i })} />
    ))}
    <SayRow label={`Сказать (шаг ${state.step + 1})`} can={can} live={live} onSay={() => run(specs[state.step])} onStop={stop} />
  </>)
}
