export default function StickerModule({ node, file }) {
  const src = file?.r2Url ?? null
  return (
    <div className="playerMsgRow">
      <div className="playerMediaPlaceholder">
        {src ? '[ стикер ]' : 'Стикер не загружен'}
      </div>
    </div>
  )
}
