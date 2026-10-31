// Какие дорожки «идут» (едут пилюли) на стадии игры — по ним на полотне дорожки бегут штрихи конвейера (WordLanePills → .wlLanes i[data-run], word-lane-lane-run.css). Чистая функция: без React и DOM.
// Дорожка едет, пока идёт стадия движка пилюль: диктор / ученик (и разминка, читка, дубль репетиции — у них engineKind dictor / student) — дорожки ступени (step.active, нет — step.parts); «Порядок» и «Различи» — все три.
// Плашки (announce, turn), заставка, зеркало, итог и пауза — дорожки стоят, штрихи гаснут. Штрихи включаются со сменой стадии, а первая пилюля выкатывается из тьмы чуть позже (она проезжает затемнение сверху) — поэтому дорожка
// «пошла» раньше пилюли. Результат — строка из трёх знаков '1' / '0' (примитив: мемоизированные WordLanePills не перерисовываются зря).
import { engineKind } from '../../../rehearsal/rehearsalKinds.js'

export const RUN_NONE = '000'
export const RUN_ALL = '111'

/** Дорожки, на которых сейчас едут пилюли: '101' — первая и третья. stage — стадия сценария (stageObj) или null */
export function runLanes(stage) {
  const kind = engineKind(stage)
  if (kind === 'order' || kind === 'discern') return RUN_ALL
  if (kind !== 'dictor' && kind !== 'student') return RUN_NONE
  const lanes = stage.step?.active ?? stage.step?.parts ?? []
  return [0, 1, 2].map(lane => (lanes.includes(lane) ? '1' : '0')).join('')
}
