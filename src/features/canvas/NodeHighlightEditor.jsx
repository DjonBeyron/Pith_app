import { useState } from 'react'
import { buildCharStyles, hexToRgba } from '../../shared/lib/textHighlight.js'

const COLORS = ['#b6fe3b', '#60c8ff', '#ff6060', '#ffcc00', '#ff9040', '#e060ff']

function PreviewText({ text, highlights }) {
  if (!text) return <span className="hlPreviewEmpty">Текст не задан</span>
  const cs = buildCharStyles(text, highlights)
  if (!cs) return <>{text}</>
  const out = []; let i = 0
  while (i < text.length) {
    const h = cs[i]; let j = i + 1
    while (j < text.length && cs[j] === h) j++
    const seg = text.slice(i, j)
    const style = h ? {
      color:        h.color   || undefined,
      fontWeight:   h.bold    ? 700 : undefined,
      background:   h.bgColor ? hexToRgba(h.bgColor, h.bgOpacity ?? 0.3) : undefined,
      borderRadius: h.bgColor ? '3px' : undefined,
      padding:      h.bgColor ? '0 2px' : undefined,
    } : undefined
    out.push(<span key={i} style={style}>{seg}</span>)
    i = j
  }
  return <>{out}</>
}

export default function NodeHighlightEditor({ text, highlights, onHighlightsChange, initialWord, onClose }) {
  const [word,      setWord]      = useState(initialWord ?? '')
  const [bold,      setBold]      = useState(false)
  const [color,     setColor]     = useState(null)
  const [useBg,     setUseBg]     = useState(false)
  const [bgColor,   setBgColor]   = useState('#b6fe3b')
  const [bgOpacity, setBgOpacity] = useState(0.25)

  function add() {
    if (!word.trim()) return
    onHighlightsChange([...highlights, {
      id: Date.now().toString(),
      word: word.trim(), bold, color,
      bgColor: useBg ? bgColor : null, bgOpacity,
    }])
    setWord(''); setBold(false); setColor(null); setUseBg(false)
  }

  function remove(id) {
    onHighlightsChange(highlights.filter(h => h.id !== id))
  }

  return (
    <div className="hlEditor" onClick={e => e.stopPropagation()}>
      <div className="hlEditorHeader">
        <span className="hlEditorTitle">Выделения</span>
        <button className="hlEditorClose" onClick={onClose}>✕</button>
      </div>

      <div className="hlPreview">
        <div className="hlPreviewLabel">Предпросмотр</div>
        <div className="hlPreviewText"><PreviewText text={text} highlights={highlights} /></div>
      </div>

      <div className="hlForm">
        <input
          className="hlWordInput"
          value={word}
          onChange={e => setWord(e.target.value)}
          placeholder="Слово или фраза для выделения"
          onClick={e => e.stopPropagation()}
        />
        <label className="hlCheckRow">
          <input type="checkbox" checked={bold} onChange={e => setBold(e.target.checked)} />
          <span>Жирный</span>
        </label>

        <div className="hlColorSection">
          <span className="hlLabel">Цвет текста</span>
          <div className="hlChips">
            <button
              className={`hlChip hlChipNone${!color ? ' hlChipActive' : ''}`}
              onClick={() => setColor(null)} title="По умолчанию"
            >×</button>
            {COLORS.map(c => (
              <button key={c} className={`hlChip${color === c ? ' hlChipActive' : ''}`}
                style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>

        <label className="hlCheckRow">
          <input type="checkbox" checked={useBg} onChange={e => setUseBg(e.target.checked)} />
          <span>Подложка (фон слова)</span>
        </label>

        {useBg && (
          <div className="hlBgSection">
            <div className="hlChips">
              {COLORS.map(c => (
                <button key={c} className={`hlChip${bgColor === c ? ' hlChipActive' : ''}`}
                  style={{ background: c }} onClick={() => setBgColor(c)} />
              ))}
            </div>
            <label className="hlSliderRow">
              <span>Непрозрачность {Math.round(bgOpacity * 100)}%</span>
              <input type="range" min="0.05" max="1" step="0.05" value={bgOpacity}
                onChange={e => setBgOpacity(+e.target.value)} className="hlOpacitySlider" />
            </label>
          </div>
        )}

        <button className="hlAddBtn" onClick={add} disabled={!word.trim()}>+ Добавить</button>
      </div>

      {highlights.length > 0 && (
        <div className="hlList">
          <span className="hlLabel">Добавленные:</span>
          {highlights.map(h => (
            <div key={h.id} className="hlListItem">
              <span style={{
                color:        h.color   || undefined,
                fontWeight:   h.bold    ? 700 : undefined,
                background:   h.bgColor ? hexToRgba(h.bgColor, h.bgOpacity ?? 0.3) : undefined,
                borderRadius: h.bgColor ? '3px' : undefined,
                padding:      h.bgColor ? '0 3px' : undefined,
              }}>«{h.word}»</span>
              <button className="hlListRemove" onClick={() => remove(h.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
