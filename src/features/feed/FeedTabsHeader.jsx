import { useRef } from 'react'
import { Search, VolumeX } from 'lucide-react'
import { unlockAllForSound } from './videoPool.js'

// Верхние вкладки ленты («Рекомендации»/«Мои уроки») + иконка звука слева
// (только для тех, кто уже включал звук раньше — см. soundEverOn в
// useFeedSound.js; для новых пользователей индикация уже есть на самом
// видео, тут дублировать незачем) + скрытый вход в DBG (5 тапов по
// «Рекомендациям», только админу) + кнопка 🔍 (поиск фразы + фильтр сложности, справа);
// точка на ней — фильтр активен
export default function FeedTabsHeader({
  view, onSetView, onShowDebug, onOpenSearch, filterActive, isAdmin,
  soundOn, soundEverOn, onSoundOn,
}) {
  // Тап по иконке — тот же жест-«бless» для всего пула, что и у чипа на
  // видео (activateSound в SlideVideo.jsx): звук включается сразу везде
  function handleHeaderSoundOn() {
    unlockAllForSound()
    onSoundOn?.()
  }

  // Кнопка DBG скрыта (мешала в обычном просмотре); панель открывается
  // скрытым жестом — 5 тапов по «Рекомендациям» за 2 секунды, только админу.
  // Тапы не мешают обычному переключению вкладки — это тот же onSetView
  const tapsRef = useRef([])
  function handleFeedTab() {
    onSetView('feed')
    if (!isAdmin) return
    const now = Date.now()
    tapsRef.current = [...tapsRef.current.filter(t => now - t < 2000), now]
    if (tapsRef.current.length >= 5) {
      tapsRef.current = []
      onShowDebug()
    }
  }

  return (
    <>
      <div className="feedV2Tabs">
        <button
          className={view === 'feed' ? 'feedV2Tab feedV2TabActive' : 'feedV2Tab'}
          onClick={handleFeedTab}>
          Рекомендации
        </button>
        <button
          className={view === 'mine' ? 'feedV2Tab feedV2TabActive' : 'feedV2Tab'}
          onClick={() => onSetView('mine')}>
          Мои уроки
        </button>
      </div>
      {!soundOn && soundEverOn && (
        <button className="feedHeaderSoundBtn" onClick={handleHeaderSoundOn} aria-label="Включить звук">
          <VolumeX />
        </button>
      )}
      {/* Лупа — поиск фразы + фильтр сложности (в стиле иконок нижней панели: без фона, с тенью) */}
      <button className="feedSearchBtn" onClick={onOpenSearch} aria-label="Поиск и фильтр сложности">
        <Search />
        {filterActive && <span className="feedSearchDot" />}
      </button>
    </>
  )
}
