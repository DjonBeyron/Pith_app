import { createPupilLook } from '../../../scene/v2/pupilLook.js'
import { setMouth } from '../../../scene/v2/mouthDriver.js'
import { applyMascotMouthCode } from '../../../scene/v2/sprites/mascot/mascotMouth.js'
import { createWhiskerDrive } from '../../../scene/v2/whiskerDrive.js'

// «Живой Пит v2» для кота игры «Повтори за диктором» (WordLaneCat.jsx) — чистая обёртка без React: зрачки (взгляд, саккады по словам, дрейф в тишине, расширение в начале речи) и
// класс is-talking и усы (whiskerDrive.js: JS-амплитуда плавно 0 → 1 при речи и 1 → 0 после, без CSS-переходов и @property — в Safari они давали рывок на старте и в конце). В сценах это делает режиссёр (scenePlayLine.js) и флаг animV2; в игре включено всегда, кроме слабого устройства (там только рот — NO_LOOK).
// Всё по событиям, без rAF: зрачки — CSS-переменные --look-x / --look-y / --pupil, остальное рисует CSS (scene-v2-pit.css). Переменные и класс пишутся на ОБЩИЙ родитель голов — <g class="scn-cat">
// (у кота три головы base / love / shy, видна одна): CSS `.scn--v2 .pu` читает переменные у зрачков любой из них.
// Таймеры и случайность инъектируются для тестов.
export const TALK_OFF_MS = 300 // is-talking снимается не сразу: короткая пауза между словами усы не гасит; после снятия усы плавно доезжают до покоя (whiskerDrive.js: амплитуда 1 → 0 за RAMP_MS)
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
export const NO_LOOK = Object.freeze({ lineStart() {}, word() {}, lineEnd() {}, idle() {}, talking() {}, release() {}, stop() {} })

/** getRoot() → <g class="scn-cat"> | null; skin — пакет маскота (масштаб посадки зрачков); whiskers — привод усов (в тестах подменяется) */
export function createCatLook({ getRoot, skin = 'kit', timers = globalThis, rand = Math.random, whiskers = createWhiskerDrive({ getRoot }) }) {
  const pupils = createPupilLook({ whos: ['a'], getEl: getRoot, skinOf: () => skin, timers, rand }) // один персонаж: взгляд прямо, без «собеседника»
  let on = false
  let offTimer = null
  const clearOff = () => { if (offTimer !== null) { timers.clearTimeout(offTimer); offTimer = null } }
  // is-talking снят; усы сами доезжают до покоя (амплитуда 1 → 0 за RAMP_MS, цикл rAF кончается на нулевом угле — рывка нет)
  const release = () => { if (!on) return; on = false; const el = getRoot(); if (el) el.classList.remove(TALKING); whiskers.set(false) }

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
        if (!on) { on = true; const el = getRoot(); if (el) el.classList.add(TALKING); whiskers.set(true) }
        return
      }
      if (!on || offTimer !== null) return
      offTimer = timers.setTimeout(() => { offTimer = null; release() }, TALK_OFF_MS)
    },
    /** Усы гасим сразу, без выдержки TALK_OFF_MS (пауза игры): is-talking снят, амплитуда усов плавно идёт к нулю */
    release() { clearOff(); release() },
    /** Конец жизни кота: таймеры сняты, переменные и класс убраны; усы доезжают до покоя, если кот ещё на экране */
    stop() {
      clearOff()
      on = false
      const el = getRoot()
      if (el) el.classList.remove(TALKING)
      whiskers.stop() // мягко, если узел ещё в DOM (амплитуда идёт к нулю и угол снимается сам); узла нет — привод сам снимает всё сразу (whiskerDrive.js)
      pupils.stop()
    },
  }
}
