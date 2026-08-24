import { useState, useRef, useEffect } from 'react'
import { canvasLsKey, canvasViewKey } from './canvasStorageKeys.js'
import { makeNode } from './nodeGraph.js'

// Ключ черновика — в canvasStorageKeys.js (не в CanvasBoard.jsx: тот файл не
// должен экспортировать ничего, кроме компонента, иначе ломается Fast Refresh).
// CanvasPage.handleSave чистит его сразу после успешного сохранения — черновик
// нужен только чтобы не терять НЕсохранённые правки при случайной
// перезагрузке страницы.
const CANVAS_LS = canvasLsKey

function loadSaved(lessonId) {
  if (!lessonId) return {}
  try { return JSON.parse(localStorage.getItem(CANVAS_LS(lessonId)) ?? '{}') } catch { return {} }
}

// Позиция обзора (offset/scale) — отдельный ключ (canvasViewKey), переживает
// сохранение урока: черновик нод (loadSaved выше) стирается в
// CanvasPage.handleSave, а «где мы были» должно помниться всегда
function loadView(lessonId) {
  if (!lessonId) return {}
  try { return JSON.parse(localStorage.getItem(canvasViewKey(lessonId)) ?? '{}') } catch { return {} }
}

// Состояние доски (ноды/offset/scale) + вся его локальная персистентность:
// черновик нод в localStorage (переживает перезагрузку до сохранения),
// сверка черновика с сервером при монтировании, память позиции обзора,
// автосейв черновика и оповещение onNodesChange наружу. Вынесено из
// CanvasBoard.jsx — тот файл отвечал за это же вперемешку с рендером/DnD.
export function useCanvasBoardState(lessonId, initialNodes, onNodesChange) {
  // true, если начальные ноды взяты из локального черновика — он может
  // оказаться СТАРЕЕ того, что реально лежит на сервере (правки с другого
  // устройства/вкладки, о которых этот браузер не знает); проверяем это
  // сразу после монтирования (см. эффект ниже)
  const draftFallbackRef = useRef(false)
  // Ref пишется внутри ленивого инициализатора useState — он гарантированно
  // выполняется один раз, синхронно, до первого чтения draftFallbackRef где-
  // либо ещё (эффект ниже), поэтому «во время рендера» здесь безопасно
  // eslint-disable-next-line react-hooks/refs
  const [nodes, setNodes] = useState(() => {
    const s = loadSaved(lessonId)
    if (s.nodes?.length) { draftFallbackRef.current = true; return s.nodes }
    return initialNodes?.length ? initialNodes : [makeNode(1, 120, 80)]
  })

  // Если начальный выбор пал на локальный черновик, а он короче того, что
  // реально только что пришло с сервера (initialNodes уже свежие — доска
  // монтируется только после загрузки, см. CanvasPage) — молчать нельзя:
  // следующее «Сохранить» затрёт более полную серверную версию черновиком
  // из другого, более раннего состояния этого браузера. Спрашиваем, как в
  // handleResetToServer (CanvasPage.jsx) — это тот же случай, но обнаруженный
  // автоматически, а не руками через кнопку
  useEffect(() => {
    if (!draftFallbackRef.current) return
    draftFallbackRef.current = false
    if (!lessonId || !initialNodes?.length || initialNodes.length <= nodes.length) return
    const useServer = window.confirm(
      `В этом браузере сохранён черновик урока короче, чем версия на сервере ` +
      `(${nodes.length} нод здесь, ${initialNodes.length} нод на сервере) — похоже, урок правили в ` +
      `другом месте. Загрузить версию с сервера вместо черновика?`
    )
    if (useServer) {
      localStorage.removeItem(CANVAS_LS(lessonId))
      // Ответ на явный вопрос пользователю (confirm), а не синхронизация
      // состояния — разовое действие, не «эффект» в обычном смысле
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNodes(initialNodes)
    }
  // Разовая сверка при монтировании (не подписка на внешние данные) — намеренно без deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [offset, setOffset] = useState(() => loadView(lessonId).offset ?? { x: 0, y: 0 })
  const [scale, setScale]   = useState(() => {
    const v = loadView(lessonId)
    return typeof v.scale === 'number' ? v.scale : 1
  })
  const scaleRef   = useRef(scale)
  const mountedRef = useRef(false)

  // Черновик несохранённых правок нод — стирается после успешного
  // сохранения (CanvasPage.handleSave)
  useEffect(() => {
    if (!lessonId) return
    if (!mountedRef.current) { mountedRef.current = true; return }
    const t = setTimeout(() =>
      localStorage.setItem(CANVAS_LS(lessonId), JSON.stringify({ nodes })), 80)
    return () => clearTimeout(t)
  }, [lessonId, nodes])

  // Позиция обзора (offset/scale) — отдельная, независимая память: не
  // привязана к черновику и не стирается после сохранения, чтобы при
  // следующем открытии урока камера была там же, где её оставили
  useEffect(() => {
    if (!lessonId) return
    const t = setTimeout(() =>
      localStorage.setItem(canvasViewKey(lessonId), JSON.stringify({ offset, scale })), 200)
    return () => clearTimeout(t)
  }, [lessonId, offset, scale])

  useEffect(() => {
    if (!onNodesChange) return
    const t = setTimeout(() => onNodesChange(nodes), 500)
    return () => clearTimeout(t)
  }, [nodes, onNodesChange])

  return { nodes, setNodes, offset, setOffset, scale, setScale, scaleRef }
}
