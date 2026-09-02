import { useState, useRef } from 'react'
import NodeAudioPicker from './NodeAudioPicker.jsx'
import NodeAudioTts from './NodeAudioTts.jsx'
import NodeTextProEditor from './NodeTextProEditor.jsx'
import NodeReactionPicker from './NodeReactionPicker.jsx'
import NodeMediaCrop from './NodeMediaCrop.jsx'
import NodeTriggerEditor from './NodeTriggerEditor.jsx'
import NodeAnswerFields           from './NodeAnswerFields.jsx'
import NodeRegistrationTriggers   from './NodeRegistrationTriggers.jsx'
import NodeTypeSelect from './NodeTypeSelect.jsx'
import { useNodeEmoji } from './useNodeEmoji.js'
import NodeTextModals from './NodeTextModals.jsx'
import NodeTextTools from './NodeTextTools.jsx'
import { applyTypeChange } from './nodeDefaults.js'
import { NODE_TYPES } from './nodeTypes.js'
import { autoGrowTextarea } from '../../shared/lib/autoGrowTextarea.js'
import { useTextareaHeight } from './useTextareaHeight.js'
import RichTextField from './rich-text/RichTextField.jsx'

const DEFAULT_CROP = { x: 0, y: 0, scale: 1 }

// Типы нод со своим текстом сообщения — им нужна кнопка смайликов
const HAS_TEXT_TYPES = new Set(['text', 'pin_message', 'system', 'audio', 'sticker', 'photo'])

function mainFieldPlaceholder(type) {
  if (type === 'pin_message') return 'Текст закреплённого сообщения...'
  if (type === 'system')      return 'Системное сообщение...'
  if (type === 'photo')       return 'Текст под фото (в том же пузыре)...'
  if (type === 'sticker')     return 'Текст под стикером (в том же пузыре)...'
  return 'Введи текст сообщения...'
}

