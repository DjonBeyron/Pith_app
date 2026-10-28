// Список слов-ловушек с особым переходом (variant) — общая разметка для
// table (ручной режим) и phrase_assembly: один и тот же приём «чип + шестерня
// открывает свой триггер» повторялся в NodeTablePicker.jsx и
// NodePhraseAssemblyPicker.jsx почти дословно и раздувал оба файла к
// потолку в 400 строк (CLAUDE.md). wrapClass/chipClass/removeClass —
// у таблицы и «Собери фразу» разные классы обёртки/чипа исторически, чтобы
// не трогать существующий CSS обеих панелей.
import NodeSelect from './NodeSelect.jsx'

export default function NodeDistractorList({
  distractors, wrapClass = 'nodePaDistractors', chipClass, removeClass = 'nodePaDistractorDel',
  onRemove, variantOpenIds, onToggleVariant, variantThen, onSetVariantThen,
  otherNodes, rowRefs,
}) {
  if (!distractors.length) return null
  return (
    <div className={wrapClass}>
      {distractors.map(d => (
        <div key={d.id} className="nodePaDistractorRow" ref={el => rowRefs.current.set(d.id, el)}>
          <span className={chipClass}>
            {d.text}
            <button
              className={`nodeWcGearBtn nodePaVariantBtn${variantThen(d.id) ? ' nodeWcGearBtnOn' : ''}`}
              onClick={() => onToggleVariant(d.id)}
              title="Особый переход для этого слова (замещает верно/неверно)"
            >{variantOpenIds.has(d.id) ? '▾' : '▸'}</button>
            <button className={removeClass} onClick={() => onRemove(d.id)}>×</button>
          </span>
          {variantOpenIds.has(d.id) && (
            <div className="nodeWcTriggerRow nodeWcVariantRow">
              <span className="nodeWcTriggerLabel">↳ Особый переход →</span>
              <NodeSelect className="nodeWcTriggerSelect" value={variantThen(d.id)} onChange={e => onSetVariantThen(d.id, e.target.value)} emptyLabel="— как верно/неверно —" nodes={otherNodes} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
