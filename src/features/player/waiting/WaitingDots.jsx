// active=true → dots animate (teacher is typing); false → dots visible but paused
export default function WaitingDots({ active = false }) {
  return (
    <div className="playerMsgRow">
      <div className={`playerWaiting${active ? '' : ' playerWaitingIdle'}`}>
        <span className="playerWaitingDot" />
        <span className="playerWaitingDot" />
        <span className="playerWaitingDot" />
      </div>
    </div>
  )
}
