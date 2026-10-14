import HelpTip from './HelpTip.jsx'

// Жёсткие правила поверх весов (rankRules.js) внизу списка сигналов: каждая N-я
// позиция — из хвоста (exploreEvery, 0 — выкл) и не больше N одного типа слайда подряд
// (maxSameTypeInRow — типов у модулей пока нет, правило пропускается). Границы
// зажимает draftModel.setRule → normalizeConfig. «?» — соседом подписи, не внутри неё.
const RULES = [
  { key: 'exploreEvery', title: 'Подмешка из хвоста', help: 'rule_explore', hint: 'каждая N-я позиция — случайная фраза из хвоста; 0 — выключено (в legacy всегда 6)', max: 30 },
  { key: 'maxSameTypeInRow', title: 'Одного типа подряд', help: 'rule_same_type', hint: 'не больше N слайдов одного типа подряд; 0 — выключено (типов у модулей пока нет)', max: 10 },
]

export default function RulesBlock({ rules, onRule }) {
  return (
    <section className="slGroup slRules" aria-labelledby="slGroup-rules">
      <h2 id="slGroup-rules" className="slGroupTitle">Жёсткие правила</h2>
      {RULES.map(r => (
        <div key={r.key} className="slRule">
          <label className="slRuleText" htmlFor={`slRule-${r.key}`}>
            <span className="slRowTitle">{r.title}</span>
            <span className="slRuleHint">{r.hint}</span>
          </label>
          <HelpTip help={r.help} />
          <input id={`slRule-${r.key}`} type="number" min={0} max={r.max} step={1} value={rules[r.key]} onChange={e => onRule(r.key, e.target.value)} className="slNum" aria-label={r.title} />
        </div>
      ))}
    </section>
  )
}
