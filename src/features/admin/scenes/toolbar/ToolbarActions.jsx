import { Fragment } from 'react'
import { splitByWidth, groupActions, menuItems } from './toolbarModel.js'
import ToolbarOverflowMenu from './ToolbarOverflowMenu.jsx'
import { ToolbarSegment, ToolbarToggle } from './ToolbarModeControls.jsx'

// Группа действий тулбара: кнопки по группам (modes | voice | scene | view) с разделителями; на узком
// окне — только pinned-действия, остальные в меню «⋯» (сегменты/тумблеры раскладываются в пункты —
// toolbarModel.menuItems). Кнопки рисуются из списка toolbarModel.buildToolbarActions, сюда ничего
// дописывать не надо: kind segment/toggle — ToolbarModeControls, kind menu — кнопка с выпадашкой
// (тот же ToolbarOverflowMenu с текстом). extra — хвост (кнопка «?»).
function ActionButton({ a, narrow }) {
  const text = narrow && a.shortLabel ? a.shortLabel : a.label
  const Icon = a.Icon
  if (a.kind === 'segment') return <ToolbarSegment a={a} />
  if (a.kind === 'toggle') return <ToolbarToggle a={a} narrow={narrow} />
  if (a.kind === 'menu') {
    return <ToolbarOverflowMenu items={a.items} text={text} Icon={Icon} label={a.label} hint={a.hint} menuLabel={a.label} disabled={a.disabled} mainRun={a.run} actionId={a.id} />
  }
  if (a.iconOnly) {
    return (
      <button type="button" className={`scbTbIcon${a.id === 'makeDefault' && !a.disabled ? ' scbTbIconAccent' : ''}`} data-action={a.id} onClick={a.run} disabled={a.disabled} aria-label={a.label} title={a.hint || a.label}>
        <Icon size={16} aria-hidden="true" />
      </button>
    )
  }
  return (
    <button type="button" className={a.primary ? 'fsBtn fsBtnPrimary' : 'fsBtn'} data-action={a.id} onClick={a.run} disabled={a.disabled} title={a.hint || a.label}>
      {Icon && <Icon size={13} aria-hidden="true" />}{text}
    </button>
  )
}

export default function ToolbarActions({ actions, narrow = false, extra = null, menuOpen = false }) {
  const { bar, menu } = splitByWidth(actions, narrow)
  return (
    <div className="scbTbActions">
      {groupActions(bar).map((g, i) => (
        <Fragment key={g.id}>
          {i > 0 && <span className="scbTbSep" role="separator" aria-orientation="vertical" />}
          <div className="scbTbGroup" role="group" aria-label={g.label} title={g.hint} data-group={g.id}>
            {g.items.map(a => <ActionButton key={a.id} a={a} narrow={narrow} />)}
          </div>
        </Fragment>
      ))}
      <ToolbarOverflowMenu items={menuItems(menu)} initialOpen={menuOpen} />
      {extra}
    </div>
  )
}
