import { Heart, Bookmark, Zap } from 'lucide-react'
import PhraseBubbleStatic from '../../../feed/PhraseBubbleStatic.jsx'
import PhraseTranslationRow from '../../../feed/PhraseTranslationRow.jsx'
import DifficultyBadge from '../../../feed/DifficultyBadge.jsx'

// Слои слайда ленты поверх сцены для предпросмотра «Как в ленте»: те же классы и те же компоненты, что в FeedSlide/FeedHud
// (блок фразы с шариками, строка перевода, колонка HUD, кнопка «Изучить фразу»), а значит те же размеры и отступы из
// feed-v2.css / feed-hud.css. Нет только данных ленты (лайки, закладки, жесты) — кнопки заглушки. Нижняя панель — те же
// классы .shellV2Nav (в макете она absolute, admin-scenes-feedframe.css). Всё без обработчиков: макет не кликается.
const noop = () => {}
const TABS = ['Лента', 'Учёба', 'Рейтинг', 'Профиль']

export default function FeedSlideLayers({ phrase = 'Where is the nearest station?', translation = 'Где ближайшая станция?', lessons = 3 }) {
  return (
    <>
      <div className="feedPauseGuard" aria-hidden="true" />
      <div className="feedPhraseBlock" data-ffp="phrase">
        <div className="feedPhraseStack">
          <PhraseBubbleStatic><div className="feedPhrase">{phrase}</div></PhraseBubbleStatic>
          <div className="feedPhraseSub"><PhraseTranslationRow text={translation} open={false} peek onToggle={noop} /></div>
        </div>
      </div>
      <div className="feedHud" data-ffp="hud">
        <div className="feedSlowZone" aria-hidden="true" />
        <button type="button" className="feedHudBtn" tabIndex={-1} aria-label="Лайк" title="Лайк"><Heart className="feedHudIcon" fill="currentColor" /><span>3</span></button>
        <button type="button" className="feedHudBtn" tabIndex={-1} aria-label="Закладка" title="Закладка"><Bookmark className="feedHudIcon" fill="currentColor" /></button>
        <button type="button" className="feedHudBtn" tabIndex={-1} aria-label="Репост" title="Репост">
          <svg className="feedHudIcon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 5l7 7-7 7v-4C7 15 4 17 2 20c0-7 4-11 12-11V5z" /></svg>
        </button>
        <DifficultyBadge level={null} myVote={null} onVote={noop} active={false} />
      </div>
      <button type="button" className="feedLearnBtn" data-ffp="learn" tabIndex={-1}>
        <Zap fill="currentColor" />
        Изучить фразу
        <span className="feedLearnCount">{lessons} урока</span>
      </button>
      <nav className="shellV2Nav ffpNav" data-ffp="nav" aria-hidden="true">
        {TABS.map(t => <span key={t} className="shellV2NavBtn">{t}</span>)}
      </nav>
    </>
  )
}
