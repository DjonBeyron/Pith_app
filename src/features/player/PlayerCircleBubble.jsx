// Round video bubble (Telegram video-note style).
// Crop positioning from the canvas editor is applied via transform.
// Intrinsic-size computation for correct crop is part of Stage 5.
export default function PlayerCircleBubble({ src }) {
  return (
    <div className="playerCircle">
      {src
        ? <video
            ref={el => { if (el) el.muted = true }}
            src={src}
            className="playerCircleVideo"
            playsInline
            autoPlay
            loop
          />
        : <div className="playerCirclePlaceholder">○</div>
      }
    </div>
  )
}
