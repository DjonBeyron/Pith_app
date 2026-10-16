import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import HelpTip from '../../admin/signals/HelpTip.jsx'
import NodeSceneBuilderHost from '../NodeSceneBuilderHost.jsx'
import { demoOfficeScene } from '../../scene/v2/demoScenes.js'
import { wordKey } from '../../../shared/lib/wordAudio/wordKey.js'
import SceneTabRow from './SceneTabRow.jsx'
import SceneTabSummary from './SceneTabSummary.jsx'
import SceneTabEmpty from './SceneTabEmpty.jsx'
import SceneAddMenu from './SceneAddMenu.jsx'
import SceneModuleBlock from './SceneModuleBlock.jsx'
import { useSceneTabActions } from './useSceneTabActions.js'
import { useModuleScene } from './useModuleScene.js'
import { TAB_HELP } from './sceneTabHelp.js'

// Вкладка «Сцены» канваса урока (кнопка в шапке, рядом с «Граф»): сцены ЭТОГО урока — ноды `scene`
// по порядку — со сводкой, правилами S1–S8, чипами «Динамичная/Статичная» и действиями строки
// (сборщик сцен, к ноде, как в плеере, дубль, удаление). data — useSceneRows (его же берёт бейдж
// кнопки); никаких запросов, кроме необязательного блока «Сцена модуля в ленте».
export default function SceneTabPanel({ data, lessonTitle = '', boardApiRef, module = null, onPlayFrom, onClose }) {
  const act = useSceneTabActions({ boardApiRef, onClose, onPlayFrom })
  const mod = useModuleScene(module?.id, true)
  const [modEdit, setModEdit] = useState(false)
  const listRef = useRef(null)
  const { editing, added, clearAdded } = act
  const busy = !!editing || modEdit

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // Только что добавленная нода: как только она появится в списке — показать и мигнуть
  useEffect(() => {
    if (!added) return undefined
    const el = listRef.current?.querySelector(`[data-node-id="${added}"]`)
    if (!el) return undefined
    el.scrollIntoView?.({ block: 'nearest' })
    el.dataset.added = '1'
    const t = setTimeout(() => { delete el.dataset.added; clearAdded() }, 1800)
    return () => clearTimeout(t)
  }, [added, data.rows, clearAdded])

  const isWord = !!wordKey(lessonTitle)
  return createPortal(
    <div className="scTabOverlay" onMouseDown={() => { if (!busy) onClose() }}>
      <div className="scTab" role="dialog" aria-modal="true" aria-label="Сцены урока" onMouseDown={e => e.stopPropagation()}>
        <div className="scTabTop">
          <span className="scTabTopTitle">Сцены урока</span>
          <HelpTip content={TAB_HELP.tab} />
          <button type="button" className="scTabClose" aria-label="Закрыть вкладку «Сцены»" title="Закрыть" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="scTabScroll">
          <SceneTabSummary summary={data.summary} issues={data.issues} isWordLesson={isWord} />
          <SceneAddMenu onAdd={act.add} disabled={busy} />
          {module?.id && <SceneModuleBlock moduleTitle={module.title} state={mod} onEdit={() => setModEdit(true)} />}
          {data.rows.length === 0
            ? <SceneTabEmpty />
            : (
              <ul className="scTabList" ref={listRef} aria-label="Сцены этого урока">
                {data.rows.map(r => <SceneTabRow key={r.id} row={r} handlers={act.handlers} busy={busy} />)}
              </ul>
            )}
        </div>
      </div>
      {editing && (
        <NodeSceneBuilderHost
          initialScene={editing.scene ?? demoOfficeScene} initialView={editing.view}
          onApply={act.apply} onClose={act.closeEditor}
        />
      )}
      {modEdit && mod.row?.scene && (
        <NodeSceneBuilderHost
          title="Сцена для ленты" applyLabel="В библиотеку и в ленту" useMode="module"
          initialScene={mod.row.scene} initialRow={mod.row}
          onApply={async (scene, saved) => { setModEdit(false); try { await mod.apply(scene, saved) } catch (e) { window.alert(e?.message || 'Не удалось сохранить сцену') } }}
          onClose={() => setModEdit(false)}
        />
      )}
    </div>,
    document.body,
  )
}
