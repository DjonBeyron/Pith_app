import { GROUPS } from '../../../shared/lib/ranking/signalRegistry.js'
import { weightShares } from './draftModel.js'
import { GROUP_COLORS } from './signalTexts.js'
import SignalRow from './SignalRow.jsx'
import RulesBlock from './RulesBlock.jsx'

// Левая колонка окна «Сигналы ленты»: все сигналы по группам реестра (GROUPS),
// у каждого — статус, тумблер, ползунок веса и доля в сумме. Не-live показаны, но
// заблокированы (uiLocked). Внизу — жёсткие правила (RulesBlock).
export default function SignalList({ metas, draft, selectedId, onSelect, actions }) {
  const { shares, total } = weightShares(draft)
  const groups = Object.keys(GROUPS).map(g => ({ id: g, title: GROUPS[g], items: metas.filter(m => m.group === g) })).filter(g => g.items.length)
  const liveOn = metas.filter(m => !m.uiLocked && draft.signals[m.id]?.enabled).length

  return (
    <div className="slWrap">
      <p className="slSummary">
        Включено живых сигналов: <b>{liveOn}</b> · сумма весов: <b>{total}</b>. Вес — сила сигнала в сумме; доля показывает, сколько
        он решает относительно остальных. Клавиши ↑↓ на ползунке — шаг 1.
      </p>
      {groups.map(g => (
        <section key={g.id} className="slGroup" aria-labelledby={`slGroup-${g.id}`}>
          <h2 id={`slGroup-${g.id}`} className="slGroupTitle">
            <span className="slGroupDot" style={{ background: GROUP_COLORS[g.id] }} aria-hidden="true" />
            {g.title}
          </h2>
          {g.items.map(m => (
            <SignalRow
              key={m.id} meta={m} state={draft.signals[m.id]} share={shares[m.id] ?? 0} selected={m.id === selectedId}
              onSelect={() => onSelect(m.id)} onWeight={w => actions.weight(m.id, w)} onEnable={on => actions.enable(m.id, on)}
            />
          ))}
        </section>
      ))}
      <RulesBlock rules={draft.rules} onRule={actions.rule} />
    </div>
  )
}
