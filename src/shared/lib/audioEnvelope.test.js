import { describe, it, expect, vi, afterEach } from 'vitest'
import { envelopeFromSamples, computeEnvelope, validEnvelope, envelopeLevels, levelAt, ENV_HZ, ENV_MAX, ENV_MAX_SEC } from './audioEnvelope.js'

// Синтетика: sampleRate 1000, hz 20 → окно 50 сэмплов. Секунда тишины, секунда громкой «речи», секунда тихой
const SR = 1000
function signal(parts) {
  const out = []
  for (const [sec, amp] of parts) for (let i = 0; i < sec * SR; i++) out.push(amp * Math.sin(i * 0.7))
  return Float32Array.from(out)
}

describe('audioEnvelope — огибающая громкости реплики', () => {
  it('окно 1/hz с: на 3 с получаем 60 цифр; тишина — 0, самое громкое окно — f, тише — пропорционально RMS', () => {
    const env = envelopeFromSamples(signal([[1, 0], [1, 1], [1, 0.5]]), SR, ENV_HZ)
    expect(env.hz).toBe(20)
    expect(env.data).toHaveLength(60)
    expect(/^[0-9a-f]+$/.test(env.data)).toBe(true)
    expect(env.data.slice(0, 20)).toBe('0'.repeat(20))
    expect(env.data.slice(20, 40)).toBe('f'.repeat(20))       // пик = 15 (нормировка к самому громкому окну)
    expect([...env.data.slice(40, 60)].every(c => c === '7' || c === '8')).toBe(true) // вдвое тише → ≈ 7,5
  })

  it('нормировка к пику реплики: тихий файл растягивается на всю шкалу', () => {
    const loud = envelopeFromSamples(signal([[1, 0.9]]), SR)
    const quiet = envelopeFromSamples(signal([[1, 0.05]]), SR)
    expect(quiet.data).toBe(loud.data)
    expect(quiet.data[0]).toBe('f')
  })

  it('полная тишина и пустой вход не падают: нули / пустая строка', () => {
    expect(envelopeFromSamples(new Float32Array(2000), SR).data).toBe('0'.repeat(40))
    expect(envelopeFromSamples(new Float32Array(0), SR).data).toBe('')
    expect(envelopeFromSamples(null, SR).data).toBe('')
    expect(envelopeFromSamples(signal([[1, 1]]), 0).data).toBe('')
  })

  it('другой hz: 10 окон в секунду; хвост неполного окна считается по своим сэмплам', () => {
    expect(envelopeFromSamples(signal([[1, 1]]), SR, 10).data).toHaveLength(10)
    const tail = envelopeFromSamples(Float32Array.from({ length: 1075 }, (_, i) => Math.sin(i)), SR, 20)
    expect(tail.data).toHaveLength(22)
  })

  it('размер: реплика в 4 с — 80 байт; длиннее ENV_MAX_SEC обрезается', () => {
    expect(envelopeFromSamples(signal([[4, 1]]), SR).data.length).toBe(80)
    expect(envelopeFromSamples(new Float32Array((ENV_MAX_SEC + 30) * SR).fill(0.5), SR).data.length).toBe(ENV_MAX_SEC * ENV_HZ)
  })

  it('validEnvelope: годится { hz 1…100, data hex }; всё остальное — нет', () => {
    expect(validEnvelope({ hz: 20, data: '0a4f' })).toBe(true)
    for (const bad of [null, {}, { hz: 20 }, { hz: 0, data: '0' }, { hz: 101, data: '0' }, { hz: 2.5, data: '0' }, { hz: 20, data: '' }, { hz: 20, data: 'xyz' }, { hz: 20, data: 'F' }, { hz: 1, data: '0'.repeat(ENV_MAX_SEC + 1) }]) {
      expect(validEnvelope(bad)).toBe(false)
    }
  })

  it('envelopeLevels / levelAt: уровни 0…1, линейно между центрами окон, за краями — крайние значения', () => {
    const lv = envelopeLevels({ hz: 10, data: '0f' })
    expect(lv.levels[0]).toBe(0)
    expect(lv.levels[1]).toBe(1)
    expect(levelAt(lv, 0.05)).toBe(0)                          // центр окна 0
    expect(levelAt(lv, 0.1)).toBeCloseTo(0.5)                  // граница окон — середина
    expect(levelAt(lv, 0.15)).toBe(1)
    expect(levelAt(lv, 9)).toBe(1)
    expect(levelAt(lv, -1)).toBe(0)
    expect(levelAt(null, 1)).toBe(0)
    expect(levelAt(lv, NaN)).toBe(0)
    expect(envelopeLevels({ hz: 0, data: 'f' })).toBeNull()
    expect(ENV_MAX).toBe(15)
  })
})

describe('computeEnvelope — декодирование файла', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('через OfflineAudioContext: берёт первый канал и частоту декодера', async () => {
    const samples = signal([[1, 0], [1, 1]])
    const decodeAudioData = vi.fn(async () => ({ getChannelData: () => samples, sampleRate: SR }))
    vi.stubGlobal('OfflineAudioContext', class { constructor(...a) { this.args = a } decodeAudioData(b) { return decodeAudioData(b) } })
    const env = await computeEnvelope(new ArrayBuffer(8))
    expect(decodeAudioData).toHaveBeenCalledTimes(1)
    expect(env.data).toBe('0'.repeat(20) + 'f'.repeat(20))
  })

  it('нет OfflineAudioContext — понятная ошибка, а не падение', async () => {
    vi.stubGlobal('OfflineAudioContext', undefined)
    vi.stubGlobal('webkitOfflineAudioContext', undefined)
    await expect(computeEnvelope(new ArrayBuffer(8))).rejects.toThrow(/OfflineAudioContext/)
  })
})
