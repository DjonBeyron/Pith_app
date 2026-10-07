import { memo } from 'react'
import PlayerMessage from './PlayerMessage.jsx'
import NodeEditPencil from './admin/NodeEditPencil.jsx'
import { mergeFeedOrder } from '../../shared/lib/feedOrder.js'
import { useFeedWindow } from './useFeedWindow.js'
import { entryKey } from './feedWindow.js'
import { nodeFileKey } from './preloadQueue.js'

// Сообщения ленты: видимые ноды графа урока + сигнальные сообщения
// (useSignalMessages.js), вперемешку в хронологическом порядке (см.
// shared/lib/feedOrder.js — сигнал, сработавший раньше, не должен оказаться
// в чате НИЖЕ более поздних сообщений графа), + pending-нода, которая
// пре-рендерится за экраном с тем же key. Вынесено из LessonPlayer.jsx — он
// упирался в потолок размера файла.
//
// В DOM живёт только хвост ленты (useFeedWindow.js) — старые сообщения
// остаются в visibleNodes, но не рендерятся, пока их не раскроют кнопкой.
//
// Pending-нода рендерится В ТОМ ЖЕ массиве детей, что и показанные (последним
// элементом), — только так React сохраняет её fiber и DOM при показе (тот же
// key в том же списке). Раньше она шла отдельным ребёнком фрагмента после
// map, и React монтировал ноду заново: 1.4 с предрисовки пропадали, <img>/
// <video>/<audio> создавались с нуля в момент появления (замер: 0 из 98
// показов сохранили DOM) — фото и стикеры выходили пустыми на первый кадр.
// Колбэки на запись ленты — стабильные между рендерами (WeakMap по объекту
// ноды): инлайн-стрелки давали всем сообщениям новые пропсы на каждый рендер
// LessonPlayer (0,8–0,9 раз/с), и вся лента перерисовывалась (профиль:
// PlayerMessage 5110 рендеров за урок). id — что передать в done (id ноды
// или ключ сигнала), done/onTrReveal — обработчики, по ним же кэш
const CB = new WeakMap()
function nodeCallbacks(node, id, done, onTrReveal) {
  let byHandlers = CB.get(node)
  if (!byHandlers) { byHandlers = new Map(); CB.set(node, byHandlers) }
  let cbs = byHandlers.get(done)
  if (!cbs || cbs.onTrRevealSrc !== onTrReveal) {
    cbs = {
      onTrRevealSrc: onTrReveal,
      onDone: result => done(id, result),
      onTrReveal: () => onTrReveal(node.id),
    }
    byHandlers.set(done, cbs)
  }
  return cbs
}
const NOOP = () => {}

const MemoMessage = memo(PlayerMessage)

