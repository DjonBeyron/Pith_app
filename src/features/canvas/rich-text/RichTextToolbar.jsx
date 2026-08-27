import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripHorizontal, X, Bold, Italic, Underline, Strikethrough, Eraser, Star, Trash2 } from 'lucide-react'
import {
  addHighlight, removeRange, rangeHasStyle, clearRange, hexToRgba, decorStyle, DECOR_MODES,
} from '../../../shared/lib/textHighlight.js'
import { useHighlightPrefs } from '../useHighlightPrefs.js'
import { useColorHistory } from './useColorHistory.js'
import { useRichTextFavorites, RICH_TEXT_FAV_ID } from './useRichTextFavorites.js'
import { positionToolbar } from './positionToolbar.js'

const TOOLBAR_W = 280
const LINE_H = 18 // .richTextField: font-size 12px * line-height 1.5
const HISTORY_COMMIT_DELAY = 500 // мс тишины после последнего тика драга в color-picker'е
const HEX_RE = /^[0-9a-fA-F]{6}$/

// Фирменный зелёный (#b6fe3b — акцент по всему приложению, 300+ мест) —
// встроенное избранное, есть всегда, даже пока список из Supabase пуст
const BRAND_GREEN = { color: '#b6fe3b', mode: 'text', opacity: 1, bold: true, italic: false, underline: false, strike: false }

// Миниатюра избранного стиля: буква "А" в цвете/декорациях пресета, чтобы
// сразу было видно жирность/курсив/подчёркивание/зачёркивание, не только цвет
function favSwatchStyle(fav) {
  const c = hexToRgba(fav.color, fav.opacity ?? 1)
  const decor = decorStyle({
    bold: fav.bold, italic: fav.italic,
    underline: fav.underline ? { color: fav.color, opacity: fav.opacity ?? 1 } : null,
    strike: fav.strike ? { color: fav.color, opacity: fav.opacity ?? 1 } : null,
  })
  return fav.mode === 'bg'
    ? { ...decor, color: '#e0e0e0', ...(fav.outline ? { boxShadow: `inset 0 0 0 1.5px ${c}` } : { background: c }) }
    : { ...decor, color: c }
}

