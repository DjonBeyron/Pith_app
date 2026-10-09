import { useState, useEffect, useCallback, useRef } from 'react'
import { readCaptureMode, writeCaptureMode, isCaptureMode } from './speechCapture.js'
import { createCaptureManager, idleCapture } from './speechCaptureManager.js'

// React-обвязка режимов захвата пробы «Голос»: выбранный режим (localStorage), менеджер потока микрофона и его состояние
// (уровень/пик для полоски). Менеджер отдаётся в useSpeechProbe; освобождение микрофона — на pagehide и размонтировании.
export function useSpeechCapture() {
  const [mode, setModeState] = useState(readCaptureMode)
  const [state, setState] = useState(idleCapture)
  const modeRef = useRef(mode) // актуальный режим для контроллера (читается в тапе, не при рендере)
  const [manager] = useState(() => createCaptureManager({
    getUserMedia: c => navigator.mediaDevices.getUserMedia(c), // синхронно в жесте; если mediaDevices нет — бросит, менеджер поймает
    createAudioContext: () => new (window.AudioContext || window.webkitAudioContext)(),
    onState: setState,
  }))

  const setMode = useCallback(m => {
    if (!isCaptureMode(m)) return
    modeRef.current = m
    setModeState(m)
    setState(idleCapture) // прошлый пик относился к другому режиму
    writeCaptureMode(m)
  }, [])

  useEffect(() => {
    const free = () => manager.close()
    window.addEventListener('pagehide', free)
    return () => { window.removeEventListener('pagehide', free); free() }
  }, [manager])

  const getMode = useCallback(() => modeRef.current, [])
  return { mode, setMode, state, manager, getMode }
}
