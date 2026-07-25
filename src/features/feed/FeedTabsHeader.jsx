import { Search } from 'lucide-react'

// Верхние вкладки ленты («Рекомендации»/«Мои уроки») + кнопка DBG (только
// админу) + кнопка 🔍 (поиск фразы + фильтр сложности, справа); точка на
// ней — фильтр активен
export default function FeedTabsHeader({ view, onSetView, onShowDebug, onOpenSearch, filterActive, isAdmin }) {
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
      {isAdmin && <button className="feedDbgBtn" onClick={onShowDebug}>DBG</button>}
      {/* Лупа — поиск фразы + фильтр сложности (в стиле иконок нижней панели: без фона, с тенью) */}
      <button className="feedSearchBtn" onClick={onOpenSearch} aria-label="Поиск и фильтр сложности">
        <Search />
        {filterActive && <span className="feedSearchDot" />}
      </button>
    </>
  )
}
