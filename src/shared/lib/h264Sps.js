// Метка цвета ВНУТРИ потока H.264: поле video_signal_type в VUI заголовка SPS.
//
// Метка в контейнере MP4 (атом colr, mp4ColorTag.js) Android проигнорировал:
// перезалитые с ней видео остались «в дымке». Аппаратный декодер смотрит
// в сам поток — в SPS, а там video_signal_type нет (проверено разбором:
// VUI есть, сигнала диапазона нет). Здесь вписываем в VUI явное
// «video_full_range_flag = 0, BT.709/BT.709/BT.709» — кадры не меняются,
// меняется только заголовок-описание (+4 байта).
//
// Работа на уровне битов: SPS хранится с «защитными» байтами 0x03 (после двух
// нулей), поэтому снимаем их, правим биты и ставим обратно.

function unescape(bytes) {
  const out = []
  let zeros = 0
  for (const b of bytes) {
    if (zeros >= 2 && b === 3) { zeros = 0; continue } // защитный байт — выкидываем
    out.push(b)
    zeros = b === 0 ? zeros + 1 : 0
  }
  return out
}

function escape(bytes) {
  const out = []
  let zeros = 0
  for (const b of bytes) {
    if (zeros >= 2 && b <= 3) { out.push(3); zeros = 0 }
    out.push(b)
    zeros = b === 0 ? zeros + 1 : 0
  }
  return out
}

function toBits(bytes) { const bits = []; for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1); return bits }
function toBytes(bits) { const out = []; for (let i = 0; i < bits.length; i += 8) { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | (bits[i + k] || 0); out.push(v) } return out }
const numBits = (v, n) => Array.from({ length: n }, (_, i) => (v >> (n - 1 - i)) & 1)

function reader(bits) {
  let pos = 0
  const bit = () => { if (pos >= bits.length) throw new Error('конец SPS'); return bits[pos++] }
  const n = k => { let v = 0; for (let i = 0; i < k; i++) v = (v << 1) | bit(); return v }
  const ue = () => { let z = 0; while (!bit()) { if (++z > 31) throw new Error('битый ue'); } return (2 ** z) - 1 + n(z) }
  const se = () => { const k = ue(); return k & 1 ? (k + 1) / 2 : -(k / 2) }
  return { bit, n, ue, se, get pos() { return pos } }
}

const HIGH_PROFILES = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]

// Разбор SPS до места сигнала диапазона. Возвращает позиции нужных битов
function locate(bits) {
  const r = reader(bits)
  const profile = r.n(8); r.n(16); r.ue()
  if (HIGH_PROFILES.includes(profile)) {
    const chroma = r.ue(); if (chroma === 3) r.bit()
    r.ue(); r.ue(); r.bit()
    if (r.bit()) {
      for (let i = 0; i < (chroma !== 3 ? 8 : 12); i++) {
        if (!r.bit()) continue
        let last = 8, next = 8
        for (let j = 0; j < (i < 6 ? 16 : 64); j++) { if (next !== 0) next = (last + r.se() + 256) % 256; last = next === 0 ? last : next }
      }
    }
  }
  r.ue()
  const poc = r.ue()
  if (poc === 0) r.ue()
  else if (poc === 1) { r.bit(); r.se(); r.se(); const k = r.ue(); for (let i = 0; i < k; i++) r.se() }
  r.ue(); r.bit(); r.ue(); r.ue()
  if (!r.bit()) r.bit()
  r.bit()
  if (r.bit()) { r.ue(); r.ue(); r.ue(); r.ue() }
  const vuiFlagPos = r.pos
  if (!r.bit()) return { vuiFlagPos, vui: false }
  if (r.bit()) { if (r.n(8) === 255) r.n(32) }
  if (r.bit()) r.bit()
  const signalPos = r.pos
  const hasSignal = r.bit()
  const res = { vuiFlagPos, vui: true, signalPos, hasSignal }
  if (hasSignal) { r.n(3); res.fullRange = r.bit(); if (r.bit()) { res.primaries = r.n(8); res.transfer = r.n(8); res.matrix = r.n(8) } }
  return res
}

// video_format=5 (не указан), full_range=0, есть описание цвета, BT.709 ×3
const SIGNAL = [1, ...numBits(5, 3), 0, 1, ...numBits(1, 8), ...numBits(1, 8), ...numBits(1, 8)]
// Минимальный VUI, если его не было вовсе: только сигнал, остальное «нет»
const MIN_VUI = [0, 0, ...SIGNAL, 0, 0, 0, 0, 0, 0]

// nal — байты NAL-блока SPS (с байтом заголовка). Возвращает новые байты
// или null, если сигнал уже есть или разобрать не удалось
export function tagSpsColor(nal) {
  if (!nal || (nal[0] & 0x1f) !== 7) return null
  try {
    const bits = toBits(unescape([...nal.subarray ? nal.subarray(1) : nal.slice(1)]))
    const loc = locate(bits)
    if (loc.vui && loc.hasSignal) return null
    const stop = bits.lastIndexOf(1) // rbsp_stop_one_bit
    if (stop < 0) return null
    let body
    if (loc.vui) body = [...bits.slice(0, loc.signalPos), ...SIGNAL, ...bits.slice(loc.signalPos + 1, stop)]
    else body = [...bits.slice(0, loc.vuiFlagPos), 1, ...MIN_VUI, ...bits.slice(loc.vuiFlagPos + 1, stop)]
    const withStop = [...body, 1]
    while (withStop.length % 8) withStop.push(0)
    return new Uint8Array([nal[0], ...escape(toBytes(withStop))])
  } catch {
    return null
  }
}

// Прочитать сигнал цвета SPS (для проверок и отчётов)
export function readSpsColor(nal) {
  try {
    const loc = locate(toBits(unescape([...(nal.subarray ? nal.subarray(1) : nal.slice(1))])))
    if (!loc.vui || !loc.hasSignal) return null
    return { fullRange: loc.fullRange, primaries: loc.primaries, transfer: loc.transfer, matrix: loc.matrix }
  } catch {
    return null
  }
}
