// Две кнопки над текстом ноды: смайлики и свои переносы. Раскраска слов
// теперь инлайн, прямо в текстовом поле (RichTextField, выделил слово —
// всплыл тулбар) — отдельная кнопка-кисть и окно для неё больше не нужны.
// Вынесены из NodeContentEditor.jsx — он у потолка размера файла.
//
// Смайлики доступны у любого типа со своим текстом (даже пока он пустой —
// сообщение можно начать со смайлика), а переносы — только когда текст уже
// написан: переносить нечего.
export default function NodeTextTools({ hasText, textWritten, wrapActive, onEmoji, onWrap }) {
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
