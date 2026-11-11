import { describe, it, expect } from 'vitest'
import { renderTable, rowOk, groupOf, levelCheck } from './voiceSetTable.js'

// Таблица прогона набора: что считается верным, сводка по видам и словам, провалы с услышанным и причиной, сверка уровней
const base = { rep: 1, far: false, tapPeak: 0.006, rmsPeak: 0.006, tapNoise: 0.0001, rmsNoise: 0.0001, tapRms: 0.002, clipRms: 0.002, engPeak: 0.02, gamePeak: 0.02, partials: [], finals: [], ear: [] }
const word = (i, text, variant, hit, extra = {}) => ({ ...base, i, file: `clips/${String(i + 1).padStart(3, '0')}_${text}_${variant}_1.wav`, kind: 'word', text, variant, expect: variant === 'nolast' || variant === 'half' ? 'none' : 'hit', hit, hitAt: hit ? 1500 : null, fromEndMs: hit ? 320 : null, ...extra })
const rows = [
  word(1, 'house', 'whole', true), word(2, 'house', 'quiet', true, { fromEndMs: 400 }), word(3, 'house', 'nolast', false),
  word(4, 'milk', 'whole', true), word(5, 'milk', 'quiet', false, { partials: [[900, 'mill']], finals: [{ t: 1400, text: 'mill', by: 'ear', words: [{ w: 'mill', conf: 0.76 }] }], ear: ['1400 итог «mill»: ловушка — не засчитано: слово не договорено'], engPeak: 0.0045, gamePeak: 0.0047, manifestVoiceMs: 325 }),
  word(6, 'milk', 'nolast', true, { finals: [{ t: 1300, text: 'milk', by: 'ear', words: [{ w: 'milk', conf: 0.9 }] }] }),
  word(7, 'milk', 'whole', true, { far: true }),
  { ...base, i: 8, file: 'clips/009_see-you-later_whole_1.wav', kind: 'phrase', text: 'See you later', variant: 'whole', expect: 'hit', hit: true, ratio: 1, hitAt: 2000, fromEndMs: 150, drafts: [[800, 'see you']], log: [] },
  { ...base, i: 9, file: 'clips/010_see-you-later_cutlast_1.wav', kind: 'phrase', text: 'See you later', variant: 'cutlast', expect: 'none', hit: true, ratio: 0.67, hitAt: 3000, fromEndMs: 900, drafts: [], log: [] },
  { ...base, i: 0, file: 'clips/001_silence_long_1.wav', kind: 'long', text: 'silence', variant: 'long', expect: 'none', hit: false, target: 'nice' },
]

describe('таблица прогона набора', () => {
  it('верно: слово — как ожидали; фраза целиком — только чистый зачёт; недоговорённая — чистого быть не должно', () => {
    expect(rows.map(rowOk)).toEqual([true, true, true, true, false, false, true, true, true, true])
    expect(rowOk({ kind: 'phrase', expect: 'hit', hit: true, ratio: 0.75 })).toBe(false)
    expect(rowOk({ kind: 'phrase', expect: 'none', hit: true, ratio: 1 })).toBe(false)
    expect(rowOk({ kind: 'noise', expect: 'none', hit: true })).toBe(false)
    expect([groupOf(rows[0]), groupOf(rows[6]), groupOf(rows[7]), groupOf(rows[9])]).toEqual(['whole', 'whole-far', 'phrase whole', 'long'])
  })
  it('сводка по видам и словам, провалы с тем, что услышал Vosk, и причиной из журнала, итог', () => {
    const t = renderTable(rows, { title: 'iPhone iOS 18.7, v3.3.188', micGain: 2, bed: 'тишина набора', hf: true })
    expect(t).toMatch(/whole\s+должно: зачёт\s+зачтено 2\/2\s+✓\s+зачёт от конца голоса, мс: медиана 320 \(320…320\)/)
    expect(t).toMatch(/quiet\s+должно: зачёт\s+зачтено 1\/2\s+✗ неверно 1/)
    expect(t).toMatch(/nolast\s+должно: нет зачёта\s+зачтено 1\/2\s+✗ неверно 1/)
    expect(t).toMatch(/whole-far\s+должно: зачёт\s+зачтено 1\/1\s+✓/)
    expect(t).toMatch(/phrase cutlast\s+должно: не чисто \/ нет\s+зачтено 1\/1\s+✓/)
    expect(t).toMatch(/house\s+1\/1\s+· 1\/1\s+· 0\/1\s+· 0\/0\s*\n/)
    expect(t).toMatch(/milk\s+1\/1\s+· 0\/1\s+· 1\/1\s+· 1\/1\s+✗/)
    expect(t).toContain('== Провалы (2 из 10)')
    expect(t).toContain('#006 clips/006_milk_quiet_1.wav «milk» — ждали: зачёт, вышло: нет зачёта')
    expect(t).toContain('черновики: mill; итог: «mill» (mill 0,76) ear')
    expect(t).toContain('причина: итог «mill»: ловушка — не засчитано: слово не договорено')
    expect(t).toContain('#007 clips/007_milk_nolast_1.wav «milk» — ждали: нет зачёта, вышло: зачёт на 1500 мс')
    expect(t).toContain('ИТОГО: верно 8 из 10 (80 %)')
    expect(t).toContain('поправка тракта (шум выше 9,5 кГц по огибающей исходного звука): да')
  })
  it('сверка уровней: медиана, разброс и число клипов вне ±10 %; с усилением ×1 — уровень движка против сырого звука', () => {
    const a = levelCheck(rows, 2)
    expect(a[0]).toBe('rms всего клипа (вход прогонщика / огибающая манифеста): медиана ×1,00, 5–95 %: ×1,00…×1,00, вне ±10 %: 0 из 10')
    expect(a.at(-1)).toMatch(/^пик после усиления игры .*вне ±10 %: 0 из 10$/)
    const b = levelCheck(rows.map((r, k) => ({ ...r, engRms: k ? 0.0021 : 0.003, engPeak: 0.0061 })), 1)
    expect(b[3]).toMatch(/уровень ДВИЖКА без усиления: rms клипа .*медиана ×1,05.*вне ±10 %: 1 из 10/)
    expect(b[4]).toMatch(/пик \(движок \/ rmsPeak манифеста\): медиана ×1,02/)
    expect(levelCheck([{ tapPeak: 0, rmsPeak: 0 }])[1]).toMatch(/нет данных/)
  })
})
