// Контролы режимов предпросмотра в тулбаре (toolbarModel kind: segment | toggle): компактный
// сегмент режима показа и кнопки-тумблеры озвучки оригинала/перевода. Это ПРЕДПРОСМОТРОВЫЕ
// переопределения — сцену не меняют; отличие от записанного в сцене видно по data-override
// (пунктирная акцентная рамка и точка) и подсказке «предпросмотр ≠ сцена»; «Сделать по умолчанию»
// (обычная кнопка той же группы) записывает их в options.

export function ToolbarSegment({ a }) {
  return (
    <div className={`scbTbSeg${a.overridden ? ' scbTbOverride' : ''}`} role="radiogroup" aria-label={a.label} data-action={a.id} data-override={a.overridden ? '1' : undefined} title={a.overridden ? `${a.hint} — предпросмотр ≠ сцена` : a.hint}>
      {a.options.map(o => (
        <button
          key={o.id} type="button" role="radio" aria-checked={a.value === o.id} className={a.value === o.id ? 'scbTbSegBtn scbTbSegBtnOn' : 'scbTbSegBtn'}
          onClick={() => a.pick(o.id)} disabled={a.disabled} data-value={o.id}
        >{o.label}</button>
      ))}
      {a.overridden && <span className="scbTbOverrideDot" aria-hidden="true" />}
    </div>
  )
}

export function ToolbarToggle({ a, narrow = false }) {
  const Icon = a.Icon
  const text = (narrow || a.compact) && a.shortLabel ? a.shortLabel : a.label
  return (
    <button
      type="button" className={`fsBtn scbTbToggle${a.pressed ? ' scbTbToggleOn' : ''}${a.overridden ? ' scbTbOverride' : ''}`} data-action={a.id} data-override={a.overridden ? '1' : undefined}
      onClick={a.run} disabled={a.disabled} aria-pressed={!!a.pressed} aria-label={a.label} title={a.overridden ? `${a.hint} — предпросмотр ≠ сцена` : a.hint}
    >
      {Icon && <Icon size={13} aria-hidden="true" />}{text}
      {a.overridden && <span className="scbTbOverrideDot" aria-hidden="true" />}
    </button>
  )
}
