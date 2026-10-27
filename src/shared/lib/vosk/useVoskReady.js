import { useState, useEffect, useCallback, useRef } from 'react'
import { voskRuntime } from './voskRuntime.js'
import { forceBackground } from './voskBackground.js'
import { useBgStatus, onBgCached } from './voskBgStatus.js'
import { readyView } from './voskReadyView.js'

// «Готовность Vosk» для экрана, которому нужно распознавание речи: держит прогрев модели, пока экран открыт, и сообщает, что с ней (voskReadyView.js).
// Один механизм для всех мест (мини-игра «Скажи вслух», дальше «Сказать фразу»): не готова — уведомление «Нужно скачать» (VoskReadyNotice.jsx),
// кнопка «Скачать» запускает загрузку сразу (forceBackground: не ждёт «тишины», но не качает офлайн), прогресс берётся из фоновой загрузки. Системное распознавание не подставляется.
// Модель докачалась, пока ждали, — прогрев запускается заново сам (attempt). Сбой — «Ещё раз» снимает паузу после сбоя (warmNow) и пробует снова.
export const READY_WAIT_MS = 25000

export function useVoskReady({ runtime = voskRuntime, why = 'say-aloud' } = {}) {
  const bg = useBgStatus()
  const [asked, setAsked] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [res, setRes] = useState({ attempt: -1, result: null })

  useEffect(() => {
    const release = runtime.acquire(why)
    let alive = true
    runtime.whenSettled(READY_WAIT_MS).then(result => { if (alive) setRes({ attempt, result }) })
    return () => { alive = false; release() }
  }, [runtime, why, attempt])

  const result = res.attempt === attempt ? res.result : null
  // Докачка закончилась, пока ждали «нет модели» — перезапускаем прогрев (в остальное время, например при первой проверке кэша на старте приложения, экран не трогаем)
  const waitsModel = !!result && !result.ok && result.reason === 'no-model'
  const waitsRef = useRef(false)
  useEffect(() => { waitsRef.current = waitsModel }, [waitsModel])
  useEffect(() => onBgCached(() => { if (waitsRef.current) setAttempt(n => n + 1) }), [])

  const download = useCallback(() => { setAsked(true); forceBackground().catch(() => {}) }, [])
  const retry = useCallback(() => { runtime.warmNow('manual'); setAttempt(n => n + 1) }, [runtime])
  return { ...readyView({ result, bg, asked }), download, retry }
}
