import { useEffect, useState, useRef } from 'react'
import NodeAudioPicker from './NodeAudioPicker.jsx'
import NodeTextHighlighter from './NodeTextHighlighter.jsx'
import NodeTextProEditor from './NodeTextProEditor.jsx'
import NodeMediaCrop from './NodeMediaCrop.jsx'
import NodeTriggerEditor from './NodeTriggerEditor.jsx'
import NodeWordChoicePicker       from './NodeWordChoicePicker.jsx'
import NodePhraseAssemblyPicker   from './NodePhraseAssemblyPicker.jsx'
import NodeTablePicker            from './NodeTablePicker.jsx'
import NodePhotoChoicePicker      from './NodePhotoChoicePicker.jsx'
import NodeRegistrationTriggers   from './NodeRegistrationTriggers.jsx'
import NodeLessonLink     from './NodeLessonLink.jsx'
import NodeRewardCheckbox from './NodeRewardCheckbox.jsx'
import { makeDefaultTriggers, hasOwnTriggers, setLastNodeType } from './nodeDefaults.js'
import NodeTypeSelect from './NodeTypeSelect.jsx'
import { NODE_TYPES, TYPE_COLOR } from './nodeTypes.js'

const DEFAULT_CROP = { x: 0, y: 0, scale: 1 }
const NEXT_SIZE    = { nano: 'mini', mini: 'max', max: 'nano' }

// Mix module color with the node dark base (#12141a) instead of rgba transparency,
// so the node stays dark regardless of what's behind it.
function colorBg(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const br = 18, bg = 20, bb = 26  // #12141a
  return `rgb(${Math.round(br + (r - br) * alpha)},${Math.round(bg + (g - bg) * alpha)},${Math.round(bb + (b - bb) * alpha)})`
}

