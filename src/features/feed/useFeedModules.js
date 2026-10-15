import { isLessonOpen } from '../../shared/lib/lessonOpen.js'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { fdbg } from '../../shared/lib/feedDebug.js'
import { useFeedSignals } from '../../shared/lib/ranking/feedSignalsStore.js'
import { latchRank } from './feedKnowledge.js'
import { rankFeedByConfig } from './feedRankEngine.js'
import { publishedFeedModules } from './feedModuleShape.js'
import { onFeedJump } from './catch/catchForce.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { SANDBOX_ID } from './scene/sandbox/feedSandbox.js'
import { useSandboxModule } from './scene/sandbox/useFeedSandbox.js'
import { mixSandbox } from './scene/sandbox/sandboxModule.js'

// Загрузка модулей (curricula) + «пин» на фразу (deep-link репоста /?m=<id>,
// либо программный поворот из поиска — см. jumpTo) + расчёт круга
// рекомендаций (не начатые модули по карте памяти — rankFeed, повёрнутые к
// закреплённой фразе). rank — { stepOf, lessonWord, skipped, seed } | null
// (null — память ещё грузится: лента ждёт её до RANK_WAIT_MS, чтобы ПЕРВАЯ
// фраза уже была по карте памяти — потом круг держит текущую фразу, и порядок
// сменился бы только со второго слайда; не дождались — порядок админа).
// Порядок меняется, только пока лента скрыта: ответ на проверку слова или сигнал «память изменилась»
// обновляют rank, пока человек смотрит фразу, — пересортировка сдвигает индекс слайда, слайд
// пересоздаётся и фраза снова закрывается шариками (первый тап по слову после ответа «пропадал»)
const RANK_WAIT_MS = 1200

