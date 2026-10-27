import { MASCOT_PACKS } from './mascots.js'

// Рот маскота без React: драйвер рта (mouthDriver.js) даёт три формы closed / half / open, здесь они становятся формами Rhubarb из таблицы пакета
// (X закрытый, C полуоткрытый, D широко открытый) и пишутся в четыре узла рта прямо в DOM. Закрытый рот берёт «рот в покое» состояния лица
// (улыбка, смущение…), если он у состояния есть — как в демо /mascot/.

const VISEME = { closed: 'X', half: 'C', open: 'D' }
const NODES = ['mm', 'mt', 'mf', 'ml']

// Форма рта по коду Rhubarb (X A B C D E F G H) — для озвучки по буквам (wordLaneVisemes.js); формы closed / half / open — частный случай (X / C / D)
export function mouthByCode(skin, face, code) {
  const pack = MASCOT_PACKS[skin]
  if (!pack) return null
  const rest = code === 'X' ? pack.states[face]?.mouth : null
  if (rest) return { m: { d: rest, fill: 'none', sw: 6 }, t: '', f: '', l: null }
  return pack.mouthTable[code] ?? pack.mouthTable.X
}

export const mouthShapeFor = (skin, face, shape) => mouthByCode(skin, face, VISEME[shape] ?? 'X')

// catEl — корень кота ([data-part="cat"]); для обычного кота (нет data-skin) ничего не делает
export function applyMascotMouthCode(catEl, code) {
  const skin = catEl?.getAttribute?.('data-skin')
  if (!skin) return
  const e = mouthByCode(skin, catEl.getAttribute('data-face'), code)
  if (!e) return
  const [mm, mt, mf, ml] = NODES.map(c => catEl.querySelector(`.${c}`))
  if (!mm) return
  mm.setAttribute('d', e.m.d); mm.setAttribute('fill', e.m.fill); mm.setAttribute('stroke-width', e.m.sw)
  mt.setAttribute('d', e.t); mf.setAttribute('d', e.f)
  ml.setAttribute('d', e.l ? e.l.d : '')
  if (e.l) ml.setAttribute('stroke-width', e.l.sw)
}

export const applyMascotMouth = (catEl, shape) => applyMascotMouthCode(catEl, VISEME[shape] ?? 'X')
