import PlayerMessage from './PlayerMessage.jsx'

// Сработавшие сигналы ошибок (см. useSignalMessages.js, PROJECT.md «Сигналы
// ошибок») — рисуются ПОСЛЕ обычной ленты (PlayerFeedNodes), тем же
// PlayerMessage/resolveModule, что и весь остальной чат: ни одного
// самодельного рендера по типу тут нет, работает любой тип ноды урока.
//
// Отличие от PlayerFeedNodes: onDone НЕ уходит в onNodeDone графа урока (эти
// ноды не часть visibleNodes) — он снимает freeze у панели, которая сигнал
// запустила (см. useSignalMessages.js/onMessageDone).
export default function PlayerSignalMessages({
  items, nodes, filesWithBlobs, teacherName,
  bottomOffset, videoAutoSound, isAdmin,
  onTrReveal, onOpenLessonRef, onMessageDone,
}) {
  return items.map(({ key, node }) => {
    const fileId = node.typeData?.[node.type]?.file_id ?? null
    const file   = filesWithBlobs.find(f => f.id === fileId) ?? null
    return (
      <div key={key}>
        <PlayerMessage
          node={node}
          file={file}
          lessonFiles={filesWithBlobs}
          lessonNodes={nodes}
          teacherName={teacherName}
          bottomOffset={bottomOffset}
          videoAutoSound={videoAutoSound}
          adminPreview={isAdmin}
          onDone={() => onMessageDone(key)}
          onTrReveal={() => onTrReveal?.(node.id)}
          onOpenLessonRef={onOpenLessonRef}
        />
      </div>
    )
  })
}
