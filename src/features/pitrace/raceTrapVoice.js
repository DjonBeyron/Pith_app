// Голос ловушки «Вершины» (CONCEPT_RACE.md): Пит говорит «это {двойник}, а нужно {слово}». Реплики с подстановкой целиком не озвучиваются (как «Начни с» + слово в rehearsalHints.js), поэтому четыре куска идут один за другим:
// race_trap_pre «это» → двойник голосом из библиотеки слов → race_trap_mid «а нужно» → слово голосом. Подпись на плашке — полная («это earn, а нужно learn»). Нет озвучки «это» или «а нужно» (или Пит занят) — одна
// короткая реплика race_trap_short «мимо, это двойник» с той же полной подписью. Часы и голос приходят аргументами.
import { lineMs } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'

export const TRAP_GAP_MS = 150 // пауза между кусками

/** → cancel(): снимает ещё не сказанные куски. lines — реплики (url озвучки), rate — скорость озвучки, sayLine(id, vars) → принята ли, sayText(слово) — слово из библиотеки слов */
export function sayTrap({ said, word, lines, rate = 1, sayLine, sayText, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const pre = lines?.race_trap_pre, mid = lines?.race_trap_mid
  const caption = `это ${said}, а нужно ${word}`
  const r = rate > 0 ? rate : 1
  if (!(pre?.url && mid?.url && sayLine('race_trap_pre', { caption }))) { sayLine('race_trap_short', { caption }); return () => {} }
  const t1 = lineMs(pre, rate) + TRAP_GAP_MS
  const t2 = t1 + estChunkMs(said) / r + TRAP_GAP_MS
  const t3 = t2 + lineMs(mid, rate) + TRAP_GAP_MS
  const ids = [setTimer(() => sayText(said), t1), setTimer(() => sayLine('race_trap_mid', { caption }), t2), setTimer(() => sayText(word), t3)]
  return () => ids.forEach(id => clearTimer(id))
}
