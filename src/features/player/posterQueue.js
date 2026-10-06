import { capturePosterFrame } from '../../shared/lib/videoFrame.js'

// Фоновая очередь захвата постер-кадров. Строго по одному: параллельные <video>-декодеры
// на Android душат друг друга, и каждый захват может занимать секунды. Очередь никогда
// не блокирует ни загрузку файлов, ни готовность нод — постер дописывается когда успеет.
let chain = Promise.resolve()

// isAlive — проверка в момент, когда очередь дошла до этого файла: урок
// закрыт/пересобран (поколение сменилось) — захват пропускается, а не
// занимает до 4 с декодера. Раньше хвосты из карточки запуска доигрывали
// уже в сессии плеера и задерживали постеры показанных нод
export function enqueuePosterCapture(blobUrl, onDone, isAlive = () => true) {
  chain = chain
    .then(() => (isAlive() ? capturePosterFrame(blobUrl, 4000) : null))
    .catch(() => null)
    .then(posterUrl => { onDone(posterUrl) })
}
