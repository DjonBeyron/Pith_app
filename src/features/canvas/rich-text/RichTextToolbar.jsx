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
import { describeStyle } from '../../../shared/lib/styleReadout.js'
import { BASE_GRAY } from '../../../shared/lib/lessonMarkup.js'

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
// doc — документ поля: в отдельном окне (review/usePopupWindow.js) тулбар рисуется и слушает мышь в нём, а не в главном окне
export default function RichTextToolbar({ rect, range, highlights, onApply, onClose, doc = document }) {
  const prefs = useHighlightPrefs()
  const { mode, setMode, outline, setOutline } = prefs
  // Активный цвет — цвет самого выделенного текста (а не «последний выбранный»): панель открывается с ним, и свотч/hex/прозрачность показывают его.
  // Базовый серый (#ffffff 75%) тоже активный цвет, но при выборе нового берём обычную прозрачность из настроек, а не серую
  const [active, setActive] = useState(() => {
    const st = range ? describeStyle(highlights, range.start, range.end) : null
    return st && !st.mixed && st.color ? { color: st.color, opacity: st.opacity ?? 1, base: st.isBase } : null
  })
  // «Цвет линии»: красим только линию подчёркивания (текст остаётся как есть) — например, белое подчёркивание под серым текстом
  const [lineOn, setLineOn] = useState(false)
  const [lineC, setLineC] = useState(() => {
    const u = range ? highlights.find(h => h.mode === 'underline' && h.start <= range.start && h.end >= range.end) : null
    return u?.color ?? '#ffffff'
  })
  const baseColor = active?.color ?? prefs.color
  const color = lineOn ? lineC : baseColor
  const opacity = active?.opacity ?? prefs.opacity
  const setColor = c => {
    if (lineOn) { setLineC(c); return }
    prefs.setColor(c)
    setActive(a => ({ color: c, opacity: a && !a.base ? a.opacity : prefs.opacity, base: false }))
  }
  const setOpacity = v => { prefs.setOpacity(v); setActive(a => ({ color: a?.color ?? prefs.color, opacity: v, base: false })) }
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
    doc.addEventListener('mousedown', onDocMouseDown, true)
    return () => doc.removeEventListener('mousedown', onDocMouseDown, true)
  }, [onClose, doc])

  useEffect(() => () => clearTimeout(historyTimerRef.current), [])

  if (!rect || !range) return null
  const isOn = m => rangeHasStyle(highlights, range.start, range.end, m)
  const style = describeStyle(highlights, range.start, range.end)

  const barH = 30 + 40 + 34 + 44 + (mode === 'bg' ? 32 : 0) + 34 +
    (opacityOpen ? 26 : 0) + (history.length ? 34 : 0)
  const autoPos = positionToolbar(rect, TOOLBAR_W, barH, { width: doc.defaultView.innerWidth, height: doc.defaultView.innerHeight }, LINE_H)
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
      doc.removeEventListener('mousemove', onMove)
      doc.removeEventListener('mouseup', onUp)
    }
    doc.addEventListener('mousemove', onMove)
    doc.addEventListener('mouseup', onUp)
  }

  // Красим сразу на каждый тик (живой предпросмотр, особенно заметно при
  // протяжке в нативном color-picker'е), а в историю попадает только цвет,
  // на котором реально остановились — иначе туда улетают все промежуточные
  // оттенки, через которые курсор проехал по пути
  function paintColor(c) {
    if (lineOn) { // только линия подчёркивания
      setLineC(c)
      onApply(addHighlight(highlights, { start: range.start, end: range.end, mode: 'underline', color: c, opacity: 1 }))
      return
    }
    setColor(c)
    onApply(addHighlight(highlights, {
      start: range.start, end: range.end, color: c, mode, opacity,
      ...(mode === 'bg' && outline ? { outline: true } : {}),
    }))
    clearTimeout(historyTimerRef.current)
    historyTimerRef.current = setTimeout(() => pushHistory(c), HISTORY_COMMIT_DELAY)
  }

  // Ползунок прозрачности сразу перекрашивает выделение с новой прозрачностью (раньше менял только настройку на будущее, текст не менялся)
  function paintOpacity(v) {
    setOpacity(v)
    let next = addHighlight(highlights, {
      start: range.start, end: range.end, color, mode, opacity: v,
      ...(mode === 'bg' && outline ? { outline: true } : {}),
    })
    // Начертания (жирный, подчёркивание…) несут свой цвет и прозрачность — иначе они перекрывали бы новую прозрачность текста
    for (const m of DECOR_MODES) {
      if (isOn(m)) next = addHighlight(removeRange(next, range.start, range.end, m), { start: range.start, end: range.end, mode: m, color, opacity: v })
    }
    onApply(next)
  }

  function toggleDecor(m) {
    onApply(isOn(m)
      ? removeRange(highlights, range.start, range.end, m)
      : addHighlight(highlights, { start: range.start, end: range.end, mode: m, color, opacity }))
  }

  // Готовые стили проекта: «главное» — только белое подчёркивание (текст остаётся серым), «лишнее» — красный и зачёркнутый
  function applyPreset(kind) {
    if (kind === 'l') {
      onApply(addHighlight(highlights, { start: range.start, end: range.end, mode: 'underline', color: '#ffffff', opacity: 1 }))
    } else {
      onApply(addHighlight(addHighlight(highlights, { start: range.start, end: range.end, mode: 'text', color: '#ff5a5a', opacity: 1 }),
        { start: range.start, end: range.end, mode: 'strike', color: '#ff5a5a', opacity: 1 }))
    }
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
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: TOOLBAR_W, zIndex: 1500 }}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
    >
      <div className="richTextToolbarHeader" onMouseDown={onHandleMouseDown}>
        <GripHorizontal size={14} />
        <button className="richTextIconBtn richTextIconBtnClose" title="Закрыть"
          onMouseDown={e => e.stopPropagation()} onClick={onClose}><X size={13} /></button>
      </div>

      {/* Проверка стиля выделенного: какой цвет и какие начертания у него сейчас (во всех полях канваса) */}
      {style && (
        <div className="richTextStyleReadout" title="Стиль выделенного текста">
          <span>
            {style.mixed ? 'разные стили (показан первый)' : style.flags.length ? style.flags.map(f => ({ bold: 'жирный', italic: 'курсив', underline: 'подчёркнут', strike: 'зачёркнут' })[f]).join(', ') : 'без начертаний'}
            {style.bg && ` · плашка ${style.bg.color}${style.bg.outline ? ' (обводка)' : ''}`}
          </span>
          {!style.mixed && style.isBase && <span className="richTextStyleTag">базовый серый</span>}
          {!style.mixed && style.mark && <span className="richTextStyleTag">{`{${style.mark}:} ${style.markName}`}</span>}
        </div>
      )}

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
        <button className={`richTextIconBtn${lineOn ? ' active' : ''}`} title="Цвет линии подчёркивания: следующий выбранный цвет красит только линию, текст не трогает"
          onClick={() => { setLineOn(v => !v); if (!lineOn && !isOn('underline')) onApply(addHighlight(highlights, { start: range.start, end: range.end, mode: 'underline', color: lineC, opacity: 1 })) }}><span className="richTextIconLetter" style={{ color: lineC, textDecoration: 'underline' }}>Л</span></button>
        <button className={`richTextIconBtn${isOn('underline') ? ' active' : ''}`} title="Подчеркнуть (Ctrl+U)"
          onClick={() => toggleDecor('underline')}><Underline size={15} /></button>
        <button className={`richTextIconBtn${isOn('strike') ? ' active' : ''}`} title="Зачеркнуть"
          onClick={() => toggleDecor('strike')}><Strikethrough size={15} /></button>
        {/* «Дефолтный» текст в уроке — базовый серый, и это тоже слой раскраски: снимаем всё и кладём его обратно, иначе кусок становился белым, а не обычным */}
        <button className="richTextIconBtn richTextIconBtnDanger" title="Сбросить к обычному тексту (базовый серый, без жирного и подчёркиваний)"
          onClick={() => onApply(addHighlight(clearRange(highlights, range.start, range.end), { start: range.start, end: range.end, mode: 'text', color: BASE_GRAY, opacity: 1 }))}><Eraser size={15} /></button>
      </div>

      <div className="richTextToolbarRow richTextToolbarSwatches">
        <button
          className={`richTextFavSwatch${color === BRAND_GREEN.color && mode === BRAND_GREEN.mode ? ' active' : ''}`}
          style={favSwatchStyle(BRAND_GREEN)}
          onClick={() => applyFavorite(BRAND_GREEN)}
          title="Фирменный зелёный"
        >А</button>
        <button className="richTextFavSwatch" style={{ color: '#c6c6c6', textDecoration: 'underline', textDecorationColor: '#ffffff' }}
          onClick={() => applyPreset('l')} title="Главное: белое подчёркивание, текст остаётся серым ({l:})">А</button>
        <button className="richTextFavSwatch" style={{ color: '#ff5a5a', textDecoration: 'line-through' }}
          onClick={() => applyPreset('x')} title="Лишнее: красный и зачёркнутый ({x:})">А</button>
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
            onChange={e => paintOpacity(+e.target.value)} className="textHLOpacitySlider" />
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
    doc.body,
  )
}
