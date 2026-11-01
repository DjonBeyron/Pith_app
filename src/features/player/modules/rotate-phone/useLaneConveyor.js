import { useEffect, useRef } from 'react'
import { createConveyorDrive } from './laneConveyorDrive.js'

// React-обёртка привода конвейера (laneConveyorDrive.js): привод живёт на корне поля пилюль, команда armed ('101') и пауза приходят пропсами; на кадрах React не участвует.
export function useLaneConveyor(rootRef, { armed, paused = false, still = false }) {
  const drive = useRef(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const d = createConveyorDrive({ root, still })
    drive.current = d
    return () => { d.dispose(); if (drive.current === d) drive.current = null }
  }, [rootRef, still])
  useEffect(() => { drive.current?.setArmed(armed) }, [armed, still])
  useEffect(() => { drive.current?.setPaused(paused) }, [paused, still])
}
