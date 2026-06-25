// Shared highlight utilities for canvas editor and player.
// Highlight format: { start, end, color, mode: 'text'|'bg', opacity }
// Highlights stack: bg has display priority over text-color on the same chars.
// Both can coexist — right-click removes them one at a time (bg first).

export function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

export function sameStyle(a, b) {
  return a && b && a.color === b.color && a.mode === b.mode && a.opacity === b.opacity
}

export function bridgeSpans(spans) {
  return spans.map((s, i) => {
    if (!s.h && /^\s+$/.test(s.text) && sameStyle(spans[i - 1]?.h, spans[i + 1]?.h))
      return { ...s, h: spans[i - 1].h }
    return s
  })
}

// Builds flat span array from text + highlights for rendering.
// bg has display priority over text-color on the same position.
// Returns [{ text, h: display_highlight|null }]
export function buildSpans(text, highlights = []) {
  if (!highlights.length) return [{ text, h: null }]
  const bgMap   = new Array(text.length).fill(null)
  const textMap = new Array(text.length).fill(null)
  for (const h of highlights) {
    for (let i = h.start; i < h.end && i < text.length; i++) {
      if (h.mode === 'bg') bgMap[i] = h
      else textMap[i] = h
    }
  }
  // Display: bg wins; text-color can still show inside bg (as textUnder)
  const dispMap = bgMap.map((bg, i) => bg ?? textMap[i])
  const spans = []
  let i = 0
  while (i < text.length) {
    const h = dispMap[i]
    let j = i + 1
    while (j < text.length && dispMap[j] === h && textMap[j] === textMap[i]) j++
    const textUnder = h?.mode === 'bg' ? textMap[i] : null
    spans.push({ text: text.slice(i, j), h, textUnder })
    i = j
  }
  return spans
}

// Adds a new highlight. Same-mode overlaps are trimmed; different-mode overlaps are kept (stacking).
export function addHighlight(prev, newH) {
  const result = []
  for (const h of prev) {
    const overlaps = h.end > newH.start && h.start < newH.end
    if (!overlaps || h.mode !== newH.mode) {
      result.push(h) // no overlap OR different mode (keep both)
    } else {
      // same mode overlap: trim existing
      if (h.start < newH.start) result.push({ ...h, end: newH.start })
      if (h.end   > newH.end)   result.push({ ...h, start: newH.end })
    }
  }
  result.push(newH)
  return result.sort((a, b) => a.start - b.start)
}

// Right-click removal: removes highest-priority highlight at position.
// bg is removed first; text-color removed on next click.
export function removeHighlightAt(highlights, pos) {
  const atPos = highlights.filter(h => h.start <= pos && h.end > pos)
  if (!atPos.length) return highlights
  const toRemove = atPos.find(h => h.mode === 'bg') ?? atPos[0]
  return highlights.filter(h => h !== toRemove)
}

// Returns CSS style object for a highlight (or empty object for null).
export function highlightStyle(h) {
  if (!h) return {}
  const c = hexToRgba(h.color, h.opacity ?? 1)
  return h.mode === 'bg'
    ? { background: c, borderRadius: 3, padding: '1px 3px', lineHeight: 1, display: 'inline', verticalAlign: 'baseline' }
    : { color: c }
}

// Legacy: word-based char map used by audio module.
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
