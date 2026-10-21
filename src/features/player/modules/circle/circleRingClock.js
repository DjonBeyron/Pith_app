// Кольцо прогресса видео-кружка — по часам самого видео, а не по CSS-анимации «на всю длительность с момента playing».
// На iPhone 'playing' приходит раньше реальных кадров, а буферизация посреди ролика кольцо не останавливала — оно доезжало
// до конца раньше видео и стояло (та же жалоба, что у кружка-сцены). Здесь, как у сцены (useSceneProgress/якорь):
//  · anchor(video) — на 'playing' и при расхождении: от текущего currentTime/duration одна линейная WAAPI-анимация до конца
//    за реальный остаток (duration − currentTime) / playbackRate;
//  · tick(video) — на 'timeupdate' (≈4 Гц): если часы видео разошлись с кольцом больше RING_DRIFT_MS — новый якорь;
//  · pause() — 'waiting' (буферизация): кольцо замирает; end() — ровно полное; reset() — пустое.
// Без React и DOM-зависимостей: элемент и animate инъектируются (circleRingClock.test.js).

export const RING_DRIFT_MS = 120

export function createRingClock(getEl, C, {
  animate = (el, kf, opts) => el.animate(kf, opts),
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
} = {}) {
  let anim = null
  let plan = null // { v0, t0, ms } — что кольцо сейчас рисует
  const offset = v => String(Math.round(C * (1 - Math.min(1, Math.max(0, v))) * 1000) / 1000)
  const set = v => { const el = getEl(); if (el) el.style.strokeDashoffset = offset(v) }
  const cancel = () => { try { anim?.cancel() } catch { /* уже снята */ } anim = null; plan = null }

  const remainingOf = video => {
    const d = video?.duration, t = video?.currentTime ?? 0
    if (!(d > 0)) return null
    const r = video.playbackRate > 0 ? video.playbackRate : 1
    return { v: t / d, ms: Math.max(0, (d - t) * 1000 / r) }
  }

  function anchor(video) {
    const el = getEl()
    const r = remainingOf(video)
    if (!el || !r) return false
    cancel()
    set(r.v)
    plan = { v0: r.v, t0: now(), ms: r.ms }
    if (typeof animate === 'function' && r.ms > 0) {
      anim = animate(el, [{ strokeDashoffset: offset(r.v) }, { strokeDashoffset: '0' }], { duration: r.ms, easing: 'linear', fill: 'forwards' })
    } else set(1)
    return true
  }

  // Ожидаемый кольцом остаток против реального по часам видео
  function tick(video) {
    const r = remainingOf(video)
    if (!r) return false
    if (!plan) return anchor(video)
    const expected = plan.ms - (now() - plan.t0)
    if (Math.abs(r.ms - expected) > RING_DRIFT_MS) return anchor(video)
    return false
  }

  return {
    anchor, tick,
    pause() { try { anim?.pause() } catch { /* ignore */ } plan = null },
    end() { cancel(); set(1) },
    reset() { cancel(); set(0) },
    planned: () => plan,
  }
}
