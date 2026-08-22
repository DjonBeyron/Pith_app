import PlayerMessage from './PlayerMessage.jsx'
import NodeEditPencil from './admin/NodeEditPencil.jsx'

// Сообщения ленты: видимые ноды + pending-нода, которая пре-рендерится за
// экраном с тем же key (React сохраняет DOM и уже декодированный кадр видео,
// когда нода становится активной). Вынесено из LessonPlayer.jsx — он упирался
// в потолок размера файла.
export default function PlayerFeedNodes({
  visibleNodes, pendingNode, nodes, filesWithBlobs, teacherName,
  states, xpMap, pendingPhotoXp, bottomOffset, videoAutoSound, isAdmin,
  onNodeDone, onTrReveal, onPhotoXpFired,
  // Режим правки из канваса (usePlayerAdminEdit) — в обычном плеере null
  adminEdit = null,
}) {
  const feedNodes = [
    ...visibleNodes,
    ...(pendingNode && !visibleNodes.some(v => v.id === pendingNode.id) ? [pendingNode] : []),
  ]

  return feedNodes.map(node => {
    const isPending = pendingNode?.id === node.id && !visibleNodes.some(v => v.id === node.id)
    const fileId = node.typeData?.[node.type]?.file_id ?? null
    const file   = filesWithBlobs.find(f => f.id === fileId) ?? null
    return (
      <div
        key={node.id}
        className={adminEdit?.enabled
          ? `playerMsgSlot${adminEdit.editId === node.id ? ' playerMsgSlotActive' : ''}`
          : undefined}
        data-pending={isPending ? 'true' : undefined}
        style={isPending ? {
          position: 'fixed', bottom: '-100vh', left: 0, width: '100%',
          pointerEvents: 'none', visibility: 'hidden',
        } : undefined}
      >
        {adminEdit?.enabled && !isPending && (
          <NodeEditPencil
            onClick={() => adminEdit.open(node.id)}
            active={adminEdit.editId === node.id}
          />
        )}
        <PlayerMessage
          node={node}
          file={file}
          lessonFiles={filesWithBlobs}
          lessonNodes={nodes}
          teacherName={teacherName}
          photoChoiceState={states.photoChoiceStates[node.id] ?? null}
          wordChoiceState={states.wordChoiceStates[node.id] ?? null}
          allWordChoiceStates={states.wordChoiceStates}
          allPhotoChoiceStates={states.photoChoiceStates}
          allPhraseStates={states.phraseStates}
          phraseState={states.phraseStates[node.id] ?? null}
          regState={states.regStates[node.id] ?? null}
          tableSent={!!states.tableSent[node.id]}
          bottomOffset={bottomOffset}
          videoAutoSound={videoAutoSound}
          adminPreview={isAdmin}
          pending={isPending}
          onDone={isPending ? () => {} : () => onNodeDone(node.id)}
          onTrReveal={() => onTrReveal(node.id)}
          rewardXp={xpMap.get(node.id) ?? 0}
          photoXpPending={pendingPhotoXp[node.id] ?? 0}
          /* коллбэк дергается по событию XP-анимации, не в рендере */
          onPhotoXpFired={(rect) => onPhotoXpFired(node.id, rect)}
        />
      </div>
    )
  })
}
