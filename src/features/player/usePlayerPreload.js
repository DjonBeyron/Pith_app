import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { forwardReachable, buildItemQueue, revokeEntry, warmupPlan } from './preloadQueue.js'
import { usePreloadProgress } from './usePreloadProgress.js'
import { isNodeWarm as isNodeWarmPure } from './preloadWarm.js'
import { makePreloadFetch, EVICT_TYPES } from './preloadFetchOne.js'
import { makeEvict } from './preloadEvict.js'
import { historyPageIds } from './feedWindow.js'

const LOOKAHEAD    = 3
const CONCURRENCY  = 2
export const CHAT_BUFFER_SIZE = 5
const MEDIA_TYPES  = new Set(['audio', 'voice_record', 'video', 'circle', 'photo', 'sticker', 'photo_choice', 'table'])
// POSTER_TYPES / EVICT_TYPES — в preloadFetchOne.js (там же и загрузка файла)

// opts.historyIds — id нод, показанных ДО точки входа (useLessonResume /
// payload карточки запуска, порядок ленты). Страница истории, что окажется в
// ленте при старте (feedWindow.historyPageIds), прогревается ПЕРВОЙ и целиком
// (preloadQueue.warmupPlan) — карточка запуска не стартует урок, пока история
// не готова, а плеер не выгружает её файлы на первом кадре (graceRef)
export function usePlayerPreload(nodes, files, visibleNodes, opts = {}) {
  const { initialLookahead = LOOKAHEAD, initialBlobMap = null, bufferSize = CHAT_BUFFER_SIZE, entryNodeId = null, historyIds = null } = opts
  const initRef = useRef(initialBlobMap ?? {})
  // Страница истории на экране при старте — из нод, которые в уроке есть
  const historyPage = useMemo(() => {
    if (!historyIds?.length) return []
    const ids = new Set(nodes.map(n => n.id))
    return historyPageIds(historyIds, id => ids.has(id))
  }, [nodes, historyIds])
  const historyKey = historyPage.join(',')

  const [blobMap, setBlobMap] = useState(() => ({ ...(initialBlobMap ?? {}) }))
  const [queueTotal, setQueueTotal] = useState(0)
  const [queueItems, setQueueItems] = useState([]) // зеркало queueRef для расчётов в рендере
  const [readyNodeIds, setReadyNodeIds] = useState(() => new Set())

  // Eviction
  const [evictLog, setEvictLog] = useState([])
  const evictLogRef     = useRef([])
  const evictingIdsRef  = useRef(new Set())
  const visibleNodesRef = useRef(visibleNodes)

  const blobUrlsRef    = useRef({ ...(initialBlobMap ?? {}) })
  const genRef         = useRef(0)
  const queueRef       = useRef([])
  const cursorRef      = useRef(0)
  const allowUpToRef   = useRef(initialLookahead)
  const warmupSetRef   = useRef(null) // ноды прогрева по плану (warmupPlan) — для процента бара
  // Сколько элементов уже взято «вперёд по пути» с последнего переупорядочивания
  // очереди (см. гейт в pump и эффект visibleNodes)
  const aheadRef       = useRef(0)
  const inFlightRef    = useRef(0)
  const byIdRef        = useRef({})
  const startTimeRef   = useRef(0) // выставляется в Date.now() при rebuild-эффекте
  // Запас буфера на старт с историей: столько тяжёлых файлов истории на
  // экране сверх bufferSize. Тает на единицу с каждым новым сообщением —
  // история выгружается постепенно, самая давняя первой, а не вся разом
  const graceRef       = useRef(0)
  const historySetRef  = useRef(new Set()) // ноды истории в плане прогрева
  const lastVisibleRef = useRef(null)

  // Байтовый прогресс, процент прогрева, реестр загрузок — usePreloadProgress.js
  const {
    debugItemsRef, bytesTotalRef, bytesLoadedRef, warmupPct, tick, throttledTick, cancelFlush, markFailed,
  } = usePreloadProgress(queueRef, initialLookahead, warmupSetRef)

  const [warmupNodeIds, setWarmupNodeIds] = useState([])
  const [initialized, setInitialized]     = useState(false)
  const [initializedFor, setInitializedFor] = useState(null) // список нод, под который построена очередь

  useEffect(() => { visibleNodesRef.current = visibleNodes }, [visibleNodes])

  function ts() {
    const s = (Date.now() - startTimeRef.current) / 1000
    return `+${s.toFixed(1)}`
  }

  function addMsgTs(seq, tsStr) {
    debugItemsRef.current.forEach(item => {
      if (item.seq === seq && !item.msgTs) item.msgTs = tsStr
    })
    tick()
  }

  // ─── Eviction (preloadEvict.js) ──────────────────────────────────────────
  // Counts only revealed (visible) evictable files against the buffer limit.
  // Preloaded-ahead files are free — they only enter the count once revealed.
  function evictFarthestIfNeeded(gen, justLoadedId) {
    return makeEvict({
      genRef, blobUrlsRef, setBlobMap, queueRef, visibleNodesRef, evictingIdsRef,
      evictLogRef, setEvictLog, ts, limit: () => bufferSize + graceRef.current,
    })(gen, justLoadedId)
  }

  // Returns true when all queue items for this node have a blobUrl or errored out.
  function checkNodeReady(nodeId) {
    const items = queueRef.current.filter(i => i.nodeId === nodeId)
    if (!items.length) return true
    return items.every(i => blobUrlsRef.current[i.id]?.blobUrl || blobUrlsRef.current[i.id]?.error)
  }

  // ─── Download ────────────────────────────────────────────────────────────
  // Событийная очередь: pump добирает свободные слоты до CONCURRENCY. Вызывается
  // при старте, после каждого завершённого скачивания и при сдвиге гейта — без таймеров.

  function pump(gen) {
    if (genRef.current !== gen) return
    while (inFlightRef.current < CONCURRENCY && cursorRef.current < queueRef.current.length) {
      const item = queueRef.current[cursorRef.current]
      // Гейт по BFS-индексу (nodeIdx) ИЛИ первые LOOKAHEAD элементов очереди
      // после курсора. Одного nodeIdx мало: в ветвящемся уроке (выбор, сигналы)
      // ближайшие по BFS ноды лежат на чужих ветках, а следующее голосовое по
      // РЕАЛЬНОМУ пути имеет индекс много больше гейта — эффект visibleNodes
      // ставит его первым в очереди (forwardReachable), но гейт по индексу его
      // не пропускал, и файл качался только когда нода уже показана: в логе
      // play() при readyState=1, rate=0.3 первые секунды, текст и заливка
      // разъезжались со звуком, буферящимся с сети
      const ahead = aheadRef.current < LOOKAHEAD
      if (item.nodeIdx >= allowUpToRef.current && !ahead) return
      cursorRef.current++
      // Skip if blobUrl already present (evicted entries have blobUrl=null → re-download ok)
      if (blobUrlsRef.current[item.id]?.blobUrl) continue
      if (item.nodeIdx >= allowUpToRef.current) {
        aheadRef.current++
        pLog(`[preload] вперёд по пути: seq=${item.nodeSeq} ${item.nodeType} idx=${item.nodeIdx} (гейт ${allowUpToRef.current}, ${aheadRef.current}/${LOOKAHEAD})`)
      }
      fetchOne(item, gen)
    }
  }

  // Загрузка одного файла очереди (+ мета голосового и постер в фоне) —
  // preloadFetchOne.js. Собирается в момент вызова (из pump, то есть из
  // эффектов), а не при рендере: те же рефы, сеттеры и функции этого хука
  function makeFetch() {
    return makePreloadFetch({
      genRef, blobUrlsRef, setBlobMap, setReadyNodeIds, inFlightRef,
      debugItemsRef, bytesLoadedRef, bytesTotalRef, tick, throttledTick, markFailed,
      ts, checkNodeReady, evictFarthestIfNeeded, pump, byIdRef,
    })
  }
  function fetchOne(item, gen) {
    return makeFetch()(item, gen)
  }

  // То же для карточки запуска — множество прогретых нод, пересчитывается
  // по blobMap (постер/мета доезжают после байтов)
  const warmNodeIds = useMemo(() => {
    const byNode = new Map()
    for (const it of queueItems) {
      if (!byNode.has(it.nodeId)) byNode.set(it.nodeId, [])
      byNode.get(it.nodeId).push(it)
    }
    return new Set([...byNode].filter(([, items]) => isNodeWarmPure(items, blobMap)).map(([id]) => id))
  }, [queueItems, blobMap])

  // «Нода прогрета» для графа урока (preloadWarm.js): blob + постер + мета.
  // Читает рефы в момент вызова — стабильна, в зависимости эффектов не попадает
  const isNodeWarm = useCallback(nodeId => {
    const items = queueRef.current.filter(i => i.nodeId === nodeId)
    return isNodeWarmPure(items, blobUrlsRef.current)
  }, [])

  // ─── visibleNodes: reorder queue + eviction check ────────────────────────
  useEffect(() => {
    if (!visibleNodes.length) return
    // Гейт считаем от МЕСТА в очереди (nodeIdx — BFS-расстояние от начала
    // урока), а не от числа увиденных ЗА ЭТУ СЕССИЮ медиа-нод. Раньше это
    // было одно и то же только потому, что сессия всегда начиналась с ноды
    // 0 — счёт «сколько видели» совпадал с позицией в очереди. При
    // «Продолжить урок» (startNodeId где-то в середине графа) видимых нод
    // за сессию мало (счёт с нуля), а их реальный nodeIdx уже большой —
    // гейт оставался маленьким и блокировал докачку файлов рядом с точкой
    // возобновления: голосовые играли «в лоб» с сервера без буфера
    // (readyState=0 в момент play(), реальные паузы на несколько секунд)
    const nodeIdxById = new Map(queueRef.current.map(item => [item.nodeId, item.nodeIdx]))
    const maxVisibleIdx = visibleNodes.reduce((max, n) => {
      const idx = nodeIdxById.get(n.id)
      return idx != null && idx > max ? idx : max
    }, -1)
    const needed = maxVisibleIdx + 1 + LOOKAHEAD
    if (needed > allowUpToRef.current) {
      pLog(`[preload] гейт ${allowUpToRef.current}→${needed} (дальняя видимая нода idx=${maxVisibleIdx})`)
      allowUpToRef.current = needed
    }

    const lastVisible = visibleNodes[visibleNodes.length - 1]
    if (!lastVisible) return
    // Новое сообщение в ленте — запас буфера под историю тает на единицу
    if (lastVisibleRef.current && lastVisibleRef.current !== lastVisible.id && graceRef.current > 0) graceRef.current--
    lastVisibleRef.current = lastVisible.id
    const reach     = forwardReachable(lastVisible, byIdRef.current)
    const loaded    = cursorRef.current
    const remaining = queueRef.current.slice(loaded)
    // История стартовой ленты от точки входа обычно недостижима — но её место
    // в очереди первое (warmupPlan), в «спекулятивный» хвост не отодвигаем
    const keep = item => reach.has(item.nodeId) || historySetRef.current.has(item.nodeId)
    const active      = remaining.filter(item =>  keep(item))
    const speculative = remaining.filter(item => !keep(item))
    if (speculative.length > 0) {
      queueRef.current = [...queueRef.current.slice(0, loaded), ...active, ...speculative]
    }
    // Новая видимая нода — снова можно взять LOOKAHEAD файлов вперёд по пути
    aheadRef.current = 0
    evictFarthestIfNeeded(genRef.current, null).catch(() => {})
    pump(genRef.current)
  }, [visibleNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── nodes/files: rebuild everything ─────────────────────────────────────
  useEffect(() => {
    const gen = genRef.current

    // Revoke only entries this hook created — not ones from initialBlobMap
    Object.entries(blobUrlsRef.current).forEach(([id, entry]) => {
      if (!initRef.current[id]) revokeEntry(entry)
    })
    blobUrlsRef.current = { ...initRef.current }
    setBlobMap({ ...initRef.current })
    setInitialized(false)
    setWarmupNodeIds([])
    debugItemsRef.current = new Map()
    evictLogRef.current = []
    setEvictLog([])
    evictingIdsRef.current.clear()
    startTimeRef.current = Date.now()
    allowUpToRef.current = initialLookahead
    byIdRef.current     = Object.fromEntries(nodes.map(n => [n.id, n]))
    queueRef.current    = buildItemQueue(nodes, files, MEDIA_TYPES)
    cursorRef.current   = 0
    inFlightRef.current = 0
    // Ожидаемые размеры из метаданных files — бар честный с первого чанка
    bytesTotalRef.current  = new Map(queueRef.current.filter(i => i.size).map(i => [i.id, i.size]))
    bytesLoadedRef.current = new Map()
    tick()
    // Count only items within the warmup gate (nodeIdx < initialLookahead)
    // Прогрев — от точки входа (preloadQueue.warmupPlan): начало урока или
    // точка «Продолжить»; очередь и гейт под неё
    const plan = warmupPlan(queueRef.current, entryNodeId, byIdRef.current, initialLookahead, historyPage)
    queueRef.current = plan.queue
    allowUpToRef.current = Math.max(allowUpToRef.current, plan.allowUpTo)
    const warmSet = new Set(plan.warmupIds)
    warmupSetRef.current = warmSet
    historySetRef.current = new Set(historyPage)
    const historyEvictable = queueRef.current.filter(i => historySetRef.current.has(i.nodeId) && EVICT_TYPES.has(i.nodeType))
    graceRef.current = historyEvictable.length
    lastVisibleRef.current = visibleNodesRef.current[visibleNodesRef.current.length - 1]?.id ?? null
    const warmup = queueRef.current.filter(item => warmSet.has(item.nodeId)).length
    setQueueTotal(warmup || queueRef.current.length)
    setQueueItems(queueRef.current)
    const warmupIds = plan.warmupIds
    setWarmupNodeIds(warmupIds)
    setInitialized(true)
    setInitializedFor(nodes)
    // Диагностика handoff: сколько файлов уже пришло с блобами из карточки запуска
    const handoffItems = queueRef.current.filter(i => blobUrlsRef.current[i.id]?.blobUrl)
    pLog(`[preload] очередь: ${queueRef.current.length} файлов, с handoff-блобами: ${handoffItems.length}, warmup-нод: ${warmupIds.length}` +
      (historyPage.length ? ` (история: ${historyPage.length} нод, ${historyEvictable.length} тяжёлых файлов сверх буфера на старт)` : ''))
    if (handoffItems.length) makeFetch().finishHandoff(handoffItems, gen)
    const pcItems = queueRef.current.filter(i => i.nodeType === 'photo_choice')
    if (pcItems.length) {
      const pcBlobs = pcItems.filter(i => blobUrlsRef.current[i.id]?.blobUrl).length
      pLog(`[preload] photo_choice: ${pcBlobs}/${pcItems.length} фото с блобами на старте`)
    }
    // Nodes with no downloadable files are ready immediately
    const nodesWithDownloads = new Set(queueRef.current.map(i => i.nodeId))
    const autoReady = new Set(
      nodes.filter(n => MEDIA_TYPES.has(n.type) && !nodesWithDownloads.has(n.id)).map(n => n.id)
    )
    setReadyNodeIds(autoReady)

    // If player starts with preloaded blobs, advance gate past already-cached items
    if (Object.keys(initRef.current).length > 0) {
      const maxPreloadedIdx = queueRef.current.reduce((max, item) =>
        blobUrlsRef.current[item.id] ? Math.max(max, item.nodeIdx + 1) : max, 0)
      if (maxPreloadedIdx + LOOKAHEAD > allowUpToRef.current) {
        allowUpToRef.current = maxPreloadedIdx + LOOKAHEAD
      }
    }

    // Safety net: if warmup nodes are still not ready after 10s, force-unblock the
    // progress bar. Handles capturePosterFrame hangs, gen-mismatch early-returns, etc.
    const SAFETY_MS = 10_000
    const safetyTimer = setTimeout(() => {
      if (genRef.current !== gen) return
      setReadyNodeIds(prev => {
        const next = new Set(prev)
        warmupIds.forEach(id => next.add(id))
        return next
      })
    }, SAFETY_MS)

    if (queueRef.current.length && files.length) pump(gen)
    return () => {
      genRef.current++
      clearTimeout(safetyTimer)
      cancelFlush()
    }
  }, [nodes, files, entryNodeId, historyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Размонтирование: blob-ссылки освобождаются на следующем такте и только
  // если хук не смонтировался снова. StrictMode в dev «размонтирует» и тут же
  // монтирует заново — сразу отозванные ссылки, переданные карточкой запуска
  // или прогревом карточки повторения (initialBlobMap), терялись, и файлы
  // качались второй раз
  const releaseTimerRef = useRef(null)
  useEffect(() => {
    clearTimeout(releaseTimerRef.current)
    return () => {
      releaseTimerRef.current = setTimeout(() => {
        Object.values(blobUrlsRef.current).forEach(revokeEntry)
        blobUrlsRef.current = {}
        initRef.current = {}
      }, 0)
    }
  }, [])

  // Transfer ownership of all blob URLs to the caller (card → player handoff).
  function releaseBlobs() { blobUrlsRef.current = {} }

  // Дебаг-оверлей живёт в ref и «дёргается» через setDebugTick — чтение при рендере намеренное
  // eslint-disable-next-line react-hooks/refs
  const debugItems = [...debugItemsRef.current.values()]
  return { blobMap, queueTotal, readyNodeIds, warmNodeIds, warmupNodeIds, warmupPct, initialized, initializedFor, debugItems, addMsgTs, releaseBlobs, evictLog, isNodeWarm }
}
