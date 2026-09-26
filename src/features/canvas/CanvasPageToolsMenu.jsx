import CanvasToolsMenu from './CanvasToolsMenu.jsx'

// Меню редких действий холста («⋯» в шапке) с его пунктами. Вынесено из
// CanvasPage.jsx (тот упирался в потолок 400 строк); сами действия живут в
// CanvasBoard (boardApiRef) и CanvasPage (onResetToServer)
export default function CanvasPageToolsMenu({
  pos, onClose, filter, boardApiRef, debugLinks, setDebugLinks, onResetToServer,
}) {
  return (
    <CanvasToolsMenu
      pos={pos}
      onClose={onClose}
      items={[
        ...(filter.activeCount
          ? [{ label: `Сбросить фильтры (${filter.activeCount})`,
               title: 'Показать все ноды',
               onClick: filter.reset }]
          : []),
        { label: 'В начало', title: 'Прокрутить холст к первой ноде',
          onClick: () => boardApiRef.current?.focusStart() },
        { label: 'Раздвинуть', title: 'Развести ноды, если они наехали друг на друга',
          onClick: () => boardApiRef.current?.spreadNodes() },
        { label: 'Сжать раскладку', title: 'Собрать длинную ленту нод в несколько рядов — по сценарию, слева направо',
          onClick: () => boardApiRef.current?.compactLayout() },
        { label: debugLinks ? '✓ Отладка связей' : 'Отладка связей',
          title: 'Показать связи прямыми линиями поверх графа и сводку по ним',
          onClick: () => setDebugLinks(v => !v) },
        { label: '↻ Вернуть данные с сервера', title: 'Отменить несохранённые локальные правки',
          onClick: onResetToServer },
        { label: 'Очистить все ноды', danger: true, title: 'Удалить все ноды урока',
          onClick: () => boardApiRef.current?.clearAll() },
      ]}
    />
  )
}
