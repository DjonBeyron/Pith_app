import { useState } from 'react'
import { jsonSeed, withSeed } from '../../rehearsal/rehearsalTestForm.js'
import { newSeed, cleanSeed } from '../../rehearsal/rehearsalSeed.js'

// Поле «Семя» блока «Шлифовка репетиции» (CONCEPT_REHEARSAL.md §8): семя случайностей внутри актов — по нему выбираются порядок слов разминки, «чётко / обычно», подсказки, раскладка «Различи» и варианты реплик Пита.
// Пусто — семя от сегодняшней даты и фразы (одна сессия за день одинакова, завтра другая); своё семя пишется в JSON плана (поле seed — общая форма с «Тестом игры»), «Новое» ставит свежее — посмотреть другой вариант.
export default function PolishSeed({ json, plan, disabled, onJson }) {
  const saved = jsonSeed(json)
  const [text, setText] = useState(saved ?? '')
  const [seen, setSeen] = useState(saved)
  if (seen !== saved) { setSeen(saved); if (cleanSeed(text) !== saved) setText(saved ?? '') } // фикстуру или JSON сменили в другом месте — поле показывает их семя (набранный пробел в конце не стираем)
  const set = value => { setText(value); onJson(withSeed(json, value)) }
  return (
    <div data-testid="rh-polish-seed-block">
      <div className="aspRow">
        <label className="aspLabel">Семя (пусто — от даты и фразы)
          <input className="aspInput" value={text} placeholder="по дате" disabled={disabled || !plan} spellCheck={false} onChange={e => set(e.target.value)} data-testid="rh-polish-seed" />
        </label>
        <button type="button" className="aspChip" disabled={disabled || !plan} onClick={() => set(newSeed())} data-testid="rh-polish-seed-new">Новое</button>
      </div>
      {plan && <p className="aspHint" data-testid="rh-polish-seed-now">Семя этой сессии: {plan.seed}</p>}
    </div>
  )
}
