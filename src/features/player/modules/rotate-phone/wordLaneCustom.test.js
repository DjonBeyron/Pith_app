import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { unlockNotes, playNote, previewReward, previewUrl, releaseNotes } from './wordLaneNotes.js'
import { getRewardSound, setRewardSound, getRewardUrl, setRewardUrl, MEOW_PATHS, REWARD_RATES, REWARD_SOUND_KEY, REWARD_URL_KEY } from './wordLaneMeow.js'
import GameSoundsBlock from '../../../admin/speech/GameSoundsBlock.jsx'

const read = p => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
const URL1 = 'https://cdn.example/chat/meow.wav'

// Audio подменяем: play() запоминает скорость и preservesPitch В МОМЕНТ запуска; load() сбрасывает playbackRate к defaultPlaybackRate, как в браузере
let store, created, plays
class FakeAudio {
  constructor(src) { this.src = src; this.volume = 1; this.playbackRate = 1; this.defaultPlaybackRate = 1; this.preservesPitch = true; created.push(this) }
  play() { plays.push({ src: this.src, rate: this.playbackRate, pitch: this.preservesPitch, webkitPitch: this.webkitPreservesPitch, volume: this.volume }); return Promise.resolve() }
  pause() {}
  load() { this.playbackRate = this.defaultPlaybackRate }
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
const useCustom = () => { setRewardUrl(URL1); setRewardSound('custom') }

describe('режим «custom»: настройка и адрес файла', () => {
  it('custom нельзя выбрать без сохранённого url; с url — выбирается и читается', () => {
    setRewardSound('custom'); expect(getRewardSound()).toBe('meow')
    useCustom()
    expect(getRewardSound()).toBe('custom'); expect(getRewardUrl()).toBe(URL1)
    expect(store.get(REWARD_SOUND_KEY)).toBe('custom'); expect(store.get(REWARD_URL_KEY)).toBe(URL1)
  })
  it('url пропал или испорчен — custom читается как мяу; чужие схемы (javascript:, data:) не принимаются', () => {
    useCustom(); store.delete(REWARD_URL_KEY)
    expect(getRewardSound()).toBe('meow')
    ;['javascript:alert(1)', 'data:audio/wav;base64,AAAA', '//evil.example/x.wav', 'banana', ''].forEach(bad => { setRewardUrl(bad); expect(getRewardUrl()).toBeNull() })
    store.set(REWARD_URL_KEY, 'javascript:alert(1)'); expect(getRewardUrl()).toBeNull()
    setRewardUrl('/sounds/own.wav'); expect(getRewardUrl()).toBe('/sounds/own.wav')
  })
  it('три скорости 1 / 1.26 / 1.5', () => { expect(REWARD_RATES).toEqual([1, 1.26, 1.5]) })
})

describe('пробуждение нот: AbortError не отказ', () => {
  it('play() тишины прерван (AbortError) — звук всё равно подставляется (после завершения play), тон выставлен; отпущенные ноты ничего не меняют', async () => {
    useCustom()
    const rejects = []
    const origPlay = FakeAudio.prototype.play
    FakeAudio.prototype.play = function play() { plays.push({ src: this.src }); return new Promise((_, rej) => rejects.push(rej)) }
    unlockNotes()
    expect(created.map(a => a.src)).not.toContain(URL1) // пока play() тишины в пути — src не трогаем
    rejects.forEach(r => r(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })))
    await flush()
    expect(created.map(a => a.src)).toEqual([URL1, URL1, URL1])
    expect(created.map(a => a.playbackRate)).toEqual(REWARD_RATES)
    releaseNotes()
    const n = created.length
    unlockNotes()
    releaseNotes()
    rejects.slice(3).forEach(r => r(Object.assign(new Error('x'), { name: 'AbortError' }))) // отказ уже отпущенных элементов
    await flush()
    expect(created.slice(n).every(a => a.src === '' || a.src !== URL1)).toBe(true)
    FakeAudio.prototype.play = origPlay
  })
})

