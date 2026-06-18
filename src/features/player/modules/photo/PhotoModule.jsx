import PlayerBubble from '../../PlayerBubble.jsx'

export default function PhotoModule({ node, file }) {
  const src = file?.r2Url ?? null
  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--photo">
        {src
          ? <img src={src} className="playerPhoto" alt="" />
          : <div className="playerMediaPlaceholder">Фото не загружено</div>
        }
      </PlayerBubble>
    </div>
  )
}
