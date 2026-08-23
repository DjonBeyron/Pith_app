// Три кнопки над текстом ноды: смайлики, раскраска слов и свои переносы.
// Вынесены из NodeContentEditor.jsx — он у потолка размера файла.
//
// Смайлики доступны у любого типа со своим текстом (даже пока он пустой —
// сообщение можно начать со смайлика), а кисть и переносы — только когда
// текст уже написан: красить и переносить нечего.
export default function NodeTextTools({ hasText, textWritten, hasHighlights, wrapActive, onEmoji, onPaint, onWrap }) {
  if (!hasText) return null
  const lit = { borderColor: '#b6fe3b', color: '#b6fe3b' }

  return (
    <>
      <button
        className="nodeHLOpenBtn"
        title="Смайлики"
        onClick={onEmoji}
        onMouseDown={e => e.stopPropagation()}
      >😊</button>

      {textWritten && (
        <button
          className="nodeHLOpenBtn"
          title="Раскрасить слова"
          style={hasHighlights ? lit : undefined}
          onClick={onPaint}
          onMouseDown={e => e.stopPropagation()}
        >🎨</button>
      )}

      {textWritten && (
        <button
          className="nodeHLOpenBtn"
          title="Свои переносы строк"
          /* зелёная обводка — как у палитры: в ноде есть свои переносы либо
             включён режим «пузырь по моим строкам» */
          style={wrapActive ? lit : undefined}
          onClick={onWrap}
          onMouseDown={e => e.stopPropagation()}
        >↵</button>
      )}
    </>
  )
}
