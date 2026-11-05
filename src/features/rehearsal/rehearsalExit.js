// Уход с итога репетиции (v3.3.87, «Нет» в окне «хочешь ещё»): окно итога улетает вверх по синусоиде, как пилюля (wordLanePlateExit.startPlateExit — та же кривая), а сама игра — всё, что лежит на сцене
// .wlStage, кроме окна, — плавно опускается вниз и растворяется (translate + opacity, STAGE_EXIT_MS). Окно лежит внутри сцены, поэтому анимируется не сама .wlStage (её прозрачность гасила бы и улетающее окно),
// а её прямые дети: у них нет свойства translate (оно у пилюль внутри поля, а не у верхних детей), существующий transform не трогается. Потом зовётся onDone (завершение игры).
// lite (слабое устройство или reduced-motion): без полёта и без спуска — окно гаснет (класс .wlTurn--leave), сцена гаснет по opacity (STAGE_EXIT_LITE_MS).
import { startPlateExit, plateLite } from '../player/modules/rotate-phone/wordLanePlateExit.js'

export const STAGE_EXIT_MS = 600       // сцена опускается и растворяется
export const STAGE_EXIT_LITE_MS = 250  // lite: просто гаснет
export const STAGE_DROP_DVH = 16       // на сколько опускается сцена, % высоты экрана
export const STAGE_EXIT_EASING = 'cubic-bezier(0.4, 0, 0.8, 0.6)' // ease-in: сначала тихо, потом ускоряется вниз

/** Кадры ухода сцены: lite — только opacity */
export const stageExitFrames = lite => (lite
  ? [{ opacity: 1 }, { opacity: 0 }]
  : [{ translate: '0 0', opacity: 1 }, { translate: `0 ${STAGE_DROP_DVH}dvh`, opacity: 0 }])

/** Сколько длится уход сцены (мс): через столько игра закрывается */
export const exitMs = lite => (lite ? STAGE_EXIT_LITE_MS : STAGE_EXIT_MS)

/**
 * Запустить уход: plate — окно итога (DOM), lite — plateLite(). Окно улетает (в lite его гасит класс компонента), дети сцены опускаются и гаснут.
 * Возвращает число анимаций сцены (0 — WAAPI или сцены нет: игру закрывают по таймеру всё равно).
 */
export function startExit(plate, lite = plateLite(), soft = false) { // soft — «Гонка с Питом»: окно итога не улетает, а мягко уходит CSS (scale 0,9 + opacity, race-plate.css)
  if (!plate) return 0
  if (!lite && !soft) startPlateExit(plate)
  const stage = plate.closest?.('.wlStage')
  if (!stage) return 0
  let n = 0
  for (const el of Array.from(stage.children)) {
    if (el === plate || typeof el.animate !== 'function') continue
    el.animate(stageExitFrames(lite), { duration: exitMs(lite), easing: lite ? 'ease-out' : STAGE_EXIT_EASING, fill: 'forwards' })
    n += 1
  }
  return n
}
