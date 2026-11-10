import { useState, useEffect, useCallback } from 'react'
import { onGameMicLost, peekGameMic, dropGameMic, openGameMic } from '../../shared/lib/gameMic.js'
import { renewGameMic } from '../../shared/lib/gameMicRenew.js'
import { waitUnmute } from '../../shared/lib/gameMicKeep.js'
import { createMicHealth } from './standMicHealth.js'

// «Здоровье микрофона» стенда пилюль (standMicHealth.js) в React: пока микрофон стенда включён (on), слушает трассу (уровень ровно 0 — 'level' с z, status 'dead' слушателя слов и фраз,
// конец захода цели) и сигналы игрового потока (onGameMicLost: mute / ended дорожки). Оживил — onRevived(how) (стенд перезапускает слушатель той же цели). → { health, tap } — tap зовётся из нажатия.
const trackInfo = () => {
  try { const t = peekGameMic()?.getAudioTracks?.()[0]; return t ? { readyState: t.readyState, muted: !!t.muted, enabled: t.enabled } : { readyState: 'нет потока' } } catch { return {} }
}
const isDead = e => (e.k === 'wl' && e.kind === 'status' && e.status === 'dead') || (e.k === 'listen' && e.status === 'dead')

export default function useStandMicHealth({ trace, on, onRevived }) {
  const [health, setHealth] = useState({ state: 'ok', why: '', attempts: 0 })
  const [h] = useState(() => createMicHealth({
    trace, tracks: trackInfo, onState: setHealth, onRevived, // стабильный (useCallback у стенда): здоровье создаётся один раз
    renew: why => renewGameMic({ why: `[mic] стенд: ${why}` }),
    reopen: () => { dropGameMic(); return openGameMic() }, // в тапе плашки: getUserMedia в жесте
    waitUnmute: () => waitUnmute(peekGameMic()),
  }))
  useEffect(() => {
    if (!on) return undefined
    const off = trace.subscribe(e => { if (e.k === 'level') h.level(e.z ? 0 : 1); else if (isDead(e)) h.dead('dead'); else if (e.k === 'run-stop') h.idle() })
    const lost = onGameMicLost((kind, info) => { if (!info?.idle) h.dead(kind === 'ended' ? 'ended' : 'mute') })
    return () => { off(); lost(); h.idle() }
  }, [on, trace, h])
  const tap = useCallback(() => h.tap(), [h])
  return { health, tap }
}
