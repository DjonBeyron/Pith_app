// Запасной путь воспроизведения дубля: <audio> файл записи не играет (iPhone: NotSupportedError, readyState 0), а Web Audio его часто декодирует. Blob → AudioBuffer (decodeAudioData) → игровой AudioContext
// (gameBufferPlay.playGameBuffer, как звуки диктора и кота). → 'ended' (доиграло) | 'unsupported' (не декодируется, нет контекста игры или он не запустился: экран зеркала скажет «Запись не воспроизводится
// на этом устройстве», а не промолчит). Буфер декодируется один раз на файл (кэш по blob). deps — для тестов: decode, play.
import { playGameBuffer } from '../../../shared/lib/gameBufferPlay.js'

const decoded = new WeakMap() // blob → промис AudioBuffer | null

const decodeBlob = async blob => {
  const Ctx = typeof window !== 'undefined' ? window.OfflineAudioContext || window.webkitOfflineAudioContext : null
  if (!Ctx || !blob?.arrayBuffer) return null
  return new Ctx(1, 1, 44100).decodeAudioData(await blob.arrayBuffer())
}

export function playTakeBuffer(blob, { decode = decodeBlob, play = playGameBuffer, tailMs = 1500 } = {}) {
  if (!blob) return Promise.resolve('unsupported')
  let p = decoded.get(blob)
  if (!p) { p = Promise.resolve().then(() => decode(blob)).catch(() => null); decoded.set(blob, p) }
  return p.then(buffer => {
    if (!buffer) return 'unsupported'
    return new Promise(resolve => {
      let done = false
      const end = r => { if (done) return; done = true; clearTimeout(timer); resolve(r) }
      const timer = setTimeout(() => end('ended'), Math.round((buffer.duration || 0) * 1000) + tailMs) // onEnded не пришёл — запасной выход
      const started = play(buffer, { onEnd: () => end('ended'), onResult: r => { if (r?.play === 'ctx-stuck' || r?.play === 'rejected') end('unsupported') } })
      if (!started) end('unsupported')
    })
  })
}
