import { useState } from 'react'
import { pickStepAnswer } from './stepAnswer.js'

// Пошаговое управление прогоном (админ, запуск из канваса): пауза, шаг вперёд,
// шаг назад и тумблер «отвечать верно/неверно».
//
// Состояние объявляется ДО useGraphPlayer (пауза — его входной параметр), а
// действия собираются ПОСЛЕ (им нужен сам graph) — отсюда две части: хук
// состояния и обычная фабрика действий.
export function usePlayerStepState() {
  // paused — цепочка стоит (переходы не идут).
  // frozen — вдобавок молчит и текущее сообщение (звук и печать текста).
  // Шаг «вперёд» снимает заморозку, оставляя паузу: показанное сообщение
  // отыгрывается целиком, а следующее всё равно ждёт кнопки
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [answerCorrect, setAnswerCorrect] = useState(true)
  // Растёт на каждом откате назад и подмешивается в key нижних панелей: без
  // этого панель осталась бы в состоянии «уже отвечено» и вопрос второй раз
  // не показала бы
  const [epoch, setEpoch] = useState(0)

  return {
    paused,
    frozen,
    // Кнопка одна: что-то играет — замораживаем всё; заморожено — идём дальше
    togglePause: () => {
      const next = !frozen
      setFrozen(next)
      setPaused(next)
    },
    pause: () => { setPaused(true); setFrozen(true) },
    unfreeze: () => setFrozen(false),
    answerCorrect,
    setAnswerCorrect,
    epoch,
    bumpEpoch: () => setEpoch(e => e + 1),
  }
}

// Готовый объект для PlayerStepBar: состояние + кнопки. Действия собираются
// в момент нажатия, а не в рендере — они читают рефы вызывающего (XP, отметки
// отыгранных нод), а рендеру это знать незачем.
export function buildStep({ state, graph, ctx }) {
  return {
    ...state,
    canBack: graph.canStepBack,
    forward: () => { const c = ctx(); c.onSkipMedia(); makeStepActions(c).forward() },
    back:    () => { const c = ctx(); c.onHideSummary(); makeStepActions(c).back() },
  }
}

// Ответы за ученика выставляются напрямую (см. stepAnswer.js), а не кликом
// внутри панели: панели держат своё состояние и анимации, и лезть туда
// пришлось бы в пять разных мест.
// onRollbackNode(nodeId, wasWrong) — вызывающий откатывает то, что живёт в его
// рефах: отметку «мгновенная нода отыграла», начисленный XP и засчитанную
// ошибку (она идёт в звёзды урока)
// Был ли на ноде неверный ответ — чтобы шаг назад снял его из счёта ошибок
function wasAnsweredWrong(answers, nodeId) {
  return answers.wordChoiceStates[nodeId]?.result === 'wrong'
    || answers.photoChoiceStates[nodeId]?.result === 'wrong'
    || (answers.phraseStates[nodeId] ?? []).some(b => b.result === 'wrong')
}

export function makeStepActions({ state, graph, answers, onRollbackNode, onPhotoPick, onCountWrong }) {
  function applyAnswer(node, a) {
    if (a.kind === 'photo') { onPhotoPick(node.id, a.idx, a.correct); return }
    if (a.kind === 'word') {
      // Галочка «выбранное слово уходит в чат» — тот же путь, что у панели
      if (node.typeData?.word_choice?.sendPickToChat === true) answers.handleWordPick(node.id, a.pickText)
      answers.handleWordAnswer(node.id, a.responseText, a.correct ? 'correct' : 'wrong')
    }
    // Таблица в ленте ничего не рисует (весь её UI — в нижней панели), так
    // что состояния ответа ей заводить незачем
    if (a.kind === 'phrase') {
      answers.handlePhraseAnswer(node.id, a.responseText, a.correct ? 'correct' : 'wrong')
    }
    if (a.kind === 'reg') answers.handleRegAnswer(node.id, '', a.correct ? 'correct' : 'wrong')
    // Неверный шаг считается ошибкой урока (звёзды) — ровно как ответ рукой;
    // у фото это делает сам onPhotoPick, он же общий с панелью
    if (!a.correct) onCountWrong()
    graph.onNodeDone(node.id, a.result, a.variantId, true)
  }

  return {
    canBack: graph.canStepBack,

    forward() {
      // Показанное сообщение должно отыграться: звук и синхронная с ним
      // печать текста — иначе у голосового появлялся бы пустой пузырь
      state.unfreeze()
      // Переход уже назначен (идёт «печатает…» или ждёт снятия паузы) —
      // показываем следующее сообщение сейчас же
      if (graph.revealNow()) return
      const last = graph.visibleNodes[graph.visibleNodes.length - 1]
      if (!last) return
      const a = pickStepAnswer(last, state.answerCorrect)
      if (a) applyAnswer(last, a)
      else graph.onNodeDone(last.id, null, null, true)
    },

    back() {
      const res = graph.stepBack()
      if (!res) return
      for (const node of [res.removed, res.last]) {
        onRollbackNode(node.id, wasAnsweredWrong(answers, node.id))
        answers.resetNode(node.id)
      }
      state.bumpEpoch()
      // Нода, снова ставшая последней, уже отыграла — второго «доиграло» от
      // её модуля не будет, и без паузы чат просто замер бы молча. Встаём на
      // паузу: дальше двигаемся кнопкой «вперёд», это видно по горящей кнопке
      state.pause()
    },
  }
}
