import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { meowSet, toWav, ladder, synthMeow, VOICES, PICK, RATE, RATIOS, TARGET_RMS as MEOW_RMS, PEAK_LIMIT } from '../../../../../scripts/meow/make_meow.mjs'
import { TARGET_RMS as NOTES_RMS, NOTES, makeNoteWav, wavRms, unlockNotes, playNote, previewReward, releaseNotes } from './wordLaneNotes.js'
import { getRewardSound, setRewardSound, getRewardVolume, setRewardVolume, MEOW_PATHS, REWARD_SOUND_KEY, REWARD_VOLUME_KEY } from './wordLaneMeow.js'
import GameSoundsBlock from '../../../admin/speech/GameSoundsBlock.jsx'

const rel = p => fileURLToPath(new URL(p, import.meta.url))
const read = p => readFileSync(rel(p), 'utf8')
const rmsOf = s => Math.sqrt(s.reduce((q, x) => q + x * x, 0) / s.length)

// Скрипт синтеза «мяу»: формат, длина, громкость
describe('scripts/meow/make_meow.mjs: три мяу лесенки', () => {
  const set = meowSet(PICK)
  it('WAV: RIFF/WAVE, 22050 Гц, 16 бит, моно; размер данных сходится с длиной', () => {
    set.forEach(s => {
      const w = toWav(s)
      expect(w.toString('latin1', 0, 4)).toBe('RIFF')
      expect(w.toString('latin1', 8, 12)).toBe('WAVE')
      expect(w.readUInt16LE(22)).toBe(1)
      expect(w.readUInt32LE(24)).toBe(22050)
      expect(w.readUInt16LE(34)).toBe(16)
      expect(w.readUInt32LE(40)).toBe(s.length * 2)
      expect(w.length).toBe(44 + s.length * 2)
    })
  })
  it('длина первых двух мяу 420–520 мс, третье чуть длиннее', () => {
    const ms = set.map(s => (s.length / RATE) * 1000)
    expect(ms[0]).toBeGreaterThanOrEqual(420); expect(ms[0]).toBeLessThanOrEqual(520)
    expect(ms[1]).toBeGreaterThanOrEqual(420); expect(ms[1]).toBeLessThanOrEqual(520)
    expect(ms[2]).toBeGreaterThan(ms[1])
    Object.keys(VOICES).forEach(k => meowSet(k).slice(0, 2).forEach(s => { const m = (s.length / RATE) * 1000; expect(m).toBeGreaterThanOrEqual(420); expect(m).toBeLessThanOrEqual(520) }))
  })
  it('RMS ≈ цели 1300 (вдвое ниже прежних нот), пик ≤ 20000, начало мягкое', () => {
    expect(MEOW_RMS).toBe(1300)
    expect(NOTES_RMS / MEOW_RMS).toBeGreaterThanOrEqual(2)
    Object.keys(VOICES).forEach(k => meowSet(k).forEach(s => {
      expect(Math.abs(rmsOf(s) - MEOW_RMS) / MEOW_RMS).toBeLessThan(0.03)
      expect(s.reduce((m, x) => Math.max(m, Math.abs(x)), 0)).toBeLessThanOrEqual(PEAK_LIMIT)
      expect(Math.abs(s[0])).toBeLessThan(50)
    }))
  })
  it('на iPhone тише нот: RMS мяу ≤ 55 % RMS любой ноты (одна проверка по готовым wav из public)', () => {
    const noteRms = NOTES.map(n => wavRms(makeNoteWav(n.freqs, n.ms, n.level)))
    ;[1, 2, 3].forEach((n, k) => {
      const f = readFileSync(rel(`../../../../../public/sounds/meow-${n}.wav`))
      expect(wavRms(new Uint8Array(f))).toBeLessThanOrEqual(noteRms[k] * 0.55)
    })
  })
  it('тоны лесенки: кривая высоты ×1, ×1.26, ×1.5; результат воспроизводим; готовые wav в public совпадают со скриптом (тембр PICK)', () => {
    expect(RATIOS).toEqual([1, 1.26, 1.5])
    expect(synthMeow(VOICES.a, 1, 0)).toEqual(synthMeow(VOICES.a, 1, 0))
    set.forEach((s, k) => expect(readFileSync(rel(`../../../../../public/sounds/meow-${k + 1}.wav`)).equals(toWav(s))).toBe(true))
  })
  it('«лесенка» для прослушивания = три мяу с паузами', () => {
    expect(ladder(set).length).toBeGreaterThan(set.reduce((n, s) => n + s.length, 0))
  })
})

// Хранилище, Audio и URL подменяем
let store, created, plays
class FakeAudio {
  constructor(src) { this.src = src; this.volume = 1; created.push(this) }
  play() { plays.push({ src: this.src, volume: this.volume }); return Promise.resolve() }
  pause() {}
  load() {}
  removeAttribute() { this.src = '' }
  addEventListener() {}
}
beforeEach(() => {
  store = new Map(); created = []; plays = []
  vi.stubGlobal('localStorage', { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) })
  vi.stubGlobal('Audio', FakeAudio)
})
afterEach(() => { releaseNotes(); vi.unstubAllGlobals() })
const flush = () => new Promise(r => setTimeout(r, 0))

