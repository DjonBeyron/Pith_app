import { useEffect, useRef } from 'react'
import { createConveyorDrive } from './laneConveyorDrive.js'

// React-обёртка привода конвейера (laneConveyorDrive.js): привод живёт на корне поля пилюль, команда armed ('101') и пауза приходят пропсами; на кадрах React не участвует.
export function useLaneConveyor(rootRef, { armed, paused = false, still = false, speed = null, speedKey = null, onSpeed = null }) {
  const drive = useRef(null)
  const speedCb = useRef(onSpeed) // бейдж скорости («Гонка»): привод пересоздаётся только по still, колбэк берёт свежий из ref
  useEffect(() => { speedCb.current = onSpeed })
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const d = createConveyorDrive({ root, still, onSpeed: v => speedCb.current?.(v) })
    drive.current = d
    return () => { d.dispose(); if (drive.current === d) drive.current = null }
  }, [rootRef, still])
  useEffect(() => { drive.current?.setArmed(armed) }, [armed, still])
  useEffect(() => { drive.current?.setPaused(paused) }, [paused, still])
  useEffect(() => { drive.current?.setSpeedHint(speed, speedKey) }, [speed, speedKey, still]) // скорость первой пилюли ближайшей стадии разгона: дорожки набирают её заранее
}
