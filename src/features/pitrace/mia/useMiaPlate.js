import { useEffect, useState } from 'react'
import { ARR } from './miaMotion.js'
import { examPlateOn } from '../boss/lineWordAt.js'

// Плашка Мии. «Допрос у Мии» (владелец 2026-11-25: «плашку нужно показать позже, когда она уже выскочила из-за экрана»): плашка появляется, когда Мия ПРИЗЕМЛИЛАСЬ на коробку (конец её прыжка из-за
// правого края: падение коробки m.at + срок прыжка m.jump + длина прыжка ARR.JUMP_LEN; срок прыжка сам ждёт конец реплики из-за края — miaCircleEnd.jumpAfterPush), и стоит до конца церемонии
// (до круга — как плашки остальных этапов). Раньше она стояла, только пока Мия говорила за кадром, и гасла в момент прыжка: Мии на экране при плашке не было.
// «Шкала памяти» (экзамен, stage.script === 'boss') — как было (v3.3.271): от первой реплики из-за края (boss_mia_hush) до прыжка на коробку.
// v3.3.380 (владелец 2026-11-26: «плашки этапов висят слишком долго»; по журналу «Допрос» стоял ≈16 с — с приземления до конца церемонии, «Шкала памяти» ≈6,6 с — всю реплику boss_mia_look): обе плашки держатся PLATE_SHOW_MS от своего появления и уходят, не дожидаясь конца церемонии / реплики.
// started — Мия уже заговорила за кадром на этой церемонии: дорожки плавно желтеют (miaTint.miaColorOn); speedUp — она сказала «я ускоряю игру» (SPEED_ID): конвейер набирает скорость круга с Мией.
export const SPEED_ID = 'mia_announce_2' // «Это не важно, я ускоряю игру…» (сценарий владельца 2026-11-24: склеены «А ты, за экраном…» и «Я ускоряю игру…»; v3.3.272): только с этой реплики конвейер ускоряется
export const PLATE_SHOW_MS = 2000 // сколько плашка Мии («Допрос», «Шкала памяти») стоит после появления: обычная плашка этапа — plate.hold 1200 мс + нота, здесь немного дольше (Мия говорит поверх)
export const OFFSCREEN_IDS = ['mia_push', 'boss_mia_hush'] // реплики Мии из-за правого края (она ещё не прыгнула): справа дуги звука (RaceMia.jsx)

/** Когда (performance.now, мс) Мия прыгает на коробку: падение коробки at + секунды до прыжка jumpAt (по умолчанию ARR.JUMP). У экзамена в этот момент плашка гаснет */
export const plateEndAt = (at, jumpAt) => (Number(at) || 0) + (Number(jumpAt ?? ARR.JUMP) || 0) * 1000
/** Когда (performance.now, мс) Мия уже на коробке (прыжок из-за края кончился): с этого момента плашка «Допроса» на экране */
export const plateShowAt = (at, jumpAt) => plateEndAt(at, jumpAt) + ARR.JUMP_LEN * 1000
/** Плашка на экране? boss — экзамен: пока Мия говорит за кадром, до прыжка; «Допрос» — с приземления Мии до конца церемонии. ann — идёт церемония этого прихода */
export const plateOn = ({ boss, ann, started, jumped, landed, gone = false }) => !!ann && !gone && (boss ? !!started && !jumped : !!landed)
/** Когда (performance.now, мс) плашка «Допроса» уходит: через PLATE_SHOW_MS после того, как Мия приземлилась */
export const plateGoneAt = (at, jumpAt) => plateShowAt(at, jumpAt) + PLATE_SHOW_MS

/** → { go, look, started, speedUp }; look — плашка экзамена (реплика boss_mia_look идёт и ещё не прошло PLATE_SHOW_MS). talk — реплика Мии сейчас ({ id }), m — состояние машины Мии, stage — стадия церемонии (mia: 'ann') */
export function useMiaPlate({ talk, m, stage }) {
  const [spoke, setSpoke] = useState(-1)   // seq прихода, на котором Мия заговорила за кадром
  const [over, setOver] = useState(-1)     // seq прихода, у которого прыжок уже начался
  const [landed, setLanded] = useState(-1) // seq прихода, у которого Мия уже на коробке
  const [gone, setGone] = useState(-1)     // seq прихода, у которого плашка «Допроса» уже отстояла своё
  const [lookDone, setLookDone] = useState('') // key реплики boss_mia_look, плашка экзамена которой уже отстояла своё
  const id = talk?.id, seq = m?.seq, at = m?.at, ann = stage?.mia === 'ann' && m?.phase === 'in', jump = m?.jump ?? stage?.jumpAt, boss = stage?.script === 'boss'
  useEffect(() => {
    if (!ann || !OFFSCREEN_IDS.includes(id)) return undefined
    const t = setTimeout(() => setSpoke(seq), 0)
    return () => clearTimeout(t)
  }, [ann, id, seq])
  const started = ann && spoke === seq
  useEffect(() => { // срок прыжка может сдвинуться (Мия договаривает реплику из-за края): таймеры переставляются
    if (!ann) return undefined
    const now = performance.now()
    const t1 = setTimeout(() => setOver(seq), Math.max(0, plateEndAt(at, jump) - now))
    const t2 = setTimeout(() => setLanded(seq), Math.max(0, plateShowAt(at, jump) - now))
    const t3 = setTimeout(() => setGone(seq), Math.max(0, plateGoneAt(at, jump) - now))
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [ann, seq, at, jump])
  const lookKey = examPlateOn(talk) ? talk.key : null // плашка экзамена: от начала boss_mia_look; не от конца реплики (6,6 с)
  useEffect(() => {
    if (lookKey == null) return undefined
    const t = setTimeout(() => setLookDone(lookKey), PLATE_SHOW_MS)
    return () => clearTimeout(t)
  }, [lookKey])
  const [fastSeq, setFastSeq] = useState(-1) // seq прихода, на котором Мия сказала «ускоряю игру» (mia_announce_2)
  useEffect(() => {
    if (!ann || id !== SPEED_ID) return undefined
    const t = setTimeout(() => setFastSeq(seq), 0)
    return () => clearTimeout(t)
  }, [ann, id, seq])
  return { go: plateOn({ boss, ann, started, jumped: over === seq, landed: landed === seq, gone: gone === seq }), look: lookKey != null && lookDone !== lookKey, started, speedUp: ann && fastSeq === seq }
}