// Форма редактирования содержимого ноды по её типу: файл/текст/варианты
// ответов + блок триггеров. Общая для max-ноды канваса (CanvasNode) и строки
// продакшен-списка (ProductionList) — один источник правды на все 14 типов,
// не дублируем 8 разных пикеров в двух местах.
export default function NodeContentEditor({
  node, onUpdate, allNodes, lessonFiles = [], onPickLessonFile, onRemoveLessonFile, onTriggerMeasure, moduleLessons = [],
  showTypeSelect = true,
  // Продакшен: блок «Если/Тогда» (простые типы — не word_choice и т.п. со
  // своей парой) по умолчанию свёрнут — за раскрытие/ширину строки отвечает
  // ProductionList.jsx (там же и хранится состояние per-node)
  collapsibleTriggers = false, triggersExpanded = false, onToggleTriggers,
  // Продакшен: рамка позиционирования/масштаба файла (фото/видео/кружок/
  // стикер) тоже свёрнута по умолчанию — то же состояние, тот же приём
  collapsibleMedia = false, mediaExpanded = false, onToggleMedia,
  // Продакшен: текстовые поля растут по высоте — весь текст виден без
  // скролла внутри узкой рамки, даже длинный (переносом на новую строку)
  growTextareas = false,
}) {
  // Высота textarea без раскраски (policyText — единственная оставшаяся)
  const policyRef = useTextareaHeight(`${node.id}:policy`, !growTextareas)

  const [wrapRect, setWrapRect] = useState(null) // окно «свои переносы»

  const wrapRef = useRef(null)

  const tData  = node.typeData?.[node.type] ?? {}
  const fileId = tData.file_id ?? null
  const crop   = tData.crop ?? DEFAULT_CROP

  function updateTypeData(patch) {
    onUpdate({ typeData: { ...node.typeData, [node.type]: { ...tData, ...patch } } })
  }

  function changeType(newType) {
    onUpdate(applyTypeChange(node, newType))
  }

  function handleAudioPick(file) {
    const id = onPickLessonFile(file)
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

  // Текст ноды, который правят кистью и окном переносов (у аудио он свой)
  const mainText = node.type === 'audio' ? (tData.text ?? '')
    : (node.type === 'sticker' || node.type === 'photo') ? (tData.caption ?? '')
    : (tData.content ?? '')
  // В каком поле typeData лежит основной текст этой ноды
  const mainField = node.type === 'audio' ? 'text'
    : (node.type === 'sticker' || node.type === 'photo') ? 'caption'
    : 'content'

  const emoji = useNodeEmoji({
    wrapRef, text: mainText, field: mainField,
    highlights: tData.highlights, onUpdate: updateTypeData,
  })

  // Свои переносы в ноде есть — либо стоят прямо в тексте, либо включён режим
  // «пузырь по моим строкам»
  const wrapActive = !!tData.hardWrap || mainText.includes('\n')

  const isFileType = node.type === 'audio' || node.type === 'photo' || node.type === 'video' ||
    node.type === 'circle' || node.type === 'sticker'

  return (
    <div ref={wrapRef} className="nodeContentEditor">
      {showTypeSelect && <NodeTypeSelect value={node.type} onChange={changeType} />}
      {node.type === 'audio' && (
        <NodeAudioPicker
          nodeId={node.id}
          fileId={fileId}
          lessonFiles={lessonFiles}
          onPick={handleAudioPick}
          onAnalyzed={patch => updateTypeData(patch)}
          hasWaveform={!!(tData.waveformData?.length)}
          hasTimings={!!(tData.wordTimings?.length)}
          text={tData.text ?? ''}
          highlights={tData.highlights ?? []}
          onTextChange={updateTypeData}
          growText={growTextareas}
        />
      )}
      {node.type === 'audio' && (
        <NodeAudioTts
          fileId={fileId}
          text={tData.text ?? ''}
          onPick={handleAudioPick}
          onAnalyzed={patch => updateTypeData(patch)}
          onRemoveOldFile={onRemoveLessonFile}
        />
      )}
      {(node.type === 'photo' || node.type === 'video' || node.type === 'circle' || node.type === 'sticker') && (
        <NodeMediaCrop
          type={node.type}
          fileId={fileId}
          crop={crop}
          lessonFiles={lessonFiles}
          onPickFile={handleMediaPick}
          onCropChange={newCrop => updateTypeData({ crop: newCrop })}
          shape={node.type === 'circle' ? 'circle' : node.type === 'sticker' ? 'square' : 'rect'}
          collapsible={collapsibleMedia}
          expanded={mediaExpanded}
          onToggleExpand={onToggleMedia}
        />
      )}
      {isFileType && !fileId && (
        <input
          className="nodeTextInput nodePlannedFileInput"
          value={tData.plannedFileName ?? ''}
          onChange={e => updateTypeData({ plannedFileName: e.target.value })}
          placeholder="Плановое имя файла (для продакшена, до реальной загрузки)"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        />
      )}
      {(node.type === 'text' || node.type === 'pin_message' || node.type === 'system') && (
        <RichTextField
          field="content"
          value={tData.content ?? ''}
          highlights={tData.highlights ?? []}
          onChange={updateTypeData}
          placeholder={mainFieldPlaceholder(node.type)}
          growTextarea={growTextareas}
          heightKey={`${node.id}:content`}
        />
      )}
      {node.type === 'reaction' && (
        <NodeReactionPicker tData={tData} onChange={updateTypeData} />
      )}
      {node.type === 'sticker' && (
        <label
          className="nodeStickerSound"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={tData.autoSound === true}
            onChange={e => updateTypeData({ autoSound: e.target.checked })}
          />
          <span className="nodeStickerSoundLabel">Со звуком: первый раз со звуком, дальше петля без него</span>
        </label>
      )}
      {(node.type === 'sticker' || node.type === 'photo') && (
        <RichTextField
          field="caption"
          value={tData.caption ?? ''}
          highlights={tData.highlights ?? []}
          onChange={updateTypeData}
          placeholder={mainFieldPlaceholder(node.type)}
          growTextarea={growTextareas}
          heightKey={`${node.id}:caption`}
        />
      )}
      <NodeTextTools
        hasText={HAS_TEXT_TYPES.has(node.type)}
        textWritten={!!mainText.trim()}
        wrapActive={wrapActive}
        onEmoji={emoji.open}
        onWrap={e => {
          e.stopPropagation()
          setWrapRect(wrapRef.current?.getBoundingClientRect() ?? null)
        }}
      />
      {node.type === 'text' && (
        <NodeTextProEditor
          nodeId={node.id}
          tData={tData}
          onChange={updateTypeData}
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
            rows={10}
            ref={growTextareas ? autoGrowTextarea : policyRef}
            onInput={growTextareas ? e => autoGrowTextarea(e.target) : undefined}
          />
        </>
      )}
      <NodeAnswerFields
        node={node} tData={tData} updateTypeData={updateTypeData} onUpdate={onUpdate}
        allNodes={allNodes} lessonFiles={lessonFiles} onPickLessonFile={onPickLessonFile}
        onTriggerMeasure={onTriggerMeasure} moduleLessons={moduleLessons}
      />
      {node.type === 'registration' && (
        <NodeRegistrationTriggers onTriggerMeasure={onTriggerMeasure} />
      )}
      {node.type !== 'word_choice' && node.type !== 'phrase_assembly' && node.type !== 'photo_choice' && node.type !== 'registration' && node.type !== 'table' && (
        collapsibleTriggers ? (
          <div className="triggerCollapse">
            <button
              type="button"
              className="triggerCollapseToggle"
              onClick={e => { e.stopPropagation(); onToggleTriggers?.() }}
            >
              <span className={'triggerCollapseArrow' + (triggersExpanded ? ' triggerCollapseArrowOpen' : '')}>▸</span>
              Если / Тогда
            </button>
            {triggersExpanded && (
              <NodeTriggerEditor
                triggers={node.triggers}
                nodeId={node.id}
                nodes={allNodes}
                onChange={triggers => onUpdate({ triggers })}
                onMeasure={onTriggerMeasure}
              />
            )}
          </div>
        ) : (
          <NodeTriggerEditor
            triggers={node.triggers}
            nodeId={node.id}
            nodes={allNodes}
            onChange={triggers => onUpdate({ triggers })}
            onMeasure={onTriggerMeasure}
          />
        )
      )}
      <NodeTextModals
        node={node}
        tData={tData}
        mainText={mainText}
        mainField={mainField}
        wrapRect={wrapRect}
        onWrapClose={() => setWrapRect(null)}
        onWrapChange={patch => updateTypeData(patch)}
        emoji={emoji}
      />
    </div>
  )
}
