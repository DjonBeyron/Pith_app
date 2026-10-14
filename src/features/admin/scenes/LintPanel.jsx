import ScTip from './ScTip.jsx'

// Живой список замечаний линтера (sceneLint) под телефонной рамкой: ошибки — красным,
// предупреждения — жёлтым. Клик по замечанию → onPick(text) → подсветка поля в настройках.
export default function LintPanel({ lint, onPick }) {
  const errors = lint.filter(x => x.level === 'error')
  const warns = lint.filter(x => x.level === 'warn')
  return (
    <div className="scbLint" aria-live="polite">
      <div className="scbLintHead">
        <span>Замечания линтера <ScTip help="lint" /></span>
        <span className="scbLintCount">
          <b className={errors.length ? 'scBad' : 'scOk'}>{errors.length} ошибок</b> · {warns.length} предупреждений
        </span>
      </div>
      {lint.length === 0 && <p className="scbLintOk">Сцена чистая: ошибок и предупреждений нет.</p>}
      {lint.length > 0 && (
        <ul className="scbLintList">
          {lint.map((x, i) => (
            <li key={i}>
              <button type="button" className={`scbLintItem scbLint-${x.level}`} onClick={() => onPick(x.text)} title="Показать поле">
                <span className="scbLintLvl">{x.level === 'error' ? 'Ошибка' : 'Внимание'}</span>
                <span className="scbLintText">{x.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
