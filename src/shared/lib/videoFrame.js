import { pLog } from './debug.js'
import { frameLooksBlack, pickPosterTimes } from './frameBlack.js'

// Grabs one still frame from a video Blob URL as a JPEG blob URL — used to keep a frozen
// preview for an evicted video instead of leaving empty space where a message used to be.
// Resolves with null on timeout so callers never block indefinitely on slow/buggy decoders.
// seekTo > 0: кадр берётся с этой секунды (ролики часто начинаются с чёрного
// fade-in — постер модуля с нулевого кадра выходил чёрным).
//
// Постер по умолчанию — РОВНО нулевой кадр: живое видео стартует с 0, и любой
// сдвиг (раньше при неизвестных размерах перематывали на 0.1 с) давал скачок
// при смене «стоп-кадр → видео». От чёрного кадра защита: Android-декодер на
// loadeddata/seeked часто отдаёт чёрный кадр, пока тот не презентован — тогда
// ждём презентации и пробуем снова, потом берём другие времена (pickPosterTimes)
const REPRESENT_WAIT_MS = 200

export function capturePosterFrame(blobUrl, timeoutMs = 4000, seekTo = 0) {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true

    let done = false
    const timer = setTimeout(() => finish(null), timeoutMs)

    function cleanup() {
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
    }

    function finish(url) {
      if (done) return
      done = true
      cleanup()
      resolve(url)
    }

    function grab() {
      try {
        const canvas = document.createElement('canvas')
        canvas.width  = video.videoWidth  || 320
        canvas.height = video.videoHeight || 240
        canvas.getContext('2d').drawImage(video, 0, 0)
        canvas.toBlob(blob => {
          if (done) return
          finish(blob ? URL.createObjectURL(blob) : null)
        }, 'image/jpeg', 0.85)
      } catch {
        finish(null)
      }
    }

    // Ждём, пока декодер презентует кадр: requestVideoFrameCallback, а если
    // он молчит (у отвязанного от страницы элемента так бывает) — короткий таймер
    function waitPresented(cb) {
      let fired = false
      const go = () => { if (!fired && !done) { fired = true; cb() } }
      setTimeout(go, REPRESENT_WAIT_MS)
      video.requestVideoFrameCallback?.(go)
    }

    let firstT = null
    let times = null
    let timeIdx = 0
    let sameTimeRetried = false

    function nextTime() {
      times ??= pickPosterTimes(video.duration, firstT ?? 0)
      sameTimeRetried = false
      const t = times[++timeIdx]
      if (t == null) {
        pLog(`[poster] все пробные кадры чёрные (${times.map(x => x.toFixed(2)).join(', ')} с) — постера не будет`)
        finish(null)
        return
      }
      pLog(`[poster] кадр чёрный — повтор @${t.toFixed(2)}`)
      video.currentTime = t
    }

    // Кадр готов (loadeddata без перемотки или seeked): не чёрный — снимаем;
    // чёрный — один раз ждём презентации на том же времени, затем другое время
    function onFrameReady() {
      if (done) return
      firstT ??= video.currentTime || 0
      if (!frameLooksBlack(video)) { grab(); return }
      if (!sameTimeRetried) {
        sameTimeRetried = true
        pLog(`[poster] кадр чёрный — повтор @${(video.currentTime || 0).toFixed(2)} (ждём презентации)`)
        waitPresented(onFrameReady)
        return
      }
      nextTime()
    }

    // Primary: draw frame directly at loadeddata — no seeking required.
    // Seeking is unreliable on Android (seeked event may not fire).
    video.addEventListener('loadeddata', () => {
      if (seekTo > 0) {
        // Не дальше четверти ролика — чтобы не уехать за конец короткого видео
        const target = Math.min(seekTo, (video.duration || seekTo) * 0.25)
        video.currentTime = Math.max(0.1, target)
      } else if (video.videoWidth > 0) {
        onFrameReady()
      } else {
        // Размеры ещё не известны — перемотка заставит декодировать кадр. Не на
        // 0.1 с, а почти в 0: постер должен быть тем кадром, с которого
        // видео стартует
        video.currentTime = Math.min(0.001, video.duration || 0.001)
      }
    })
    video.addEventListener('seeked', onFrameReady)
    video.addEventListener('error', () => finish(null))
    video.src = blobUrl
  })
}
