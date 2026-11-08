import { describe, it, expect, vi } from 'vitest'
import { createFillLog, FILL_LOG_EVERY_MS } from './racePhraseFillLog.js'
import { createSayTrace } from './racePhraseSayTrace.js'
import { barText, mountDebugBar, debugBarOn } from './racePhraseDebugBar.js'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubDraft, stubSay } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { compactText } from '../player/modules/rotate-phone/wordLaneJournal.js'

// Дебаг заливки «Скажи» (замечание владельца 7): журнал [fill] и отладочная полоска под пилюлей (только с флагом отладки)
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
const fakeDoc = () => { const doc = { made: [], createElement: () => { const n = { style: {}, attrs: {}, textContent: '', setAttribute(k, x) { n.attrs[k] = x }, remove: vi.fn() }; doc.made.push(n); return n } }; return doc }

describe('журнал [fill]', () => {
  it('смена цели — с причиной и временем от выезда; пока экран догоняет — не чаще 250 мс; взлёт — от последнего слова до 100 %', () => {
    const lines = [], f = createFillLog({ log: x => lines.push(x) })
    f.start(1000)
    f.frame(1016, 0, 0); expect(lines).toEqual([])
    f.word({ index: 1, text: 'to', draft: true }, 1240); f.frame(1240, 0.5, 0.31)
    expect(lines.at(-1)).toBe('[fill] +240 мс: слово 2 «to» черновик → цель 0,50, экран 0,31')
    f.frame(1300, 0.5, 0.4); expect(lines).toHaveLength(1)
    f.frame(1240 + FILL_LOG_EVERY_MS, 0.5, 0.42); expect(lines.at(-1)).toBe('[fill] экран 0,42 → 0,50')
    f.frame(1600, 0.5, 0.5); expect(lines).toHaveLength(2) // догнал — тишина
    f.phrase(1); f.frame(1700, 1, 0.6); expect(lines.at(-1)).toBe('[fill] +700 мс: итог фразы, слов 100 % → цель 1,00, экран 0,60')
    f.full(1900, 1500); f.rise(2020); expect(lines.at(-1)).toBe('[fill] 100 % через 400 мс после последнего слова, взлёт +1020 мс')
    f.end(); expect(lines.at(-1)).toBe('[fill] итог хода: слов 1, первое слово через 240 мс, 100 % через 660 мс после последнего, макс. пауза 0 мс') // слово 2 впервые на 1240 (+240), 100 % — на 1900
    f.end(); expect(lines.at(-1)).toMatch(/^\[fill\] итог хода/); expect(lines.filter(l => l.includes('итог хода'))).toHaveLength(1) // сводка — один раз
  })
  it('сцена пишет [fill] на словах фразы, «Скопировать журнал» (compactText) их не выбрасывает', () => {
    const logs = [], s = setupScene(say(), { listen: createPhraseListener, log: x => logs.push(x) })
    s.go(600); stubDraft('nice'); s.go(300); stubSay('nice to meet you'); s.go(600)
    const fill = logs.filter(l => l.startsWith('[fill]'))
    expect(fill[0]).toMatch(/^\[fill\] \+\d+ мс: слово 1 «nice» черновик → цель 0,25, экран 0,\d\d$/)
    expect(fill.some(l => /итог фразы, слов 100 % → цель 1,00/.test(l))).toBe(true)
    expect(fill.at(-2)).toMatch(/^\[fill\] 100 % через \d+ мс после последнего слова, взлёт \+\d+ мс$/)
    expect(fill.at(-1)).toMatch(/^\[fill\] итог хода: слов 4, первое слово через \d+ мс, 100 % через \d+ мс после последнего, макс\. пауза \d+ мс$/)
    expect(compactText(fill.join('\n') + '\n[gate] открыт +5 мс (rms 0,040)')).toBe(fill.join('\n') + '\n[gate] открыт +5 мс (rms 0,040)')
    s.run.stop()
  })
})

describe('отладочная полоска под пилюлей «Скажи»', () => {
  it('текст: черновик, цель, экран, затвор, мс', () => {
    expect(barText({ partial: 'nice to', goal: 0.5, shown: 0.31, gate: true, ms: 1240 })).toBe('p: nice to | g 0.50 s 0.31 | gate ▮ | +1240')
    expect(barText({})).toBe('p: — | g 0.00 s 0.00 | gate ? | +0')
    expect(barText({ gate: false })).toContain('gate ▯')
  })
  it('с флагом — узел внутри пилюли, пишет только изменения и убирается на итоге; без флага — ни узла', () => {
    const doc = fakeDoc(), kids = [], el = { ownerDocument: doc, appendChild: n => kids.push(n) }
    const on = createSayTrace({ bar: true })
    on.spawn(0, el); expect(kids).toHaveLength(1); expect(kids[0].attrs['data-testid']).toBe('race-phrase-debug')
    on.ear({ kind: 'partial', text: 'nice to' }); on.ear({ kind: 'gate', open: true }); on.frame(1240, 0.5, 0.31)
    expect(kids[0].textContent).toBe('p: nice to | g 0.50 s 0.31 | gate ▮ | +1240')
    on.drop(); expect(kids[0].remove).toHaveBeenCalled(); expect(on.shown()).toBe(false)
    const off = createSayTrace({ bar: false }), d2 = fakeDoc()
    off.spawn(0, { ownerDocument: d2, appendChild: () => {} }); off.frame(10, 0.2, 0.1)
    expect(d2.made).toHaveLength(0); expect(off.shown()).toBe(false)
    expect(mountDebugBar(null)).toBeNull()
  })
  it('флаг — режим отладки игры (localStorage pithy_wl_debug_v1 или тумблер админки); без него сцена полоску не создаёт', () => {
    vi.stubGlobal('localStorage', { getItem: k => (k === 'pithy_wl_debug_v1' ? '1' : null) })
    try { expect(debugBarOn()).toBe(true) } finally { vi.unstubAllGlobals() }
    vi.stubGlobal('localStorage', { getItem: () => null })
    try { expect(debugBarOn()).toBe(false) } finally { vi.unstubAllGlobals() }
  })
})
