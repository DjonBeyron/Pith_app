import { useMemo, useState } from 'react'
import { svgToSpriteCode } from './svgToSpriteCode.js'
import { spriteCheckSummary, SPRITE_KINDS } from '../../../scene/v2/spriteCheck.js'
import { treeToSvgDocument } from '../../../scene/v2/sprites/svgTree.js'
import { copyText, readFileText } from '../fileUtils.js'
import ScTip from '../ScTip.jsx'

// «Конвертировать SVG в код спрайта»: вставил SVG предмета → id / название / категория / якорь →
// готовый фрагмент записи для sprites/props*.js (svgToSpriteCode). Рядом — статус spriteCheck
// самого фрагмента (дерево → SVG → checkSpriteSvg): в реестр уходит только то, что проходит проверку.
const CATEGORIES = [['common', 'Общие'], ['office', 'Офис'], ['cafe', 'Кафе']]
const ANCHORS = [['auto', 'по viewBox'], ['bottom', 'низ (стоит)'], ['center', 'центр (на стене)'], ['top', 'верх (подвешен)']]
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export default function SvgToCodeTool() {
  const [text, setText] = useState('')
  const [id, setId] = useState('my-prop')
  const [title, setTitle] = useState('Новый предмет')
  const [category, setCategory] = useState('common')
  const [anchor, setAnchor] = useState('auto')
  const [copied, setCopied] = useState('')

  const result = useMemo(() => {
    if (!text.trim()) return null
    const r = svgToSpriteCode(text, { id, title, category, anchor: anchor === 'auto' ? undefined : anchor })
    if (r.error) return r
    const svg = treeToSvgDocument(r.tree, { viewBox: r.viewBox ? r.viewBox.join(' ') : '0 0 1 1' })
    return { ...r, check: spriteCheckSummary(svg, 'prop') }
  }, [text, id, title, category, anchor])

  const onFile = async e => {
    const f = e.target.files?.[0]
    if (f) { try { setText(await readFileText(f)); if (ID_RE.test(f.name.replace(/\.svg$/i, ''))) setId(f.name.replace(/\.svg$/i, '')) } catch { /* остаётся старый текст */ } }
    e.target.value = ''
  }
  const copy = async () => { setCopied((await copyText(result.code)) ? 'Скопировано' : 'Не удалось — выделите текст вручную'); setTimeout(() => setCopied(''), 2000) }
  const badId = !ID_RE.test(id)

  return (
    <div className="scdTool" id="scd-svg-to-code">
      <p className="scCardTitle">Конвертировать SVG в код спрайта <ScTip help="svg_to_code" /></p>
      <p className="scHint">Для предметов. Вставьте SVG дизайнера (уже с зелёным вердиктом), задайте поля — и скопируйте запись в массив COMMON_PROPS / OFFICE_PROPS / CAFE_PROPS.
        Якорь по умолчанию угадывается по viewBox; размер — из viewBox. Для кота и фона фрагмент пригодится как дерево фигур, но запись реестра у них другая (см. шаг «Куда класть»).</p>
      <div className="scdCheckCtl">
        <label className="scLabel">id <input className="scdInput" value={id} onChange={e => setId(e.target.value.trim())} aria-invalid={badId} /></label>
        <label className="scLabel">название <input className="scdInput" value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="scLabel">категория <select className="scdInput" value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="scLabel">якорь <select className="scdInput" value={anchor} onChange={e => setAnchor(e.target.value)}>{ANCHORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="scBtn scdFile">Загрузить файл…<input type="file" accept=".svg,image/svg+xml" onChange={onFile} /></label>
      </div>
      {badId && <p className="scBad">id — латиница в нижнем регистре и дефисы: coffee-cup</p>}
      <textarea className="scdText" rows={5} value={text} onChange={e => setText(e.target.value)} spellCheck={false} placeholder="Вставьте SVG предмета сюда" aria-label="SVG для конвертации" />
      {result?.error && <p className="scBad" role="alert">{result.error}</p>}
      {result && !result.error && (
        <div className="scdToolOut" role="status">
          <p className={result.check.ok ? 'scOk' : 'scBad'}>
            {result.check.ok ? `Фрагмент проходит spriteCheck · узлов ${result.check.nodes} из ${SPRITE_KINDS.prop.maxNodes} · якорь ${result.anchor}` : `Фрагмент НЕ проходит spriteCheck (${result.check.problems.length}) — исправьте SVG, в реестр не вставляйте`}
          </p>
          {!result.check.ok && <ul className="scProblems">{result.check.problems.map(p => <li key={p}>{p}</li>)}</ul>}
          {result.warnings.length > 0 && <ul className="scList scdWarn">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
          <div className="scdCheckCtl">
            <button type="button" className="scBtn" onClick={copy} disabled={badId}>Скопировать код</button>
            {copied && <span className="scHint">{copied}</span>}
          </div>
          <pre className="scdCode"><code>{result.code}</code></pre>
        </div>
      )}
    </div>
  )
}
