import { useEffect, useRef } from 'react'

// Заглушка для нод без файла — только для админа.
//
// Автор собирает сценарий заранее, а медиа подгружает позже. Обычный игрок
// такую ноду просто не смог бы пройти: аудио/видео/кружок ждут события
// «доиграло», которого без файла не будет, и урок вставал бы на месте.
// Админу вместо этого проигрывается пустышка: нода ведёт себя так, будто
// медиа отработало, и цепочка идёт дальше — так весь сценарий можно пройти
// до конца ещё до загрузки файлов. Длительность заодно задаёт темп печати
// текста у голосового (AudioModule): он допечатывается ровно к переходу.
export const FALLBACK_MS = 1600
// Пузырь выезжает 190мс (PlayerFeed) — ждём приземления, иначе текст
// печатается ещё в воздухе
const APPEAR_MS = 280

// active — файла нет, это админ И нода уже видна в ленте. Ждать видимости
// обязательно: ноды пре-рендерятся за экраном с заглушкой вместо onDone
// (LessonPlayer), и сработавший там таймер просто пропал бы вникуда —
// следующее сообщение не появлялось бы вовсе.
export function useMissingMediaFallback(active, onDone, { onStart } = {}) {
  const onDoneRef = useRef(onDone)
  const onStartRef = useRef(onStart)
  const firedRef = useRef(false)

  useEffect(() => {
    onDoneRef.current = onDone
    onStartRef.current = onStart
  })

  useEffect(() => {
    if (!active || firedRef.current) return
    // Сначала даём пузырю доехать, потом «воспроизводим» и отпускаем цепочку
    const start = setTimeout(() => onStartRef.current?.(), APPEAR_MS)
    const done = setTimeout(() => {
      firedRef.current = true
      onDoneRef.current?.()
    }, APPEAR_MS + FALLBACK_MS)
    return () => { clearTimeout(start); clearTimeout(done) }
  }, [active])
}
