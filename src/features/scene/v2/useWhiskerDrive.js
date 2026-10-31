import { useLayoutEffect, useRef } from 'react'
import { createWhiskerDrive } from './whiskerDrive.js'

// Усы кота сцены (SceneRenderer.jsx → Cat): active = «кот говорит и сцена не на паузе / не успокаивается» — усы плавно выходят (false → true) и плавно доезжают до покоя (true → false), см. whiskerDrive.js.
// Без setState: углы пишутся прямо в DOM из rAF, перерисовок React нет. enabled=false (слабое устройство, не live, флаг v2 выключен) — ничего не создаём; выключили на ходу (сцена доиграла) — усы доезжают до покоя
// мягко (stop()), а не встают рывком. Размонтирование — узла уже нет, цикл снят сразу (stop() сам видит, что корня нет).
export function useWhiskerDrive(ref, active, enabled = true) {
  const drive = useRef(null)
  useLayoutEffect(() => {
    if (!enabled || !ref.current) return undefined
    const d = createWhiskerDrive({ getRoot: () => ref.current })
    drive.current = d
    return () => { d.stop(); if (drive.current === d) drive.current = null }
  }, [ref, enabled])
  useLayoutEffect(() => { drive.current?.set(!!active && enabled) }, [active, enabled])
}
