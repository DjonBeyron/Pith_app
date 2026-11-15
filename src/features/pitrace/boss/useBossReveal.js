import { useEffect, useState } from 'react'
import { REVEAL_LINES, DEMO_START, REVEAL_AT } from './bossScale.js'

// Когда на церемонии показать шкалу (владелец 2026-11-15: «слишком рано, нужно чуть позже, на словах «видите шкалу»»): на реплике «Эй, вы за экраном, видите шкалу справа?» —
// не с её начала, а через REVEAL_AT от её длины (на «видите шкалу»); на следующих репликах объяснения шкала уже видна. talk — реплика Мии { id, key, ms } (miaSpeech.onSpeak) или null.
export function useBossReveal(talk) {
  const [armed, setArmed] = useState(null) // key реплики «видите шкалу», на которой пришло время показать шкалу
  const id = talk?.id, key = talk?.key, ms = talk?.ms
  useEffect(() => {
    if (id !== DEMO_START) return undefined
    const t = setTimeout(() => setArmed(key), Math.round((ms ?? 0) * REVEAL_AT))
    return () => clearTimeout(t)
  }, [id, key, ms])
  return REVEAL_LINES.includes(id) && (id !== DEMO_START || armed === key)
}
