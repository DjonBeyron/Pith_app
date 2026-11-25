import { useEffect, useState } from 'react'
import { ARR } from './miaMotion.js'

// Плашка Мии. «Допрос у Мии» (владелец 2026-11-25: «плашку нужно показать позже, когда она уже выскочила из-за экрана»): плашка появляется, когда Мия ПРИЗЕМЛИЛАСЬ на коробку (конец её прыжка из-за
// правого края: падение коробки m.at + срок прыжка m.jump + длина прыжка ARR.JUMP_LEN; срок прыжка сам ждёт конец реплики из-за края — miaCircleEnd.jumpAfterPush), и стоит до конца церемонии
// (до круга — как плашки остальных этапов). Раньше она стояла, только пока Мия говорила за кадром, и гасла в момент прыжка: Мии на экране при плашке не было.
// «Шкала памяти» (экзамен, stage.script === 'boss') — как было (v3.3.271): от первой реплики из-за края (boss_mia_hush) до прыжка на коробку.
// started — Мия уже заговорила за кадром на этой церемонии: дорожки плавно желтеют (miaTint.miaColorOn); speedUp — она сказала «я ускоряю игру» (SPEED_ID): конвейер набирает скорость круга с Мией.
export const SPEED_ID = 'mia_announce_2' // «Это не важно, я ускоряю игру…» (сценарий владельца 2026-11-24: склеены «А ты, за экраном…» и «Я ускоряю игру…»; v3.3.272): только с этой реплики конвейер ускоряется
export const OFFSCREEN_IDS = ['mia_push', 'boss_mia_hush'] // реплики Мии из-за правого края (она ещё не прыгнула): справа дуги звука (RaceMia.jsx)

/** Когда (performance.now, мс) Мия прыгает на коробку: падение коробки at + секунды до прыжка jumpAt (по умолчанию ARR.JUMP). У экзамена в этот момент плашка гаснет */
export const plateEndAt = (at, jumpAt) => (Number(at) || 0) + (Number(jumpAt ?? ARR.JUMP) || 0) * 1000
/** Когда (performance.now, мс) Мия уже на коробке (прыжок из-за края кончился): с этого момента плашка «Допроса» на экране */
export const plateShowAt = (at, jumpAt) => plateEndAt(at, jumpAt) + ARR.JUMP_LEN * 1000
/** Плашка на экране? boss — экзамен: пока Мия говорит за кадром, до прыжка; «Допрос» — с приземления Мии до конца церемонии. ann — идёт церемония этого прихода */
export const plateOn = ({ boss, ann, started, jumped, landed }) => !!ann && (boss ? !!started && !jumped : !!landed)

/** → { go, started, speedUp }. talk — реплика Мии сейчас ({ id }), m — состояние машины Мии, stage — стадия церемонии (mia: 'ann') */
export function useMiaPlate({ talk, m, stage }) {
  const [spoke, setSpoke] = useState(-1)   // seq прихода, на котором Мия заговорила за кадром
  const [over, setOver] = useState(-1)     // seq прихода, у которого прыжок уже начался
  const [landed, setLanded] = useState(-1) // seq прихода, у которого Мия уже на коробке
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
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [ann, seq, at, jump])
  const [fastSeq, setFastSeq] = useState(-1) // seq прихода, на котором Мия сказала «ускоряю игру» (mia_announce_2)
  useEffect(() => {
    if (!ann || id !== SPEED_ID) return undefined
    const t = setTimeout(() => setFastSeq(seq), 0)
    return () => clearTimeout(t)
  }, [ann, id, seq])
  return { go: plateOn({ boss, ann, started, jumped: over === seq, landed: landed === seq }), started, speedUp: ann && fastSeq === seq }
}
