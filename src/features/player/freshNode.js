// «Свежая» нода для ленты (useGraphPlayer.freshVisible): снимок показа n
// (visit, isHistory) + актуальная нода урока src (админ правит урок из плеера).
//
// Копия кэшируется по снимку: без этого на каждое новое сообщение все объекты
// видимых нод создавались заново, memo строк ленты и WeakMap-кэши колбэков
// (PlayerFeedNodes.nodeCallbacks, useFeedWindow.asHistory) промахивались, и
// каждая строка окна перерисовывалась на каждый рендер LessonPlayer (замер:
// ~16 лишних рендеров PlayerMessage на сообщение). Новая копия — только когда
// сменился сам объект ноды урока (правка админом).
const FRESH = new WeakMap() // снимок → { src, out }

export function freshNode(n, src) {
  const c = FRESH.get(n)
  if (c && c.src === src) return c.out
  const out = { ...src, visit: n.visit, isHistory: n.isHistory }
  FRESH.set(n, { src, out })
  return out
}
