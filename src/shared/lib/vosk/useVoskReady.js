import { useState, useEffect, useCallback, useRef } from 'react'
import { voskRuntime } from './voskRuntime.js'
import { runtimeOf } from './voskRuntimes.js'
import { forceBackground } from './voskBackground.js'
import { useBgStatus, onBgCached } from './voskBgStatus.js'
import { readyView } from './voskReadyView.js'

// «Готовность Vosk» для экрана, которому нужно распознавание речи: держит прогрев модели, пока экран открыт, и сообщает, что с ней (voskReadyView.js).
// Один механизм для всех мест (мини-игра «Скажи вслух», дальше «Сказать фразу»): не готова — уведомление «Нужно скачать» (VoskReadyNotice.jsx),
// кнопка «Скачать» запускает загрузку сразу (forceBackground: не ждёт «тишины», но не качает офлайн), прогресс берётся из фоновой загрузки. Системное распознавание не подставляется.
// Модель докачалась, пока ждали, — прогрев запускается заново сам (attempt). Сбой — «Ещё раз» снимает паузу после сбоя (warmNow) и пробует снова.
// lang 'ru' — русская модель (игра «Встряхни память», проход «назови перевод»): свой прогрев, кэш, загрузка и статус. hold: false — модель в память НЕ грузим, экрану важно только «скачана ли»
// (две модели в памяти iPhone вместе не держим: русскую загружает переключатель игры в нужный момент, raceSwitch.js). on: false — хук ничего не делает (экран без этой модели).
export const READY_WAIT_MS = 25000

export function useVoskReady({ runtime, why = 'say-aloud', lang = 'en', hold = true, on = true } = {}) {
  const rt = runtime ?? (lang === 'en' ? voskRuntime : runtimeOf(lang))
  const bg = useBgStatus(lang)
  const [asked, setAsked] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [res, setRes] = useState({ attempt: -1, result: null })

  useEffect(() => {
    if (!on) return undefined
    let alive = true
    if (!hold) { // только проверка кэша: в память не грузим, держателем не становимся
      rt.checkCached().then(ok => { if (alive) setRes({ attempt, result: ok ? { ok: true } : { ok: false, reason: 'no-model', text: '' } }) })
      return () => { alive = false }
    }
    const release = rt.acquire(why)
    rt.whenSettled(READY_WAIT_MS).then(result => { if (alive) setRes({ attempt, result }) })
    return () => { alive = false; release() }
  }, [rt, why, attempt, hold, on])

  const result = res.attempt === attempt ? res.result : null
  // Докачка закончилась, пока ждали «нет модели» — перезапускаем прогрев (в остальное время, например при первой проверке кэша на старте приложения, экран не трогаем)
  const waitsModel = !!result && !result.ok && result.reason === 'no-model'
  const waitsRef = useRef(false)
  useEffect(() => { waitsRef.current = waitsModel }, [waitsModel])
  useEffect(() => onBgCached(() => { if (waitsRef.current) setAttempt(n => n + 1) }, lang), [lang])

  const download = useCallback(() => { setAsked(true); forceBackground({ lang }).catch(() => {}) }, [lang])
  const retry = useCallback(() => { rt.warmNow('manual'); setAttempt(n => n + 1) }, [rt])
  return { ...readyView({ result, bg, asked }), lang, download, retry }
}
