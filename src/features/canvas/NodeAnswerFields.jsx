import NodeWordChoicePicker     from './NodeWordChoicePicker.jsx'
import NodePhraseAssemblyPicker from './NodePhraseAssemblyPicker.jsx'
import NodeTablePicker          from './NodeTablePicker.jsx'
import NodePhotoChoicePicker    from './NodePhotoChoicePicker.jsx'
import NodeLessonLink           from './NodeLessonLink.jsx'
import NodeRewardCheckbox       from './NodeRewardCheckbox.jsx'
import { isRewardOn }           from '../../shared/lib/nodeReward.js'

// Поля интерактивных типов-ответов (word_choice/phrase_assembly/table/
// photo_choice): каждый — свой пикер вариантов + привязка к уроку для
// анализа знаний (NodeLessonLink, кроме word_choice — у него свой
// statLessonId прямо в пикере) + чекбокс награды. Вынесено из
// NodeContentEditor.jsx — там же остаются простые типы (текст/медиа) и
// общий блок триггеров.
export default function NodeAnswerFields({
  node, tData, updateTypeData, onUpdate, allNodes, lessonFiles, onPickLessonFile, onTriggerMeasure, moduleLessons,
}) {
  if (node.type === 'word_choice') {
    return (
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
    )
  }

  if (node.type === 'phrase_assembly') {
    return (
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
    )
  }

  if (node.type === 'table') {
    return (
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
        {/* В режиме «Авто» галочка снята по умолчанию (таблица собирается
            сама, ученик не отвечает), но включить награду можно */}
        <NodeRewardCheckbox
          checked={isRewardOn('table', tData)}
          onChange={v => updateTypeData({ reward: v })}
        />
      </>
    )
  }

  if (node.type === 'photo_choice') {
    return (
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
    )
  }

  return null
}
