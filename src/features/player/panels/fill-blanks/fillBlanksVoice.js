import { blankWord } from '../../../../shared/lib/wordAudio/collectLessonWords.js'
import { wordKey } from '../../../../shared/lib/wordAudio/wordKey.js'

// «Что играть при выборе варианта» в «Составь предложение» — чистая логика
// (без React/Audio), чтобы её можно было проверить тестом.
//
// Озвучивается ЛЮБОЙ выбранный вариант, верный или нет (как тап по ячейке/
// варианту в таблице и по чипу в «Собери фразу»): раньше звучал только верный
// (проверка blankMatches перед playWord), и ученик, ткнувший неверный вариант,
// слышал тишину — отсюда «озвучивается не всегда».
//
// Играет ЦЕЛОЕ слово пропуска с подставленным выбором («tr___s» + «ie» →
// «tries», а не «ie»); остальные пропуски того же слова — тем, что ученик уже
// выбрал, иначе верным ответом. Принудительные переносы строки \n шаблона
// слова не склеивают (blankWord режет по любым пробельным).
//
// Озвучка ВКЛЮЧЕНА ПО УМОЛЧАНИЮ: у нод без поля voiceWords (все старые и новые) слово
// звучит; выключает только явное voiceWords === false (галочка в редакторе).
// Раньше было наоборот (звучало только при === true) — и в готовых уроках,
// где галочку никто не ставил, выбор молчал.
export function voiceWordsOn(fbData) {
  return fbData?.voiceWords !== false
}

// Возвращает ключ слова в библиотеке (wordKey.js) или null — «озвучки нет»
// (озвучка выключена галочкой, слово не латиницей и т.п.).
export function blankPickWordKey({ fbData, picked, index, value }) {
  if (!voiceWordsOn(fbData)) return null
  const blanks = fbData.blanks ?? []
  if (!blanks[index] || value == null || String(value).trim() === '') return null
  return wordKey(blankWord(fbData.template ?? '', blanks, index, { ...picked, [index]: value }))
}
