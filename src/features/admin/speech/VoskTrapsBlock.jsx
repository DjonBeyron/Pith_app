import { useState } from 'react'
import { TRAP_PRESETS, TRAP_GRAMMAR, trapSpec, silenceSpec, trapCount, cleanTrapWord } from './voskTraps.js'
import { latestRun } from './voskSeries.js'
import { RunCard, SayRow } from './VoskCards.jsx'

// B. Ловушки: говорим слова, которых нет в словаре, или молчим. Правильно — «[unk]» или пусто; «try»/«trying» на чужом слове — ложное принятие
export default function VoskTrapsBlock({ rec, can }) {
  const { state, patch, run, stop, live } = rec
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const words = [...TRAP_PRESETS, ...state.trapWords]
  const count = trapCount(state.runs)
  const cur = words.includes(state.trap) ? state.trap : words[0]
  const done = words.filter(w => latestRun(state.runs, { kind: 'trap', step: w }))
  function add() {
    const w = cleanTrapWord(draft)
    if (!w) { setNote('Нужно английское слово из букв (2–20), которого нет в словаре try / trying'); return }
    setNote(''); setDraft('')
    if (!words.includes(w)) patch({ trapWords: [...state.trapWords, w].slice(-8), trap: w }); else patch({ trap: w })
  }
  return (<>
    <p className="aspHint">Словарь: <code>{TRAP_GRAMMAR}</code>. Скажите слово, которого в нём нет, — движок должен ответить «[unk]» или ничего. Если он выдал «try»/«trying» — это ложное принятие.</p>
    <div className="vkCount" data-testid="vk-trap-count">ложных принятий {count.bad} из {count.n}</div>
    <div className="aspChips" role="group" aria-label="Слово-ловушка">
      {words.map(w => <button key={w} className={`aspChip${w === cur ? ' aspChipOn' : ''}`} disabled={!!live} aria-pressed={w === cur} onClick={() => patch({ trap: w })}>{w}</button>)}
    </div>
    <div className="aspRow">
      <input className="aspInput apWord" value={draft} onChange={e => setDraft(e.target.value)} placeholder="своё слово" aria-label="Своё слово-ловушка" disabled={!!live} spellCheck={false} autoCapitalize="off" />
      <button className="aeRefresh" disabled={!!live || !draft.trim()} onClick={add}>Добавить</button>
    </div>
    {note && <p className="aeHint">{note}</p>}
    <SayRow label={`Сказать «${cur}»`} can={can} live={live} onSay={() => run(trapSpec(cur))} onStop={stop}>
      <button className="aeRefresh" disabled={!can || !!live} onClick={() => run(silenceSpec())} data-testid="vk-silence">Тишина 3 с</button>
    </SayRow>
    {done.map(w => <RunCard key={w} id={`trap-${w}`} spec={trapSpec(w)} run={latestRun(state.runs, { kind: 'trap', step: w })} on={w === cur} busy />)}
    {count.silence > 0 && <RunCard id="silence" spec={silenceSpec()} run={latestRun(state.runs, { kind: 'silence' })} busy />}
  </>)
}
