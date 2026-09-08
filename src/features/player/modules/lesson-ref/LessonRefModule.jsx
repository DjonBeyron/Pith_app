import { useState, useEffect, useRef } from 'react'
import { Link2, BookmarkPlus, BookmarkCheck } from 'lucide-react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { fetchLessonTitles } from '../../../../shared/lib/lessonsApi.js'
import { loadCurricula } from '../../../../shared/lib/curriculaApi.js'
import { listLessonBookmarks, setLessonBookmark } from '../../../../shared/lib/lessonBookmarksApi.js'

// Обычная пауза перед автопереходом дальше (как у text/photo/system) — если
// пользователь ничего не нажал на карточке
const BASE_DONE_MS = 2000
// Клик «В закладки» откладывает переход: даём дочитать системное уведомление
// плюс небольшой запас. Полное уведомление (первая постановка) длиннее
// короткого повторного — и запас у него больше
const NOTICE_DONE_MS = 2400
const REPEAT_NOTICE_DONE_MS = 1600

// Карточка-ссылка на другой урок/модуль (нода lesson_ref, канвас) — как
// пересланное сообщение мессенджера. targetTitle из typeData — снимок на
// момент выбора в редакторе (запасной вариант); здесь название перечитывается
// живым запросом — если урок/модуль с тех пор переименован, удалён или снят
// с публикации, карточка честно покажет актуальное состояние. Клик — попап
// подтверждения → onOpenLessonRef (LessonPlayer.jsx, из LessonNavContext.jsx).
//
// Переход к следующей ноде НЕ на голом таймере (см. nodeDefaults.js —
// триггер `shown`, не `timer`): карточка сама зовёт onDone, когда готова.
// Обычно это BASE_DONE_MS, как у остальных статичных сообщений; но если
// пользователь успел нажать «В закладки», переход откладывается, пока не
// покажется и не прочитается системное уведомление — иначе лента уезжала
// дальше прямо во время его появления.
export default function LessonRefModule({ node, onDone, onOpenLessonRef }) {
  const tData = node.typeData?.lesson_ref ?? {}
  const { isModule = false, targetId = null, targetTitle = '', caption = '' } = tData

  const [liveTitle,       setLiveTitle]       = useState(null)
  const [unavailable,     setUnavailable]     = useState(false)
  const [bookmarked,      setBookmarked]      = useState(false)
  // Пока не пришёл ответ БД — не знаем правды, кнопку не показываем вовсе
  // (иначе на миг мелькает «В закладки», а через мгновение — «В закладках»)
  const [bookmarkChecked, setBookmarkChecked] = useState(false)
  // true только когда закладка встала ИМЕННО этим кликом (не найдена уже
  // существующей при загрузке) — включает разовую анимацию «зелёная → тусклая»;
  // при повторном заходе в урок (уже в закладках с самого начала) анимация не
  // играет, кнопка сразу тусклая
  const [justAdded,   setJustAdded]   = useState(false)
  const [notice,      setNotice]      = useState(null)
  const [confirming,  setConfirming]  = useState(false)

  const doneTimerRef = useRef(null)
  const doneFiredRef = useRef(false)

  // Откладывает/переназначает момент onDone — вызывать можно сколько угодно
  // раз подряд, сработает только самый последний вызов (более ранний таймер
  // снимается). После реального onDone дальнейшие вызовы — no-op
  function scheduleDone(delay) {
    if (doneFiredRef.current) return
    clearTimeout(doneTimerRef.current)
    doneTimerRef.current = setTimeout(() => {
      doneFiredRef.current = true
      onDone?.('shown')
    }, delay)
  }

  useEffect(() => {
    scheduleDone(BASE_DONE_MS)
    return () => clearTimeout(doneTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!targetId) return
    if (isModule) {
      loadCurricula().then(rows => {
        const m = rows.find(r => r.id === targetId)
        if (m?.published && !m.preview_only) setLiveTitle(m.title)
        else setUnavailable(true)
      })
    } else {
      fetchLessonTitles([targetId]).then(map => {
        if (map[targetId]) setLiveTitle(map[targetId])
        else setUnavailable(true)
      })
      listLessonBookmarks().then(set => {
        setBookmarked(set.has(targetId))
        setBookmarkChecked(true)
      })
    }
  }, [targetId, isModule])

  if (!targetId) return null
  const title = liveTitle ?? targetTitle

  // Кнопка-закладка есть только у ссылки на УРОК (см. StandaloneLessonRunner —
  // модули добавлять в закладки некуда, у них уже есть свой module_bookmarks),
  // и только когда реально знаем текущее состояние (bookmarkChecked)
  const showActions = !isModule && !unavailable && bookmarkChecked

  // Закладка ставится один раз и навсегда — второй клик её НЕ снимает
  // (иначе легко потерять сохранённый урок случайным повторным тапом),
  // только коротко напоминает, что урок уже сохранён
  function handleBookmarkClick(e) {
    e.stopPropagation()
    const kind = isModule ? 'Модуль' : 'Урок'
    if (bookmarked) {
      setNotice(`${kind} уже добавлен в закладки`)
      scheduleDone(REPEAT_NOTICE_DONE_MS)
      return
    }
    setBookmarked(true)
    setJustAdded(true)
    setLessonBookmark(targetId, true)
    setNotice(`${kind} «${title}» добавлен в закладки. Найти его можно в «Мои уроки» и в Профиле → «Сохранённые».`)
    scheduleDone(NOTICE_DONE_MS)
  }

  return (
    <>
      <div className="playerMsgRow">
        <PlayerBubble className="playerMsgBubble playerMsgBubble--lessonRef">
          <button
            type="button"
            className={`playerLessonRefPreview${unavailable ? ' playerLessonRefPreview--off' : ''}${showActions ? '' : ' playerLessonRefPreview--last'}`}
            onClick={() => !unavailable && setConfirming(true)}
          >
            <span className="playerLessonRefBar" />
            <span className="playerLessonRefIconWrap"><Link2 size={16} /></span>
            <span className="playerLessonRefBody">
              <span className="playerLessonRefTitle">{unavailable ? 'Урок недоступен' : title}</span>
              {caption && !unavailable && <span className="playerLessonRefCaption">{caption}</span>}
            </span>
          </button>
          {showActions && (
            <div className="playerLessonRefActions">
              <button
                type="button"
                className={`playerLessonRefBookmarkPill${bookmarked ? ' playerLessonRefBookmarkPill--on' : ''}${justAdded ? ' playerLessonRefBookmarkPill--justAdded' : ''}`}
                onClick={handleBookmarkClick}
              >
                {bookmarked ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}
                <span>{bookmarked ? 'В закладках' : 'В закладки'}</span>
              </button>
            </div>
          )}
        </PlayerBubble>
      </div>

      {/* Разовое уведомление — визуально как системное сообщение чата (те же
          классы, что у обычной системной ноды, SystemModule.jsx) — отдельной
          строкой ленты, а не внутри пузыря карточки. data-no-slide: это не
          «пришло новое сообщение», а довесок к уже показанной карточке — без
          этого атрибута PlayerFeed.jsx считал его обычным новым рядом и толкал
          всю историю (в т.ч. саму карточку-ссылку) компенсирующей анимацией,
          отчего она на миг соскакивала со своего места и возвращалась назад */}
      {notice && (
        <div className="playerMsgRow pinSystemRow" data-no-slide="true">
          <span className="pinSystemText">{notice}</span>
        </div>
      )}

      {confirming && (
        <div className="playerLessonRefConfirmOverlay" onClick={() => setConfirming(false)}>
          <div className="playerLessonRefConfirmCard" onClick={e => e.stopPropagation()}>
            <p>
              Текущий урок встанет на паузу, ты перейдёшь {isModule ? 'в модуль' : 'в урок'} «{title}».
              Продолжить?
            </p>
            <button
              className="playerLessonRefConfirmPrimary"
              onClick={() => { setConfirming(false); onOpenLessonRef({ isModule, targetId, targetTitle: title }) }}
            >
              Перейти
            </button>
            <button onClick={() => setConfirming(false)}>Отмена</button>
          </div>
        </div>
      )}
    </>
  )
}
