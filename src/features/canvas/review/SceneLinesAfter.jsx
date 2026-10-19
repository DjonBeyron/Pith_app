import { useState } from 'react'
import { useDebouncedPatch } from './useDebouncedPatch.js'
import { setSceneLine } from './sceneLineEdit.js'

// Реплики сцены в «После»: по полю на реплику (текст и необязательный перевод). Значения держим локально (набор без лагов),
// в копию урока разбора они уходят пачкой (useDebouncedPatch) в typeData.scene.scene.timeline[i]
export default function SceneLinesAfter({ raw, onPatch, reg }) {
  const timeline = Array.isArray(raw?.timeline) ? raw.timeline : []
  const [vals, setVals] = useState(() => timeline.map(l => ({ text: l?.text ?? '', translation: l?.translation ?? '' })))
  const commit = useDebouncedPatch(onPatch, reg)
  const change = (i, key, value) => {
    setVals(v => v.map((m, k) => (k === i ? { ...m, [key]: value } : m)))
    commit(x => ({ ...x, scene: setSceneLine(x.scene, i, { [key]: value }) }))
  }
  const name = who => raw?.characters?.[who]?.name || (who === 'b' ? 'Кот 2' : 'Кот')
  return (
    <div className="rvwEdBlock" data-scene-lines>
      <label className="rvwEdLbl">Реплики сцены: правка (после)</label>
      {timeline.map((l, i) => (
        <div key={i} className="rvwEdBlock">
          <div className="rvwEdLbl">{i + 1}. {name(l?.who)}</div>
          <textarea className="rvwEdIn" rows={2} value={vals[i]?.text ?? ''} onChange={e => change(i, 'text', e.target.value)} data-line-text={i} />
          <input className="rvwEdIn" placeholder="перевод (необязательно)" value={vals[i]?.translation ?? ''} onChange={e => change(i, 'translation', e.target.value)} data-line-tr={i} />
        </div>
      ))}
      <p className="nodeSceneHint">После правки текста озвучка этой реплики сбрасывается (она записана под старые слова) — озвучь её заново кнопкой «Озвучить» в редакторе сцены.</p>
    </div>
  )
}
