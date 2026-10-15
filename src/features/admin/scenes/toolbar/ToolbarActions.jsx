import { Fragment } from 'react'
import { splitByWidth, groupActions } from './toolbarModel.js'
import ToolbarOverflowMenu from './ToolbarOverflowMenu.jsx'

// Группа действий тулбара: кнопки по группам (voice | scene | view) с разделителями; на узком
// окне — только pinned-действия, остальные в меню «⋯». Кнопки рисуются из списка
// toolbarModel.buildToolbarActions, сюда ничего дописывать не надо. extra — хвост (кнопка «?»).
function ActionButton({ a, narrow }) {
  const text = narrow && a.shortLabel ? a.shortLabel : a.label
  const Icon = a.Icon
  if (a.iconOnly) {
    return (
      <button type="button" className="scbTbIcon" data-action={a.id} onClick={a.run} disabled={a.disabled} aria-label={a.label} title={a.hint || a.label}>
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
          <div className="scbTbGroup" role="group" aria-label={g.label}>
            {g.items.map(a => <ActionButton key={a.id} a={a} narrow={narrow} />)}
          </div>
        </Fragment>
      ))}
      <ToolbarOverflowMenu items={menu} initialOpen={menuOpen} />
      {extra}
    </div>
  )
}
