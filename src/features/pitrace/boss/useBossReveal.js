import { useEffect, useState } from 'react'
import { REVEAL_LINES, DEMO_START, REVEAL_AT } from './bossScale.js'

// Когда на церемонии показать шкалу (владелец 2026-11-15: «слишком рано, нужно чуть позже»): на реплике «Эй, вы за экраном, это экзамен для вашей памяти, шкала покажет…» —
// не с её начала, а на слове «шкала»: срок talk.revealMs считается по таймингам слов записи реплики (нет их — по месту слова в тексте), от реального начала звука.
// Показ — ЗАЩЁЛКА (владелец 2026-11-25: «Мия говорит: я запускаю слова, и шкала снова исчезает и начинает моргать»): раньше шкала была видна только, ПОКА Мия говорит одну из реплик
// объяснения (REVEAL_LINES), — на «я запускаю слова» (boss_mia_go, её в списке нет) шкала гасла, а со стартом круга появлялась заново с анимацией мигания. Теперь, появившись, шкала стоит,
// пока идут стадии экзамена (live): следующие реплики, пауза и сброс очереди речи её не гасят; защёлка снимается, когда экзамен кончился (live → false) — новая игра начинает без шкалы.
// talk — реплика Мии { id, key, ms, revealMs } (miaSpeech.onSpeak → useExamSpeech) или null; live — идёт стадия экзамена (церемония, круги, смена языка; пауза не в счёт).
export function useBossReveal(talk, live = true) {
  const [shown, setShown] = useState(false)
  const id = talk?.id, key = talk?.key, at = talk?.revealMs ?? Math.round((talk?.ms ?? 0) * REVEAL_AT) // revealMs — срок слова «шкала» по записи реплики (bossScale.revealAtMs, считает useExamSpeech на реальном начале звука)
  useEffect(() => {
    if (!live || !REVEAL_LINES.includes(id)) return undefined
    const t0 = id === DEMO_START ? setTimeout(() => setShown(false), 0) : 0 // церемония началась заново (после паузы): шкала снова ждёт слова «шкала»; в обычном ходе она здесь и так не видна
    const t = setTimeout(() => setShown(true), revealDelay(id, at)) // реплика объяснения началась без «…шкала покажет…» (её пропустили) — шкала появляется сразу
    return () => { clearTimeout(t0); clearTimeout(t) }
  }, [live, id, key, at])
  useEffect(() => (live ? () => setShown(false) : undefined), [live]) // экзамен кончился — защёлка снята
  return live && shown
}

/** Через сколько мс от начала реплики id показать шкалу: на «…шкала покажет…» — на слове (at), на следующих репликах объяснения — сразу; не реплика объяснения — null (шкалу не трогает) */
export const revealDelay = (id, at) => (!REVEAL_LINES.includes(id) ? null : id === DEMO_START ? Math.max(0, at) : 0)
