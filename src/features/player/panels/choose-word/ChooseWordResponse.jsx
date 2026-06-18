export default function ChooseWordResponse({ text, result }) {
  const mod = result === 'correct' ? ' chooseWordResponseOk' : ' chooseWordResponseErr'
  return (
    <div className="chooseWordResponseRow">
      <div className={`chooseWordResponseBubble${mod}`}>{text}</div>
    </div>
  )
}
