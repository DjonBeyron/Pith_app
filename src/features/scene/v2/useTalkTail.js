import { useLayoutEffect, useRef } from 'react'
import { startTail } from './talkTail.js'

// Хвост речи для кота сцены (SceneRenderer.jsx → Cat): talking перешёл true → false — класс is-tail ставится в тот же коммит, до отрисовки (useLayoutEffect: между снятием is-talking
// и постановкой is-tail не проходит ни одного кадра, иначе усы успели бы дёрнуться). Без setState: класс пишется прямо в DOM, перерисовок React нет. enabled=false (слабое устройство,
// флаг v2 выключен) — ничего не делаем.
export function useTalkTail(ref, talking, enabled = true) {
  const was = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!enabled || !el) { was.current = false; return undefined }
    if (talking) { was.current = true; return undefined }
    if (!was.current) return undefined
    was.current = false
    return startTail(el) // отмена — при следующем запуске речи и при размонтировании
  }, [ref, talking, enabled])
}
