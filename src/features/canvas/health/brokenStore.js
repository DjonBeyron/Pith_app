import { useSyncExternalStore } from 'react'

// Какие ноды сейчас «сломаны» (useLessonHealth.js пишет, NodeMediaBadge.jsx читает): общий стор вместо пробрасывания через
// CanvasBoard → CanvasNode — холст и так у потолка размера, а метка нужна и на основном холсте, и в «Разборе» (своя копия нод)
let broken = new Map() // nodeId → reasons[]
const subs = new Set()

export function setBrokenNodes(list) {
  broken = new Map((list ?? []).map(b => [b.id, b.reasons]))
  subs.forEach(fn => fn())
}
export const brokenReasons = id => broken.get(id) ?? null
export function subscribeBroken(fn) { subs.add(fn); return () => subs.delete(fn) }
export function useNodeBroken(id) {
  return useSyncExternalStore(subscribeBroken, () => brokenReasons(id), () => null)
}
