export default function PinMessageBanner({ content }) {
  if (!content) return null
  return (
    <div className="pinBanner">
      <span className="pinBannerLabel">📌</span>
      <span className="pinBannerText">{content}</span>
    </div>
  )
}
