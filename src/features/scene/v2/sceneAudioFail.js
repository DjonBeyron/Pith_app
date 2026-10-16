// Почему реплика НЕ заиграла файлом и чем звучит сейчас — чистые подписи без React и DOM.
// audioLine.playLineAudio зовёт onFail(reason), scenePlayLine превращает это в запись
// { url, reason, text } (onFallback + console.warn), useSceneDirectorV2 хранит последнюю в
// состоянии (fail), а предпросмотр сборщика показывает её рядом с «звук: файл / синтез / таймер».
// Раньше откат на синтез/таймер был молчаливым: рот шёл по словам, звука не было, причины
// не видел никто (2026-10-15).

export const SOURCE_LABEL = { audio: 'файл', speech: 'браузерный голос', timer: 'таймер' }

const REASON_TEXT = {
  'not-allowed': 'браузер не дал запустить звук без касания (NotAllowedError) — нажмите «Старт»/сцену ещё раз',
  'not-supported': 'файл недоступен или это не аудио (404/403, пустой ответ, не mp3) — проверьте ссылку кнопкой «Проверить звук»',
  'load-timeout': 'файл не начал играть за 7 с (сеть/медленный хост) — проверьте доступность ссылки',
  'play-threw': 'play() бросил исключение — элемент <audio> в неожиданном состоянии',
  'no-url': 'у реплики нет ссылки на файл',
  'no-element': 'нет общего элемента <audio> (нет document)',
}

// 'media-error-4' → подпись по коду MediaError
const MEDIA_ERR = {
  1: 'загрузка прервана (MEDIA_ERR_ABORTED)',
  2: 'ошибка сети при загрузке (MEDIA_ERR_NETWORK) — две попытки не помогли',
  3: 'файл не декодируется (MEDIA_ERR_DECODE) — повреждён или не mp3',
  4: 'источник не поддерживается (MEDIA_ERR_SRC_NOT_SUPPORTED) — 404/403, неверный Content-Type или домен закрыт',
}

// Реплика-шаблон по частям не собралась в цепочку (scenePlayLine.playSegments): text — слово/часть без файла
const SEGMENT_TEXT = {
  'segments-word-no-audio': t => `слова «${t || '…'}» нет в библиотеке озвучки слов — реплика прочитана синтезом устройства целиком; озвучьте слово кнопкой «Озвучить слово» в блоке «Слова пользователя»`,
  'segments-part-no-audio': t => `часть «${t || '…'}» не озвучена — нажмите «Озвучить части» у реплики; пока реплика читается синтезом устройства целиком`,
  'segments-unfilled-var': () => 'в реплике остался неподставленный {плейсхолдер} — реплика читается синтезом устройства',
  'segments-empty': () => 'в реплике нечего озвучивать файлами — читается синтезом устройства',
}

export function describeAudioFail(reason, text = '') {
  const r = String(reason ?? 'unknown')
  if (SEGMENT_TEXT[r]) return SEGMENT_TEXT[r](text)
  if (REASON_TEXT[r]) return REASON_TEXT[r]
  const m = r.match(/^media-error-(\d)$/)
  if (m) return MEDIA_ERR[m[1]] ?? `ошибка медиа, код ${m[1]}`
  if (r.startsWith('play-rejected-')) return `play() отклонён (${r.slice('play-rejected-'.length)})`
  return `неизвестная причина (${r})`
}

// Строка для статуса предпросмотра: что звучит (sound=false — «без звука», галка снята) и,
// если файл не завёлся, почему
export function soundStatusText(mode, fail, sound = true) {
  const src = sound ? (SOURCE_LABEL[mode] ?? SOURCE_LABEL.timer) : 'без звука'
  if (!fail) return `звук: ${src}`
  if (String(fail.reason).startsWith('segments-')) return `звук: ${src} — ${describeAudioFail(fail.reason, fail.text)}`
  return `звук: ${src} — файл не завёлся: ${describeAudioFail(fail.reason)}`
}
