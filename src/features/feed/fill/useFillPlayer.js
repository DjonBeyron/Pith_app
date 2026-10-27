import { useCallback, useEffect, useRef, useState } from 'react'
import { createFillPlayer } from './fillAudio.js'

// Звук шторки «Дополни реплику»: при открытии сам играет склейку «до слова → мяу → после» (fillAudio.js), «Послушать ещё»
// — заново. audio — { url, steps } из задачи или null (звука нет: хук ничего не делает).
// → { stage: null | 'before' | 'meow' | 'after' | 'done' | 'blocked', replay }; stage нужен экрану, чтобы «мяу» мигнуло
// в такт паузе. 'blocked' — браузер не дал играть без касания: кнопка «Послушать» остаётся
export function useFillPlayer(audio) {
  const [stage, setStage] = useState(null)
  const player = useRef(null)

  useEffect(() => {
    if (!audio) return undefined
    const p = createFillPlayer({ url: audio.url, steps: audio.steps, onStage: setStage })
    player.current = p
    p.play()
    return () => { p.stop(); player.current = null }
  }, [audio])

  const replay = useCallback(() => { player.current?.play() }, [])
  return { stage, replay }
}
