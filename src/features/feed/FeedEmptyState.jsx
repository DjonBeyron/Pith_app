// Лента «Рекомендации» без слайдов: фильтр сложности ничего не оставил /
// все фразы уже начаты / уроков нет вовсе. Вынесено из FeedTab.jsx. Тексты — emptyTexts.js
import { FEED_EMPTY as T } from './emptyTexts.js'

export default function FeedEmptyState({ filterActive, circleLen, modulesCount, error, onResetFilter, onGoMine }) {
  return (
    <div className="feedV2Center">
      {filterActive && circleLen > 0 ? (
        <>
          <div className="feedV2CenterTitle">{T.filter.title}</div>
          <div className="feedV2CenterSub">{T.filter.sub}</div>
          <button className="mlGoFeedBtn" onClick={onResetFilter}>{T.filter.reset}</button>
        </>
      ) : modulesCount > 0 ? (
        <>
          <div className="feedV2CenterTitle">{T.allStarted.title}</div>
          <div className="feedV2CenterSub">{T.allStarted.sub}</div>
          <button className="mlGoFeedBtn" onClick={onGoMine}>{T.allStarted.go}</button>
        </>
      ) : (
        <>
          <div className="feedV2CenterTitle">{T.noLessons.title}</div>
          <div className="feedV2CenterSub">{error || T.noLessons.sub}</div>
        </>
      )}
    </div>
  )
}
