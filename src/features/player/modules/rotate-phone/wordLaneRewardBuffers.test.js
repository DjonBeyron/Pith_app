import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { unlockNotes, playNote, releaseNotes, warmRewardBuffers } from './wordLaneNotes.js'
import { unlockPlate, playPlate, releasePlate, warmPlateBuffer } from './wordLanePlateSound.js'
import { releaseClips } from './wordLaneClips.js'
import { setLessonMuted } from '../../lessonVolume.js'
import { makeFakeWebAudio } from '../../../../shared/lib/fakeWebAudio.js'

// Мяу / ноты / «блюп» плашки через Web Audio: буфер декодируется заранее, громкость награды — GainNode (на iPhone audio.volume игнорируется), тоны 'custom' — playbackRate 1 / 1.26 / 1.5; <audio> не создаются
let fake, audios, fetched
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
const store = init => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const setup = (init = {}) => vi.stubGlobal('localStorage', store(init))
beforeEach(() => {
  audios = []; fetched = []
  fake = makeFakeWebAudio()
  vi.stubGlobal('AudioContext', fake.Ctx)
  vi.stubGlobal('window', { OfflineAudioContext: fake.Offline })
  vi.stubGlobal('Audio', class { constructor(src) { this.src = src; audios.push(this) } setAttribute() {} play() { return Promise.resolve() } pause() {} load() {} removeAttribute() {} })
  vi.stubGlobal('fetch', url => { fetched.push(String(url)); return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }) })
  vi.stubGlobal('URL', { createObjectURL: () => `blob:${Math.random()}`, revokeObjectURL() {} })
})
afterEach(() => { releaseNotes(); releasePlate(); releaseClips(); setLessonMuted(false); vi.unstubAllGlobals() })

describe('награда за пилюлю через Web Audio', () => {
  it('мяу по умолчанию: три файла качаются и декодируются в тапе, <audio> не создаются; играет буфер с gain = громкость награды', async () => {
    setup({ pithy_game_reward_volume_v1: '0.8' })
    unlockNotes()
    expect(playNote(0)).toBe(false) // буфер ещё декодируется — тишина, а не ошибка
    await flush()
    expect(audios).toHaveLength(0)
    expect(fetched).toHaveLength(3)
    expect(fetched[0]).toMatch(/^\/sounds\/meow-1\.wav/)
    expect(playNote(1)).toBe(true)
    expect(fake.sources).toHaveLength(1)
    expect(fake.sources[0].gain).toBe(0.8) // громкость — GainNode, а не audio.volume
    expect(fake.sources[0].rate).toBe(1)
    expect(fake.sources[0].startedAt).toBe(1.5)
  })

  it('ноты (синтез): WAV собирается и декодируется без сети; третья нота — длиннее, всё тем же путём', async () => {
    setup({ pithy_game_reward_sound_v1: 'notes' })
    unlockNotes(); await flush()
    expect(fetched).toHaveLength(0)
    expect(playNote(2)).toBe(true)
    expect(playNote(7)).toBe(true) // номер выше последнего → последняя нота
    expect(fake.sources).toHaveLength(2)
    expect(fake.sources[0].gain).toBe(0.5) // громкость по умолчанию
  })

  it('своя запись (custom): ОДИН файл на три тона — playbackRate 1 / 1.26 / 1.5, декодируется один раз', async () => {
    setup({ pithy_game_reward_sound_v1: 'custom', pithy_game_reward_url_v1: 'https://r2/meow.mp3' })
    unlockNotes(); await flush()
    expect(fetched).toEqual(['https://r2/meow.mp3'])
    expect(fake.decodes).toBe(1)
    ;[0, 1, 2].forEach(k => playNote(k))
    expect(fake.sources.map(s => s.rate)).toEqual([1, 1.26, 1.5])
  })

  it('«без звука» в админке или в уроке — не играет; warmRewardBuffers готовит буферы без жеста (карточка игры)', async () => {
    setup({ pithy_game_reward_sound_v1: 'off' })
    unlockNotes(); warmRewardBuffers(); await flush()
    expect(playNote(0)).toBe(false)
    expect(fetched).toHaveLength(0)
    setup({})
    warmRewardBuffers(); await flush()
    expect(fetched).toHaveLength(3) // подготовлено ДО тапа
    setLessonMuted(true)
    expect(playNote(0)).toBe(false)
    setLessonMuted(false)
    expect(playNote(0)).toBe(true)
  })

  it('Web Audio выключен (off) — прежний путь <audio>: элементы создаются и будятся в тапе', () => {
    setup({ pithy_game_web_audio_v1: 'off' })
    unlockNotes()
    expect(audios).toHaveLength(3)
    expect(fake.decodes).toBe(0)
  })
})

describe('звук плашки «Теперь твоя очередь»', () => {
  it('буфер декодируется при прогреве (warmPlateBuffer), играет через gain = громкость награды; <audio> нет', async () => {
    setup({ pithy_game_reward_volume_v1: '0.3' })
    warmPlateBuffer(); await flush()
    expect(playPlate()).toBe(true)
    expect(audios).toHaveLength(0)
    expect(fake.sources).toHaveLength(1)
    expect(fake.sources[0].gain).toBe(0.3)
  })

  it('буфер ещё не готов — false (и догрузка на следующий раз); «без звука» в уроке молчит', async () => {
    setup({})
    expect(playPlate()).toBe(false)
    await flush()
    expect(playPlate()).toBe(true)
    setLessonMuted(true)
    expect(playPlate()).toBe(false)
  })

  it('unlockPlate в тапе при Web Audio — только буфер; без Web Audio — <audio> в жесте', async () => {
    setup({})
    unlockPlate(); await flush()
    expect(audios).toHaveLength(0)
    releasePlate(); releaseClips()
    setup({ pithy_game_web_audio_v1: 'off' })
    unlockPlate()
    expect(audios).toHaveLength(1)
  })
})
