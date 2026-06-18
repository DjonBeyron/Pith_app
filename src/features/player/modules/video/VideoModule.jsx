import PlayerBubble from '../../PlayerBubble.jsx'

export default function VideoModule({ node, file }) {
  const src = file?.r2Url ?? null
  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--video">
        {src
          ? <video src={src} className="playerVideo" controls playsInline />
          : <div className="playerMediaPlaceholder">Видео не загружено</div>
        }
      </PlayerBubble>
    </div>
  )
}