describe('режим «custom»: один файл — три тона', () => {
  it('unlockNotes: три слота получают один и тот же url; preservesPitch=false выставлен ДО первого play (прогрев в жесте)', async () => {
    useCustom()
    unlockNotes()
    expect(created).toHaveLength(3); expect(plays).toHaveLength(3)
    plays.forEach(p => { expect(p.pitch).toBe(false); expect(p.webkitPitch).toBe(false) }) // на момент play() в тапе
    await flush()
    expect(created.map(a => a.src)).toEqual([URL1, URL1, URL1])
    // load() не сбросил скорости: defaultPlaybackRate поставлен
    expect(created.map(a => a.playbackRate)).toEqual(REWARD_RATES)
  })

  it('playNote(k): скорость 1 / 1.26 / 1.5 и preservesPitch=false в момент play', async () => {
    useCustom()
    unlockNotes(); await flush(); plays.length = 0
    ;[0, 1, 2].forEach(k => expect(playNote(k)).toBe(true))
    expect(plays.map(p => p.rate)).toEqual([1, 1.26, 1.5])
    plays.forEach(p => { expect(p.pitch).toBe(false); expect(p.webkitPitch).toBe(false); expect(p.src).toBe(URL1) })
  })

  it('playNote до прогрева файла подставляет url сам и всё равно ставит скорость', async () => {
    useCustom()
    unlockNotes(); plays.length = 0 // play-then ещё не сработал: src — тишина
    expect(playNote(2)).toBe(true)
    expect(plays[0]).toMatchObject({ src: URL1, rate: 1.5, pitch: false })
  })

  it('уважает громкость и «без звука» в админке', async () => {
    useCustom(); store.set('pithy_game_reward_volume_v1', '0.25')
    unlockNotes(); await flush(); plays.length = 0
    playNote(1)
    expect(plays[0].volume).toBe(0.25)
    setRewardSound('off'); plays.length = 0
    expect(playNote(0)).toBe(false); expect(plays).toHaveLength(0)
  })

  it('«мяу»-синтез и «ноты» играют на обычной скорости 1 (после custom скорость не «залипает»)', async () => {
    useCustom()
    unlockNotes(); await flush()
    setRewardSound('meow'); plays.length = 0
    playNote(2)
    expect(plays[0]).toMatchObject({ src: MEOW_PATHS[2], rate: 1 })
  })

  it('«Послушать» из админки и предпрослушка кандидата: тот же файл со скоростью тона', () => {
    useCustom()
    expect(previewReward(2)).toBe(true)
    expect(plays[0]).toMatchObject({ src: URL1, rate: 1.5, pitch: false })
    expect(previewUrl('blob:abc', 1)).toBe(true)
    expect(plays[1]).toMatchObject({ src: 'blob:abc', rate: 1.26, pitch: false })
    expect(previewUrl('', 0)).toBe(false)
  })
})

describe('админка: «Своё мяу»', () => {
  it('рисует панель генерации и загрузки; «Своё мяу» недоступно, пока файла нет, и выбрано, когда он сохранён', () => {
    const html = renderToStaticMarkup(createElement(GameSoundsBlock))
    expect(html).toContain('data-testid="game-sfx-panel"')
    expect(html).toContain('Сгенерировать мяу')
    expect(html).toContain('Загрузить свой файл (wav/mp3/m4a)')
    expect(html).toContain('short cute kitten meow, single soft &quot;mew&quot;, rising pitch, no background noise')
    expect(html).toMatch(/disabled=""[^>]*data-testid="reward-sound-custom"/)
    useCustom()
    const html2 = renderToStaticMarkup(createElement(GameSoundsBlock))
    expect(html2).not.toMatch(/disabled=""[^>]*data-testid="reward-sound-custom"/)
    expect(html2).toMatch(/aria-pressed="true"[^>]*data-testid="reward-sound-custom"/)
  })
  it('исходники: ставим preservesPitch и webkitPreservesPitch, нормализуем перед загрузкой в R2', () => {
    const notes = read('./wordLaneNotes.js')
    expect(notes).toContain('a.preservesPitch = false'); expect(notes).toContain('a.webkitPreservesPitch = false')
    expect(notes.indexOf('tuneSlot(a, k, mode) // preservesPitch до первого play')).toBeLessThan(notes.indexOf('a.play().then(() => { if (els?.[k] !== a) return'))
    const flow = read('../../../admin/speech/gameSfxFlow.js')
    expect(flow.indexOf('normalizeToWav(bytes)')).toBeGreaterThan(-1)
    expect(flow).toContain('uploadSfxWav(c.wav)')
  })
})
