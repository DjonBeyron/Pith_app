// Раздел «Настройки» блока «Шлифовка репетиции»: свёрнут по умолчанию, в свёрнутом виде — заголовок и одна строка сводки (settingsSummary.js: режим звука, озвучено N из M, фикстура).
// Внутри (children) — режим звука и прогон по режимам, озвучка реплик и кусков, фикстура плана, семя, строка «Фраза». open / onToggle ведёт usePolishOpen.
export default function PolishSettings({ open, onToggle, summary, children }) {
  return (
    <section className="rhpSettings" data-open={open ? '1' : undefined} data-testid="rh-polish-settings">
      <button type="button" className="rhpToggle rhpSetBar" aria-expanded={open} onClick={onToggle} data-testid="rh-polish-settings-toggle">
        <span className="rhpArrow" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <strong className="rhpName">Настройки</strong>
        <span className="rhpSum" data-testid="rh-polish-settings-summary">{summary}</span>
      </button>
      {open && <div className="rhpSetBody" data-testid="rh-polish-settings-body">{children}</div>}
    </section>
  )
}
