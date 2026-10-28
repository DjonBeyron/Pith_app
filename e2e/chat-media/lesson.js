// Синтетический урок стенда «медиа в чате»: по одной ноде каждого типа с файлом (media/ — сгенерированы
// scripts/make-bench-media.sh). Переходы — таймерами, чтобы цепочка шла сама. Ключи нод — те же, что в
// chat-media.spec.js (ожидания по типам)
export const MEDIA_FILES = [
  ['fa1', 'a1.mp3', 'audio/mpeg'], ['fa2', 'a2.mp3', 'audio/mpeg'], ['fc', 'circle.webm', 'video/webm'], ['fv', 'video.webm', 'video/webm'],
  ['fs', 'sticker.webm', 'video/webm'], ['fsp', 'sticker.png', 'image/png'], ['fp', 'photo.jpg', 'image/jpeg'],
  ['p1', 'pc1.jpg', 'image/jpeg'], ['p2', 'pc2.jpg', 'image/jpeg'], ['p3', 'pc3.jpg', 'image/jpeg'],
]

const text = (id, seq, content, then) => ({ id, seq, type: 'text', typeData: { text: { content } }, triggers: [{ if: 'timer', ms: 500, then }] })
const media = (id, seq, type, td, then, ms = 1200) => ({ id, seq, type, typeData: { [type]: td }, triggers: then ? [{ if: 'timer', ms, then }] : [] })

export function buildBenchLesson(mediaBase) {
  const files = MEDIA_FILES.map(([id, name, type]) => ({ id, name, size: 0, type, r2Url: `${mediaBase}/${name}`, status: 'synced', localFile: null }))
  const nodes = [
    text('t1', 1, 'Привет! Сейчас будет фото', 'ph'),
    media('ph', 2, 'photo', { file_id: 'fp', caption: 'большое фото 2400×1800' }, 't2'),
    text('t2', 3, 'Теперь голосовое', 'au1'),
    media('au1', 4, 'audio', { file_id: 'fa1', text: 'раз два три', showText: true }, 'ci', 3500),
    media('ci', 5, 'circle', { file_id: 'fc' }, 't3', 3000),
    text('t3', 6, 'Стикер-картинка', 'st1'),
    media('st1', 7, 'sticker', { file_id: 'fsp', isVideo: false }, 'vi'),
    media('vi', 8, 'video', { file_id: 'fv' }, 'st2', 3000),
    media('st2', 9, 'sticker', { file_id: 'fs', isVideo: true }, 'pc', 2500),
    media('pc', 10, 'photo_choice', { question: 'Где кот?', photos: [{ id: 'a', fileId: 'p1', label: 'один' }, { id: 'b', fileId: 'p2', label: 'два' }, { id: 'c', fileId: 'p3', label: 'три' }], correctId: 'a' }, 'au2', 2500),
    media('au2', 11, 'audio', { file_id: 'fa2', text: 'конец', showText: true }, 'end', 3000),
    text('end', 12, 'Конец теста', null),
  ]
  nodes[nodes.length - 1].triggers = []
  return { nodes, files }
}
