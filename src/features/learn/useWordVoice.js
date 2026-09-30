import { useEffect, useState } from 'react'
import { listWordAudio, hasWordAudio, subscribeWordAudio } from '../../shared/lib/wordAudio/wordAudioApi.js'
import { playWord } from '../player/word-audio/wordAudioPlayer.js'

// Озвучка слов в списках «Моей памяти»: та же библиотека произношений
// (таблица word_audio) и тот же проигрыватель, что озвучивают слова в
// уроках. Список библиотеки грузится один раз на сессию (кэш wordAudioApi;
// гостю тоже — читают все), после загрузки список перерисовывается.
// Ключ слова памяти совпадает с ключом озвучки (word_key = wordKey), так что
// слово ищется прямо по нему. has — слово уже озвучено; play — сыграть его
// (внутри тапа: iOS разрешает звук только из жеста)
export function useWordVoice() {
  const [, bump] = useState(0)
  useEffect(() => {
    listWordAudio()
    return subscribeWordAudio(() => bump(n => n + 1))
  }, [])
  return { has: hasWordAudio, play: playWord }
}
