// Проверка MP4 перед загрузкой в ленту: быстрый ли старт у файла.
// Браузер может начать играть видео только добравшись до moov-атома
// («оглавления»). Если он в конце файла (ffmpeg по умолчанию) — старт
// медленный; ffmpeg-флаг +faststart переносит его в начало.
// Идём по верхнеуровневым атомам, читая только 16-байтовые заголовки —
// сам файл (mdat) не читается.
// Возвращает: true — faststart ок, false — moov в конце, null — не удалось
// определить (не mp4/mov).
export async function checkMp4Faststart(file) {
  try {
    let offset = 0
    let guard = 0
    while (offset + 8 <= file.size && guard++ < 64) {
      const head = new DataView(await file.slice(offset, offset + 16).arrayBuffer())
      let boxSize = head.getUint32(0)
      const type = String.fromCharCode(
        head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7),
      )
      if (offset === 0 && type !== 'ftyp') return null // не ISO-BMFF контейнер
      if (type === 'moov') return true
      if (type === 'mdat') return false
      if (boxSize === 1) boxSize = Number(head.getBigUint64(8)) // 64-битный размер
      else if (boxSize === 0) break // атом до конца файла
      if (boxSize < 8) break
      offset += boxSize
    }
    return null
  } catch {
    return null
  }
}
