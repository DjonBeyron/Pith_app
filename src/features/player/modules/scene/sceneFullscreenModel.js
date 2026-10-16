// Чистая логика полноэкранного показа сцены (useSceneFullscreen.js) — без React и DOM.
//
// Два рендерера — один режиссёр «живой» в каждый момент: в ленте и на весь экран
// у сцены свои SceneRenderer (перенести DOM между порталом и лентой React не умеет
// без пересоздания). Перенос — через состояние: открывая, ставим ленту на паузу и
// запускаем экран с той же реплики; закрывая — переносим реплику обратно.
// Пауза режиссёра и так отменяет реплику и начинает её заново (directorCore), так
// что реплика продолжается с начала, звук идёт через один общий <audio> и никогда
// не удваивается.

import { SCENE_W, SCENE_H } from '../../../scene/v2/sprites/backgrounds.js'

export const SCENE_FS_SWIPE_CLOSE_PX = 80
export const SCENE_FS_Z = { bg: 10000, stage: 10001, controls: 10002 } // как у видео (useVideoFullscreen.jsx)

// Кадр сцены на весь экран — «cover», как у видео (object-fit: cover): сцена не лежит 9:16 по центру
// с пустыми полосами, а заполняет всю рамку плеера. Как: рамка сцены 360×640 единиц ставится в масштабе s,
// фон за её краями продолжается сам (backgrounds.js, BLEED: стена вверх/в стороны, пол вниз — PROJECT.md
// «пол сцены продолжается»), а сама рамка просто центрируется на «содержательной полосе»
// FS_CONTENT (облачко … ноги котов, вьюбокс y 270…612) между кнопкой закрытия и нижней панелью.
// s = min(w / 360, высота полосы / высота содержимого): по ширине сцена максимум во весь экран (коты
// целиком по бокам), по высоте — облачко и коты целиком вмещаются (ландшафт, очень вытянутые окна).
// Как у ленты (feedFrameCalc.js): масштаб от ширины слайда, ноги котов над занятой зоной, остальное — фон.
// w/h — рамка плеера; safeTop/safeBottom — safe-area (px); возвращает { s, left, top, width, height } в px рамки.
export const FS_CONTENT = { top: 270, bottom: 612 }
export const FS_PAD = { top: 56, bottom: 76 } // кнопка закрытия сверху; панель (18 + 44 + 14) снизу, без safe-area

export function fsCoverFrame({ w, h }, { safeTop = 0, safeBottom = 0 } = {}) {
  const W = Math.max(0, w ?? 0), H = Math.max(0, h ?? 0)
  if (!W || !H) return { s: 0, left: 0, top: 0, width: 0, height: 0 }
  const ut = Math.max(0, safeTop) + FS_PAD.top
  const ub = H - (Math.max(0, safeBottom) + FS_PAD.bottom)
  const usable = Math.max(ub - ut, H * 0.4) // экран совсем низкий — не уходим в ноль
  const s = Math.min(W / SCENE_W, usable / (FS_CONTENT.bottom - FS_CONTENT.top))
  const cy = ub - ut >= usable ? (ut + ub) / 2 : H / 2
  const mid = (FS_CONTENT.top + FS_CONTENT.bottom) / 2
  const r = v => Math.round(v * 100) / 100
  return { s: Math.round(s * 10000) / 10000, left: r((W - SCENE_W * s) / 2), top: r(cy - mid * s), width: r(SCENE_W * s), height: r(SCENE_H * s) }
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

// Раскрытие кружка сцены тапом (useSceneCircleExpand): что делает режиссёр. До старта/на паузе — пуск, после конца —
// с начала (кружок оживает из статичного кадра), играла без звука (политика автоплея) — реплика заново со звуком,
// иначе (играет со звуком) — ничего, просто растёт. Тап по кружку — всегда жест: звук открывается в любом случае
export function expandAction(status, soundBlocked = false) {
  if (status === 'idle' || status === 'paused') return 'play'
  if (status === 'ended') return 'restart'
  if (status === 'playing' && soundBlocked) return 'replay'
  return null
}
