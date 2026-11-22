import { useState } from 'react'
import { dur } from './timelineFormat.js'
import { SORTS, sortPauses, pauseTotals, pauseGroups } from './timelinePauseList.js'
import TimelinePauseCard from './TimelinePauseCard.jsx'

// Вкладка «Паузы» — главное для владельца: ВСЕ паузы «игра молчит» длиннее порога карточками с реальным текстом реплик перед тишиной и после (TimelinePauseCard). Сверху итог
// («долгих пауз N, всего X с из Y с игры»), сортировка (самые долгие сверху / по времени) и чипы этапов с суммой молчания — фильтр по этапу. Карточек может быть десятки: порциями (PAGE).
// pauses — куски пауз (buildPauses), total — длина игры (мс), onGo(p) — «показать на ленте», block — комментарий к паузе в GitHub (TimelineBlockComment).
export const PAGE = 40

export default function TimelinePausesTab({ pauses, total, onGo, block = null }) {
  const [sort, setSort] = useState('long')
  const [act, setAct] = useState(null) // null — все этапы
  const [shown, setShown] = useState(PAGE)
  const tot = pauseTotals(pauses), groups = pauseGroups(pauses)
  const list = sortPauses(pauses, sort, groups.some(g => g.act === act) ? act : null)
  return (
    <section className="tlPTab" data-testid="tl-pauses">
      <p className="tlPSum" data-testid="tl-pauses-sum">Долгих пауз <b>{tot.n}</b>, всего <b>{dur(tot.ms)}</b> из {dur(total)} игры <span className="tlMuted">— игра молчит и игрока не ждёт</span></p>
      {tot.n > 0 && (
        <div className="tlBar">
          <div className="tlGroup" role="radiogroup" aria-label="Порядок пауз">
            {SORTS.map(([k, t]) => <button key={k} type="button" role="radio" aria-checked={sort === k} className="tlChip" onClick={() => setSort(k)} data-testid={`tl-sort-${k}`}>{t}</button>)}
          </div>
          <div className="tlGroup" role="radiogroup" aria-label="Этап">
            <button type="button" role="radio" aria-checked={act == null} className="tlChip" onClick={() => { setAct(null); setShown(PAGE) }}>все этапы</button>
            {groups.map(g => <button key={g.act} type="button" role="radio" aria-checked={act === g.act} className="tlChip" onClick={() => { setAct(g.act); setShown(PAGE) }} data-testid="tl-act-chip">{g.title} · {dur(g.ms)}{g.n > 1 ? ` (${g.n})` : ''}</button>)}
          </div>
        </div>
      )}
      {!tot.n && <p className="tlMuted" data-testid="tl-pauses-none">Долгих пауз нет: никто не молчал дольше порога, когда игрока не ждали. Попробуй порог поменьше.</p>}
      <div className="tlPList">{list.slice(0, shown).map(p => <TimelinePauseCard key={p.t} p={p} onGo={onGo} block={block} />)}</div>
      {list.length > shown && <button type="button" className="tlBtn tlMore" onClick={() => setShown(n => n + PAGE)}>Показать ещё ({list.length - shown})</button>}
    </section>
  )
}