// Плавающий тулбар покраски — всплывает СБОКУ от выделения текста в
// RichTextField, без захода в отдельное окно (как в Notion). Появляется
// только когда жест выделения завершён (useRichTextSelection — на mouseup/
// keyup, не на каждый tick протяжки мышью). Каждая кнопка красит УЖЕ
// сделанное выделение `range` немедленно. Автопозиция — сбоку от выделения;
// шапка сверху позволяет перетащить панель вручную, если авто-место не
// устраивает (сбрасывается на новом выделении — тулбар монтируется заново).
export default function RichTextToolbar({ rect, range, highlights, onApply, onClose }) {
  const { color, setColor, mode, setMode, outline, setOutline, opacity, setOpacity } = useHighlightPrefs()
  const [favs, updateFavs] = useRichTextFavorites(RICH_TEXT_FAV_ID)
  const { history, push: pushHistory, clear: clearHistory } = useColorHistory()
  const [opacityOpen, setOpacityOpen] = useState(false)
  const [manualPos, setManualPos] = useState(null)
  // Черновик hex-поля: null, пока не печатают руками — тогда показываем
  // текущий color как есть. Набор ещё не валиден (не все 6 знаков) — держим
  // черновик; как только цвет реально сменился снаружи (свотч/избранное) —
  // черновик сбрасывается. Правится прямо в рендере (не в эффекте) — так
  // React рекомендует подстраивать состояние под внешний проп без лишнего
  // цикла рендеров
  const [hexDraft, setHexDraft] = useState(null)
  const [colorSeen, setColorSeen] = useState(color)
  if (color !== colorSeen) { setColorSeen(color); setHexDraft(null) }
  const hexValue = hexDraft ?? color.replace('#', '')
  const boxRef = useRef(null)
  const historyTimerRef = useRef(null)

  // Клик снаружи тулбара — закрыть. Capture-фаза: срабатывает раньше любого
  // stopPropagation внутри тулбара/поля, не зависит от их порядка событий
  useEffect(() => {
    function onDocMouseDown(e) {
      if (!boxRef.current?.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown, true)
    return () => document.removeEventListener('mousedown', onDocMouseDown, true)
  }, [onClose])

  useEffect(() => () => clearTimeout(historyTimerRef.current), [])

  if (!rect || !range) return null
  const isOn = m => rangeHasStyle(highlights, range.start, range.end, m)

  const barH = 30 + 40 + 34 + (mode === 'bg' ? 32 : 0) + 34 +
    (opacityOpen ? 26 : 0) + (history.length ? 34 : 0)
  const autoPos = positionToolbar(rect, TOOLBAR_W, barH, { width: window.innerWidth, height: window.innerHeight }, LINE_H)
  if (!autoPos) return null
  const pos = manualPos ?? autoPos

  // Перетаскивание за шапку — считаем дельту от точки захвата, не зависим
  // от того, где именно на шапке кликнули
  function onHandleMouseDown(e) {
    e.preventDefault()
    e.stopPropagation()
    const start = { x: e.clientX, y: e.clientY, left: pos.left, top: pos.top }
    function onMove(ev) {
      setManualPos({ left: start.left + (ev.clientX - start.x), top: start.top + (ev.clientY - start.y) })
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Красим сразу на каждый тик (живой предпросмотр, особенно заметно при
  // протяжке в нативном color-picker'е), а в историю попадает только цвет,
  // на котором реально остановились — иначе туда улетают все промежуточные
  // оттенки, через которые курсор проехал по пути
  function paintColor(c) {
    setColor(c)
    onApply(addHighlight(highlights, {
      start: range.start, end: range.end, color: c, mode, opacity,
      ...(mode === 'bg' && outline ? { outline: true } : {}),
    }))
    clearTimeout(historyTimerRef.current)
    historyTimerRef.current = setTimeout(() => pushHistory(c), HISTORY_COMMIT_DELAY)
  }

  function toggleDecor(m) {
    onApply(isOn(m)
      ? removeRange(highlights, range.start, range.end, m)
      : addHighlight(highlights, { start: range.start, end: range.end, mode: m, color, opacity }))
  }

  function applyFavorite(fav) {
    setColor(fav.color); setMode(fav.mode); setOutline(!!fav.outline); setOpacity(fav.opacity ?? 1)
    let next = addHighlight(highlights, {
      start: range.start, end: range.end, color: fav.color, mode: fav.mode, opacity: fav.opacity ?? 1,
      ...(fav.mode === 'bg' && fav.outline ? { outline: true } : {}),
    })
    for (const m of DECOR_MODES) {
      next = fav[m]
        ? addHighlight(removeRange(next, range.start, range.end, m), { start: range.start, end: range.end, mode: m, color: fav.color, opacity: fav.opacity ?? 1 })
        : removeRange(next, range.start, range.end, m)
    }
    onApply(next)
  }

  function addCurrentAsFavorite() {
    updateFavs([...favs, {
      color, mode, opacity, outline,
      bold: isOn('bold'), italic: isOn('italic'), underline: isOn('underline'), strike: isOn('strike'),
    }])
  }

  function removeFavorite(i) {
    updateFavs(favs.filter((_, idx) => idx !== i))
  }

  return createPortal(
    <div
      ref={boxRef}
      className="richTextToolbar"
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: TOOLBAR_W, zIndex: 399 }}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
    >
      <div className="richTextToolbarHeader" onMouseDown={onHandleMouseDown}>
        <GripHorizontal size={14} />
        <button className="richTextIconBtn richTextIconBtnClose" title="Закрыть"
          onMouseDown={e => e.stopPropagation()} onClick={onClose}><X size={13} /></button>
      </div>

      <div className="richTextToolbarRow">
        <button className={`richTextIconBtn${mode === 'text' ? ' active' : ''}`} title="Цвет текста"
          onClick={() => setMode('text')}><span className="richTextIconLetter" style={{ color }}>T</span></button>
        <button className={`richTextIconBtn${mode === 'bg' ? ' active' : ''}`} title="Плашка"
          onClick={() => setMode('bg')}><span className="richTextIconLetter" style={{ color }}>▧</span></button>
        <span className="richTextToolbarDivider" />
        <button className={`richTextIconBtn${isOn('bold') ? ' active' : ''}`} title="Жирный (Ctrl+B)"
          onClick={() => toggleDecor('bold')}><Bold size={15} /></button>
        <button className={`richTextIconBtn${isOn('italic') ? ' active' : ''}`} title="Курсив (Ctrl+I)"
          onClick={() => toggleDecor('italic')}><Italic size={15} /></button>
        <button className={`richTextIconBtn${isOn('underline') ? ' active' : ''}`} title="Подчеркнуть (Ctrl+U)"
          onClick={() => toggleDecor('underline')}><Underline size={15} /></button>
        <button className={`richTextIconBtn${isOn('strike') ? ' active' : ''}`} title="Зачеркнуть"
          onClick={() => toggleDecor('strike')}><Strikethrough size={15} /></button>
        <button className="richTextIconBtn richTextIconBtnDanger" title="Очистить формат"
          onClick={() => onApply(clearRange(highlights, range.start, range.end))}><Eraser size={15} /></button>
      </div>

      <div className="richTextToolbarRow richTextToolbarSwatches">
        <button
          className={`richTextFavSwatch${color === BRAND_GREEN.color && mode === BRAND_GREEN.mode ? ' active' : ''}`}
          style={favSwatchStyle(BRAND_GREEN)}
          onClick={() => applyFavorite(BRAND_GREEN)}
          title="Фирменный зелёный"
        >А</button>
        {favs.map((fav, i) => (
          <button
            key={i}
            className={`richTextFavSwatch${color === fav.color && mode === fav.mode ? ' active' : ''}`}
            style={favSwatchStyle(fav)}
            onClick={() => applyFavorite(fav)}
            onDoubleClick={() => removeFavorite(i)}
            title="Двойной клик — убрать из избранного"
          >А</button>
        ))}
      </div>

      {mode === 'bg' && (
        <div className="richTextToolbarRow">
          <button className={`textHLFillBtn${!outline ? ' active' : ''}`} onClick={() => setOutline(false)}>■ Заливка</button>
          <button className={`textHLFillBtn${outline ? ' active' : ''}`} onClick={() => setOutline(true)}>▢ Обводка</button>
        </div>
      )}

      <div className="richTextToolbarRow">
        <input type="color" value={color} onChange={e => paintColor(e.target.value)} className="textHLColorInput" />
        <div className="richTextHexInput">
          <span>#</span>
          <input
            type="text"
            value={hexValue}
            maxLength={6}
            spellCheck={false}
            placeholder="b6fe3b"
            onChange={e => {
              const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
              setHexDraft(v)
              if (HEX_RE.test(v)) paintColor('#' + v)
            }}
          />
        </div>
        <button className={`richTextOpacityBtn${opacityOpen ? ' active' : ''}`} title="Прозрачность"
          onClick={() => setOpacityOpen(v => !v)}>{Math.round(opacity * 100)}%</button>
        <button className="richTextToolbarFavToggle" title="Добавить текущий стиль в избранное" onClick={addCurrentAsFavorite}>
          <Star size={13} />
        </button>
      </div>
      {opacityOpen && (
        <div className="richTextToolbarRow">
          <input type="range" min="0.1" max="1" step="0.05" value={opacity}
            onChange={e => setOpacity(+e.target.value)} className="textHLOpacitySlider" />
        </div>
      )}
      {history.length > 0 && (
        <div className="richTextToolbarRow richTextToolbarSwatches">
          {history.map(c => (
            <button key={c} className={`textHLSwatch${color === c ? ' active' : ''}`}
              style={{ background: c }} onClick={() => paintColor(c)} title={c} />
          ))}
          <button className="richTextIconBtn richTextIconBtnDanger richTextHistoryClear" title="Очистить историю"
            onClick={clearHistory}><Trash2 size={13} /></button>
        </div>
      )}
    </div>,
    document.body,
  )
}