export default function CanvasNode({
  node, onUpdate, onDragStart, wasDragged, allNodes, lessonFiles = [], onPickLessonFile, onTriggerMeasure,
  moduleLessons = [],
}) {
  const color   = TYPE_COLOR[node.type] ?? TYPE_COLOR.text
  const [hlRect, setHlRect] = useState(null)  // viewport rect of node when HL editor is open
  const [hlTarget, setHlTarget] = useState('main') // 'main' | 'pro' — какой текст красим
  const nodeRef = useRef(null)

  // When leaving max mode, clear stale trigger measurements so they don't
  // ghost onto the next max layout (e.g. after type switch or size cycle).
  // Clear stale measurements when leaving max mode.
  // word_choice and phrase_assembly handle their own measurements via their pickers.
  useEffect(() => {
    if (node.size !== 'max') onTriggerMeasure?.([])
  }, [node.size, onTriggerMeasure])

  // Per-type data: each type stores its own file_id and (for photo/video) crop
  const tData  = node.typeData?.[node.type] ?? {}
  const fileId = tData.file_id ?? null
  const crop   = tData.crop ?? DEFAULT_CROP

  function updateTypeData(patch) {
    onUpdate({
      typeData: {
        ...node.typeData,
        [node.type]: { ...tData, ...patch },
      },
    })
  }

  function expandClick(e) {
    e.stopPropagation()
    if (wasDragged()) return
    onUpdate({ size: NEXT_SIZE[node.size] })
  }

  // Смена типа пересобирает триггеры под дефолт нового типа (nodeDefaults.js) —
  // старые строки не тянутся за нодой и не дублируются. Существующая связь
  // (then) сохраняется в первом триггере. Тип запоминается для новых нод.
  function changeType(e) {
    const newType = e.target.value
    setLastNodeType(newType)
    if (hasOwnTriggers(newType, node.triggers)) {
      onUpdate({ type: newType }) // родная пара уже есть — не трогаем связи
      return
    }
    const keepThen = node.triggers?.find(t => t.then)?.then ?? null
    onUpdate({ type: newType, triggers: makeDefaultTriggers(newType, keepThen) })
  }

  function handleAudioPick(file) {
    const id = onPickLessonFile(file)
    // Clear old analysis when file is replaced
    updateTypeData({ file_id: id, waveformData: null, wordTimings: null, duration: null })
  }

  function handleMediaPick(file) {
    const id = onPickLessonFile(file)
    if (node.type === 'sticker') {
      const isVid = file.type?.startsWith('video/')
      updateTypeData({ file_id: id, crop: DEFAULT_CROP, isVideo: isVid })
    } else {
      updateTypeData({ file_id: id, crop: DEFAULT_CROP })
    }
  }

  // ── nano ────────────────────────────────────────────────────────
  if (node.size === 'nano') {
    return (
      <div
        className="canvasNode canvasNodeNano"
        style={{ background: color }}
        onMouseDown={onDragStart}
        onClick={expandClick}
      >
        <span className="canvasNodeSeq">{node.seq}</span>
      </div>
    )
  }

  // ── mini ────────────────────────────────────────────────────────
  const miniFile = lessonFiles.find(f => f.id === fileId) ?? null

  if (node.size === 'mini') {
    return (
      <div className="canvasNode canvasNodeMini" style={{ background: colorBg(color, 0.07) }} onMouseDown={onDragStart}>
        <div className="canvasNodeTopBar" style={{ background: color }} />
        <div className="canvasNodeMiniBody">
          <button className="canvasNodeExpandBtn" onClick={expandClick}>›</button>
          <span className="canvasNodeSeq">#{node.seq}</span>
          <NodeTypeSelect value={node.type} onChange={v => changeType({ target: { value: v } })} compact />
          {miniFile && (
            <span
              className={`nodeAudioStatus ${miniFile.status === 'synced' ? 'nodeAudioStatusSynced' : 'nodeAudioStatusLocal'}`}
              title={miniFile.status === 'synced' ? 'На сервере' : 'Локально'}
            >
              {miniFile.status === 'synced' ? '↑' : '○'}
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── max ─────────────────────────────────────────────────────────
  return (
    <div ref={nodeRef} className="canvasNode canvasNodeMax" style={{ background: colorBg(color, 0.07) }} onMouseDown={onDragStart}>
      <div className="canvasNodeTopBar" style={{ background: color }} />
      <div className="canvasNodeMaxBody">
        <div className="canvasNodeMaxTop">
          <button className="canvasNodeExpandBtn" onClick={expandClick}>‹</button>
          <span className="canvasNodeSeq">#{node.seq}</span>
        </div>
        <NodeTypeSelect value={node.type} onChange={v => changeType({ target: { value: v } })} />
        {node.type === 'audio' && (
          <NodeAudioPicker
            fileId={fileId}
            lessonFiles={lessonFiles}
            onPick={handleAudioPick}
            onAnalyzed={patch => updateTypeData(patch)}
            hasWaveform={!!(tData.waveformData?.length)}
            hasTimings={!!(tData.wordTimings?.length)}
            text={tData.text ?? ''}
            onTextChange={t => updateTypeData({ text: t })}
          />
        )}
        {(node.type === 'photo' || node.type === 'video' || node.type === 'circle' || node.type === 'sticker') && (
          <>
            <NodeMediaCrop
              type={node.type}
              fileId={fileId}
              crop={crop}
              lessonFiles={lessonFiles}
              onPickFile={handleMediaPick}
              onCropChange={newCrop => updateTypeData({ crop: newCrop })}
              shape={node.type === 'circle' ? 'circle' : node.type === 'sticker' ? 'square' : 'rect'}
            />
          </>
        )}
        {(node.type === 'text' || node.type === 'pin_message' || node.type === 'system') && (
          <textarea
            className="nodeTextInput"
            value={tData.content ?? ''}
            onChange={e => updateTypeData({ content: e.target.value })}
            placeholder={
              node.type === 'pin_message' ? 'Текст закреплённого сообщения...' :
              node.type === 'system'      ? 'Системное сообщение...' :
              'Введи текст сообщения...'
            }
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            rows={4}
          />
        )}
        {(node.type === 'text' || node.type === 'pin_message' || (node.type === 'audio' && !!tData.text)) && (
          <button
            className="nodeHLOpenBtn"
            style={(tData.highlights?.length > 0) ? { borderColor: '#b6fe3b', color: '#b6fe3b' } : undefined}
            onClick={e => {
              e.stopPropagation()
              setHlTarget('main')
              setHlRect(nodeRef.current?.getBoundingClientRect() ?? null)
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            🎨
          </button>
        )}
        {node.type === 'text' && (
          <NodeTextProEditor
            tData={tData}
            onChange={updateTypeData}
            onOpenHl={() => {
              setHlTarget('pro')
              setHlRect(nodeRef.current?.getBoundingClientRect() ?? null)
            }}
          />
        )}
        {(node.type === 'text' || node.type === 'sticker') && (
          <div className="nodeReplySection">
            <label className="nodeReplyLabel" onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={tData.replyToSeq != null}
                onChange={e => updateTypeData({ replyToSeq: e.target.checked ? 0 : null })}
              />
              В ответ на
            </label>
            {tData.replyToSeq != null && (
              <select
                className="nodeReplySelect"
                value={tData.replyToSeq || ''}
                onChange={e => updateTypeData({ replyToSeq: e.target.value ? Number(e.target.value) : 0 })}
                onClick={e => e.stopPropagation()}
              >
                <option value="">— выбери сообщение —</option>
                {[...allNodes]
                  .filter(n => n.seq < node.seq)
                  .sort((a, b) => a.seq - b.seq)
                  .map(n => {
                    const label = NODE_TYPES.find(t => t.value === n.type)?.label ?? n.type
                    const preview = n.typeData?.[n.type]?.content?.slice(0, 28)
                    return (
                      <option key={n.id} value={n.seq}>
                        {`#${n.seq} ${label}${preview ? ` — ${preview}` : ''}`}
                      </option>
                    )
                  })
                }
              </select>
            )}
          </div>
        )}
        {node.type === 'registration' && (
          <>
            <input
              className="nodeTextInput"
              style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
              value={tData.title ?? ''}
              onChange={e => updateTypeData({ title: e.target.value })}
              placeholder="Заголовок панели (по умолчанию: Регистрация)"
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            />
            <textarea
              className="nodeTextInput"
              style={{ fontSize: 11, lineHeight: 1.5 }}
              value={tData.policyText ?? ''}
              onChange={e => updateTypeData({ policyText: e.target.value })}
              placeholder="Текст политики конфиденциальности (если пусто — используется стандартный текст)"
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              rows={5}
            />
          </>
        )}
        {node.type === 'word_choice' && (
          <>
            <NodeWordChoicePicker
              options={tData.options ?? []}
              responseCorrect={tData.responseCorrect ?? ''}
              responseWrong={tData.responseWrong ?? ''}
              onOptionsChange={opts => updateTypeData({ options: opts })}
              onResponseCorrectChange={txt => updateTypeData({ responseCorrect: txt })}
              onResponseWrongChange={txt => updateTypeData({ responseWrong: txt })}
              triggers={node.triggers ?? []}
              allNodes={allNodes}
              nodeId={node.id}
              onTriggersChange={triggers => onUpdate({ triggers })}
              onTriggerMeasure={onTriggerMeasure}
              statLessonId={tData.statLessonId ?? null}
              onStatLessonChange={v => updateTypeData({ statLessonId: v })}
              moduleLessons={moduleLessons}
            />
            <NodeRewardCheckbox
              checked={tData.reward !== false}
              onChange={v => updateTypeData({ reward: v })}
            />
          </>
        )}
        {node.type === 'phrase_assembly' && (
          <>
            <NodePhraseAssemblyPicker
              words={tData.words ?? []}
              distractors={tData.distractors ?? []}
              responseCorrect={tData.responseCorrect ?? ''}
              responseWrong={tData.responseWrong ?? ''}
              onWordsChange={w => updateTypeData({ words: w })}
              onDistractorsChange={d => updateTypeData({ distractors: d })}
              onResponseCorrectChange={txt => updateTypeData({ responseCorrect: txt })}
              onResponseWrongChange={txt => updateTypeData({ responseWrong: txt })}
              triggers={node.triggers ?? []}
              allNodes={allNodes}
              nodeId={node.id}
              onTriggersChange={triggers => onUpdate({ triggers })}
              onTriggerMeasure={onTriggerMeasure}
            />
            <NodeLessonLink
              value={tData.statLessonId ?? null}
              onChange={v => updateTypeData({ statLessonId: v })}
              moduleLessons={moduleLessons}
            />
            <NodeRewardCheckbox
              checked={tData.reward !== false}
              onChange={v => updateTypeData({ reward: v })}
            />
          </>
        )}
        {node.type === 'table' && (
          <NodeTablePicker
            tData={tData}
            onDataChange={patch => updateTypeData(patch)}
            lessonFiles={lessonFiles}
            onPickFile={f => onPickLessonFile(f)}
          />
        )}
        {node.type === 'photo_choice' && (
          <>
            <NodePhotoChoicePicker
              photos={tData.photos ?? []}
              correctIndexes={tData.correctIndexes ?? []}
              lessonFiles={lessonFiles}
              onPickFile={onPickLessonFile}
              onPhotosChange={p => updateTypeData({ photos: p })}
              onCorrectIndexesChange={ci => updateTypeData({ correctIndexes: ci })}
              triggers={node.triggers ?? []}
              allNodes={allNodes}
              nodeId={node.id}
              onTriggersChange={triggers => onUpdate({ triggers })}
              onTriggerMeasure={onTriggerMeasure}
            />
            <NodeLessonLink
              value={tData.statLessonId ?? null}
              onChange={v => updateTypeData({ statLessonId: v })}
              moduleLessons={moduleLessons}
            />
            <NodeRewardCheckbox
              checked={tData.reward !== false}
              onChange={v => updateTypeData({ reward: v })}
            />
          </>
        )}
        {node.type === 'registration' && (
          <NodeRegistrationTriggers onTriggerMeasure={onTriggerMeasure} />
        )}
        {node.type !== 'word_choice' && node.type !== 'phrase_assembly' && node.type !== 'photo_choice' && node.type !== 'registration' && (
          <NodeTriggerEditor
            triggers={node.triggers}
            nodeId={node.id}
            nodes={allNodes}
            onChange={triggers => onUpdate({ triggers })}
            onMeasure={onTriggerMeasure}
          />
        )}
      </div>
      {hlRect && (
        <NodeTextHighlighter
          text={hlTarget === 'pro' ? (tData.proText ?? '')
            : node.type === 'audio' ? (tData.text ?? '') : (tData.content ?? '')}
          highlights={(hlTarget === 'pro' ? tData.proHighlights : tData.highlights) ?? []}
          anchorRect={hlRect}
          onClose={() => setHlRect(null)}
          onChange={hl => updateTypeData(hlTarget === 'pro' ? { proHighlights: hl } : { highlights: hl })}
        />
      )}
    </div>
  )
}
