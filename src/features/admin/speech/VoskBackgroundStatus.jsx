import { useState, useEffect, useRef } from 'react'
import { useBgStatus, bgStatusText, getBgStatus, subscribeBgStatus } from '../../../shared/lib/vosk/voskBgStatus.js'
import { startBackground, abortBackground, resetBackgroundCache } from '../../../shared/lib/vosk/voskBackground.js'
import { isStopped, setStopped } from '../../../shared/lib/vosk/voskBgPolicy.js'

// Диагностика тихой фоновой предзагрузки модели у ВСЕХ пользователей (shared/lib/vosk/voskBackground.js): одна строка статуса,
// «Остановить / Включить» (флаг в localStorage этого устройства — планировщик его уважает) и «Сбросить кэш модели».
// Показывается только в админской лаборатории «Голос». inCache — модель лежит в кэше (по быстрой проверке блока модели);
// onChanged — перечитать статус кэша в блоке модели, когда фоновая загрузка закончилась или кэш сброшен.
export default function VoskBackgroundStatus({ inCache, locked, onChanged }) {
  const s = useBgStatus()
  const [stopped, setStoppedState] = useState(isStopped)
  const [busy, setBusy] = useState(false)
  const changed = useRef(onChanged)
  useEffect(() => { changed.current = onChanged })
  useEffect(() => subscribeBgStatus(() => { if (getBgStatus().state === 'cached') changed.current?.() }), [])

  function stop() { setStopped(true); setStoppedState(true); abortBackground() }
  function resume() { setStopped(false); setStoppedState(false); startBackground() }
  async function reset() {
    setBusy(true)
    await resetBackgroundCache()
    setBusy(false)
    changed.current?.()
  }

  const running = s.state === 'downloading' || s.state === 'waiting' || s.state === 'check'
  return (
    <div className="vkBox">
      <div className="vkStatus">Фоновая загрузка (у всех пользователей): <b>{stopped && !running ? 'выключена на этом устройстве' : bgStatusText(s, inCache)}</b></div>
      {s.state === 'downloading' && (
        <div className="vkBar" role="progressbar" aria-valuenow={s.pct ?? 0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${s.pct ?? 100}%`, opacity: s.pct == null ? 0.4 : 1 }} /></div>
      )}
      <div className="aspRow">
        {stopped
          ? <button className="aeRefresh" onClick={resume}>Включить фоновую загрузку</button>
          : <button className="aeRefresh" onClick={stop}>Остановить фоновую загрузку</button>}
        <button className="aeRefresh" disabled={locked || busy} onClick={reset}>Сбросить кэш модели</button>
      </div>
      <div className="aspHint">Стартует через 5–8 с после запуска приложения, только в простое: не на ленте, не при видео и загрузке файлов урока, не в фоне, не офлайн и не при экономии трафика. Кусками по 2 МБ с докачкой.</div>
    </div>
  )
}
