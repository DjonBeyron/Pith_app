import ChooseWordPanel     from './panels/choose-word/ChooseWordPanel.jsx'
import PhraseAssemblyPanel from './panels/phrase-assembly/PhraseAssemblyPanel.jsx'
import PhotoChoicePanel    from './panels/photo-choice/PhotoChoicePanel.jsx'
import RegistrationPanel   from './panels/registration/RegistrationPanel.jsx'
import TableDictatorPanel  from './panels/table-dictator/TableDictatorPanel.jsx'
import TableManualPanel    from './panels/table-manual/TableManualPanel.jsx'
import { wordOptionEvent } from './useAnswerStats.js'

// Нижние панели ответов: выбор слова, сборка фразы, выбор фото, регистрация,
// таблица. Каждая привязана к последней видимой ноде своего типа и живёт до
// ответа. Вынесены из LessonPlayer.jsx — самодостаточный кусок разметки,
// который упирался в потолок размера файла.
export default function PlayerPanels({
  wcNode, paNode, pcNode, regNode, tableNode,
  showRegPanel, photoChoiceStates, filesWithBlobs, xpMap,
  // Шаг «назад» админа: растёт при откате и пересобирает панель — иначе она
  // осталась бы в состоянии «уже отвечено» и вопрос заново не показала бы.
  // node.visit — то же самое для обычного игрока: сценарий вернул его на ту же
  // ноду (цикл «ошибся → подсказка → снова вопрос»), и панель должна открыться
  // с чистого листа, а не с показанным разбором прошлой попытки
  epoch = 0,
  onNodeDone, record, wrongRef,
  handleWordAnswer, handleWordPick, handlePhraseAnswer, handleRegAnswer,
  handlePhotoPick, handleXpEarned, onTableToChat,
  setWcPanelHeight, setPaPanelHeight, setPcPanelHeight, setRegPanelHeight, setTablePanelHeight,
}) {
  return (
    <>
      {wcNode && (
        <ChooseWordPanel
          key={`${wcNode.id}:${epoch}:${wcNode.visit ?? 0}`} /* вторая нода того же типа подряд = свежая панель */
          node={wcNode}
          xpAmount={xpMap.get(wcNode.id) ?? 0}
          onDone={(result, variantId) => { setWcPanelHeight(0); onNodeDone(wcNode.id, result, variantId) }}
          onAnswered={(text, result) => handleWordAnswer(wcNode.id, text, result)}
          onPicked={(opt) => {
            const ev = wordOptionEvent(wcNode, opt)
            if (ev.type === 'wrong') wrongRef.current += 1
            record({ nodeId: wcNode.id, ...ev })
            // Галочка в редакторе ноды: выбранный вариант уходит в чат
            // отдельным пузырём справа — раньше текста реакции
            if (wcNode.typeData?.word_choice?.sendPickToChat === true) {
              handleWordPick(wcNode.id, opt.text)
            }
          }}
          onXpEarned={handleXpEarned}
          onHeightChange={setWcPanelHeight}
        />
      )}
      {paNode && (
        <PhraseAssemblyPanel
          key={`${paNode.id}:${epoch}:${paNode.visit ?? 0}`}
          node={paNode}
          xpAmount={xpMap.get(paNode.id) ?? 0}
          onDone={(result, variantId) => { setPaPanelHeight(0); onNodeDone(paNode.id, result, variantId) }}
          onAnswered={(text, result) => handlePhraseAnswer(paNode.id, text, result)}
          onChecked={(result, text) => {
            if (result === 'wrong') wrongRef.current += 1
            record({
              nodeId: paNode.id,
              lessonId: paNode.typeData?.phrase_assembly?.statLessonId ?? null,
              type: result,
              option: text,
            })
          }}
          onXpEarned={handleXpEarned}
          onHeightChange={setPaPanelHeight}
        />
      )}
      {pcNode && !photoChoiceStates[pcNode.id] && (
        <PhotoChoicePanel
          key={`${pcNode.id}:${epoch}:${pcNode.visit ?? 0}`}
          node={pcNode}
          lessonFiles={filesWithBlobs}
          onPick={(idx, isCorrect) => handlePhotoPick(pcNode.id, idx, isCorrect)}
          onHeightChange={setPcPanelHeight}
        />
      )}
      {regNode && showRegPanel && (
        <RegistrationPanel
          key={`${regNode.id}:${epoch}:${regNode.visit ?? 0}`}
          node={regNode}
          onDone={(trigger, data) => { setRegPanelHeight(0); onNodeDone(regNode.id, trigger, data) }}
          onAnswered={(text, result) => handleRegAnswer(regNode.id, text, result)}
          onHeightChange={setRegPanelHeight}
        />
      )}
      {tableNode && tableNode.typeData?.table?.table && (
        tableNode.typeData.table.mode === 'manual' ? (
          <TableManualPanel
            key={`${tableNode.id}:${epoch}:${tableNode.visit ?? 0}`}
            onSendToChat={tableNode.typeData?.table?.sendToChat ? () => onTableToChat?.(tableNode.id) : undefined}
            node={tableNode}
            onDone={(trigger, variantId) => { setTablePanelHeight(0); onNodeDone(tableNode.id, trigger, variantId) }}
            onAnswered={() => {}}
            /* Галочка «отправить ответ ученика в чат»: собранная фраза уходит
               пузырём справа (верная — сразу, неверная — последняя из трёх) */
            onAnswerToChat={tableNode.typeData?.table?.sendAnswerToChat
              ? (text, result) => handlePhraseAnswer(tableNode.id, text, result)
              : undefined}
            onHeightChange={setTablePanelHeight}
          />
        ) : (
          <TableDictatorPanel
            key={`${tableNode.id}:${epoch}:${tableNode.visit ?? 0}`}
            onSendToChat={tableNode.typeData?.table?.sendToChat ? () => onTableToChat?.(tableNode.id) : undefined}
            node={tableNode}
            file={filesWithBlobs.find(f => f.id === tableNode.typeData?.table?.file_id) ?? null}
            onDone={(trigger, variantId) => { setTablePanelHeight(0); onNodeDone(tableNode.id, trigger, variantId) }}
            onHeightChange={setTablePanelHeight}
          />
        )
      )}
    </>
  )
}
