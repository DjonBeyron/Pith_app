// Жёсткие правила поверх весов (rankRules.js) внизу списка сигналов: каждая N-я
// позиция — из хвоста (exploreEvery, 0 — выкл) и не больше N одного типа слайда подряд
// (maxSameTypeInRow — типов у модулей пока нет, правило пропускается). Границы
// зажимает draftModel.setRule → normalizeConfig.
const RULES = [
  { key: 'exploreEvery', title: 'Подмешка из хвоста', hint: 'каждая N-я позиция — случайная фраза из хвоста; 0 — выключено (в legacy всегда 6)', max: 30 },
  { key: 'maxSameTypeInRow', title: 'Одного типа подряд', hint: 'не больше N слайдов одного типа подряд; 0 — выключено (типов у модулей пока нет)', max: 10 },
]

export default function RulesBlock({ rules, onRule }) {
  return (
    <section className="slGroup slRules" aria-labelledby="slGroup-rules">
      <h2 id="slGroup-rules" className="slGroupTitle">Жёсткие правила</h2>
      {RULES.map(r => (
        <label key={r.key} className="slRule">
          <span className="slRuleText">
            <span className="slRowTitle">{r.title}</span>
            <span className="slRuleHint">{r.hint}</span>
          </span>
          <input type="number" min={0} max={r.max} step={1} value={rules[r.key]} onChange={e => onRule(r.key, e.target.value)} className="slNum" aria-label={r.title} />
        </label>
      ))}
    </section>
  )
}