describe('переключатель и громкость награды', () => {
  it('по умолчанию мяу и 0.5; значения читаются и запоминаются', () => {
    expect(getRewardSound()).toBe('meow')
    expect(getRewardVolume()).toBe(0.5)
    setRewardSound('notes'); expect(getRewardSound()).toBe('notes'); expect(store.get(REWARD_SOUND_KEY)).toBe('notes')
    setRewardSound('off'); expect(getRewardSound()).toBe('off')
    setRewardVolume(0.2); expect(getRewardVolume()).toBe(0.2); expect(store.get(REWARD_VOLUME_KEY)).toBe('0.2')
  })
  it('мусор игнорируется; громкость зажата в 0…1', () => {
    setRewardSound('banana'); expect(getRewardSound()).toBe('meow')
    store.set(REWARD_SOUND_KEY, 'banana'); expect(getRewardSound()).toBe('meow')
    store.set(REWARD_VOLUME_KEY, 'abc'); expect(getRewardVolume()).toBe(0.5)
    store.set(REWARD_VOLUME_KEY, ''); expect(getRewardVolume()).toBe(0.5)
    setRewardVolume(7); expect(getRewardVolume()).toBe(1)
    setRewardVolume(-3); expect(getRewardVolume()).toBe(0)
    setRewardVolume('x'); expect(getRewardVolume()).toBe(0)
  })
  it('без localStorage (приватный режим) — значения по умолчанию, ничего не падает', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } })
    expect(getRewardSound()).toBe('meow'); expect(getRewardVolume()).toBe(0.5)
    expect(() => { setRewardSound('notes'); setRewardVolume(0.1) }).not.toThrow()
  })
})

describe('проигрывание награды', () => {
  it('unlockNotes прогревает три файла мяу (слоты нот): тихий wav в тапе, затем src = meow-k.wav', async () => {
    unlockNotes()
    expect(created).toHaveLength(3)
    expect(plays).toHaveLength(3) // play() внутри жеста
    expect(created.every(a => a.src.startsWith('blob:'))).toBe(true) // пока — тишина-«будильник»
    await flush()
    expect(created.map(a => a.src)).toEqual(MEOW_PATHS)
    expect(MEOW_PATHS[0]).toMatch(/^\/sounds\/meow-1\.wav/)
    expect(created.every(a => a.volume === 0.5)).toBe(true)
  })
  it('playNote(k) играет файл мяу k с выставленной громкостью (регулятор — audio.volume)', async () => {
    setRewardVolume(0.25)
    unlockNotes(); await flush(); plays.length = 0
    expect(playNote(0)).toBe(true); expect(playNote(2)).toBe(true)
    expect(plays).toEqual([{ src: MEOW_PATHS[0], volume: 0.25 }, { src: MEOW_PATHS[2], volume: 0.25 }])
  })
  it('режим «ноты»: те же слоты прогреваются blob-нотами', async () => {
    setRewardSound('notes')
    unlockNotes(); await flush()
    expect(created.every(a => a.src.startsWith('blob:'))).toBe(true)
    plays.length = 0
    expect(playNote(1)).toBe(true)
    expect(plays[0].src.startsWith('blob:')).toBe(true)
  })
  it('«без звука»: unlockNotes ничего не создаёт, playNote и «Послушать» ничего не играют', async () => {
    setRewardSound('off')
    unlockNotes(); await flush()
    expect(created).toHaveLength(0)
    expect(playNote(0)).toBe(false); expect(previewReward(0)).toBe(false)
    expect(plays).toHaveLength(0)
  })
  it('переключили на «без звука» уже после прогрева — играть перестаёт сразу', async () => {
    unlockNotes(); await flush(); plays.length = 0
    setRewardSound('off')
    expect(playNote(0)).toBe(false); expect(plays).toHaveLength(0)
  })
  it('«Послушать» из админки играет выбранный вариант отдельным элементом', () => {
    expect(previewReward(1)).toBe(true)
    expect(plays).toEqual([{ src: MEOW_PATHS[1], volume: 0.5 }])
    setRewardSound('notes'); setRewardVolume(0.8); plays.length = 0
    expect(previewReward(2)).toBe(true)
    expect(plays[0].src.startsWith('blob:')).toBe(true); expect(plays[0].volume).toBe(0.8)
  })
})

describe('админка «Голос» → «Звуки игры»', () => {
  it('блок подключён отдельным импортом; рисует три режима, ползунок и три кнопки «Послушать», подсказка про iOS', () => {
    const tab = read('../../../admin/speech/AdminSpeechTab.jsx')
    expect(tab).toContain("import GameSoundsBlock from './GameSoundsBlock.jsx'")
    expect(tab).toContain('<GameSoundsBlock />')
    const html = renderToStaticMarkup(createElement(GameSoundsBlock))
    expect(html).toContain('data-testid="reward-sound-meow"')
    expect(html).toMatch(/reward-sound-meow"[^>]*>Мяу/)
    expect(html).toContain('aria-pressed="true"') // по умолчанию выбрано «Мяу»
    expect(html).toContain('data-testid="reward-volume"')
    expect(html).toContain('Громкость: 50 %')
    expect(html).toContain('data-testid="reward-listen-3"')
    expect(html).toContain('iPhone')
  })
  it('RotatePhoneModule по-прежнему будит слоты в тапе «Начать»', () => {
    expect(read('./RotatePhoneModule.jsx')).toContain('unlockNotes()')
  })
})
