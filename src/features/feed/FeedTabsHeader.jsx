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
      {/* Лупа + ползунки фильтра (в стиле иконок нижней панели: без фона, с тенью) */}
      <button className="feedSearchBtn" onClick={onOpenSearch} aria-label="Поиск и фильтр сложности">
        <svg viewBox="0 0 38 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="8" cy="9" r="6" />
          <path d="M12.5 13.5 16.5 17.5" />
          <line x1="20" y1="5" x2="36" y2="5" />
          <circle cx="26" cy="5" r="2" fill="currentColor" stroke="none" />
          <line x1="20" y1="12" x2="36" y2="12" />
          <circle cx="31" cy="12" r="2" fill="currentColor" stroke="none" />
          <line x1="20" y1="19" x2="36" y2="19" />
          <circle cx="24" cy="19" r="2" fill="currentColor" stroke="none" />
        </svg>
        {filterActive && <span className="feedSearchDot" />}
      </button>
    </>
  )
}
