import { createPupilLook } from '../../../scene/v2/pupilLook.js'
import { setMouth } from '../../../scene/v2/mouthDriver.js'
import { applyMascotMouthCode } from '../../../scene/v2/sprites/mascot/mascotMouth.js'

// «Живой Пит v2» для кота игры «Повтори за диктором» (WordLaneCat.jsx) — чистая обёртка без React: зрачки (взгляд, саккады по словам, дрейф в тишине, расширение в начале речи) и
// класс is-talking (усы качаются, амплитуда --talk). В сценах это делает режиссёр (scenePlayLine.js) и флаг animV2; в игре включено всегда, кроме слабого устройства (там только рот — NO_LOOK).
// Всё по событиям, без rAF: зрачки — CSS-переменные --look-x / --look-y / --pupil, остальное рисует CSS (scene-v2-pit.css). Переменные и класс пишутся на ОБЩИЙ родитель голов — <g class="scn-cat">
// (у кота три головы base / love / shy, видна одна): CSS `.scn--v2 .pu` читает переменные у зрачков любой из них.
// Таймеры и случайность инъектируются для тестов.
export const TALK_OFF_MS = 300 // класс is-talking снимается не сразу: --talk (scene-v2-cat.css) уходит плавно за 0,3 с, а короткая пауза в речи его не гасит
const TALKING = 'is-talking'

const isCode = key => /^[A-Z]$/.test(key)

/** Нарисовать форму рта в голову кота: key — closed / half / open или код Rhubarb (одна заглавная буква). Широкие формы (D, E; «open» без буквы — D) отмечаются атрибутом data-vis на голове —
 *  по нему scene-v2-pit.css рисует рот и язык крупнее (`.scn--v2 .scn-cat [data-vis="D"] .mouth`); голова — потомок .scn-cat, селектор находит её. Остальные формы data-vis не несут (setMouth снимает прежний) */
export function drawCatMouth(head, key) {
  if (!head) return
  if (isCode(key)) { applyMascotMouthCode(head, key); head.removeAttribute('data-mouth'); head.setAttribute('data-vis', key) }
  else { setMouth(head, key); if (key === 'open') head.setAttribute('data-vis', 'D') }
}

/** Заглушка для слабого устройства (.scn--lite): зрачки и усы не трогаем, остаётся один рот */
export const NO_LOOK = Object.freeze({ lineStart() {}, word() {}, lineEnd() {}, idle() {}, talking() {}, stop() {} })

/** getRoot() → <g class="scn-cat"> | null; skin — пакет маскота (масштаб посадки зрачков) */
export function createCatLook({ getRoot, skin = 'kit', timers = globalThis, rand = Math.random }) {
  const pupils = createPupilLook({ whos: ['a'], getEl: getRoot, skinOf: () => skin, timers, rand }) // один персонаж: взгляд прямо, без «собеседника»
  let on = false
  let offTimer = null
  const clearOff = () => { if (offTimer !== null) { timers.clearTimeout(offTimer); offTimer = null } }

  return {
    lineStart: () => pupils.lineStart('a'),
    word: () => pupils.word('a'),
    lineEnd: () => pupils.lineEnd(),
    /** Дрейф взгляда в тишине: включён, пока кот выглядывает */
    idle: want => { if (want) pupils.startIdle(); else pupils.stopIdle() },
    /** Говорит ли кот: true — сразу, false — через TALK_OFF_MS без новых true (звать можно каждый кадр: лишней работы нет) */
    talking(want) {
      if (want) {
        clearOff()
        if (!on) { on = true; getRoot()?.classList.add(TALKING) }
        return
      }
      if (!on || offTimer !== null) return
      offTimer = timers.setTimeout(() => { offTimer = null; on = false; getRoot()?.classList.remove(TALKING) }, TALK_OFF_MS)
    },
    /** Конец жизни кота: таймеры сняты, переменные и класс убраны */
    stop() {
      clearOff()
      on = false
      getRoot()?.classList.remove(TALKING)
      pupils.stop()
    },
  }
}
