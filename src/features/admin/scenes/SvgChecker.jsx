import { useState, useMemo } from 'react'
import { spriteCheckSummary, SPRITE_KINDS } from '../../scene/v2/spriteCheck.js'
import { readFileText, svgDataUrl } from './fileUtils.js'
import { fixHintFor } from './designer-pack/fixHints.js'
import ScTip from './ScTip.jsx'

// «Проверить SVG»: файл с диска или вставленный текст → checkSpriteSvg по типу
// (кот / предмет / фон) → отчёт: ок или список нарушений (+ «как исправить» из designer-pack/fixHints —
// те же подсказки, что в автономном проверщике дизайнера), число узлов, найденные группы
// data-part и data-viseme; предпросмотр через <img src="data:…"> (скрипты в img не выполняются).
const KINDS = [['cat', 'Кот'], ['prop', 'Предмет'], ['background', 'Фон']]
const PART_RE = /data-part\s*=\s*["']([^"']+)["']/g
const VISEME_RE = /data-viseme\s*=\s*["']([^"']+)["']/g
const found = (text, re) => [...new Set([...String(text).matchAll(re)].map(m => m[1]))]

export default function SvgChecker() {
  const [kind, setKind] = useState('prop')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState('')

  const report = useMemo(() => {
    if (!text.trim()) return null
    return { ...spriteCheckSummary(text, kind), parts: found(text, PART_RE), visemes: found(text, VISEME_RE) }
  }, [text, kind])

  const onFile = async e => {
    const f = e.target.files?.[0]
    if (!f) return
    try { setText(await readFileText(f)); setFileName(f.name); setErr('') } catch (ex) { setErr(ex.message) }
    e.target.value = ''
  }

  return (
    <div className="scCard scdCheck" id="scd-check">
      <p className="scCardTitle">Проверить SVG <ScTip help="sprite_check" /></p>
      <div className="scdCheckCtl">
        <div className="scSegBtns" role="radiogroup" aria-label="Тип спрайта">
          {KINDS.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={kind === id} className={kind === id ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => setKind(id)}>{label}</button>
          ))}
        </div>
        <label className="scBtn scdFile">
          Загрузить файл…
          <input type="file" accept=".svg,image/svg+xml" onChange={onFile} />
        </label>
        {fileName && <span className="scHint">{fileName}</span>}
        {text && <button type="button" className="scBtn" onClick={() => { setText(''); setFileName('') }}>Очистить</button>}
      </div>
      <textarea
        className="scdText" value={text} onChange={e => { setText(e.target.value); setFileName('') }} spellCheck={false} rows={8}
        placeholder={`Вставьте текст SVG сюда (или загрузите файл). Лимит узлов для типа: ${SPRITE_KINDS[kind].maxNodes}`} aria-label="Текст SVG"
      />
      {err && <p className="scBad" role="alert">{err}</p>}
      {report && (
        <div className="scdReport" role="status">
          <div className="scdReportMain">
            <p className={report.ok ? 'scdVerdict scOk' : 'scdVerdict scBad'}>{report.ok ? 'Ок — файл можно класть в реестр' : `${report.problems.length} нарушений`}</p>
            <p className="scHint">Узлов: <b>{report.nodes}</b> из {SPRITE_KINDS[kind].maxNodes} · группы data-part: {report.parts.length ? report.parts.map(p => <code key={p}>{p}</code>) : '— нет —'}
              {kind === 'cat' && <> · виземы: {report.visemes.length ? report.visemes.map(v => <code key={v}>{v}</code>) : '— нет —'}</>}
            </p>
            {!report.ok && (
              <ul className="scProblems">
                {report.problems.map(p => <li key={p}>{p}{fixHintFor(p) && <span className="scdFix">{fixHintFor(p)}</span>}</li>)}
              </ul>
            )}
          </div>
          <div className="scdPreview" aria-label="Предпросмотр файла">
            <img src={svgDataUrl(text)} alt="Предпросмотр SVG" onError={e => { e.currentTarget.alt = 'Браузер не смог отрисовать файл' }} />
          </div>
        </div>
      )}
    </div>
  )
}
