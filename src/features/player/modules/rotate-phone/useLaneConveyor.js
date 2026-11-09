import { useEffect, useRef } from 'react'
import { createConveyorDrive } from './laneConveyorDrive.js'
import { raceChron } from '../../../pitrace/raceStartChron.js'

// React-обёртка привода конвейера (laneConveyorDrive.js): привод живёт на корне поля пилюль, команда armed ('101') и пауза приходят пропсами; на кадрах React не участвует.
export function useLaneConveyor(rootRef, { armed, paused = false, still = false, speed = null, speedKey = null, fx = null }) {
  const drive = useRef(null)
  const fxRef = useRef(fx) // директор игры: pitLeft — сколько мс Пит ещё говорит (замедление между этапами длится, пока он рассказывает про следующий)
  useEffect(() => { fxRef.current = fx })
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const d = createConveyorDrive({ root, still, talk: () => fxRef.current?.pitLeft?.() ?? 0 })
    drive.current = d
    return () => { d.dispose(); if (drive.current === d) drive.current = null }
  }, [rootRef, still])
  useEffect(() => { drive.current?.setArmed(armed); if (/[12]/.test(armed ?? '')) raceChron.step('conveyor', `конвейер зажёгся: дорожки поехали (${armed})`) }, [armed, still]) // хронология старта гонки: первый ход конвейера
  useEffect(() => { drive.current?.setPaused(paused) }, [paused, still])
  useEffect(() => { drive.current?.setSpeedHint(speed, speedKey) }, [speed, speedKey, still]) // скорость первой пилюли ближайшей стадии разгона: дорожки набирают её заранее
}
