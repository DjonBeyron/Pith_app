import { describe, it, expect, afterEach } from 'vitest'
import { createWordEar } from './wordEarRule.js'
import { rig, W } from './wordEarTestKit.js'
import { parsePhones, setPhonesForTest } from '../../../../shared/lib/vosk/phones/phoneTable.js'
import { EN_PHONES } from '../../../../shared/lib/vosk/phones/enPhones.js'

// v3.3.185: отчёт владельца, iPhone — «house» без конца засчитан с conf 1 («я уверен, что не говорю окончания, система казуалит это»); «nice» — 20 попыток, 0 зачётов: затвор не пускал тихий звук в Vosk
describe('фонетические ловушки и сторож затвора (v3.3.185)', () => {
  afterEach(() => setPhonesForTest(null))
  const flush = () => new Promise(r => setTimeout(r, 0))
  it('таблица произношений загружена: в грамматике «house» — how и howl (а не «hous, housy»), обрубок «hau…» Vosk отдаёт как how — не засчитано; целое слово — зачёт', async () => {
    setPhonesForTest(parsePhones(EN_PHONES))
    const r = rig({ targets: ['house'], stream: true }); await r.open()
    expect(r.cur().grammar).toEqual(expect.arrayContaining(['house', 'how', 'howl']))
    for (const g of ['hous', 'housy', 'houss', 'housh']) expect(r.cur().grammar).not.toContain(g)
    expect(r.logs.find(s => s.startsWith('ловушки'))).toMatch(/^ловушки «house» по звуку \(\d+, все есть в словаре модели\): how, howl/)
    r.voice(340); r.still(); expect(r.cur().stops).toEqual(['ear'])
    r.cur().cb.onResult('how', { words: [W('how', 1, 0.36, 0.72)] })
    expect(r.hits()).toBe(0)
    expect(r.logs.at(-1)).toMatch(/^итог «how»: how — ловушка \(обрубок цели\) conf 1 — не засчитано: слово не договорено$/)
    r.advance(1); await flush(); r.still(300)
    r.voice(480); r.still(); r.cur().cb.onResult('house', { words: [W('house', 1, 0.3, 0.84)] })
    expect(r.hits()).toBe(1)
    r.l.dispose()
  })
  it('таблица догрузилась между заходами: первый заход — буквенные ловушки без проверки, следующий — уже фонетические (журнал говорит, какие и почему)', async () => {
    const r = rig({ targets: ['house'], stream: true }); await r.open()
    expect(r.cur().grammar).toContain('hous')
    expect(r.logs[0]).toMatch(/^ловушки «house» по буквам без проверки \(таблица произношений ещё не загружена; \d+\): hous, .* — которых нет в словаре модели, те она молча выбросит$/)
    setPhonesForTest(parsePhones(EN_PHONES))
    r.voice(300); r.still(); r.cur().cb.onResult('', { words: [] })
    r.advance(1); await flush()
    expect(r.cur().grammar).toContain('how'); expect(r.cur().grammar).not.toContain('hous')
    expect(r.logs.filter(s => s.startsWith('ловушки')).at(-1)).toMatch(/^ловушки «house» по звуку/)
    r.l.dispose()
  })
  it('слова нет в таблице: буквенные ловушки — только настоящие слова, не слова названы в журнале; слово без соседей — так и сказано', async () => {
    setPhonesForTest(parsePhones(EN_PHONES))
    const logs = []
    createWordEar({ targets: ['housemilk'], log: s => logs.push(s) })
    expect(logs[0]).toMatch(/^ловушки «housemilk» по буквам \(слова нет в таблице произношений; \d+ — слова, модель их примет\): house, .*; отброшены как не слова: housemil, /)
    createWordEar({ targets: ['zzyzx'], log: s => logs.push(s) })
    expect(logs.at(-1)).toMatch(/^ловушек у «zzyzx» нет \(по буквам вышли не слова: zzyz, .*\): обрубок Vosk может принять за целое слово$/)
  })
  it('сторож: затвор не пустил голос в Vosk — предупреждение с цифрами; в строке итога — сколько голоса ушло в Vosk и с каким усилением', async () => {
    const r = rig({ targets: ['nice'] }); await r.open()
    r.voice(500); r.still()
    r.cur().cb.onResult('', { words: [], voiceMs: 500, gatedVoiceMs: 430, gatedMs: 2400, agcMax: 1 })
    expect(r.logs).toContain('⚠ звук не дошёл до Vosk: затвор закрыт 430 мс из 500 мс голоса')
    const q = rig({ targets: ['nice'] }); await q.open()
    q.voice(500, 0.004); q.still()
    q.cur().cb.onResult('nice', { words: [W('nice', 1, 0.33, 0.9)], voiceMs: 516, gatedVoiceMs: 0, gatedMs: 1290, agcMax: 26.7 })
    expect(q.hits()).toBe(1)
    expect(q.logs.some(s => s.startsWith('⚠'))).toBe(false)
    expect(q.logs.at(-1)).toMatch(/^итог «nice»: nice conf 1, по Vosk 570 мс, голос \d+ мс \(ожидаю ≥ 120\) — зачёт; в Vosk ушло: голос 516 мс, усиление до ×26\.7, тишины не отдано 1290 мс$/)
    r.l.dispose(); q.l.dispose()
  })
})
