// Utilities shared between canvas highlight editor and player typing animation.

export function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

// Returns array[text.length] where each slot is the highlight object that covers
// that character, or null. Later entries in highlights[] win on overlap.
export function buildCharStyles(text, highlights = []) {
  if (!highlights.length) return null
  const styles = new Array(text.length).fill(null)
  const lower  = text.toLowerCase()
  for (const h of highlights) {
    const word = h.word.toLowerCase()
    let start  = 0
    while (start < lower.length) {
      const idx = lower.indexOf(word, start)
      if (idx === -1) break
      for (let i = idx; i < idx + h.word.length; i++) styles[i] = h
      start = idx + h.word.length
    }
  }
  return styles
}
