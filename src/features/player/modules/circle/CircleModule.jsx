export default function CircleModule({ node, file }) {
  const src = file?.r2Url ?? null
  return (
    <div className="playerMsgRow playerMsgRowCircle">
      <div className="playerMsgBubble playerMsgBubble--circle">
        {src
          ? <video
              ref={el => { if (el) el.muted = true }}
              src={src}
              className="playerCircleVideo"
              playsInline
              autoPlay
              loop
            />
          : <div className="playerMediaPlaceholder">Кружок не загружен</div>
        }
      </div>
    </div>
  )
}
