import { useEffect, useState } from 'react'
import SceneRenderer from '../scene/v2/SceneRenderer.jsx'
import NodeSceneBuilderHost from '../canvas/NodeSceneBuilderHost.jsx'
import { demoOfficeScene } from '../scene/v2/demoScenes.js'
import { getScene, saveScene } from '../../shared/api/scenesApi.js'
import { updateCurriculumScene } from '../../shared/lib/curriculaApi.js'
import ModuleSceneLibrary from './ModuleSceneLibrary.jsx'
import { sceneLinkState, sceneLinkText, sceneLinkTone, builderSavePayload } from './moduleSceneModel.js'
import { modesSummary } from '../admin/scenes/modes/sceneModes.js'
import { voiceSummary } from '../canvas/scenePickerModel.js'
import { openSceneInFeed } from '../admin/scenes/feedTest/openInFeed.js'

// Режим «Сцена» панели медиа модуля (ModuleVideoPanel): привязка сцены библиотеки к
// модулю ленты (curricula.scene_id). Проверяет привязанную строку (getScene): опубликована /
// черновик (ленту покажет без сцены!) / удалена; мини-превью статичным кадром; «Из
// библиотеки» (только published, ModuleSceneLibrary), «Создать / править в сборщике»
// (тот же BuilderWindow, что у ноды канваса; «Применить» = сохранить в библиотеку как
// published и привязать), «Убрать сцену». Сцена в ленте заменяет видео — видео остаётся запасным.
// «Открыть в ленте с заданием» (сцена опубликована): тест — принудительный показ задания и поворот ленты к модулю (feedTest/openInFeed).
// Режимы показа/озвучки лента берёт из options сцены — здесь только сводка и ссылка «править в сборщике».
export default function ModuleScenePanel({ curriculumId, sceneId, hasVideo, onChange }) {
  // Ответ getScene помечен id, для которого получен: сменился sceneId — старый ответ
  // не считается (loaded = false), без синхронного сброса состояния в эффекте
  const [res, setRes] = useState({ forId: null, row: null, error: null })
  const [lib, setLib] = useState(false)
  const [builder, setBuilder] = useState(false)
  const [busy, setBusy] = useState('')
  const [actErr, setActErr] = useState('')

  useEffect(() => {
    if (!sceneId) return undefined
    let alive = true
    getScene(sceneId)
      .then(r => { if (alive) setRes({ forId: sceneId, row: r ?? null, error: null }) })
      .catch(e => { if (alive) setRes({ forId: sceneId, row: null, error: e }) })
    return () => { alive = false }
  }, [sceneId])

  const loaded = !!sceneId && res.forId === sceneId
  const row = loaded ? res.row : null
  const error = loaded ? res.error : null
  const state = sceneLinkState({ sceneId, row, error, loaded })
  const tone = sceneLinkTone(state)

  async function link(id) {
    setBusy('Привязываем…'); setActErr('')
    try { await updateCurriculumScene(curriculumId, id); onChange(id) } catch (e) { setActErr(e?.message || 'Не удалось сохранить') }
    setBusy('')
  }

  async function applyFromBuilder(scene, saved) {
    setBuilder(false)
    setBusy('Сохраняем сцену в библиотеку…'); setActErr('')
    try {
      const savedRow = await saveScene(builderSavePayload(scene, saved))
      await updateCurriculumScene(curriculumId, savedRow.id)
      onChange(savedRow.id)
    } catch (e) { setActErr(e?.message || 'Не удалось сохранить сцену') }
    setBusy('')
  }

  async function unlink() {
    if (!window.confirm('Убрать сцену из ленты? Сама сцена останется в библиотеке.')) return
    await link(null)
  }

  return (
    <div className="msPanel">
      {row?.scene && state !== 'deleted' && (
        <div className="msTop">
          <div className="msPreview" aria-hidden="true">
            <SceneRenderer scene={row.scene} mode="static" showBubbles={false} lite />
          </div>
          <div className="msCandMeta">
            <div className="msCandTitle">{row.title}</div>
            <div className="mvHint">{(row.scene.timeline ?? []).length} реплик · {voiceSummary(row.scene)}</div>
            <div className="mvHint" title="Лента берёт режимы из options сцены; поменять — «Править в сборщике» → Параметры воспроизведения">{modesSummary(row.scene)} — <button type="button" className="msLink" onClick={() => setBuilder(true)} disabled={!!busy}>править в сборщике</button></div>
          </div>
        </div>
      )}
      <p className={`msState msState--${tone}`} role={tone === 'ok' || tone === 'dim' ? undefined : 'alert'}>{sceneLinkText(state, error)}</p>
      {state !== 'none' && hasVideo && <p className="mvHint">Видео фразы тоже загружено: в ленте оно уступает сцене и остаётся запасным</p>}
      {state === 'none' && hasVideo && <p className="mvHint">Привязанная сцена заменит видео в ленте</p>}

      <div className="mvRowBtns msBtns">
        <button type="button" className="mvAction" onClick={() => setLib(v => !v)} disabled={!!busy}>Из библиотеки</button>
        <button type="button" className="mvAction msPrimary" onClick={() => setBuilder(true)} disabled={!!busy}>
          {row?.scene ? 'Править в сборщике' : 'Создать в сборщике'}
        </button>
        {state === 'published' && <button type="button" className="mvAction" onClick={() => { if (!openSceneInFeed({ moduleId: curriculumId, sceneId })) setActErr('Не удалось выставить принудительный показ задания') }} disabled={!!busy} title="Лента откроется на этом модуле, задание сцены (если есть) покажется сразу, без лимитов">Открыть в ленте с заданием</button>}
        {sceneId && <button type="button" className="mvAction mvDanger" onClick={unlink} disabled={!!busy}>Убрать сцену</button>}
      </div>
      {busy && <div className="mvHint">{busy}</div>}
      {actErr && <div className="mvErr" role="alert">{actErr}</div>}

      {lib && (
        <ModuleSceneLibrary
          currentId={sceneId ?? null}
          onPick={r => { setLib(false); link(r.id) }}
          onClose={() => setLib(false)}
        />
      )}
      {builder && (
        <NodeSceneBuilderHost
          title="Сцена для ленты"
          applyLabel="В библиотеку и в ленту"
          useMode="module"
          initialScene={row?.scene ?? demoOfficeScene}
          initialRow={row?.scene ? row : null}
          onApply={applyFromBuilder}
          onClose={() => setBuilder(false)}
        />
      )}
    </div>
  )
}
