// Раздел «Настройки» блока «Шлифовка репетиции» и блока «Гонка с Питом (стенд)»: свёрнут по умолчанию, в свёрнутом виде — заголовок и одна строка сводки (settingsSummary.js: режим звука, озвучено N из M, фикстура).
// Внутри (children) — режим звука и прогон по режимам, озвучка реплик и кусков, фикстура плана, семя, строка «Фраза». open / onToggle ведёт usePolishOpen; testid — префикс data-testid (у гонки свой, чтобы не совпадал с шлифовкой); title — заголовок (у «Озвучки Пита» и «Старого (old)» свой).
export default function PolishSettings({ open, onToggle, summary, children, testid = 'rh-polish-settings', title = 'Настройки' }) {
  return (
    <section className="rhpSettings" data-open={open ? '1' : undefined} data-testid={testid}>
      <button type="button" className="rhpToggle rhpSetBar" aria-expanded={open} onClick={onToggle} data-testid={`${testid}-toggle`}>
        <span className="rhpArrow" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <strong className="rhpName">{title}</strong>
        <span className="rhpSum" data-testid={`${testid}-summary`}>{summary}</span>
      </button>
      {open && <div className="rhpSetBody" data-testid={`${testid}-body`}>{children}</div>}
    </section>
  )
}
