import { useEffect } from 'react'
import { applyLessonVolume, subscribeLessonVolume, listenMediaReapply } from '../../lessonVolume.js'

// Звук диктанта слушается из шапки урока (lessonVolume.js): «без звука»
// ставит muted на ведущий элемент (прогон, таймлайн и спектр идут как есть —
// RAF читает currentTime, а muted его не останавливает), скорость голоса —
// playbackRate (таймлайн ведётся по currentTime и ускоряется сам; хвост после
// конца аудио пересчитывает dictatorPostAudio.js).
//
// audioRef.current — это <audio> панели, прогретый элемент (primedAudio.js)
// или часы (silentClock.js, у них своя setRate). srcKey — audioSrc панели:
// <audio> монтируется позже первого рендера, и без этого dep автозапуск
// через 800 мс стартовал бы со звуком (на стенде — play() с muted=false).
// playing в deps: после старта прогона элемент мог смениться на запасной.
// Плюс повтор на loadedmetadata/play — браузер сбрасывает playbackRate при
// загрузке источника. muted — из контекста плеера (повторение || mute урока)
export function useDictatorVolume(audioRef, muted, playing, srcKey = null) {
  useEffect(() => {
    const apply = () => applyLessonVolume(audioRef.current, muted)
    apply()
    const offEvents = listenMediaReapply(audioRef.current, apply)
    const offStore = subscribeLessonVolume(apply)
    return () => { offStore(); offEvents() }
  }, [audioRef, muted, playing, srcKey])
}
