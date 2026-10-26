import { useMemo, useState } from 'react'
import { treeToSvgDocument } from '../../scene/v2/sprites/svgTree.js'
import { catSprite } from '../../scene/v2/sprites/spriteRegistry.js'
import { spriteCheckSummary } from '../../scene/v2/spriteCheck.js'
import { PALETTE_PRESETS } from '../../scene/v2/sceneConstants.js'
import SpritePreview from './SpritePreview.jsx'
import CatControls from './CatControls.jsx'
import MascotControls from './MascotControls.jsx'
import { copyText } from './fileUtils.js'
import { KIND_LABEL } from './sceneLabels.js'

// Карточка спрайта в галерее: превью, id, название, число узлов, совместимые слоты,
// статус spriteCheck, кнопки «Скопировать SVG» / «Скопировать id». Для кота — переключатели
// пола, эмоции, формы рта и палитры (CatControls); у маскота (Пит, Мия) — лица, рот и два выключателя (MascotControls); превью и SVG следуют за ними.

export default function SpriteCard({ sprite }) {
  const [cat, setCat] = useState({ gender: sprite.gender ?? 'male', emotion: 'neutral', mouth: 'closed', palette: { ...PALETTE_PRESETS.ginger }, stripes: true })
  const [mascot, setMascot] = useState({ face: 'base', mouth: 'closed', pupilReaction: true, extraFace: true })
  const [note, setNote] = useState('')
  const isMascot = !!sprite.skin
  const isCat = sprite.kind === 'cat' && !isMascot
  const shown = isCat ? catSprite(cat.gender) : sprite
  const props = useMemo(() => {
    if (isMascot) return { face: mascot.face, pupilReaction: mascot.pupilReaction, extraFace: mascot.extraFace }
    return isCat ? { palette: cat.palette, stripes: cat.stripes, emotion: cat.emotion } : {}
  }, [isMascot, isCat, cat, mascot])

  const check = useMemo(() => {
    const svg = treeToSvgDocument(shown.build(props), { viewBox: shown.viewBox })
    return { svg, ...spriteCheckSummary(svg, shown.checkKind ?? shown.kind) }
  }, [shown, props])

  const copy = async (text, label) => setNote((await copyText(text)) ? `${label} — скопировано` : 'Не удалось скопировать')

  return (
    <article className={`scSprite${check.ok ? '' : ' scSpriteBad'}`} aria-label={sprite.title}>
      <div className="scSpriteTop">
        <div className={`scSpriteArt scSpriteArt-${shown.kind}`}>
          <SpritePreview sprite={shown} props={props} mouth={isMascot ? mascot.mouth : cat.mouth} size={shown.kind === 'background' ? 120 : 96} />
        </div>
        <div className="scSpriteMeta">
          <p className="scSpriteTitle">{shown.title}</p>
          <p className="scSpriteId"><code>{shown.id}</code> · {KIND_LABEL[shown.kind]} · {shown.category}</p>
          <p className="scSpriteRow">Узлов: <b>{check.nodes}</b> · viewBox {shown.viewBox} · якорь {shown.anchor}</p>
          <p className="scSpriteRow">
            Проверка: <span className={check.ok ? 'scOk' : 'scBad'}>{check.ok ? 'ок' : `${check.problems.length} нарушений`}</span>
          </p>
          {!check.ok && <ul className="scProblems">{check.problems.map(p => <li key={p}>{p}</li>)}</ul>}
          {shown.kind === 'prop' && (
            <p className="scSpriteRow scSlots">
              Слоты: {shown.slots.length ? shown.slots.map(s => <code key={s}>{s}</code>) : '—'}
            </p>
          )}
          {(isCat || isMascot) && <p className="scSpriteRow scSlots">Части: {shown.parts.map(p => <code key={p}>{p}</code>)}</p>}
        </div>
      </div>
      {isCat && <CatControls value={cat} onChange={setCat} />}
      {isMascot && <MascotControls skin={sprite.skin} value={mascot} onChange={setMascot} />}
      <div className="scSpriteBtns">
        <button className="scBtn" onClick={() => copy(check.svg, 'SVG')}>Скопировать SVG</button>
        <button className="scBtn" onClick={() => copy(shown.id, 'id')}>Скопировать id</button>
        {note && <span className="scNote" role="status">{note}</span>}
      </div>
    </article>
  )
}
