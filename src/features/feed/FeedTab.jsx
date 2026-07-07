import { useState, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { fetchFeedSocial, setLike, setBookmark, fetchStartedModules } from '../../shared/api/moduleSocialApi.js'
import CurriculumView from '../lessons/CurriculumView.jsx'
import FeedSlide from './FeedSlide.jsx'
import MyLessons from './MyLessons.jsx'
import DebugPanel from './DebugPanel.jsx'
import { fdbg } from '../../shared/lib/feedDebug.js'
import { useAuth } from '../../shared/lib/useAuth.js'
import { APP_VERSION } from '../../shared/lib/version.js'

// Лента видео (новая оболочка, шаг 3 миграции): вертикальный scroll-snap
// по модулям из curricula, бесконечная по кругу — список повторяется
// циклами, а при подходе к краю scrollTop незаметно переносится на один
// цикл внутрь (контент идентичен — скачка не видно). Вместо видео пока
// градиент-заглушка — поле video_url появится на серверном этапе.
export default function FeedTab({ visible = true, onOpenCanvas, onRequireAuth }) {
  const [modules,   setModules]   = useState(null) // null = загрузка
  const [error,     setError]     = useState('')
  const [view,      setView]      = useState('feed') // feed | mine
  // Открытый модуль (схема Старт → уроки → Финал) поверх ленты
  const [openModule, setOpenModule] = useState(null)
  // Лайки/закладки по id модуля — общие для всех копий слайда в круге
  const [reactions, setReactions] = useState({})
  // Начатые модули: в «Рекомендациях» их не показываем (они в «Моих уроках»)
  const [startedIds, setStartedIds] = useState(() => new Set())
  // Серверная соц-инфа: залогинен ли, счётчики лайков
  const [social,    setSocial]    = useState(null)
  // Звук ленты: первый тап по чипу включает его для всех слайдов и
  // запоминается между запусками. Если при холодном старте iOS заблокирует
  // автозвук — слайд сообщит (onSoundBlocked), вернём чип
  const [soundOn, setSoundOnState] = useState(() => localStorage.getItem('pithy_sound_v1') === '1')
  function setSoundOn(on) {
    setSoundOnState(on)
    if (on) localStorage.setItem('pithy_sound_v1', '1')
    else localStorage.removeItem('pithy_sound_v1')
  }
  // Пользователь тапнул чип хотя бы раз — дальше автоблок звука на
  // пересозданных <video> соседних слайдов (без прямого жеста) не должен
  // откатывать его выбор, иначе звук гаснет сам через пару видео
  const soundGestureRef = useRef(false)
  function handleSoundOn() {
    fdbg('sound: user tapped chip')
    soundGestureRef.current = true
    setSoundOn(true)
  }
  function handleSoundBlocked() {
    if (soundGestureRef.current) {
      fdbg('sound: blocked ignored (gesture already given)')
      return
    }
    fdbg('sound: blocked → откат soundOn=false')
    setSoundOn(false)
  }
  const [showDebug, setShowDebug] = useState(false)
  // Активный слайд считается из позиции скролла (не IntersectionObserver —
  // тот в webview-средах может молчать, и видео не монтировалось)
  const [activeIdx, setActiveIdx] = useState(-1)
  const scrollRef = useRef(null)
  // Авторизация из локальной сессии — мгновенно, не ждём fetchFeedSocial
  // (раньше тап по лайку до его загрузки улетал в форму входа)
  const { user, loading: authLoading } = useAuth()

  function refreshStarted() {
    fetchStartedModules().then(setStartedIds).catch(() => {})
  }
  useEffect(refreshStarted, [])

  // Трекер переключения вкладок — для дебага «чёрной ленты»/«зависшего видео»
  // при возврате: пишем в лог DBG смену видимости и текущего вида
  useEffect(() => {
    fdbg(`tab: visible=${visible} view=${view} → tabVisible(feed)=${visible && view === 'feed'}`)
  }, [visible, view])

  useEffect(() => {
    let cancelled = false
    fetchFeedSocial()
      .then(s => {
        if (cancelled) return
        setSocial(s)
        // Мои лайки/закладки с сервера — стартовое состояние иконок
        setReactions(prev => {
          const next = { ...prev }
          for (const id of s.myLikes)     next[id] = { ...next[id], liked: true }
          for (const id of s.myBookmarks) next[id] = { ...next[id], saved: true }
          return next
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

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
        setModules(rows.filter(r => r.published).map(r => ({
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
  // Запас: минимум 40 циклов. Snap-stop пускает по слайду за жест, поэтому
  // между перецентровками до реального края долистать нельзя.
  // При маленьком len (мало модулей) перецентровка (teleport) раньше
  // случалась через каждые ~len*3 слайдов — а она пересоздаёт DOM-узел
  // активного <video> (новый ключ виртуализатора), что на iOS Safari рвёт
  // разрешение на автовоспроизведение со звуком у свежего элемента (см.
  // fdbg 'sound blocked' сразу за 'teleport settle' в реальном логе).
  // Больший запас циклов не стоит ничего в DOM (рендерится только overscan),
  // зато отодвигает перецентровку на порядок дальше — звук перестаёт рваться
  // при обычном пролистывании
  const cycles = len > 0 ? Math.max(40, Math.ceil(120 / len)) : 0
  const settleTimer = useRef(null)

  // Высота вьюпорта ленты — размер каждого виртуального слайда
  const [viewH, setViewH] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      fdbg('viewH:', el.clientHeight)
      setViewH(el.clientHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [len])

  // Виртуализация как в TikTok: в DOM живут только видимый слайд и запас
  // overscan сверху/снизу. Пока высота экрана не измерена (viewH=0) — список
  // пуст: рендер по «прикидочной» высоте с последующей перестройкой давал
  // мигание нескольких слайдов при старте
  const virtualizer = useVirtualizer({
    count: len > 0 && viewH > 0 ? cycles * len : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => viewH || 1,
    overscan: 2,
  })
  useEffect(() => { virtualizer.measure() }, [viewH]) // eslint-disable-line react-hooks/exhaustive-deps

  // Телепорт scrollTop с ВЫКЛЮЧЕННЫМ snap: iOS Safari на программный
  // scrollTop в snap-контейнере запускает «доснэпливание» и скролл улетает
  // к краям — получалась вечная драка (мигание слайдов). События скролла от
  // самого телепорта глушим флагом
  const teleportingRef = useRef(false)
  function teleport(el, target, why) {
    fdbg('teleport', why + ':', el.scrollTop.toFixed(0), '→', target.toFixed(0))
    teleportingRef.current = true
    const prev = el.style.scrollSnapType
    el.style.scrollSnapType = 'none'
    el.scrollTop = target
    if (viewH > 0) setActiveIdx(Math.round(target / viewH))
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.scrollSnapType = prev
      teleportingRef.current = false
    }))
  }

  // Перенос в середину круга с сохранением позиции внутри цикла: контент в
  // точке переноса идентичен, поэтому скачка не видно
  function recentre(why) {
    const el = scrollRef.current
    if (!el || !len) return
    const cycleH = el.scrollHeight / cycles
    const target = Math.floor(cycles / 2) * cycleH + (el.scrollTop % cycleH)
    if (Math.abs(target - el.scrollTop) > 1) teleport(el, target, why)
  }

  // Старт с середины круга — один раз, когда известны список и высота
  // экрана И контейнер реально растянут (iOS обрезал scrollTop, если ставить
  // его раньше, чем виртуализатор дорастил высоту)
  const initedRef = useRef(false)
  useEffect(() => { initedRef.current = false }, [len])
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !len || !viewH || initedRef.current) return
    initedRef.current = true
    const want = cycles * len * viewH
    let tries = 0
    const apply = () => {
      if (!scrollRef.current) return
      if (scrollRef.current.scrollHeight >= want - 2 || tries++ > 60) {
        teleport(scrollRef.current, len * viewH * Math.floor(cycles / 2), 'init')
      } else {
        requestAnimationFrame(apply)
      }
    }
    apply()
  }, [len, cycles, viewH])

  useEffect(() => () => clearTimeout(settleTimer.current), [])

  // Доводка: скролл остановился — только перецентровка круга, если додрейфовали
  // к краю запаса (teleport). Активный слайд считается в onScroll на лету.
  function onSettle() {
    const el = scrollRef.current
    if (!el || !len) return
    const cycleH = el.scrollHeight / cycles
    const mid = Math.floor(cycles / 2) * cycleH
    const threshold = cycleH * Math.max(1, Math.floor(cycles / 2) - 2)
    if (Math.abs(el.scrollTop - mid) > threshold) recentre('settle')
  }

  function onScroll() {
    const el = scrollRef.current
    if (!el || !len) return
    // Активный слайд — сразу из позиции скролла. Сосед (active±1) при этом
    // считается near и заранее прогревает своё видео из пула, поэтому при
    // приезде оно стартует мгновенно (см. SlideVideo/videoPool).
    if (viewH > 0) setActiveIdx(Math.round(el.scrollTop / viewH))
    // События, порождённые нашим же телепортом, не обрабатываем
    if (teleportingRef.current) return
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(onSettle, 140)
    // Аварийный перенос прямо в полёте — лишь у самого края
    const cycleH = el.scrollHeight / cycles
    const maxTop = el.scrollHeight - el.clientHeight
    if (el.scrollTop < cycleH * 0.5 || el.scrollTop > maxTop - cycleH * 0.5) recentre('edge')
  }

  // Лайк/закладка: гостю — форма входа; юзеру — оптимистичное переключение
  // + запись на сервер в фоне
  function toggle(id, key) {
    if (authLoading) return
    if (!user) { onRequireAuth?.(); return }
    const on = !reactions[id]?.[key]
    setReactions(r => ({ ...r, [id]: { ...r[id], [key]: on } }))
    if (key === 'liked') {
      setSocial(s => s && ({
        ...s,
        likeCount: { ...s.likeCount, [id]: Math.max(0, (s.likeCount[id] ?? 0) + (on ? 1 : -1)) },
      }))
      setLike(id, on)
    } else {
      setBookmark(id, on)
    }
  }

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
          soundOn={soundOn}
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
                      soundOn={soundOn}
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
