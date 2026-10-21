import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { estimateWidthDuration } from './audioWaveParts.js'

// Короткое голосовое «подрастало» по ширине, когда длительность доезжала после
// появления пузыря (воспроизведено в Chromium, Pixel 5, CPU 4×, мета через 1,5 с:
// «We need to leave» 137 → 166 px). Теперь ширина берётся на первом кадре и не меняется
describe('ширина голосового: длительность фиксируется на первом кадре', () => {
  it('оценка по тексту: растёт с длиной, без текста — типовые 4 с', () => {
    expect(estimateWidthDuration('')).toBe(4)
    expect(estimateWidthDuration(undefined)).toBe(4)
    expect(estimateWidthDuration('x'.repeat(26))).toBeCloseTo(2)
    expect(estimateWidthDuration('x'.repeat(130))).toBeGreaterThan(estimateWidthDuration('x'.repeat(26)))
  })

  it('AudioModule считает --audio-dur от замороженного widthDur, а не от живой duration', () => {
    const src = readFileSync(fileURLToPath(new URL('./AudioModule.jsx', import.meta.url)), 'utf8')
    expect(src).toMatch(/const \[widthDur\] = useState\(\(\) => duration \|\| estimateWidthDuration\(text\)\)/)
    expect(src).toMatch(/'--audio-dur': Math\.min\(widthDur, 20\)/)
  })
})
