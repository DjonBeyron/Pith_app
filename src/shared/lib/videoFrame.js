// Grabs one still frame from a video Blob URL as a JPEG blob URL — used to keep a frozen
// preview for an evicted video instead of leaving empty space where a message used to be.
export function capturePosterFrame(blobUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true

    function cleanup() {
      video.removeAttribute('src')
      video.load()
    }

    video.addEventListener('loadeddata', () => {
      video.currentTime = Math.min(0.1, video.duration || 0.1)
    })
    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 320
        canvas.height = video.videoHeight || 240
        canvas.getContext('2d').drawImage(video, 0, 0)
        canvas.toBlob(blob => {
          cleanup()
          resolve(blob ? URL.createObjectURL(blob) : null)
        }, 'image/jpeg', 0.7)
      } catch (e) {
        cleanup()
        reject(e)
      }
    })
    video.addEventListener('error', e => { cleanup(); reject(e) })
    video.src = blobUrl
  })
}
