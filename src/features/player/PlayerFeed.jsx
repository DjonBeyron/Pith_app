import WaitingDots from './waiting/WaitingDots.jsx'

// column-reverse feed: newest message is last in DOM = visually at bottom.
// No scrollToBottom needed — scrollTop=0 always shows the bottom in column-reverse.
export default function PlayerFeed({ children, showDots = false }) {
  return (
    <div className="playerFeed">
      <div className="playerFeedInner">
        {showDots && <WaitingDots />}
        {children}
      </div>
    </div>
  )
}
