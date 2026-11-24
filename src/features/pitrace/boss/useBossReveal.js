import { useEffect, useState } from 'react'
import { REVEAL_LINES, DEMO_START, REVEAL_AT } from './bossScale.js'

// Когда на церемонии показать шкалу (владелец 2026-11-15: «слишком рано, нужно чуть позже»): на реплике «Эй, вы за экраном, это экзамен для вашей памяти, шкала покажет…» —
// не с её начала, а на слове «шкала»: срок talk.revealMs считается по таймингам слов записи реплики (нет их — по месту слова в тексте), от реального начала звука; на следующих репликах объяснения
// шкала уже видна. talk — реплика Мии { id, key, ms, revealMs } (miaSpeech.onSpeak → useExamSpeech) или null.
export function useBossReveal(talk) {
  const [armed, setArmed] = useState(null) // key реплики «видите шкалу», на которой пришло время показать шкалу
  const id = talk?.id, key = talk?.key, at = talk?.revealMs ?? Math.round((talk?.ms ?? 0) * REVEAL_AT) // revealMs — срок слова «шкала» по записи реплики (bossScale.revealAtMs, считает useExamSpeech на реальном начале звука)
  useEffect(() => {
    if (id !== DEMO_START) return undefined
    const t = setTimeout(() => setArmed(key), at)
    return () => clearTimeout(t)
  }, [id, key, at])
  return REVEAL_LINES.includes(id) && (id !== DEMO_START || armed === key)
}
