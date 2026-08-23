import { useState, useRef } from 'react'
import NodeAudioPicker from './NodeAudioPicker.jsx'
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
import NodeTypeSelect from './NodeTypeSelect.jsx'
import { useNodeEmoji } from './useNodeEmoji.js'
import NodeTextModals from './NodeTextModals.jsx'
import NodeTextTools from './NodeTextTools.jsx'
import { applyTypeChange } from './nodeDefaults.js'
import { NODE_TYPES } from './nodeTypes.js'
import { autoGrowTextarea } from '../../shared/lib/autoGrowTextarea.js'
import { useTextareaHeight } from './useTextareaHeight.js'

const DEFAULT_CROP = { x: 0, y: 0, scale: 1 }

// Типы нод со своим текстом сообщения — им нужна кнопка смайликов
const HAS_TEXT_TYPES = new Set(['text', 'pin_message', 'system', 'audio', 'sticker', 'photo'])

// Форма редактирования содержимого ноды по её типу: файл/текст/варианты
// ответов + блок триггеров. Общая для max-ноды канваса (CanvasNode) и строки
// продакшен-списка (ProductionList) — один источник правды на все 14 типов,
// не дублируем 8 разных пикеров в двух местах.
export default function NodeContentEditor({
  node, onUpdate, allNodes, lessonFiles = [], onPickLessonFile, onTriggerMeasure, moduleLessons = [],
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
  // Высота текстовых полей, растянутых уголком, помнится между сессиями
  const contentRef = useTextareaHeight(`${node.id}:content`, !growTextareas)
  const captionRef = useTextareaHeight(`${node.id}:caption`, !growTextareas)
  const policyRef  = useTextareaHeight(`${node.id}:policy`, !growTextareas)

  const [hlRect, setHlRect] = useState(null)
  const [wrapRect, setWrapRect] = useState(null) // окно «свои переносы»
  const [hlTarget, setHlTarget] = useState('main') // 'main' | 'pro' — какой текст красим

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
          onTextChange={t => updateTypeData({ text: t })}
          growText={growTextareas}
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
          rows={8}
          ref={growTextareas ? autoGrowTextarea : contentRef}
          onInput={growTextareas ? e => autoGrowTextarea(e.target) : undefined}
        />
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
        <textarea
          className="nodeTextInput"
          value={tData.caption ?? ''}
          onChange={e => updateTypeData({ caption: e.target.value })}
          placeholder={node.type === 'photo'
            ? 'Текст под фото (в том же пузыре)...'
            : 'Текст под стикером (в том же пузыре)...'}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          rows={4}
          ref={growTextareas ? autoGrowTextarea : captionRef}
          onInput={growTextareas ? e => autoGrowTextarea(e.target) : undefined}
        />
      )}
      <NodeTextTools
        hasText={HAS_TEXT_TYPES.has(node.type)}
        textWritten={!!mainText.trim()}
        hasHighlights={tData.highlights?.length > 0}
        wrapActive={wrapActive}
        onEmoji={emoji.open}
        onPaint={e => {
          e.stopPropagation()
          setHlTarget('main')
          setHlRect(wrapRef.current?.getBoundingClientRect() ?? null)
        }}
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
          onOpenHl={() => {
            setHlTarget('pro')
            setHlRect(wrapRef.current?.getBoundingClientRect() ?? null)
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
            rows={10}
            ref={growTextareas ? autoGrowTextarea : policyRef}
            onInput={growTextareas ? e => autoGrowTextarea(e.target) : undefined}
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
            sendPickToChat={tData.sendPickToChat === true}
            onSendPickChange={v => updateTypeData({ sendPickToChat: v })}
            triggers={node.triggers ?? []}
            allNodes={allNodes}
            nodeId={node.id}
            onTriggersChange={triggers => onUpdate({ triggers })}
            onTriggerMeasure={onTriggerMeasure}
            statLessonId={tData.statLessonId ?? null}
            onStatLessonChange={v => updateTypeData({ statLessonId: v })}
            moduleLessons={moduleLessons}
          />
          <NodeRewardCheckbox checked={tData.reward !== false} onChange={v => updateTypeData({ reward: v })} />
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
          <NodeRewardCheckbox checked={tData.reward !== false} onChange={v => updateTypeData({ reward: v })} />
        </>
      )}
      {node.type === 'table' && (
        <>
          <NodeTablePicker
            tData={tData}
            onDataChange={patch => updateTypeData(patch)}
            lessonFiles={lessonFiles}
            onPickFile={f => onPickLessonFile(f)}
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
          <NodeRewardCheckbox checked={tData.reward !== false} onChange={v => updateTypeData({ reward: v })} />
        </>
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
          <NodeRewardCheckbox checked={tData.reward !== false} onChange={v => updateTypeData({ reward: v })} />
        </>
      )}
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
        hlRect={hlRect}
        hlTarget={hlTarget}
        onHlClose={() => setHlRect(null)}
        onHighlightsChange={updateTypeData}
        wrapRect={wrapRect}
        onWrapClose={() => setWrapRect(null)}
        onWrapChange={patch => updateTypeData(patch)}
        emoji={emoji}
      />
    </div>
  )
}
