import { useEffect, useState } from 'react'
import { ARR } from './miaMotion.js'

// Плашка Мии («Допрос у Мии» / «Шкала памяти») показывается, только когда Мия говорит за кадром (владелец, v3.3.271): от первой реплики из-за правого края (mia_push, boss_mia_hush) до её прыжка
// на коробку (jumpAt стадии — секунды от падения коробки, m.at; у обычной церемонии — ARR.JUMP). Пока плашка стоит, дорожки плавно желтеют и конвейер ускоряется (go → WordLaneGame / miaTint).
// Раньше плашка шла отдельной стадией до церемонии и уходила раньше, чем Мия заговорила. Чистая часть — jumpMsAt: когда плашка гаснет (по часам performance.now).
export const SPEED_ID = 'mia_announce_2' // «Это не важно, я ускоряю игру…» (сценарий владельца 2026-11-24: склеены «А ты, за экраном…» и «Я ускоряю игру…»; v3.3.272): только с этой реплики дорожки желтеют и ускоряются
export const OFFSCREEN_IDS = ['mia_push', 'boss_mia_hush'] // реплики Мии из-за правого края (она ещё не прыгнула): справа дуги звука (RaceMia.jsx)

/** Когда (performance.now, мс) плашка гаснет: падение коробки at + секунды до прыжка jumpAt (по умолчанию ARR.JUMP) */
export const plateEndAt = (at, jumpAt) => (Number(at) || 0) + (Number(jumpAt ?? ARR.JUMP) || 0) * 1000

/** → { go, started, speedUp }: speedUp — Мия сказала «я ускоряю игру» (конвейер набирает скорость круга с Мией); go — плашка на экране (Мия говорит за кадром, до прыжка), started — Мия уже заговорила за кадром на этой церемонии (дорожки желтеют, конвейер ускоряется). talk — реплика Мии сейчас ({ id }), m — состояние машины Мии, stage — стадия церемонии (mia: 'ann') */
export function useMiaPlate({ talk, m, stage }) {
  const [win, setWin] = useState(null) // { seq, end } — окно плашки этого прихода (end — конец по performance.now)
  const [over, setOver] = useState(-1)  // seq прихода, у которого прыжок уже был (плашка погашена)
  const id = talk?.id, seq = m?.seq, at = m?.at, ann = stage?.mia === 'ann' && m?.phase === 'in', jump = m?.jump ?? stage?.jumpAt
  useEffect(() => {
    if (!ann || !OFFSCREEN_IDS.includes(id)) return undefined
    const t = setTimeout(() => setWin(w => (w?.seq === seq ? w : { seq, end: plateEndAt(at, jump) })), 0)
    return () => clearTimeout(t)
  }, [ann, id, seq, at, jump])
  const end = win?.seq === seq ? win.end : 0
  useEffect(() => {
    if (!ann || !end) return undefined
    const t = setTimeout(() => setOver(seq), Math.max(0, end - performance.now())) // момент прыжка: плашка гаснет
    return () => clearTimeout(t)
  }, [ann, end, seq])
  const [fastSeq, setFastSeq] = useState(-1) // seq прихода, на котором Мия сказала «ускоряю игру» (mia_announce_2)
  useEffect(() => {
    if (!ann || id !== SPEED_ID) return undefined
    const t = setTimeout(() => setFastSeq(seq), 0)
    return () => clearTimeout(t)
  }, [ann, id, seq])
  const started = ann && !!end
  return { go: started && over !== seq, started, speedUp: ann && fastSeq === seq }
}
