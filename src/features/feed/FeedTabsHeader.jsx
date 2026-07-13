// Верхние вкладки ленты («Рекомендации»/«Мои уроки») + кнопка DBG
export default function FeedTabsHeader({ view, onSetView, onShowDebug }) {
  return (
    <>
      <div className="feedV2Tabs">
        <button
          className={view === 'feed' ? 'feedV2Tab feedV2TabActive' : 'feedV2Tab'}
          onClick={() => onSetView('feed')}>
          Рекомендации
        </button>
        <button
          className={view === 'mine' ? 'feedV2Tab feedV2TabActive' : 'feedV2Tab'}
          onClick={() => onSetView('mine')}>
          Мои уроки
        </button>
      </div>
      <button className="feedDbgBtn" onClick={onShowDebug}>DBG</button>
    </>
  )
}
