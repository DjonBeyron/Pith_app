// Чистая логика цитаты-ответа («В ответ на» / replyToSeq) — без React и DOM,
// поэтому проверяется обычными юнит-тестами. Компонент-рендер (превью с
// картинкой, обрезкой) остаётся в ReplyPreview.jsx, он импортирует отсюда.

// Не экспортируется наружу пакета — подписи по типу ноды для случая, когда
// цитируемое сообщение само не текстовое (не сообщение ученика)
const MEDIA_LABEL = {
  photo:            'Фото',
  video:            'Видео',
  circle:           'Видеосообщение',
  sticker:          'Стикер',
  audio:            'Голосовое сообщение',
  voice_record:     'Голосовое сообщение',
  word_choice:      'Выбор слова',
  photo_choice:     'Выбор фото',
  phrase_assembly:  'Собрать фразу',
  table:            'Собрать фразу',
}

const REPLY_THEME = {
  default:   { border: '#b6fe3b', bg: 'rgba(182,254,59,0.07)',  name: '#b6fe3b', text: null },
  // Верный ответ — брендовым, как и везде в уроке: второй зелёный убран
  correct:   { border: '#b6fe3b', bg: 'rgba(182,254,59,0.06)', name: '#9aa0b4', text: '#b6fe3b' },
  incorrect: { border: '#f87171', bg: 'rgba(248,113,113,0.07)', name: '#9aa0b4', text: '#f87171' },
}

// Находит ноду, на которую ссылается replyToSeq. Общая для всех типов нод с
// цитатой (сейчас: text, sticker, phrase_assembly) — раньше была скопирована
// в каждый модуль отдельно.
export function findReplyNode(replyToSeq, lessonNodes) {
  if (!(replyToSeq > 0)) return null
  return lessonNodes?.find(n => n.seq === replyToSeq) ?? null
}

// Для phrase_assembly/table: какая попытка ученика в чате СЧИТАЕТСЯ финальным
// сообщением по этой ноде — верная, если она вообще была, иначе последняя.
export function resolvePhraseAttempt(attempts) {
  if (!attempts?.length) return { text: null, result: null }
  const correct = attempts.find(a => a.result === 'correct')
  if (correct) return correct
  return attempts[attempts.length - 1]
}

// Собирает вид блока цитаты по цитируемой ноде: имя, подпись, цвет темы.
export function resolveReply(replyNode, teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates) {
  if (!replyNode) return null
  const rType = replyNode.type
  if (rType === 'word_choice') {
    const st = allWordChoiceStates?.[replyNode.id]
    return {
      name:  'Вы:',
      label: st?.text || MEDIA_LABEL.word_choice,
      theme: st?.result === 'correct' ? REPLY_THEME.correct
           : st?.result === 'wrong'   ? REPLY_THEME.incorrect
           : REPLY_THEME.default,
      thumbSrc: null, crop: null,
    }
  }
  // Таблица в ручном режиме отдаёт собранную фразу тем же handlePhraseAnswer,
  // что и «Собери фразу» — значит и цитата на неё показывает ответ ученика
  if (rType === 'phrase_assembly' || rType === 'table') {
    const attempt = resolvePhraseAttempt(allPhraseStates?.[replyNode.id])
    return {
      name:  'Вы:',
      label: attempt.text || MEDIA_LABEL[rType],
      theme: attempt.result === 'correct' ? REPLY_THEME.correct
           : attempt.result === 'wrong'   ? REPLY_THEME.incorrect
           : REPLY_THEME.default,
      thumbSrc: null, crop: null,
    }
  }
  if (rType === 'photo_choice') {
    const st = allPhotoChoiceStates?.[replyNode.id]
    return {
      name:  'Вы:',
      label: MEDIA_LABEL.photo_choice,
      theme: st?.result === 'correct' ? REPLY_THEME.correct
           : st?.result === 'wrong'   ? REPLY_THEME.incorrect
           : REPLY_THEME.default,
      thumbSrc: null, crop: null,
    }
  }
  return {
    name:     teacherName || 'Учитель',
    label:    MEDIA_LABEL[rType] ?? replyNode.typeData?.[rType]?.content ?? '',
    theme:    REPLY_THEME.default,
    thumbSrc: null,
    crop:     replyNode.typeData?.[rType]?.crop ?? { x: 0, y: 0, scale: 1 },
  }
}
