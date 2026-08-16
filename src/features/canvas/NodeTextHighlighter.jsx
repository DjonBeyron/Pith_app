import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { addHighlight, removeHighlightAt, rangeHasStyle, removeRange } from '../../shared/lib/textHighlight.js'
import HighlightedText from '../../shared/ui/HighlightedText.jsx'
import ChatBubblePreview from './ChatBubblePreview.jsx'
import { loadFavoriteColors, saveFavoriteColors } from '../../shared/api/highlightPresetsApi.js'

const PANEL_W    = 300
const PRESET_COL = ['#ffeb3b', '#ff9800', '#ff5252', '#e91e63', '#b6fe3b', '#4caf50', '#00bcd4', '#2196f3', '#9c27b0']

// Позиция в исходной строке по узлу и смещению в нём. Переносы строк живут в
// разметке отдельными <br> (иначе фон выделения растягивается через строку),
// но в самом тексте это обычный символ \n — если его не считать, все позиции
// после первого переноса съезжают, и выделение промахивается мимо букв.
function domToStr(container, node, off) {
  const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let count = 0, n
  while ((n = w.nextNode())) {
    if (n === node) return count + (n.nodeType === Node.TEXT_NODE ? off : 0)
    if (n.nodeType === Node.TEXT_NODE) count += n.textContent.length
    else if (n.tagName === 'BR') count += 1
  }
  return count
}

function getSelRange(container) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const r = sel.getRangeAt(0)
  if (!container.contains(r.commonAncestorContainer)) return null
  const s = domToStr(container, r.startContainer, r.startOffset)
  const e = domToStr(container, r.endContainer, r.endOffset)
  return s < e ? { start: s, end: e } : s > e ? { start: e, end: s } : null
}

function charFromPoint(container, x, y) {
  let range = document.caretRangeFromPoint?.(x, y)
  if (!range && document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y)
    if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset) }
  }
  if (!range || !container.contains(range.startContainer)) return -1
  return domToStr(container, range.startContainer, range.startOffset)
}

