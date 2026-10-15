// Чистая логика полноэкранного показа сцены (useSceneFullscreen.js) — без React и DOM.
//
// Два рендерера — один режиссёр «живой» в каждый момент: в ленте и на весь экран
// у сцены свои SceneRenderer (перенести DOM между порталом и лентой React не умеет
// без пересоздания). Перенос — через состояние: открывая, ставим ленту на паузу и
// запускаем экран с той же реплики; закрывая — переносим реплику обратно.
// Пауза режиссёра и так отменяет реплику и начинает её заново (directorCore), так
// что реплика продолжается с начала, звук идёт через один общий <audio> и никогда
// не удваивается.

export const SCENE_FS_SWIPE_CLOSE_PX = 80
export const SCENE_FS_Z = { bg: 10000, stage: 10001, controls: 10002 } // как у видео (useVideoFullscreen.jsx)

// Кадр 9:16 по центру рамки плеера (на телефоне — окно, на десктопе — «телефон» 420px)
export function fsFrameSize({ w, h }, { pad = 0 } = {}) {
  const W = Math.max(0, (w ?? 0) - pad * 2)
  const H = Math.max(0, (h ?? 0) - pad * 2)
  const height = Math.min(H, W * 16 / 9)
  return { width: Math.round(height * 9 / 16), height: Math.round(height) }
}

// Открытие: с какой реплики играть на экране. После конца — с начала; иначе — текущая
export function fsOpenTransition(st) {
  const ended = st?.status === 'ended'
  return { index: ended ? 0 : (st?.index ?? 0), play: true }
}

// Закрытие: что делать с лентой. Играла → продолжить с той же реплики; пауза → остаться
// на ней; доиграла → последняя реплика без автозапуска (переход played уже сработал)
export function fsCloseTransition(fsSt) {
  const status = fsSt?.status ?? 'idle'
  const last = Math.max(0, (fsSt?.total ?? 1) - 1)
  if (status === 'ended') return { index: last, resume: false }
  return { index: fsSt?.index ?? 0, resume: status === 'playing' }
}

// Жест закрытия: свайп вниз (как у кружка) или Escape
export function isFsCloseGesture({ dy = 0, key = null } = {}) {
  if (key === 'Escape') return true
  return dy > SCENE_FS_SWIPE_CLOSE_PX
}

// Тап по сцене в ленте: до старта — запустить на месте (жест = разблокировка звука),
// иначе — открыть на весь экран (как у видео: тап = полный экран)
export function inlineTapAction(status) {
  return status === 'idle' ? 'start' : 'fullscreen'
}
