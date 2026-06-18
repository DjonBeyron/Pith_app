import PlayerBubble from './PlayerBubble.jsx'
import PlayerAudioBubble from './PlayerAudioBubble.jsx'
import PlayerCircleBubble from './PlayerCircleBubble.jsx'

// Routes each canvas node to the correct bubble.
// Audio manages its own PlayerBubble (needs to toggle the bottom-fade class itself).
// All other types are wrapped in a shared PlayerBubble.
export default function PlayerMessage({ node, file }) {
  const src      = file?.r2Url ?? null
  const isCircle = node.type === 'circle'

  if (node.type === 'audio') {
    return (
      <div className="playerMsgRow">
        <PlayerAudioBubble
          src={src}
          text={node.typeData?.audio?.text ?? ''}
          highlights={node.typeData?.audio?.highlights ?? []}
        />
      </div>
    )
  }

  return (
    <div className={`playerMsgRow${isCircle ? ' playerMsgRowCircle' : ''}`}>
      <PlayerBubble className={`playerMsgBubble playerMsgBubble--${node.type}`}>
        {node.type === 'circle' && <PlayerCircleBubble src={src} />}
        {node.type === 'video' && (
          src
            ? <video src={src} className="playerVideo" controls playsInline />
            : <div className="playerMediaPlaceholder">Видео не загружено</div>
        )}
        {node.type === 'photo' && (
          src
            ? <img src={src} className="playerPhoto" alt="" />
            : <div className="playerMediaPlaceholder">Фото не загружено</div>
        )}
        {node.type === 'text' && (
          <p className="playerText">
            {node.typeData?.text?.content || <span className="playerTextEmpty">Пустой текст</span>}
          </p>
        )}
      </PlayerBubble>
    </div>
  )
}
