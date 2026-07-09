import { useState, useEffect, useRef } from 'react'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import CurriculumView from '../lessons/CurriculumView.jsx'
import FeedSlide from './FeedSlide.jsx'
import MyLessons from './MyLessons.jsx'
import DebugPanel from './DebugPanel.jsx'
import { useFeedLoop } from './useFeedLoop.js'
import { useFeedSound } from './useFeedSound.js'
import { useFeedSocial } from './useFeedSocial.js'
import { fdbg } from '../../shared/lib/feedDebug.js'
import { APP_VERSION } from '../../shared/lib/version.js'

// Лента видео (новая оболочка, шаг 3 миграции): вертикальный scroll-snap
// по модулям из curricula, бесконечная по кругу. Механика круга — в
// useFeedLoop, звук — в useFeedSound, лайки/закладки — в useFeedSocial.
export default function FeedTab({ visible = true, onOpenCanvas, onRequireAuth }) {
  const [modules,   setModules]   = useState(null) // null = загрузка
  const [error,     setError]     = useState('')
  const [view,      setView]      = useState('feed') // feed | mine
  // Открытый модуль (схема Старт → уроки → Финал) поверх ленты
  const [openModule, setOpenModule] = useState(null)
  const [showDebug, setShowDebug] = useState(false)

  const { reactions, social, startedIds, refreshStarted, toggle } = useFeedSocial({ onRequireAuth })
  const { soundReady, soundOn, soundGestureRef, handleSoundOn, handleSoundBlocked } = useFeedSound()

  // Трекер переключения вкладок (+ обновление «начатых» при открытии «Мои
  // уроки», чтобы только что начатый модуль там появился сразу). Пишем в лог DBG
  useEffect(() => {
    fdbg(`tab: visible=${visible} view=${view} → tabVisible(feed)=${visible && view === 'feed'}`)
    if (visible && view === 'mine') refreshStarted()
  }, [visible, view]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    loadCurricula()
      .then(rows => {
        if (cancelled) return
        // Восстанавливаем lesson_ids в localStorage (как useCurricula в старой
        // вкладке): CurriculumView читает уроки модуля именно оттуда — без
        // этого «Изучить фразу» на свежем устройстве открывал пустую схему
        rows.forEach(r => {
          const key = `curr_lessons_${r.id}`
          const local = JSON.parse(localStorage.getItem(key) ?? '[]')
          if ((r.lesson_ids?.length ?? 0) > 0 && local.length === 0) {
            localStorage.setItem(key, JSON.stringify(r.lesson_ids))
          }
        })
        // Черновики в ленту не попадают (и у админа тоже — честное превью)
        const published = rows.filter(r => r.published)
        // Приоритетно готовим первый кадр ленты: прелоадим постер первого
        // модуля — чтобы за анимацией стартового сплэша уже был контент
        const firstPoster = published.find(r => r.poster_url)?.poster_url
        if (firstPoster) { const im = new Image(); im.src = firstPoster }
        setModules(published.map(r => ({
          id: r.id,
          title: r.title,
          lessonIds: r.lesson_ids ?? [],
          videoUrl: r.video_url ?? null,
          posterUrl: r.poster_url ?? null,
          posterCrop: r.poster_crop ?? null,
        })))
      })
      .catch(e => {
        if (cancelled) return
        setError(e.message)
        setModules([])
      })
    return () => { cancelled = true }
  }, [])

  // Круг рекомендаций — только не начатые модули
  const feedModules = (modules ?? []).filter(m => !startedIds.has(m.id))
  const len = feedModules.length

  // Отпускаем стартовый сплэш (index.html) не по приходу данных, а по ПЕРВОМУ
  // РЕАЛЬНОМУ КАДРУ видео (сигнал __pithyVideoShown из SlideVideo) — иначе
  // после улёта сплэша видна недогруженная лента. Если ждать нечего (пусто/
  // ошибка/без видео) — сразу; при медленной сети — страховка (виден постер).
  const splashDone = useRef(false)
  useEffect(() => {
    if (modules === null || splashDone.current) return
    const fire = why => {
      if (splashDone.current) return
      splashDone.current = true
      fdbg('splash release:', why)
      window.__pithyReady?.(why)
    }
    if (len === 0) { fire(modules.length === 0 ? 'лента пуста' : 'все модули начаты'); return }
    if (!feedModules.some(m => m.videoUrl)) { fire('слайды без видео'); return }
    window.__pithyVideoShown = () => fire('первый кадр видео')
    const t = setTimeout(() => fire('страховка 3500мс — кадра нет'), 3500)
    return () => clearTimeout(t)
  }, [modules, len]) // eslint-disable-line react-hooks/exhaustive-deps

  const { scrollRef, activeIdx, viewH, cycles, virtualizer, onScroll } = useFeedLoop(len)

  // «Изучить фразу» → готовый экран модуля (схема, карточка прогрева, плеер)
  if (openModule) {
    return (
      <div className="feedModuleScreen">
        <CurriculumView
          curriculumId={openModule.id}
          curriculumTitle={openModule.title}
          onBack={() => { setOpenModule(null); refreshStarted() }}
          onOpenCanvas={onOpenCanvas}
        />
      </div>
    )
  }

  // Снимок метрик ленты для дебаг-панели. Дампим ВСЕ элементы пула (и в ленте,
  // и припаркованные) с их состоянием — по нему видно причины багов возврата
  // на вкладку: чёрная лента (virtual ПУСТО / viewH=0), зависшая картинка при
  // живом звуке (припаркованный элемент с paused=false, или активный paused=true
  // при играющем другом). Жми «Обновить» дважды — если ct не растёт, видео стоит.
  function feedInfo() {
    const el = scrollRef.current
    const items = virtualizer.getVirtualItems()
    const all = [...document.querySelectorAll('.poolVideo')]
    const dump = all.map(v => {
      const inFeed = !!v.closest('.feedV2Scroll')
      const r = v.getBoundingClientRect()
      const where = inFeed ? `feed top=${r.top.toFixed(0)}` : 'PARKED'
      return `  ${(v.dataset.url || '—').slice(-8)} [${where}] paused=${v.paused} muted=${v.muted} ct=${v.currentTime.toFixed(2)}/${(v.duration || 0).toFixed(1)} rs=${v.readyState} op=${v.style.opacity || '1'}`
    })
    return [
      `view: ${view}, modules: ${len}, cycles: ${cycles}, viewH: ${viewH}, activeIdx: ${activeIdx}`,
      `started: ${startedIds.size} [${[...startedIds].map(s => String(s).slice(-4)).join(',')}] allModules=${modules?.length ?? 0}`,
      `tabVisible(feed): ${visible && view === 'feed'}  (app visible=${visible})`,
      `scroll: top=${el ? el.scrollTop.toFixed(0) : '—'} clientH=${el?.clientHeight ?? '—'} scrollH=${el?.scrollHeight ?? '—'}`,
      `virtual(${items.length}): ${items.map(i => `#${i.index}`).join(' ') || 'ПУСТО'}`,
      `sound: soundOn=${soundOn} gesture=${soundGestureRef.current}`,
      `pool videos (${all.length}):`,
      ...dump,
    ].join('\n')
  }

  return (
    <div className="feedV2">
      <div className="feedV2Tabs">
        <button
          className={view === 'feed' ? 'feedV2Tab feedV2TabActive' : 'feedV2Tab'}
          onClick={() => setView('feed')}>
          Рекомендации
        </button>
        <button
          className={view === 'mine' ? 'feedV2Tab feedV2TabActive' : 'feedV2Tab'}
          onClick={() => setView('mine')}>
          Мои уроки
        </button>
      </div>
      <span className="feedV2Version">v{APP_VERSION}</span>
      <button className="feedDbgBtn" onClick={() => setShowDebug(true)}>DBG</button>

      {/* Оба вида смонтированы всегда (как вкладки оболочки): переключение
          «Рекомендации» ↔ «Мои уроки» не сбрасывает ленту и её слайд */}
      <div className={view === 'mine' ? 'feedViewStack' : 'feedViewStack feedViewHidden'}>
        <MyLessons
          visible={visible && view === 'mine'}
          modules={modules ?? []}
          startedIds={startedIds}
          soundOn={soundReady}
          onSoundOn={handleSoundOn}
          onSoundBlocked={handleSoundBlocked}
          onOpen={m => setOpenModule(m)}
          onGoFeed={() => setView('feed')}
        />
      </div>
      <div className={view === 'feed' ? 'feedViewStack' : 'feedViewStack feedViewHidden'}>
        {modules === null ? (
          <div className="feedV2Scroll">
            <section className="feedSlide"><div className="feedSkeleton" /></section>
          </div>
        ) : len === 0 ? (
          <div className="feedV2Center">
            {modules.length > 0 ? (
              <>
                <div className="feedV2CenterTitle">Все уроки начаты</div>
                <div className="feedV2CenterSub">Продолжай обучение во вкладке «Мои уроки»</div>
                <button className="mlGoFeedBtn" onClick={() => setView('mine')}>Мои уроки</button>
              </>
            ) : (
              <>
                <div className="feedV2CenterTitle">Лента пуста</div>
                <div className="feedV2CenterSub">{error || 'На сервере пока нет модулей'}</div>
              </>
            )}
          </div>
        ) : (
          <div className="feedV2Scroll" ref={scrollRef} onScroll={onScroll}>
            <div className="feedVirtualTotal" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map(vi => {
                const m = feedModules[vi.index % len]
                return (
                  <div
                    key={vi.key}
                    className="feedVirtualItem"
                    style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}>
                    <FeedSlide
                      module={m}
                      slideKey={vi.index}
                      active={vi.index === activeIdx}
                      near={Math.abs(vi.index - activeIdx) <= 1}
                      tabVisible={visible && view === 'feed'}
                      gradIdx={(vi.index % len) % 4}
                      reaction={reactions[m.id]}
                      likeCount={social?.likeCount?.[m.id] ?? 0}
                      soundOn={soundReady}
                      onSoundOn={handleSoundOn}
                      onSoundBlocked={handleSoundBlocked}
                      onToggleLike={() => toggle(m.id, 'liked')}
                      onToggleSave={() => toggle(m.id, 'saved')}
                      onLearn={() => setOpenModule(m)}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {showDebug && <DebugPanel getFeedInfo={feedInfo} onClose={() => setShowDebug(false)} />}
    </div>
  )
}