export default function NodeTextHighlighter({ text, highlights, hardWrap = false, anchorRect, onClose, onChange }) {
  const [localHL, setLocalHL] = useState(highlights ?? [])
  // Выбранный цвет — общий для всего приложения и живёт между сессиями:
  // отметил нужный (обычно из избранных) — и дальше просто выделяешь текст,
  // он красится сразу им, в любой ноде и после перезагрузки
  const [color, setColorState] = useState(() => {
    try { return localStorage.getItem('hl_color') ?? '#ffeb3b' } catch { return '#ffeb3b' }
  })
  function setColor(c) {
    setColorState(c)
    try { localStorage.setItem('hl_color', c) } catch { /* приватный режим */ }
  }
  // Выбранная вкладка живёт между открытиями окна и между нодами: красят
  // обычно подряд одним способом
  const [mode, setModeState] = useState(() => {
    try { return localStorage.getItem('hl_mode') === 'bg' ? 'bg' : 'text' } catch { return 'text' }
  })
  function setMode(m) {
    setModeState(m)
    try { localStorage.setItem('hl_mode', m) } catch { /* приватный режим */ }
  }
  // Прозрачность своя у каждой вкладки: плашке идёт полупрозрачная заливка,
  // а цвету текста — обычно полная непрозрачность, и таскать одно значение
  // туда-сюда неудобно. Старый общий ключ подхватывается для плашки.
  const [opacityByMode, setOpacityByMode] = useState(() => {
    const read = (key, fallback) => {
      try {
        const v = parseFloat(localStorage.getItem(key))
        return Number.isFinite(v) ? v : fallback
      } catch { return fallback }
    }
    let legacy = 0.5
    try { legacy = read('hl_opacity', 0.5) } catch { /* приватный режим */ }
    return { text: read('hl_opacity_text', 1), bg: read('hl_opacity_bg', legacy) }
  })
  const opacity = opacityByMode[mode] ?? 1
  // Жирность — не режим, а тумблер, и своя у каждой вкладки: цветной текст
  // часто хочется жирным, а плашку — обычной. Запоминается глобально, как
  // цвет, вкладка и прозрачность.
  const [boldByMode, setBoldByMode] = useState(() => {
    const read = (key, fallback) => {
      try {
        const v = localStorage.getItem(key)
        return v === null ? fallback : v === '1'
      } catch { return fallback }
    }
    let legacy = false
    try { legacy = read('hl_bold', false) } catch { /* приватный режим */ }
    return { text: read('hl_bold_text', legacy), bg: read('hl_bold_bg', legacy) }
  })
  const boldOn = boldByMode[mode] ?? false
  function setBoldOn(v) {
    setBoldByMode(prev => ({ ...prev, [mode]: v }))
    try { localStorage.setItem(`hl_bold_${mode}`, v ? '1' : '0') } catch { /* приватный режим */ }
  }
  const [recent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hl_recent') ?? '[]') } catch { return [] }
  })
  const [favs, setFavs] = useState([])
  const textRef = useRef(null)

  useEffect(() => {
    loadFavoriteColors().then(setFavs)
  }, [])  

  const spaceRight = window.innerWidth - anchorRect.right - 12
  const left = spaceRight >= PANEL_W ? anchorRect.right + 8 : anchorRect.left - PANEL_W - 8
  const top  = Math.max(8, Math.min(anchorRect.top, window.innerHeight - 560))

  function applyColor() {
    const range = getSelRange(textRef.current)
    if (!range) return
    // trim leading/trailing whitespace from selection bounds
    let { start, end } = range
    while (start < end && /\s/.test(text[start])) start++
    while (end > start && /\s/.test(text[end - 1])) end--
    if (start >= end) return
    // Повторное выделение того же куска тем же цветом снимает раскраску —
    // слово возвращается к обычному виду, а не красится поверх
    const painted = rangeHasStyle(localHL, start, end, mode, color)
    let next = painted
      ? removeRange(localHL, start, end, mode)
      : addHighlight(localHL, { start, end, color, mode, opacity })
    // Жирность — отдельный слой: тумблер включён, значит участок жирный;
    // выключен — снимаем жирность, если она там была
    next = boldOn
      ? addHighlight(removeRange(next, start, end, 'bold'), { start, end, mode: 'bold' })
      : removeRange(next, start, end, 'bold')
    commit(next)
    window.getSelection()?.removeAllRanges()
  }

  function handleMouseUp() { setTimeout(applyColor, 0) }

  // Right-click removes highest-priority highlight at cursor (bg first, then text-color)
  function handleContextMenu(e) {
    e.preventDefault()
    const pos = charFromPoint(textRef.current, e.clientX, e.clientY)
    if (pos < 0) return
    commit(removeHighlightAt(localHL, pos))
    window.getSelection()?.removeAllRanges()
  }

  function commit(next) {
    setLocalHL(next)
    onChange(next)
  }

  function changeOpacity(v) {
    setOpacityByMode(prev => ({ ...prev, [mode]: v }))
    try { localStorage.setItem(`hl_opacity_${mode}`, String(v)) } catch { /* приватный режим */ }
  }

  async function toggleFav(c) {
    const next = favs.includes(c) ? favs.filter(x => x !== c) : [...favs, c]
    setFavs(next)
    await saveFavoriteColors(next)
  }


  const swatches = [...new Set([...PRESET_COL, ...recent])]

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 398 }} onClick={onClose} />
      <div
        className="textHLModal"
        style={{ position: 'fixed', top, left, width: PANEL_W, zIndex: 399 }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="textHLModalHeader">
          <span>Выделение текста</span>
          <button className="textHLClose" onClick={onClose}>×</button>
        </div>

        {/* native-selection text — right-click removes highlight */}
        <div
          ref={textRef}
          className="textHLTextArea"
          style={{ userSelect: 'text', cursor: 'text' }}
          onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu}
        >
          <HighlightedText text={text} highlights={localHL} />
        </div>
        <div className="textHLHint">ПКМ по выделенному — удалить</div>

        <div className="textHLModeToggle">
          <button className={`textHLModeBtn${mode === 'text' ? ' active' : ''}`} onClick={() => setMode('text')}>Цвет текста</button>
          <button className={`textHLModeBtn${mode === 'bg'   ? ' active' : ''}`} onClick={() => setMode('bg')}>Плашка</button>
          <button
            className={`textHLBoldBtn${boldOn ? ' active' : ''}`}
            title={boldOn ? 'Жирный включён — выделение будет жирным' : 'Сделать выделение жирным'}
            onClick={() => setBoldOn(!boldOn)}
          ><b>B</b></button>
        </div>
        <div className="textHLColorRow">
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="textHLColorInput" />
          <span className="textHLOpacityLabel">Прозр.:</span>
          <input type="range" min="0.1" max="1" step="0.05" value={opacity}
            onChange={e => changeOpacity(+e.target.value)} className="textHLOpacitySlider" />
          <span className="textHLOpacityVal">{Math.round(opacity * 100)}%</span>
        </div>

        <div className="textHLSwatchRow">
          {swatches.map(c => (
            <button key={c} className={`textHLSwatch${color === c ? ' active' : ''}`}
              style={{ background: c }} onClick={() => setColor(c)} title={c} />
          ))}
        </div>

        <div className="textHLFavRow">
          <span className="textHLFavLabel">★ Избр.:</span>
          {favs.map(c => (
            <button
              key={c}
              className={`textHLSwatch textHLSwatchFav${color === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={color === c ? `${c} — назначен` : `${c} — назначить`}
            />
          ))}
          <button className="textHLFavAddBtn" onClick={() => toggleFav(color)}
            title={favs.includes(color) ? 'Удалить' : 'Добавить в избранное'}>
            {favs.includes(color) ? '★' : '☆'}
          </button>
        </div>

        {/* chat preview */}
        <div className="textHLPreviewLabel">Предпросмотр в чате:</div>
        <div className="textHLPreview">
          <ChatBubblePreview text={text} highlights={localHL} hardWrap={hardWrap} />
        </div>

        <button className="textHLClearBtn" onClick={() => commit([])}>
          Очистить все выделения
        </button>

      </div>
    </>,
    document.body
  )
}
