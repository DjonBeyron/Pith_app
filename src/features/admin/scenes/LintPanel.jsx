// Живой список замечаний линтера (sceneLint): ошибки — красным, предупреждения — жёлтым.
// Клик по замечанию → onPick(text) → разворачиваются панели на пути и подсвечивается поле.
// Заголовок со счётчиками и «?» — у панели «Замечания линтера» (PhonePreview).
export default function LintPanel({ lint, onPick }) {
  return (
    <div className="scbLint" aria-live="polite">
      {lint.length === 0 && <p className="scbLintOk">Сцена чистая: ошибок и предупреждений нет.</p>}
      {lint.length > 0 && (
        <ul className="scbLintList">
          {lint.map((x, i) => (
            <li key={i}>
              <button type="button" className={`scbLintItem scbLint-${x.level}`} onClick={() => onPick(x.text)} title="Показать поле (свёрнутые блоки развернутся)">
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
