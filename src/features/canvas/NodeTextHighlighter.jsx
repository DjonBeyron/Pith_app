import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { buildSpans, addHighlight, removeHighlightAt, highlightStyle } from '../../shared/lib/textHighlight.js'
import HighlightedText from '../../shared/ui/HighlightedText.jsx'
import { loadFavoriteColors, saveFavoriteColors } from '../../shared/api/highlightPresetsApi.js'

const PANEL_W    = 300
const PRESET_COL = ['#ffeb3b', '#ff9800', '#ff5252', '#e91e63', '#b6fe3b', '#4caf50', '#00bcd4', '#2196f3', '#9c27b0']
const MAX_RECENT = 5

function domToStr(container, node, off) {
  const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let count = 0, n
  while ((n = w.nextNode())) {
    if (n === node) return count + off
    count += n.textContent.length
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

export default function NodeTextHighlighter({ text, highlights, anchorRect, onClose, onChange }) {
  const [localHL, setLocalHL] = useState(highlights ?? [])
  const [color,   setColor]   = useState('#ffeb3b')
  const [mode,    setMode]    = useState('bg')
  const [opacity, setOpacity] = useState(() => {
    try { return parseFloat(localStorage.getItem('hl_opacity') ?? '0.5') } catch { return 0.5 }
  })
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hl_recent') ?? '[]') } catch { return [] }
  })
  const [favs, setFavs] = useState([])
  const textRef = useRef(null)

  useEffect(() => {
    loadFavoriteColors().then(setFavs)
  }, []) // eslint-disable-line

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
    const next = addHighlight(localHL, { start, end, color, mode, opacity })
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
    setOpacity(v)
    localStorage.setItem('hl_opacity', String(v))
  }

  function addRecent(c) {
    setRecent(prev => {
      const next = [c, ...prev.filter(x => x !== c)].slice(0, MAX_RECENT)
      localStorage.setItem('hl_recent', JSON.stringify(next))
      return next
    })
  }

  async function toggleFav(c) {
    const next = favs.includes(c) ? favs.filter(x => x !== c) : [...favs, c]
    setFavs(next)
    await saveFavoriteColors(next)
  }


  const spans    = buildSpans(text, localHL)
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
          <button className={`textHLModeBtn${mode === 'bg'   ? ' active' : ''}`} onClick={() => setMode('bg')}>Плашка</button>
          <button className={`textHLModeBtn${mode === 'text' ? ' active' : ''}`} onClick={() => setMode('text')}>Цвет текста</button>
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
            <button key={c} className={`textHLSwatch${color === c ? ' active' : ''}`}
              style={{ background: c }} onClick={() => setColor(c)} title={c} />
          ))}
          <button className="textHLFavAddBtn" onClick={() => toggleFav(color)}
            title={favs.includes(color) ? 'Удалить' : 'Добавить в избранное'}>
            {favs.includes(color) ? '★' : '☆'}
          </button>
        </div>

        {/* chat preview */}
        <div className="textHLPreviewLabel">Предпросмотр в чате:</div>
        <div className="textHLPreview">
          <div className="playerMsgBubble playerMsgBubble--text">
            <p className="playerText">
              <HighlightedText text={text} highlights={localHL} />
            </p>
          </div>
        </div>

        <button className="textHLClearBtn" onClick={() => commit([])}>
          Очистить все выделения
        </button>

      </div>
    </>,
    document.body
  )
}
