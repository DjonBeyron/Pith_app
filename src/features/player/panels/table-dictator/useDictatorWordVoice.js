import { useEffect, useRef } from 'react'
import { playWord } from '../../word-audio/wordAudioPlayer.js'
import { wordKey } from '../../../../shared/lib/wordAudio/wordKey.js'

// Озвучка слов, которые авто-таблица (диктант) сама кладёт в бокс — по
// галочке ноды «Озвучивать выбранные слова» (typeData.table.voiceWords, по
// умолчанию выключено: диктор и так произносит их вслух, слово поверх
// голоса нужно не всегда). Слова кладут три разных пути (таймлайн RAF,
// пост-аудио, legacy) — следим не за ними, а за самим ростом массивов
// assembled (значения ячеек, строки) и extrasAssembled ({value, key}):
// вырос — озвучиваем последнее добавленное. Сброс (в []) — молча.
export function useDictatorWordVoice(enabled, assembled, extrasAssembled) {
  const prevA = useRef(0)
  const prevE = useRef(0)
  useEffect(() => {
    const grewA = assembled.length > prevA.current
    const grewE = extrasAssembled.length > prevE.current
    prevA.current = assembled.length
    prevE.current = extrasAssembled.length
    if (!enabled) return
    if (grewA) playWord(wordKey(assembled[assembled.length - 1]))
    else if (grewE) playWord(wordKey(extrasAssembled[extrasAssembled.length - 1]?.value))
  }, [assembled, extrasAssembled, enabled])
}
