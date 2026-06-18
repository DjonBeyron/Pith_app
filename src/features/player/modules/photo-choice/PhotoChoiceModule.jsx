const PHOTO_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#8b5cf6','#14b8a6',
  '#f97316','#06b6d4','#84cc16','#a855f7',
]

export default function PhotoChoiceModule({ node, photoChoiceState }) {
  if (!photoChoiceState || photoChoiceState.selected == null) return null

  const photos  = node.typeData?.photo_choice?.photos ?? []
  const { selected, result } = photoChoiceState
  const photo = photos[selected] ?? null

  return (
    <div className="playerMsgRow pcAnswerRow">
      <div className={`pcAnswerPhoto ${result === 'correct' ? 'pcAnswerPhotoOk' : 'pcAnswerPhotoErr'}`}
        style={photo?.photoUrl ? {} : { background: PHOTO_COLORS[selected % PHOTO_COLORS.length] }}>
        {photo?.photoUrl
          ? <img src={photo.photoUrl} className="pcAnswerImg" alt="" />
          : <span className="pcAnswerIdx">{selected + 1}</span>
        }
      </div>
    </div>
  )
}
