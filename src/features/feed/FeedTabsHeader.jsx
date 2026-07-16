// Верхние вкладки ленты («Рекомендации»/«Мои уроки») + кнопка DBG + кнопка
// 🔍 (поиск фразы + фильтр сложности, справа); точка на ней — фильтр активен
export default function FeedTabsHeader({ view, onSetView, onShowDebug, onOpenSearch, filterActive }) {
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
      {/* Контурная лупа в стиле иконок нижней панели: без фона, с тенью */}
      <button className="feedSearchBtn" onClick={onOpenSearch} aria-label="Поиск и фильтр сложности">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M15.8 15.8 21 21" />
        </svg>
        {filterActive && <span className="feedSearchDot" />}
      </button>
    </>
  )
}
