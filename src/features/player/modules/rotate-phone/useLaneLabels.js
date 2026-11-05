import { useState, useEffect } from 'react'
import { labelsFor } from './wordLaneStages.js'
import { builtLanes, nextLabels, nextFrames, clearFrames, initFrames, EMPTY_MEM, FRAME_MS, FRAME_LITE_MS } from './wordLaneLabels.js'

// Хуки подписей дорожек (решения — wordLaneLabels.js).
/** Подписи стадии с памятью акта: в «Сборке с конца» накапливаются, остальные — как у labelsFor. stage — стадия, чьи подписи видны (под плашкой раунда — следующая), quiet — Пит говорит реплику: подписи стадии скрыты, но уже показанные в акте остаются */
export function useBuiltLabels({ stages, stage, quiet, chunks, lanes, hint }) {
  const [mem, setMem] = useState(EMPTY_MEM)
  const base = labelsFor(quiet ? null : stage, chunks, lanes, hint)
  const next = nextLabels(mem, { base, act: stage?.act ?? null, reached: builtLanes(stages, stage) })
  if (next.mem !== mem) setMem(next.mem) // производное состояние: пересчёт сразу, без лишнего кадра с прежними подписями
  return next.labels
}

/** Рамка новых подписей: → массив на дорожку (0 — рамки нет, 1 / 2 — идёт; значение — для data-new). heads — то, что показано сейчас, lite — слабое устройство (рамка без анимации на 1 с) */
export function useLabelFrames(heads, lite) {
  const [st, setSt] = useState(() => initFrames(heads))
  const next = nextFrames(st, heads)
  if (next !== st) setSt(next)
  useEffect(() => {
    if (!st.seq) return undefined
    const t = setTimeout(() => setSt(s => clearFrames(s, st.seq)), lite ? FRAME_LITE_MS : FRAME_MS)
    return () => clearTimeout(t)
  }, [st.seq, lite])
  return next.nw
}
