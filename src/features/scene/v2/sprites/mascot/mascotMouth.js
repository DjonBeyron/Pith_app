import { MASCOT_PACKS } from './mascots.js'

// Рот маскота без React: драйвер рта (mouthDriver.js) даёт три формы closed / half / open, здесь они становятся формами Rhubarb из таблицы пакета
// (X закрытый, C полуоткрытый, D широко открытый) и пишутся в четыре узла рта прямо в DOM. Закрытый рот берёт «рот в покое» состояния лица
// (улыбка, смущение…), если он у состояния есть — как в демо /mascot/.

const VISEME = { closed: 'X', half: 'C', open: 'D' }
const NODES = ['mm', 'mt', 'mf', 'ml']

export function mouthShapeFor(skin, face, shape) {
  const pack = MASCOT_PACKS[skin]
  if (!pack) return null
  const code = VISEME[shape] ?? 'X'
  const rest = code === 'X' ? pack.states[face]?.mouth : null
  if (rest) return { m: { d: rest, fill: 'none', sw: 6 }, t: '', f: '', l: null }
  return pack.mouthTable[code]
}

// catEl — корень кота ([data-part="cat"]); для обычного кота (нет data-skin) ничего не делает
export function applyMascotMouth(catEl, shape) {
  const skin = catEl?.getAttribute?.('data-skin')
  if (!skin) return
  const e = mouthShapeFor(skin, catEl.getAttribute('data-face'), shape)
  if (!e) return
  const [mm, mt, mf, ml] = NODES.map(c => catEl.querySelector(`.${c}`))
  if (!mm) return
  mm.setAttribute('d', e.m.d); mm.setAttribute('fill', e.m.fill); mm.setAttribute('stroke-width', e.m.sw)
  mt.setAttribute('d', e.t); mf.setAttribute('d', e.f)
  ml.setAttribute('d', e.l ? e.l.d : '')
  if (e.l) ml.setAttribute('stroke-width', e.l.sw)
}
