import { capturePosterFrame } from '../../shared/lib/videoFrame.js'

// Фоновая очередь захвата постер-кадров. Строго по одному: параллельные <video>-декодеры
// на Android душат друг друга, и каждый захват может занимать секунды. Очередь никогда
// не блокирует ни загрузку файлов, ни готовность нод — постер дописывается когда успеет.
let chain = Promise.resolve()

export function enqueuePosterCapture(blobUrl, onDone) {
  chain = chain
    .then(() => capturePosterFrame(blobUrl, 4000))
    .catch(() => null)
    .then(posterUrl => { onDone(posterUrl) })
}
