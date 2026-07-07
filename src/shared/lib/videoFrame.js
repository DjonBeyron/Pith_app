// Grabs one still frame from a video Blob URL as a JPEG blob URL — used to keep a frozen
// preview for an evicted video instead of leaving empty space where a message used to be.
// Resolves with null on timeout so callers never block indefinitely on slow/buggy decoders.
// seekTo > 0: кадр берётся с этой секунды (ролики часто начинаются с чёрного
// fade-in — постер модуля с нулевого кадра выходил чёрным).
export function capturePosterFrame(blobUrl, timeoutMs = 4000, seekTo = 0) {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true

    const timer = setTimeout(() => { cleanup(); resolve(null) }, timeoutMs)

    function cleanup() {
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
    }

    function captureFrame() {
      try {
        const canvas = document.createElement('canvas')
        canvas.width  = video.videoWidth  || 320
        canvas.height = video.videoHeight || 240
        canvas.getContext('2d').drawImage(video, 0, 0)
        canvas.toBlob(blob => {
          cleanup()
          resolve(blob ? URL.createObjectURL(blob) : null)
        }, 'image/jpeg', 0.7)
      } catch {
        cleanup()
        resolve(null)
      }
    }

    // Primary: draw frame directly at loadeddata — no seeking required.
    // Seeking is unreliable on Android (seeked event may not fire).
    video.addEventListener('loadeddata', () => {
      if (seekTo > 0) {
        // Не дальше четверти ролика — чтобы не уехать за конец короткого видео
        const target = Math.min(seekTo, (video.duration || seekTo) * 0.25)
        video.currentTime = Math.max(0.1, target)
      } else if (video.videoWidth > 0) {
        captureFrame()
      } else {
        // Dimensions not yet known — try a short seek to force decode
        video.currentTime = Math.min(0.1, video.duration || 0.1)
      }
    })
    video.addEventListener('seeked', captureFrame)
    video.addEventListener('error', () => { cleanup(); resolve(null) })
    video.src = blobUrl
  })
}
