import { describe, it, expect } from 'vitest'
import { tagSpsColor, readSpsColor } from './h264Sps.js'

// Настоящие SPS из видео ленты (в обоих есть защитные байты 000003)
const hex = s => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)))
const SPS_720 = hex('674d401feca05a050d8088000003000800000301e078c18cb0')
const SPS_1080 = hex('674d4029959004403c797c04400000fa40002ee021')

// Синтетический SPS без VUI вовсе: baseline, 16x16, poc type 2
function bitsToNal(bits) {
  const all = [...bits, 1]
  while (all.length % 8) all.push(0)
  const bytes = []
  for (let i = 0; i < all.length; i += 8) bytes.push(parseInt(all.slice(i, i + 8).join(''), 2))
  return new Uint8Array([0x67, ...bytes])
}
const n8 = v => v.toString(2).padStart(8, '0').split('').map(Number)
const SPS_NO_VUI = bitsToNal([
  ...n8(66), ...n8(0), ...n8(30), // profile, constraints, level
  1, 1, 0, 1, 1, 0, 1, 0, // sps_id=0, log2_max_frame_num-4=0, poc_type=2, max_num_ref_frames=1
  0, 1, 1, // gaps=0, width_mbs-1=0, height_map_units-1=0
  1, 1, 0, // frame_mbs_only, direct_8x8, cropping=0
  0, // vui_parameters_present_flag = 0
])

// Проверка защитных байтов: нигде нет 00 00 0x (x ≤ 3) без 03
function escapedOk(nal) {
  for (let i = 3; i < nal.length; i++) {
    if (nal[i - 2] === 0 && nal[i - 1] === 0 && nal[i] <= 3 && nal[i] !== 3) return false
  }
  return true
}

describe('метка цвета в SPS H.264', () => {
  it('в SPS наших видео метки нет', () => {
    expect(readSpsColor(SPS_720)).toBeNull()
    expect(readSpsColor(SPS_1080)).toBeNull()
  })

  it('вписывает «limited, BT.709» в VUI настоящих SPS', () => {
    for (const sps of [SPS_720, SPS_1080]) {
      const tagged = tagSpsColor(sps)
      expect(readSpsColor(tagged)).toEqual({ fullRange: 0, primaries: 1, transfer: 1, matrix: 1 })
      expect(tagged[0]).toBe(sps[0]) // тот же заголовок NAL
      expect([...tagged.subarray(0, 4)]).toEqual([...sps.subarray(0, 4)]) // профиль/уровень не тронуты
      expect(tagged.length - sps.length).toBeGreaterThanOrEqual(3) // +29 бит
      expect(tagged.length - sps.length).toBeLessThanOrEqual(5)
      expect(escapedOk(tagged)).toBe(true)
    }
  })

  it('SPS без VUI получает минимальный VUI с меткой', () => {
    expect(readSpsColor(SPS_NO_VUI)).toBeNull()
    expect(readSpsColor(tagSpsColor(SPS_NO_VUI))).toEqual({ fullRange: 0, primaries: 1, transfer: 1, matrix: 1 })
  })

  it('метка уже есть или это не SPS — не трогаем', () => {
    expect(tagSpsColor(tagSpsColor(SPS_720))).toBeNull()
    expect(tagSpsColor(hex('68ee3c80'))).toBeNull() // PPS
    expect(tagSpsColor(hex('67'))).toBeNull() // обрубок
  })
})
