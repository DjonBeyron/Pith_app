// Индикатор бюджета узлов SVG: полоса X / 250 с раскладкой фон / коты / предметы
// (sceneNodeBreakdown). Перебор — полоса красная, подпись «перебор на N». Заголовок и «?» —
// у панели «Бюджет узлов» (PhonePreview), здесь только содержимое.
export default function BudgetBar({ budget }) {
  const { background, characters, props, total, limit } = budget
  const pct = v => `${Math.min(100, (v / limit) * 100)}%`
  const over = total > limit
  return (
    <div className={`scbBudget${over ? ' scbBudgetOver' : ''}`}>
      <div className="scbBudgetHead">
        <span>Фон + коты + предметы</span>
        <b aria-live="polite">{total} / {limit}{over && ` — перебор на ${total - limit}`}</b>
      </div>
      <div className="scbBar" role="img" aria-label={`Фон ${background}, коты ${characters}, предметы ${props}, всего ${total} из ${limit}`}>
        <span className="scbBarBg" style={{ width: pct(background) }} />
        <span className="scbBarCats" style={{ width: pct(characters) }} />
        <span className="scbBarProps" style={{ width: pct(props) }} />
      </div>
      <p className="scbBudgetLegend">
        <i className="scbDot scbDotBg" /> фон {background} · <i className="scbDot scbDotCats" /> коты {characters} · <i className="scbDot scbDotProps" /> предметы {props}
      </p>
    </div>
  )
}
