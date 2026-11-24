import { describe, it, expect } from 'vitest'
import { listenBlocks } from './timelineListen.js'
import { voiceOf } from './timelineVoice.js'

const L = (t, who, id, o = {}) => ({ t, end: t + 1000, who, id, text: o.text ?? id, ms: 1000, silent: !!o.silent, mouth: true, ...o })
const m = {
  stages: [{ t: 1000, end: 5000, sid: 'sprint3-ann', title: '' }, { t: 5000, end: 9000, sid: 'boss', title: '' }],
  lines: [L(500, 'pit', 'race_start'), L(1200, 'pit', 'pit_forgot'), L(2500, 'mia', 'mia_push'), L(3000, 'pit', 'well_done'), L(3500, 'mia', 'mia_ok_1', { silent: true }), L(6000, 'dictor', 'meet', { text: 'meet' }), L(7000, 'mia', 'boss_mia_hush')],
}
const ofLine = l => (l.id === 'pit_forgot' ? { url: 'u', duration: 2 } : { url: l.id === 'mia_push' ? 'u2' : null, why: 'нет озвучки (подпись)' })

describe('актуальный текст (v3.3.360)', () => {
  const m2 = {
    stages: [{ t: 0, end: 5000, sid: 'sprint3-ann', title: '' }, { t: 5000, end: 9000, sid: 'phrases-demo', title: '' }],
    lines: [L(500, 'mia', 'mia_push', { text: 'СТАРЫЙ ТЕКСТ' }), L(1000, 'pit', 'pit_gone_old_id'), L(6000, 'mia', 'mia_push')],
  }
  const b = listenBlocks(m2, l => ({ url: 'u', duration: 1, changed: l.text === 'СТАРЫЙ ТЕКСТ' }))
  it('текст берётся из текущего каталога, удалённый id и вырезанный этап скрыты', () => {
    expect(b).toHaveLength(1)
    expect(b[0].items.map(i => i.line.id)).toEqual(['mia_push'])
    expect(b[0].items[0].line.text).toMatch(/Посиди в коробке/)
  })
})

describe('блоки прослушивания: только «Встряхни память», по стадиям, в порядке игры', () => {
  const b = listenBlocks(m, ofLine)
  it('до первой стадии и две стадии; чужая реплика (well_done другой игры) и «без звука» не берутся', () => {
    expect(b.map(x => x.items.map(i => i.line.id))).toEqual([['race_start'], ['pit_forgot', 'mia_push'], ['meet', 'boss_mia_hush']])
    expect(b[0].title).toBe('до первой стадии')
  })
  it('в блоке: сколько с озвучкой и сколько секунд', () => {
    expect(b[1]).toMatchObject({ playable: 2, sec: 2 + 1 }) // у mia_push нет duration в настройках — берётся длина реплики 1 с
    expect(b[2].playable).toBe(0)
  })
  it('пустая модель — пустой список', () => { expect(listenBlocks(null, ofLine)).toEqual([]) })
})

describe('текст, поправленный в админке (custom), не считается «старым»', () => {
  const m3 = { stages: [{ t: 0, end: 5000, sid: 'sprint3-ann', title: '' }], lines: [L(500, 'mia', 'mia_push')] }
  const mk = rec => listenBlocks(m3, l => voiceOf(l, { status: 'ready', lines: { mia_push: rec } }))[0].items[0]
  it('custom: показан его текст, озвучка с тем же said — не stale', () => {
    const x = mk({ url: 'u', text: 'мой текст', said: 'мой текст', custom: true })
    expect(x.line.text).toBe('мой текст'); expect(x.stale).toBe(false)
  })
  it('без custom: файл говорит старое — stale; говорит текущее — нет', () => {
    expect(mk({ url: 'u', text: 'старый', said: 'старый' }).stale).toBe(true)
    expect(mk({ url: 'u', text: 'Посиди в коробке, пушистик, дальше командую я', said: 'Посиди в коробке, пушистик, дальше командую я' }).stale).toBe(false)
  })
})
