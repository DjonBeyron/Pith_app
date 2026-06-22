import { useEffect } from 'react'
import NodeAudioPicker from './NodeAudioPicker.jsx'
import NodeMediaCrop from './NodeMediaCrop.jsx'
import NodeTriggerEditor from './NodeTriggerEditor.jsx'
import NodeWordChoicePicker     from './NodeWordChoicePicker.jsx'
import NodePhraseAssemblyPicker from './NodePhraseAssemblyPicker.jsx'
import NodePhotoChoicePicker    from './NodePhotoChoicePicker.jsx'

const DEFAULT_CROP = { x: 0, y: 0, scale: 1 }

const NODE_TYPES = [
  { value: 'audio',           label: 'Голосовое сообщение' },
  { value: 'voice_record',    label: 'Запись голоса' },
  { value: 'photo',           label: 'Фото сообщение' },
  { value: 'video',           label: 'Видео сообщение' },
  { value: 'circle',          label: 'Кружок' },
  { value: 'text',            label: 'Текстовое сообщение' },
  { value: 'word_choice',     label: 'Выбор слова' },
  { value: 'phrase_assembly', label: 'Собрать фразу' },
  { value: 'pin_message',     label: 'Закрепить сообщение' },
  { value: 'system',          label: 'Системное сообщение' },
  { value: 'sticker',         label: 'Стикер' },
  { value: 'photo_choice',    label: 'Выбрать фото' },
]

const TYPE_COLOR = {
  audio:        '#4a7ca8',
  voice_record: '#8b3a6a',
  photo:       '#5a9a5a',
  video:       '#7a5a9a',
  circle:      '#c06a6a',
  text:        '#55556a',
  word_choice:     '#b07030',
  phrase_assembly: '#2a8070',
  pin_message:     '#8b6914',
  system:          '#4a5568',
  sticker:         '#c05830',
  photo_choice:    '#0e7490',
}

const NEXT_SIZE = { nano: 'mini', mini: 'max', max: 'nano' }

export default function CanvasNode({
  node, onUpdate, onDragStart, wasDragged, allNodes, lessonFiles = [], onPickLessonFile, onTriggerMeasure,
}) {
  const color = TYPE_COLOR[node.type] ?? TYPE_COLOR.text

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

  function changeType(e) {
    e.stopPropagation()
    const newType = e.target.value
    const update = { type: newType }
    // word_choice needs its own trigger format (word_correct / word_wrong).
    // Initialize them when switching to this type if not already present,
    // so drag-connect and the dropdown selects work from the first interaction.
    if (newType === 'word_choice') {
      const hasWc = node.triggers?.some(t => t.if === 'word_correct' || t.if === 'word_wrong')
      if (!hasWc) {
        update.triggers = [
          { id: crypto.randomUUID(), if: 'word_correct', then: null },
          { id: crypto.randomUUID(), if: 'word_wrong',   then: null },
        ]
      }
    }
    if (newType === 'phrase_assembly') {
      const hasPa = node.triggers?.some(t => t.if === 'phrase_correct' || t.if === 'phrase_wrong')
      if (!hasPa) {
        update.triggers = [
          { id: crypto.randomUUID(), if: 'phrase_correct', then: null },
          { id: crypto.randomUUID(), if: 'phrase_wrong',   then: null },
        ]
      }
    }
    if (newType === 'photo_choice') {
      const hasPc = node.triggers?.some(t => t.if === 'photo_correct' || t.if === 'photo_wrong')
      if (!hasPc) {
        update.triggers = [
          { id: crypto.randomUUID(), if: 'photo_correct', then: null },
          { id: crypto.randomUUID(), if: 'photo_wrong',   then: null },
        ]
      }
    }
    onUpdate(update)
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
      <div className="canvasNode canvasNodeMini" onMouseDown={onDragStart}>
        <div className="canvasNodeTopBar" style={{ background: color }} />
        <div className="canvasNodeMiniBody">
          <button className="canvasNodeExpandBtn" onClick={expandClick}>›</button>
          <span className="canvasNodeSeq">#{node.seq}</span>
          <select
            className="canvasNodeTypeSelectSm"
            value={node.type}
            onClick={e => e.stopPropagation()}
            onChange={changeType}
          >
            {NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
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
    <div className="canvasNode canvasNodeMax" onMouseDown={onDragStart}>
      <div className="canvasNodeTopBar" style={{ background: color }} />
      <div className="canvasNodeMaxBody">
        <div className="canvasNodeMaxTop">
          <button className="canvasNodeExpandBtn" onClick={expandClick}>‹</button>
          <span className="canvasNodeSeq">#{node.seq}</span>
        </div>
        <select
          className="canvasNodeTypeSelect"
          value={node.type}
          onClick={e => e.stopPropagation()}
          onChange={changeType}
        >
          {NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
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
            highlights={tData.highlights ?? []}
            onHighlightsChange={hl => updateTypeData({ highlights: hl })}
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
        {node.type === 'word_choice' && (
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
          />
        )}
        {node.type === 'phrase_assembly' && (
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
        )}
        {node.type === 'photo_choice' && (
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
        )}
        {node.type !== 'word_choice' && node.type !== 'phrase_assembly' && node.type !== 'photo_choice' && (
          <NodeTriggerEditor
            triggers={node.triggers}
            nodeId={node.id}
            nodes={allNodes}
            onChange={triggers => onUpdate({ triggers })}
            onMeasure={onTriggerMeasure}
          />
        )}
      </div>
    </div>
  )
}
