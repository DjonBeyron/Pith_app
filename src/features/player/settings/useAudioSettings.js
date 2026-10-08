import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  getAudioSettings, subscribeAudioSettings, setUiSoundVolume, resetUiSoundVolumes, setEqSensitivity,
  saveUiSoundVolumes, saveEqSensitivity,
} from '../../../shared/lib/audioSettings.js'

// Глобальные настройки звука для админского блока: значения (volumes, eq) из
// audioSettings.js + правка «сразу локально, в базу — через SAVE_DELAY после
// последнего изменения». status: idle | dirty | saving | saved | error. Закрыли
// меню, не дождавшись таймера, — запись уходит при размонтировании
export const SAVE_DELAY = 600

export function useAudioSettings() {
  const state = useSyncExternalStore(subscribeAudioSettings, getAudioSettings, getAudioSettings)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const timer = useRef(0)
  const pending = useRef({ vol: false, eq: false })
  const alive = useRef(true)

  const flush = useCallback(async () => {
    timer.current = 0
    const p = pending.current
    if (!p.vol && !p.eq) return
    pending.current = { vol: false, eq: false }
    if (alive.current) setStatus('saving')
    try {
      if (p.vol) await saveUiSoundVolumes()
      if (p.eq) await saveEqSensitivity()
      if (alive.current) setStatus(pending.current.vol || pending.current.eq ? 'dirty' : 'saved')
    } catch (e) {
      pending.current = { vol: pending.current.vol || p.vol, eq: pending.current.eq || p.eq }   // следующая правка повторит
      if (alive.current) { setStatus('error'); setError(e?.message || 'не удалось сохранить') }
    }
  }, [])

  const schedule = useCallback(kind => {
    pending.current[kind] = true
    clearTimeout(timer.current)
    setStatus('dirty')
    timer.current = setTimeout(flush, SAVE_DELAY)
  }, [flush])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current) { clearTimeout(timer.current); flush() }
    }
  }, [flush])

  return {
    volumes: state.volumes,
    eq: state.eq,
    status,
    error,
    setVolume: (name, v) => { setUiSoundVolume(name, v); schedule('vol') },
    resetVolumes: () => { resetUiSoundVolumes(); schedule('vol') },
    setEq: v => { setEqSensitivity(v); schedule('eq') },
  }
}
