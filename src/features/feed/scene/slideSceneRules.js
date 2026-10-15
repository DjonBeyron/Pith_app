// Чистые правила слайда-сцены ленты (SlideScene/SlideMedia) — без React, для тестов.

// Что рисовать на месте медиа слайда: сцена главнее видео, но лента не ждёт её
// бесконечно: нет сцены / не загрузилась / невалидна / не опубликована → видео
// (или прежняя заглушка). Пока грузится — 'wait' (постер/скелетон, без мигания).
export function pickSlideMedia({ sceneId, status }) {
  if (!sceneId) return 'video'
  if (status === 'ready') return 'scene'
  if (status === 'missing' || status === 'invalid') return 'video'
  return 'wait'
}

// Режим рендерера по окну ленты: активный слайд — живая сцена (одна на всю
// ленту), сосед — статичный первый кадр (без режиссёра и аудио), дальше —
// скелетон. perfFlags.noVideo (бисекция лагов) — активный тоже статичен.
export function sceneLayerMode({ active, near, noVideo = false }) {
  if (active) return noVideo ? 'static' : 'live'
  if (near) return 'static'
  return 'skeleton'
}

// Сцена в ленте крутится по кругу, как зацикленное видео. Если у сцены есть задание «О чём диалог» (sceneTask.js) —
// переводы под репликами в облачках не показываются: иначе ответ был бы перед глазами (ответ проверяется по
// исходной сцене — useSceneTask получает её, а не эту копию). И режиссёр такую сцену НЕ зацикливает: круг кончается
// 'ended' на замершей последней реплике — панель задания выезжает до того, как кот заговорит снова (иначе второй круг
// успевал стартовать и обрывался паузой); новый круг запускает useSceneTask (play по 'ended' / после ухода панели)
export function loopedScene(scene) {
  if (!scene) return null
  const timeline = scene.task && Array.isArray(scene.timeline)
    ? scene.timeline.map(l => { if (!l?.translation) return l; const { translation: _t, ...rest } = l; return rest })
    : scene.timeline
  return { ...scene, timeline, options: { ...(scene.options ?? {}), loop: !scene.task } }
}

// Режиссёру можно играть: живой режим, вкладка видна, пользователь не ставил паузу
export function shouldScenePlay({ live, paused, tabVisible = true }) {
  return !!live && !paused && !!tabVisible
}

// Звук сцены = звук ленты (soundReady: включён в настройках И был жест в этой сессии)
export function sceneSound(soundOn) {
  return !!soundOn
}

// Замедление 0.5x зоны над лайком → множитель скорости речи
export function sceneRate(slow) {
  return slow ? 0.5 : 1
}
