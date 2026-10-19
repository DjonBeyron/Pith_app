import { useMemo, useState } from 'react'
import CopyIcon from './CopyIcon.jsx'
import { useDebouncedPatch } from './useDebouncedPatch.js'
import NodeSceneCrop from '../NodeSceneCrop.jsx'
import { resolveSceneNode, rawSceneLines } from '../../scene/v2/sceneNode.js'
import { sceneLinesText } from './sceneLinesText.js'
import SceneLinesAfter from './SceneLinesAfter.jsx'

// Нода scene в окне замечания. Автор видит то, что «говорит код»: название и реплики сцены (в «До» и в «После» — текст,
// озвучка, перевод), а контроллеры масштаба и положения кадра (crop) — только в «После» (в «До» оригинал не меняется).
// Правки crop идут в копию урока разбора с задержкой (useDebouncedPatch), сам кадр двигается без лагов (локальное состояние).
function CropAfter({ d, scene, mode, onPatch, reg }) {
  const [crop, setCrop] = useState(d.crop)
  const commit = useDebouncedPatch(onPatch, reg)
  const change = patch => {
    if (!('crop' in patch)) return
    setCrop(patch.crop)
    commit(x => ({ ...x, crop: patch.crop }))
  }
  return <NodeSceneCrop tData={{ ...d, crop }} scene={scene} mode={mode} onChange={change} />
}

export default function SceneEditor({ data, onPatch, reg, ro }) {
  const resolved = useMemo(() => resolveSceneNode(data), [data])
  const scene = resolved.scene
  const raw = data?.scene && typeof data.scene === 'object' ? data.scene : null
  const text = scene ? sceneLinesText(scene) : rawSceneLines(raw).map(l => `${l.name || 'Кот'}: ${l.text}`).join('\n')
  return (
    <>
      <div className="rvwEdBlock">
        <label className="rvwEdLbl">Название сцены (видит админ)</label>
        <div className="rvwEdIn">{(scene ?? raw)?.title || 'Без названия'}{resolved.mode === 'circle' ? ' · кружок, без облачков' : ' · пузырь'}</div>
      </div>
      {ro || !raw
        ? (
          <div className="rvwEdBlock">
            <label className="rvwEdLbl">Реплики сцены: что говорит код <CopyIcon text={() => text} /></label>
            <textarea className="rvwEdIn" readOnly rows={Math.min(10, Math.max(3, text.split('\n').length))} value={text} />
          </div>
        )
        : <SceneLinesAfter raw={raw} onPatch={onPatch} reg={reg} />}
      {!ro && scene && <CropAfter d={data} scene={scene} mode={resolved.mode} onPatch={onPatch} reg={reg} />}
    </>
  )
}
