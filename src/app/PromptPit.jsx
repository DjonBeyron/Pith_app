import { memo, useMemo } from 'react'
import { buildMascot } from '../features/scene/v2/sprites/mascot/mascotSprite.js'
import { renderTree } from '../features/scene/v2/renderTree.js'
import { isWeakDevice } from '../shared/lib/deviceTier.js'
import '../features/scene/v2/scene-v2-cat.css'
import '../styles/prompt-pit.css'

// Пит, выглядывающий из-за карточки уведомления (шторки PromptSheet; живёт в app/, потому что shared не импортирует features — PromptHost передаёт его шторке пропсом pit). Только голова: хвост и тело скрыты (prompt-pit.css), снизу не торчит —
// нижняя часть головы лежит под карточкой. Появляется чуть позже самой карточки (задержка в CSS). Анимация — зацикленная и дешёвая,
// только CSS: моргание глаз (scnBlink из scene-v2-cat.css), зрачки водят туда-сюда, усы чуть покачиваются. На слабом устройстве
// (isWeakDevice) и при reduced-motion — просто выглядывает без петель. Касаний не ловит, скринридеру не нужен (aria-hidden).
// Тот же маскот, что в сцене (buildMascot('kit')); дерево собирается один раз на приложение.
const CAT_VIEWBOX = '6 14 174 148' // голова от ушей до шеи — тот же кадр, что у Пита в игре (WordLaneCat)
let tree = null
const headTree = () => tree ?? (tree = renderTree(buildMascot('kit', { face: 'base', flip: false })))

function PromptPit() {
  const cat = useMemo(() => headTree(), [])
  const lite = useMemo(() => isWeakDevice(), [])
  return (
    <span className={`promptPit${lite ? ' promptPit--lite' : ''}`} aria-hidden="true" data-testid="prompt-pit">
      <svg viewBox={CAT_VIEWBOX} className="promptPitSvg"><g className="scn-cat">{cat}</g></svg>
    </span>
  )
}

export default memo(PromptPit)
