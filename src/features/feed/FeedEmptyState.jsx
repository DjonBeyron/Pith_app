// Лента «Рекомендации» без слайдов: фильтр сложности ничего не оставил /
// все фразы уже начаты / модулей нет вовсе. Вынесено из FeedTab.jsx
export default function FeedEmptyState({ filterActive, circleLen, modulesCount, error, onResetFilter, onGoMine }) {
  return (
    <div className="feedV2Center">
      {filterActive && circleLen > 0 ? (
        <>
          <div className="feedV2CenterTitle">Ничего не подошло</div>
          <div className="feedV2CenterSub">Ни одна фраза не попала под фильтр сложности</div>
          <button className="mlGoFeedBtn" onClick={onResetFilter}>Сбросить фильтр</button>
        </>
      ) : modulesCount > 0 ? (
        <>
          <div className="feedV2CenterTitle">Все уроки начаты</div>
          <div className="feedV2CenterSub">Продолжай обучение во вкладке «Мои уроки»</div>
          <button className="mlGoFeedBtn" onClick={onGoMine}>Мои уроки</button>
        </>
      ) : (
        <>
          <div className="feedV2CenterTitle">Лента пуста</div>
          <div className="feedV2CenterSub">{error || 'На сервере пока нет модулей'}</div>
        </>
      )}
    </div>
  )
}
