import { ColumnCtx } from './panelContext.js'

// Обёртка колонки окна сборщика: сообщает вложенным панелям имя колонки (ColumnCtx) —
// для кнопки «Свернуть все» по колонке (CollapseAllButton)
export default function PanelColumn({ name, children }) {
  return <ColumnCtx.Provider value={name}>{children}</ColumnCtx.Provider>
}
