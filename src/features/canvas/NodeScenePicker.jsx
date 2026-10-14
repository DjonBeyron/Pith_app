import { useMemo, useState } from 'react'
import SceneRenderer from '../scene/v2/SceneRenderer.jsx'
import { resolveSceneNode, sceneSummary, libraryHasNewer } from '../scene/v2/sceneNode.js'
import { getScene } from '../../shared/api/scenesApi.js'
import { demoOfficeScene } from '../scene/v2/demoScenes.js'
import NodeSceneLibraryList from './NodeSceneLibraryList.jsx'
import NodeSceneBuilderHost from './NodeSceneBuilderHost.jsx'
import { pickRowPatch, applyBuilderPatch, clearScenePatch, sceneCheck, voiceLabel } from './scenePickerModel.js'

// Редактор ноды `scene` (канвас и продакшен-список): мини-превью статичным
// кадром, название/реплики/бюджет, режим «Пузырь / Кружок», «Облачки»,
// библиотека сцен (снимок копируется в ноду, sceneId запоминается), сборщик
// поверх канваса (NodeSceneBuilderHost → BuilderWindow в управляемом режиме),
// «Обновить из библиотеки» (есть новая версия — предложить обновить снимок),
// индикатор валидности (ошибки/предупреждения sceneLint). Формат — sceneNode.js.
const MODES = [['bubble', 'Пузырь'], ['circle', 'Кружок']]

export default function NodeScenePicker({ tData, onChange }) {
  const [lib, setLib] = useState(false)
  const [builder, setBuilder] = useState(false)
  const [upd, setUpd] = useState(null) // null | 'checking' | { row } | 'fresh' | 'error'
  const [showWarns, setShowWarns] = useState(false)
  const raw = tData?.scene ?? null
  const resolved = useMemo(() => resolveSceneNode(tData), [tData])
  const check = useMemo(() => sceneCheck(raw), [raw])
  const preview = resolved.scene
  const stop = e => e.stopPropagation()

  async function checkLibrary() {
    if (!tData?.sceneId) return
    setUpd('checking')
    try {
      const row = await getScene(tData.sceneId)
      if (!row) setUpd('error')
      else setUpd(libraryHasNewer(tData, row) ? { row } : 'fresh')
    } catch { setUpd('error') }
  }

  return (
    <div className="nodeScenePicker" onClick={stop} onMouseDown={stop}>
      <div className="nodeSceneTop">
        <div className={`nodeScenePreview nodeScenePreview--${resolved.mode}`} aria-hidden="true">
          {preview
            ? <SceneRenderer scene={preview} mode="static" showBubbles={false} lite />
            : <div className="nodeScenePreviewEmpty">{raw ? '⚠' : '🐱'}</div>}
        </div>
        <div className="nodeSceneMeta">
          <div className="nodeSceneTitle">{preview ? sceneSummary(preview) : (raw ? 'Сцена повреждена' : 'Сцена не выбрана')}</div>
          {preview && <div className="nodeSceneSub">{voiceLabel(preview)} · {Math.round(check.bytes / 1024)} КБ{tData.sceneId ? ' · из библиотеки' : ''}</div>}
          <div className="nodeSceneBtns">
            <button type="button" className="nodeSceneBtn" onClick={() => { setLib(v => !v); setUpd(null) }}>Из библиотеки</button>
            <button type="button" className="nodeSceneBtn nodeSceneBtnPrimary" onClick={() => setBuilder(true)}>
              {preview ? 'Править в сборщике' : 'Создать сцену'}
            </button>
            {tData.sceneId && <button type="button" className="nodeSceneBtn" onClick={checkLibrary} disabled={upd === 'checking'}>Обновить из библиотеки</button>}
            {raw && <button type="button" className="nodeSceneBtn nodeSceneBtnDanger" onClick={() => onChange(clearScenePatch())}>Убрать</button>}
          </div>
        </div>
      </div>

      {upd === 'checking' && <p className="nodeSceneHint">Проверяю библиотеку…</p>}
      {upd === 'fresh' && <p className="nodeSceneHint">Снимок актуален — в библиотеке та же версия</p>}
      {upd === 'error' && <p className="nodeSceneErr">Сцена в библиотеке не найдена (удалена или нет доступа) — снимок в ноде работает как прежде</p>}
      {upd?.row && (
        <p className="nodeSceneHint nodeSceneUpdRow">
          В библиотеке новая версия «{upd.row.title}».{' '}
          <button type="button" className="nodeSceneBtn nodeSceneBtnPrimary" onClick={() => { onChange(pickRowPatch(upd.row)); setUpd(null) }}>Обновить снимок</button>
          <button type="button" className="nodeSceneBtn" onClick={() => setUpd(null)}>Оставить</button>
        </p>
      )}

      <div className="nodeSceneRow">
        <div className="nodeSceneSeg" role="radiogroup" aria-label="Режим показа">
          {MODES.map(([id, label]) => (
            <button
              key={id} type="button" role="radio" aria-checked={resolved.mode === id}
              className={resolved.mode === id ? 'nodeSceneSegBtn nodeSceneSegBtnOn' : 'nodeSceneSegBtn'}
              onClick={() => onChange({ mode: id })}
            >{label}</button>
          ))}
        </div>
        <label className="nodeSceneCheck">
          <input type="checkbox" checked={resolved.showBubbles} onChange={e => onChange({ showBubbles: e.target.checked })} />
          Облачки с текстом
        </label>
      </div>

      {(check.errors.length > 0 || check.warns.length > 0) && (
        <div className={`nodeSceneLint ${check.errors.length ? 'nodeSceneLint--err' : 'nodeSceneLint--warn'}`}>
          <button type="button" className="nodeSceneLintHead" onClick={() => setShowWarns(v => !v)}>
            {check.errors.length ? `Ошибок: ${check.errors.length}` : 'Сцена годная'}{check.warns.length ? ` · предупреждений: ${check.warns.length}` : ''} {showWarns ? '▴' : '▾'}
          </button>
          {(showWarns || check.errors.length > 0) && (
            <ul>
              {check.errors.map((t, i) => <li key={`e${i}`} className="nodeSceneLintErr">{t}</li>)}
              {showWarns && check.warns.map((t, i) => <li key={`w${i}`}>{t}</li>)}
            </ul>
          )}
        </div>
      )}
      {preview && !check.errors.length && !check.warns.length && <p className="nodeSceneHint nodeSceneOk">Сцена годная: линтер без замечаний</p>}

      {lib && (
        <NodeSceneLibraryList
          currentId={tData.sceneId ?? null}
          onPick={row => { const p = pickRowPatch(row); if (p) onChange(p); setLib(false) }}
          onClose={() => setLib(false)}
        />
      )}
      {builder && (
        <NodeSceneBuilderHost
          initialScene={preview ?? raw ?? demoOfficeScene}
          onApply={scene => { onChange(applyBuilderPatch(scene, { prevTd: tData })); setBuilder(false) }}
          onClose={() => setBuilder(false)}
        />
      )}
    </div>
  )
}