export function useFeedModules(startedIds, visible = true, freshRank = null) {
  const [latched, setLatched] = useState(freshRank)
  const rank = latchRank(latched, freshRank, visible)
  if (rank !== latched) setLatched(rank)
  // Конфиг движка (app_settings.feed_signals) — тем же латчем: новый конфиг тоже
  // меняет порядок только пока лента скрыта
  const freshConfig = useFeedSignals()
  const [latchedConfig, setLatchedConfig] = useState(freshConfig)
  const config = latchRank(latchedConfig, freshConfig, visible)
  if (config !== latchedConfig) setLatchedConfig(config)
  const [loaded, setModules] = useState(null) // null = загрузка
  const [error, setError] = useState('')
  const [rankWaitOver, setRankWaitOver] = useState(false)
  useEffect(() => {
    if (!loaded || rank || rankWaitOver) return
    const t = setTimeout(() => setRankWaitOver(true), RANK_WAIT_MS)
    return () => clearTimeout(t)
  }, [loaded, rank, rankWaitOver])
  const modules = loaded && (rank || rankWaitOver) ? loaded : null

  const load = useCallback(() => {
    return loadCurricula()
      .then(rows => {
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
        // Черновики в ленту не попадают; форма модуля — общая с предпросмотром
        // в окне «Сигналы ленты» (feedModuleShape.js)
        const published = publishedFeedModules(rows)
        // Приоритетно готовим первый кадр ленты: прелоадим постер первого
        // модуля — чтобы за анимацией стартового сплэша уже был контент
        const firstPoster = published.find(r => r.posterUrl)?.posterUrl
        if (firstPoster) { const im = new Image(); im.src = firstPoster }
        setModules(published)
      })
      // Сбой перезагрузки (сеть) — существующий список НЕ стираем
      .catch(e => { setError(e.message); setModules(prev => prev ?? []) })
  }, [])

  // Начальная загрузка
  useEffect(() => { load() }, [load])

  // Бэкграунд-обновление (баг: опубликованный модуль не появлялся до
  // перезагрузки приложения): тихо перечитываем список без скелетона —
  // (1) при возврате в ленту (visible false→true: админ опубликовал в
  // «Админ» и вернулся; пользователь переключил вкладку), (2) когда
  // приложение выходит из фона (тап по пушу «новый модуль» → foreground).
  const prevVisible = useRef(visible)
  useEffect(() => {
    if (visible && !prevVisible.current) load()
    prevVisible.current = visible
  }, [visible, load])

  useEffect(() => {
    // Под открытым уроком (лента «видима» под CurriculumView) не перезагружаем
    const onVis = () => { if (document.visibilityState === 'visible' && visible && !isLessonOpen()) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [visible, load])

  // Закреплённая фраза: изначально из deep-link репоста (/?m=<id>), потом
  // может меняться программно — тап по результату поиска (jumpTo). Круг
  // бесконечный, поэтому просто поворачиваем список — фраза первой,
  // остальное следом. Если модуль не в рекомендациях (начат/черновик) —
  // всё равно показываем её (как и с репостом). State (не ref!): смена
  // должна вызвать перерисовку и реальный поворот ленты (см. FeedSwiper.jsx — пересборка круга)
  const [pinnedId, setPinnedId] = useState(() => new URLSearchParams(location.search).get('m'))
  useEffect(() => {
    if (pinnedId) {
      fdbg('deep-link: старт с модуля', pinnedId)
      history.replaceState(null, '', location.pathname)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Поворот ленты к фразе (используется поиском): просто меняем закреплённый id
  function jumpTo(id) { setPinnedId(id) }

  // Поворот извне (Админ → Ловля → «Отправить в ленту», catchForce.sendToFeed): событие pithy:feed-jump.
  // Лента скрыта — pinnedId всё равно обновится, круг пересоберётся от него и покажет фразу первой
  // Песочница, уже закреплённая, но ушедшая из виду: повторное «Открыть в песочнице» снимает закрепление на кадр и ставит заново —
  // иначе pinnedId не меняется и лента остаётся там, куда её пролистали
  const pinnedRef = useRef(pinnedId)
  useEffect(() => { pinnedRef.current = pinnedId })
  useEffect(() => {
    let t = null
    const off = onFeedJump(d => {
      if (!d?.moduleId) return
      if (d.moduleId === SANDBOX_ID && pinnedRef.current === SANDBOX_ID) { setPinnedId(null); t = setTimeout(() => setPinnedId(SANDBOX_ID), 0) } else setPinnedId(d.moduleId)
    })
    return () => { off(); clearTimeout(t) }
  }, [])

  // Круг рекомендаций — только не начатые модули, по карте памяти. Считается при
  // сборке списка (useMemo), не на каждый рендер; движок — по конфигу (feedRankEngine.js)
  const ranked = useMemo(
    () => rankFeedByConfig((modules ?? []).filter(m => !startedIds.has(m.id)), rank, config),
    [modules, startedIds, rank, config],
  )
  // Песочница админа (scene/sandbox/): один синтетический модуль В НАЧАЛО круга, мимо ранжирования и латча
  const { isAdmin } = useAdmin()
  const sandboxMod = useSandboxModule(isAdmin)
  const withSandbox = useMemo(() => mixSandbox(ranked, sandboxMod), [sandboxMod, ranked])
  let feedModules = withSandbox
  if (pinnedId) {
    const dlIdx = feedModules.findIndex(m => m.id === pinnedId)
    if (dlIdx > 0) {
      feedModules = [...feedModules.slice(dlIdx), ...feedModules.slice(0, dlIdx)]
    } else if (dlIdx === -1) {
      // Модуль начат (например, отправитель открыл свою же ссылку) — в
      // рекомендациях его нет, но по прямой ссылке (или из поиска) показываем всё равно
      const dlMod = (modules ?? []).find(m => m.id === pinnedId)
      if (dlMod) feedModules = [dlMod, ...feedModules]
    }
  }

  return { modules, error, feedModules, len: feedModules.length, pinnedId, jumpTo }
}