export default function PlayerFeedNodes({
  visibleNodes, pendingNode, nodes, filesWithBlobs, teacherName,
  states, bottomOffset, videoAutoSound, isAdmin,
  onNodeDone, onTrReveal, onOpenLessonRef,
  // Сигналы ошибок (см. useSignalMessages.js) — свой onDone: снимает freeze
  // у панели-источника, НЕ уходит в onNodeDone графа урока
  signalItems = [], onMessageDone,
  // Режим правки из канваса (usePlayerAdminEdit) — в обычном плеере null
  adminEdit = null,
  // «Продолжить урок»: история восстановлена не вся сразу (useGraphPlayer.js,
  // HISTORY_PAGE) — кнопка сверху ленты подгружает более раннюю пачку
  hasMoreHistory = false, onLoadMoreHistory,
}) {
  const merged = mergeFeedOrder(visibleNodes, signalItems)
  const feedWindow = useFeedWindow(merged, { hasMoreHistory, onLoadMoreHistory })
  const trailingPending = pendingNode && !visibleNodes.some(v => v.id === pendingNode.id)
    ? pendingNode : null
  const list = trailingPending
    ? [...feedWindow.entries, { kind: 'node', node: trailingPending, pending: true }]
    : feedWindow.entries

  function renderNode(node, isPending) {
    const fileId = nodeFileKey(node)
    const file   = filesWithBlobs.find(f => f.id === fileId) ?? null
    const cbs    = nodeCallbacks(node, node.id, onNodeDone, onTrReveal)
    // Реакция рисуется ВНУТРИ чужого пузыря (порталом, см. ReactionModule) —
    // своей строки в ленте у неё нет вовсе. Пустой слот-обёртка всё равно
    // добавлял бы gap ленты (4px): лента дёргалась на ровном месте
    if (node.type === 'reaction') {
      return (
        <MemoMessage
          key={node.id}
          node={node}
          lessonNodes={nodes}
          teacherName={teacherName}
          pending={isPending}
          onDone={isPending ? NOOP : cbs.onDone}
          onTrReveal={cbs.onTrReveal}
        />
      )
    }
    return (
      <div
        key={node.id}
        className={adminEdit?.enabled
          ? `playerMsgSlot${adminEdit.editId === node.id ? ' playerMsgSlotActive' : ''}`
          : undefined}
        data-pending={isPending ? 'true' : undefined}
        data-entry-key={node.id}
        // Восстановленная история («Продолжить урок») встаёт сразу на своё
        // место — без въезда снизу и без звука «новое сообщение» (тот же
        // приём, что у превращения таблицы в сообщение, PlayerFeed.jsx).
        // Без этого 8+ восстановленных строк разом слетались вниз и звучали
        // почти хором в момент открытия плеера — видимый «скачок»
        data-no-slide={node.isHistory ? 'true' : undefined}
        // Ширина — как у строк ленты (её боковые поля --feed-pad): при width:100%
        // предрисованный пузырь был шире, и при показе canvas волны голосового
        // сужался — спектр пересэмплировался прямо в момент появления
        style={isPending ? {
          position: 'fixed', bottom: '-100vh',
          left: 'var(--feed-pad, 10px)', right: 'var(--feed-pad, 10px)',
          maxWidth: 'calc(600px - 2 * var(--feed-pad, 10px))', margin: '0 auto',
          pointerEvents: 'none', visibility: 'hidden',
        } : undefined}
      >
        {adminEdit?.enabled && !isPending && (
          <NodeEditPencil
            onClick={() => adminEdit.open(node.id)}
            active={adminEdit.editId === node.id}
          />
        )}
        <MemoMessage
          node={node}
          file={file}
          lessonFiles={filesWithBlobs}
          lessonNodes={nodes}
          teacherName={teacherName}
          photoChoiceState={states.photoChoiceStates[node.id] ?? null}
          wordChoiceState={states.wordChoiceStates[node.id] ?? null}
          allWordChoiceStates={states.wordChoiceStates}
          allPhotoChoiceStates={states.photoChoiceStates}
          allPhraseStates={states.phraseStates}
          phraseState={states.phraseStates[node.id] ?? null}
          regState={states.regStates[node.id] ?? null}
          tableSent={states.tableSent[node.id] ?? null}
          tableArriving={!!states.tableArriving?.[node.id]}
          // Высота панели снизу нужна ТОЛЬКО кружку (useCircleExpand: предел
          // раскрытия). Остальным строкам проп не передаём: иначе каждое
          // открытие/закрытие панели (и каждый рост панели по ходу ответа —
          // usePanelHeight) меняло проп у ВСЕХ строк и сбрасывало их memo —
          // в замере 13 PlayerMessage + 9 PlayerBubble перерисовывались в
          // первые кадры подъёма панели
          bottomOffset={node.type === 'circle' ? bottomOffset : 0}
          videoAutoSound={videoAutoSound}
          adminPreview={isAdmin}
          pending={isPending}
          onDone={isPending ? NOOP : cbs.onDone}
          onTrReveal={cbs.onTrReveal}
          onOpenLessonRef={onOpenLessonRef}
        />
      </div>
    )
  }

  function renderSignal(key, node) {
    const fileId = nodeFileKey(node)
    const file   = filesWithBlobs.find(f => f.id === fileId) ?? null
    const cbs    = nodeCallbacks(node, key, onMessageDone, onTrReveal)
    return (
      <div key={key} data-entry-key={key}>
        <MemoMessage
          node={node}
          file={file}
          lessonFiles={filesWithBlobs}
          lessonNodes={nodes}
          teacherName={teacherName}
          bottomOffset={0}
          videoAutoSound={videoAutoSound}
          adminPreview={isAdmin}
          onDone={cbs.onDone}
          onTrReveal={cbs.onTrReveal}
          onOpenLessonRef={onOpenLessonRef}
        />
      </div>
    )
  }

  return (
    <>
      {feedWindow.hasOlder && (
        <button className="playerLoadHistoryBtn" onClick={feedWindow.showOlder}>
          Показать более раннюю историю
        </button>
      )}
      {list.map(entry => entry.kind === 'signal'
        ? renderSignal(entryKey(entry), entry.node)
        : renderNode(entry.node, !!entry.pending))}
    </>
  )
}
