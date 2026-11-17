import { describe, it, expect } from 'vitest'
import { createStudentGame, stepStudent } from './wordLaneStudent.js'
import { buildRecipe } from './wordLaneRecipe.js'

// Остаток принятой реплики — не промах (владелец, v3.3.270: Мия говорила «мимо» на верный ответ): слушатель выдал «[unk] помнить» — «[unk]» счёт промахов увеличил, «помнить» принято в том же кадре.
const DT = 16
const step = buildRecipe(["I'm", 'trying', 'to learn']).rounds[0].steps[0]

/** Прогон: в кадре at слушатель отдаёт слово 0 и (miss) ещё один промах; → события кадра at */
function frame(at, { hit = true, miss = false } = {}) {
  const g = createStudentGame({ step, chunks: ["I'm", 'trying', 'to learn'] })
  const seq = []; let misses = 0, out = []
  for (let t = 0; t <= at; t += DT) {
    if (t === at) { if (hit) seq.push(0); if (miss) misses += 1 }
    const ev = stepStudent(g, t, { level: 0, seq, misses })
    if (t === at) out = ev
  }
  return out
}
const types = ev => ev.map(e => e.type)

describe('принятое слово и шум в одной реплике', () => {
  it('слово принято и в том же кадре счёт промахов вырос — это один ответ: claim есть, miss нет', () => {
    const t = types(frame(3008, { hit: true, miss: true }))
    expect(t).toContain('claim'); expect(t).not.toContain('miss')
  })
  it('промах без принятого слова остаётся промахом (пилюля едет, слушатель услышал не то)', () => {
    const t = types(frame(3008, { hit: false, miss: true }))
    expect(t).toContain('miss'); expect(t).not.toContain('claim')
  })
  it('счёт промахов шумом не «копится» на следующий кадр: после принятого слова miss не приходит и позже', () => {
    const g = createStudentGame({ step, chunks: ["I'm", 'trying', 'to learn'] })
    const seq = []; let misses = 0; const all = []
    for (let t = 0; t <= 4000; t += DT) {
      if (t === 3008) { seq.push(0); misses += 1 }
      all.push(...stepStudent(g, t, { level: 0, seq, misses }).map(e => e.type))
    }
    expect(all).toContain('claim'); expect(all).not.toContain('miss')
  })
})
