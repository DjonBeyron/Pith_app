import { SKIN_COLORS } from '../../../scene/v2/sprites/mascot/mascots.js'

// Цвет говорящего в репликах сборщика: заливка кнопки «кто говорит» и полоса карточки
// берутся из палитры кота (fur), цвет текста поверх — автоматически по контрасту
// (WCAG 2.x relative luminance). Чистые функции, тест — colorContrast.test.js.

const INK_DARK = '#141414'
const INK_LIGHT = '#ffffff'

// '#rgb' | '#rrggbb' → [r, g, b] 0…255; мусор → null
export function parseHex(hex) {
  const s = String(hex ?? '').trim()
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const lin = c => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

// Относительная яркость 0 (чёрный) … 1 (белый); мусор → 0.5
export function luminance(hex) {
  const rgb = parseHex(hex)
  if (!rgb) return 0.5
  const [r, g, b] = rgb.map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Контраст двух цветов по WCAG: 1 … 21
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// Цвет текста поверх фона: тот из двух (тёмный/белый), что контрастнее
export function contrastInk(bg) {
  return contrastRatio(bg, INK_DARK) >= contrastRatio(bg, INK_LIGHT) ? INK_DARK : INK_LIGHT
}

// Цвет персонажа для меток «кто говорит»: шерсть; без палитры — запасной серый
export const FALLBACK_SPEAKER = { a: '#f2a65a', b: '#8e97a8' }

export function speakerColor(character, who = 'a') {
  const fur = SKIN_COLORS[character?.skin] ?? character?.palette?.fur // у маскота — цвет его шерсти, палитра не используется
  return parseHex(fur) ? fur : FALLBACK_SPEAKER[who] ?? FALLBACK_SPEAKER.a
}

// CSS-переменные для карточки реплики: --spk-a/--spk-b и контрастные --spk-a-ink/--spk-b-ink
export function speakerVars(characters) {
  const out = {}
  for (const who of ['a', 'b']) {
    const c = speakerColor(characters?.[who], who)
    out[`--spk-${who}`] = c
    out[`--spk-${who}-ink`] = contrastInk(c)
  }
  return out
}
