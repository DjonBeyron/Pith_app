import { useState } from 'react'
import { DECOR_MODES } from '../../shared/lib/textHighlight.js'

// Настройки «красок»: чем и как красим. Живут в localStorage и общие для
// всего приложения — выбрал жёлтый, плашку и подчёркивание, и дальше просто
// выделяешь текст в любой ноде, хоть после перезагрузки.
//
// Прозрачность, декорации (жирный/подчёркивание/зачёркивание) — СВОИ у каждой
// вкладки: плашке идёт полупрозрачная заливка и обычный шрифт, цветному
// тексту — полная непрозрачность и часто жирность. Таскать одно значение
// туда-сюда неудобно.
const read = (key, fallback) => {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v
  } catch { return fallback }
}

const write = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* приватный режим */ }
}

const readNum = (key, fallback) => {
  const v = parseFloat(read(key, null))
  return Number.isFinite(v) ? v : fallback
}

export function useHighlightPrefs() {
  const [color, setColorState] = useState(() => read('hl_color', '#ffeb3b'))
  const [mode, setModeState] = useState(() => (read('hl_mode', 'text') === 'bg' ? 'bg' : 'text'))
  // Плашка бывает двух видов: заливка и только обводка (рамка без фона)
  const [outline, setOutlineState] = useState(() => read('hl_outline', '0') === '1')

  const [opacityByMode, setOpacityByMode] = useState(() => {
    const legacy = readNum('hl_opacity', 0.5)
    return { text: readNum('hl_opacity_text', 1), bg: readNum('hl_opacity_bg', legacy) }
  })

  // { text: { bold, underline, strike }, bg: {...} }
  const [decorByMode, setDecorByMode] = useState(() => {
    const legacyBold = read('hl_bold', '0') === '1'
    const one = tab => Object.fromEntries(DECOR_MODES.map(m => [
      m, read(`hl_${m}_${tab}`, m === 'bold' && legacyBold ? '1' : '0') === '1',
    ]))
    return { text: one('text'), bg: one('bg') }
  })

  function setColor(c) { setColorState(c); write('hl_color', c) }
  function setMode(m)  { setModeState(m);  write('hl_mode', m) }
  function setOutline(v) { setOutlineState(v); write('hl_outline', v ? '1' : '0') }

  function setOpacity(v) {
    setOpacityByMode(prev => ({ ...prev, [mode]: v }))
    write(`hl_opacity_${mode}`, String(v))
  }

  function setDecor(decorMode, v) {
    setDecorByMode(prev => ({ ...prev, [mode]: { ...prev[mode], [decorMode]: v } }))
    write(`hl_${decorMode}_${mode}`, v ? '1' : '0')
  }

  return {
    color, setColor,
    mode, setMode,
    outline, setOutline,
    opacity: opacityByMode[mode] ?? 1, setOpacity,
    decor: decorByMode[mode] ?? {}, setDecor,
  }
}
