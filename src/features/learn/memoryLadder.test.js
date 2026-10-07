import { describe, it, expect } from 'vitest'
import { levelOf, levelFill, lineFills, findLadderWord, buildLadder, wordLevel, pageTabs, LEVEL_TITLES, LEVELS, LEVEL_COUNT, SETTLED_ABOUT } from './memoryLadder.js'
import { orth, ladderLinks, flarePath, bulbR, ballPath, FIN_TOP, orthPoints, taper, mixColor, W_MIN, W_MAX, ballScale, haloScale, BALL_D, BALL_GROW, HALO_D, HALO_GROW, ENTRY_LEG, HERO_OUT } from './ladderWires.js'
import { ladderWireSet } from './ladderWireSet.js'
import { tearWire } from './ladderTear.js'

// Прямоугольники как на телефоне: шапка на всю ширину, под ней круг-счётчик 100×100 по центру, три ступени
// лесенкой, пятиугольник; ствол — за левым краем слоя (edge −22 → x = −11)
const hero = { l: 0, t: 0, r: 300, b: 100 }
const circle = { l: 100, t: 128, r: 200, b: 228 }
const blocks = [
  { l: 0, t: 260, r: 200, b: 320 }, { l: 50, t: 340, r: 250, b: 400 }, { l: 100, t: 420, r: 300, b: 480 },
]
const fin = { l: 0, t: 520, r: 180, b: 679 }
const rects = { hero, circle, blocks, fin, edge: -22 }

describe('ступени памяти', () => {
  it('шаг → ступень: 1–2 новые, 3–4 знакомые, 5 усвоенные', () => {
    expect([1, 2, 3, 4, 5].map(levelOf)).toEqual([1, 1, 2, 2, 3])
  })

  it('заливка — путь к следующей ступени', () => {
    expect([1, 2, 3, 4, 5].map(levelFill)).toEqual([0.25, 0.75, 0.25, 0.75, 0.5])
  })

  it('линия слова: пройденные отрезки целиком, текущий — на заливку ступени, будущие пусты', () => {
    expect([1, 2, 3, 4, 5].map(lineFills)).toEqual([[0.25, 0, 0], [0.75, 0, 0], [1, 0.25, 0], [1, 0.75, 0], [1, 1, 0.5]])
  })

  it('слова по ступеням: сегодняшние первыми, дальше по сроку; постоянная память — отдельно', () => {
    const memory = [
      { word: 'go', step: 1, due_on: '2026-09-28' },
      { word: 'keep', step: 2, due_on: '2026-09-27' },
      { word: 'cook', step: 1, due_on: '2026-09-26' },
      { word: 'want', step: 4, due_on: '2026-10-02' },
      { word: 'make', step: 5, due_on: '2026-10-20' },
      { word: 'hello', step: 5, due_on: '2026-11-20', settled_on: '2026-09-20' },
    ]
    const ladder = buildLadder(memory, {
      todayWords: new Set(['go']),
      hasDeck: w => w !== 'keep',
      wordHome: new Map([['go', { lessonId: 'l-go', lessonTitle: 'Go', phrase: 'Let’s go' }]]),
    })
    expect(ladder.levels.map(l => l.words.map(w => w.word))).toEqual([['go', 'cook', 'keep'], ['want'], ['make']])
    expect(ladder.total).toBe(5)
    expect(ladder.permanent.map(w => w.word)).toEqual(['hello'])
    const [go, , keep] = ladder.levels[0].words
    expect(go).toMatchObject({ today: true, hasDeck: true, lessonId: 'l-go', lessonTitle: 'Go', phrase: 'Let’s go' })
    expect(keep).toMatchObject({ today: false, hasDeck: false, lessonId: null, lessonTitle: '', phrase: '' })
  })

  it('уровень слова для окна: n из 4, постоянная память — четвёртый', () => {
    expect(LEVEL_COUNT).toBe(4)
    expect([1, 2, 3, 4, 5].map(s => wordLevel(s).n)).toEqual([1, 1, 2, 2, 3])
    expect(wordLevel(5, true)).toMatchObject({ n: 4, name: 'Слово в постоянной памяти' })
    expect(wordLevel(1).name).toBe('Новое слово')
    expect(wordLevel(3).remember).toMatch(/ты уже узнаёшь/i)
  })

  it('описания: как слово сюда попадает → забывается → что делать → куда перейдёт', () => {
    LEVELS.forEach(l => {
      expect(l.about).toMatch(/забыва|забуд/) // такие слова забываются
      expect(l.about).toMatch(/мы напомним|проверим/) // что мы делаем
      expect(l.about).toMatch(/перейдёт|станет/)      // куда слово пойдёт дальше
    })
    expect(LEVELS[0].about.startsWith('Сюда попадают слова из уроков')).toBe(true)
    // постоянная память: начинаем с того, откуда слова здесь берутся
    expect(SETTLED_ABOUT.startsWith('Тут хранятся слова из «Усвоенных»')).toBe(true)
    expect(SETTLED_ABOUT).toMatch(/вернётся в «Знакомые»/)
  })
})

describe('линии памяти', () => {
  it('ломаная со скруглёнными углами', () => {
    expect(orth([[0, 0], [0, 40], [30, 40]], 10)).toBe('M 0 0 L 0 30 Q 0 40 10 40 L 30 40')
    // короткий отрезок — радиус не больше половины отрезка
    expect(orth([[0, 0], [0, 6], [30, 6]], 10)).toBe('M 0 0 L 0 3 Q 0 6 3 6 L 30 6')
  })

  it('из правой части шапки вниз и налево — в круг справа; из круга слева — к стволу и в левый бок каждой ступени', () => {
    const links = ladderLinks(rects)
    expect(links).toHaveLength(5)
    // шапка → круг: выход в HERO_OUT от правого края шапки, вниз до центра круга (y 178), налево в правую точку круга
    expect(links[0].pts).toEqual([[300 - HERO_OUT, 100], [300 - HERO_OUT, 178], [200, 178]])
    expect(300 - HERO_OUT - 200).toBeGreaterThanOrEqual(ENTRY_LEG)
    // круг → ступень: из левой точки круга налево к стволу, вниз, в левый бок ступени
    expect(links[2].pts).toEqual([[100, 178], [-11, 178], [-11, 370], [50, 370]])
    expect(links[4].pts.at(-1)).toEqual([90, 520 + 159 * FIN_TOP])
    expect(links[4].pts[0]).toEqual([200, 480])
    // большой зазор — последний прямой участок 36px (раздув 24 + скругление 12): вход в пятиугольник с тем же раздувом
    const roomy = ladderLinks({ ...rects, fin: { l: 0, t: 560, r: 180, b: 719 } })
    expect(roomy[4].pts.at(-1)[1] - roomy[4].pts.at(-2)[1]).toBe(36)
    // шарик бежит обратно: из ступени через круг к шапке
    expect(ballPath(links[0], links[1]).startsWith('M 0 290')).toBe(true)
    expect(ballPath(links[0], links[1]).endsWith(`L ${300 - HERO_OUT} 100`)).toBe(true)
  })

  it('узкая шапка: выход зажимается, но остаётся правее круга на прямой участок под раздув', () => {
    const links = ladderLinks({ ...rects, hero: { l: 0, t: 0, r: 240, b: 100 } })
    expect(links[0].pts[0][0]).toBe(200 + ENTRY_LEG)
  })
})

describe('страница уровней', () => {
  const ladder = buildLadder([
    { word: 'go', step: 1, due_on: '2026-09-28' },
    { word: 'cook', step: 3, due_on: '2026-09-28' },
    { word: 'make', step: 5, due_on: '2026-10-20' },
    { word: 'hello', step: 5, due_on: '2026-11-20', settled_on: '2026-09-20' },
  ])

  it('заголовки: «Первый уровень памяти» … «Четвёртый уровень памяти»', () => {
    expect(LEVEL_TITLES).toEqual(['Первый уровень памяти', 'Второй уровень памяти', 'Третий уровень памяти', 'Четвёртый уровень памяти'])
  })

  it('четыре вкладки: три ступени и «Постоянная» с её словами и описанием', () => {
    const tabs = pageTabs(ladder)
    expect(tabs.map(t => t.short)).toEqual(['Новые', 'Знакомые', 'Усвоенные', 'Постоянная'])
    expect(tabs.map(t => t.words.length)).toEqual([1, 1, 1, 1])
    expect(tabs.map(t => t.perm)).toEqual([false, false, false, true])
    expect(tabs[3]).toMatchObject({ id: LEVEL_COUNT, title: 'Четвёртый уровень памяти', name: 'Постоянная память', about: SETTLED_ABOUT })
    expect(tabs[3].words.map(w => w.word)).toEqual(['hello'])
    // пусто — другое описание (как слово сюда попадёт)
    expect(pageTabs(buildLadder([]))[3].about).toMatch(/Тут будут храниться/)
  })
})

describe('связи памяти: толщина растёт от шапки через круг до пятиугольника', () => {
  it('точки скруглённой ломаной — от начала до конца, угол — дугой', () => {
    const pts = orthPoints([[0, 0], [0, 40], [30, 40]], 10, 4)
    expect(pts[0]).toEqual([0, 0])
    expect(pts.at(-1)).toEqual([30, 40])
    expect(pts).toHaveLength(1 + 1 + 4 + 1)
  })

  it('цвет и толщина плавно меняются по длине', () => {
    const pieces = taper([[0, 0], [0, 80]], { s0: 0, s1: 1, c0: '#000000', c1: '#ffffff', maxLen: 8 })
    expect(pieces).toHaveLength(10)
    pieces.slice(1).forEach((p, i) => expect(p.w).toBeGreaterThan(pieces[i].w))
    expect(pieces[0].w).toBeGreaterThanOrEqual(W_MIN)
    expect(pieces.at(-1).w).toBeLessThanOrEqual(W_MAX)
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)')
    // результат mixColor — rgb(): его подмешивают дальше (отводы от цвета ствола), NaN недопустим
    expect(mixColor('rgb(0, 0, 0)', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)')
    expect(mixColor('rgb(219, 230, 245)', '#b6fe3b', 0)).toBe('rgb(219, 230, 245)')
  })

  it('ствол тоньше всего у шапки, толще всего у пятиугольника; отвод ниже — толще', () => {
    const { pieces, dots } = ladderWireSet(rects)
    const widths = pieces.map(p => p.w)
    expect(Math.min(...widths)).toBeCloseTo(W_MIN, 0)
    expect(Math.max(...widths)).toBeCloseTo(W_MAX, 0)
    const at = y => pieces.find(p => p.x1 === p.x2 && p.x1 === -11 && p.y1 <= y && p.y2 >= y).w
    expect(at(360)).toBeGreaterThan(at(250))
    // точки: начало у шапки + вход и выход круга + концы трёх ступеней + начало и конец связи в пятиугольник
    expect(dots).toHaveLength(8)
    expect(dots[4].r).toBeGreaterThanOrEqual(dots[3].r)
  })

  it('внутри круга отрезков нет; толщина по длине пути растёт монотонно и без скачка на круге', () => {
    const { pieces, dots, tearAt } = ladderWireSet(rects)
    const onRow = pieces.filter(p => Math.abs(p.y1 - 178) < 0.5 && Math.abs(p.y2 - 178) < 0.5)
    expect(onRow.some(p => (p.x1 + p.x2) / 2 > 100 && (p.x1 + p.x2) / 2 < 200)).toBe(false)
    // отрезки режутся ровно по краям круга
    expect(onRow.some(p => Math.min(p.x1, p.x2) === 200)).toBe(true)
    expect(onRow.some(p => Math.max(p.x1, p.x2) === 100)).toBe(true)
    // ствол (до первого отвода) — толщина не убывает от шапки до «Усвоенных»
    const branchStart = pieces.findIndex((p, i) => i > 0 && p.w < pieces[i - 1].w)
    const trunk = branchStart < 0 ? pieces : pieces.slice(0, branchStart)
    expect(trunk.length).toBeGreaterThan(40)
    trunk.slice(1).forEach((p, i) => expect(p.w).toBeGreaterThanOrEqual(trunk[i].w))
    // скачок на круге — только за счёт 100 px невидимого пути сквозь него
    const inR = onRow.find(p => Math.min(p.x1, p.x2) === 200), outL = onRow.find(p => Math.max(p.x1, p.x2) === 100)
    expect(outL.w - inR.w).toBeGreaterThan(0)
    expect(outL.w - inR.w).toBeLessThan((W_MAX - W_MIN) * 0.25)
    // бутоны входа и выхода круга — на его краях, по центру; выход толще входа
    expect([dots[1].x, dots[1].y, dots[2].x, dots[2].y]).toEqual([200, 178, 100, 178])
    expect(dots[2].r).toBeGreaterThan(dots[1].r)
    expect(tearAt).toEqual({ x: 100, y: 178 })
  })

  it('«нейрон»: у каждого элемента труба раздува и бутон шире линии', () => {
    const { flares, dots } = ladderWireSet(rects)
    expect(flares).toHaveLength(8)
    expect(flares.every(fl => fl.d.startsWith('M ') && fl.d.endsWith('Z'))).toBe(true)
    // у пятиугольника бутон — толщина линии W_MAX + 2·BULB
    expect(dots.at(-1).r).toBe(bulbR(W_MAX))
    expect(bulbR(W_MAX)).toBeGreaterThan(W_MAX / 2)
    // труба: узкий конец — толщина линии, широкий — диаметр бутона, у самого элемента
    const d = flarePath([100, 50], [1, 0], 2, 20, 5)
    const ys = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(m => [+m[1], +m[2]])
    expect(Math.min(...ys.map(p => p[0]))).toBe(80)
    expect(Math.max(...ys.map(p => p[0]))).toBe(100)
    expect(Math.max(...ys.filter(p => p[0] === 100).map(p => p[1])) - Math.min(...ys.filter(p => p[0] === 100).map(p => p[1]))).toBe(10)
  })

  it('шарик: старт на 115% толщины линии у ступени и сжатие вместе с линией до шапки', () => {
    const { widths } = ladderWireSet(rects)
    expect(widths).toHaveLength(3)
    // чем ниже ступень, тем толще линия у неё, а значит и крупнее шарик на старте
    expect(widths[0]).toBeLessThan(widths[1])
    expect(widths[1]).toBeLessThan(widths[2])
    // диаметр шарика = 115% толщины
    expect(ballScale(3.2) * BALL_D).toBeCloseTo(3.2 * BALL_GROW, 2)
    // к шапке линия тоньше — шарик меньше, чем на старте
    widths.forEach(w => expect(ballScale(W_MIN)).toBeLessThan(ballScale(w)))
    // ореол — заметно шире линии (иначе шарик одного цвета с тонкой линией не виден) и тоже сжимается
    expect(haloScale(3.2) * HALO_D).toBeCloseTo(3.2 * HALO_GROW, 2)
    expect(HALO_GROW).toBeGreaterThan(BALL_GROW * 2)
    widths.forEach(w => expect(haloScale(W_MIN)).toBeLessThan(haloScale(w)))
  })
})

describe('связи памяти: цвет и числа', () => {
  const widths = [320, 393, 430]
  const layout = w => {
    const zone = w - 44
    const cl = Math.round(zone / 2 - 50)
    return {
      hero: { l: 0, t: 0, r: zone, b: 100 },
      circle: { l: cl, t: 128, r: cl + 100, b: 228 },
      blocks: [0, 1, 2].map(i => ({ l: zone * (0.075 + 0.1425 * i), t: 260 + 110 * i, r: zone * (0.715 + 0.1425 * i), b: 350 + 110 * i })),
      fin: { l: 40, t: 620, r: zone - 40, b: 860 },
      edge: -22,
    }
  }
  const finite = o => Object.values(o).every(v => typeof v === 'string' ? !/NaN/.test(v) : Number.isFinite(v))

  it('ни у одного отрезка, раздува и бутона нет NaN — на разных ширинах, со сном и без', () => {
    for (const w of widths) for (const sleeping of [false, true]) {
      const set = ladderWireSet(layout(w), { sleeping })
      expect(set.pieces.length).toBeGreaterThan(40)
      for (const p of set.pieces) expect(finite(p)).toBe(true)
      for (const d of set.dots) expect(finite(d)).toBe(true)
      for (const fl of set.flares) expect(fl.d).not.toMatch(/NaN/)
      expect(set.widths.every(Number.isFinite)).toBe(true)
      expect(finite(set.tearAt)).toBe(true)
      // отводы к «Новым» и «Знакомым» нарисованы (отрезки у левого бока первых двух ступеней)
      const bl = layout(w).blocks
      expect(set.pieces.some(p => Math.abs(p.x2 - bl[0].l) < 9 && Math.abs(p.y1 - 305) < 1)).toBe(true)
      expect(set.pieces.some(p => Math.abs(p.x2 - bl[1].l) < 9 && Math.abs(p.y1 - 415) < 1)).toBe(true)
    }
  })

  it('без сна: зелёная до выхода из круга, бело-серая после трубы; бутоны входа/выхода — цвета линии', () => {
    const set = ladderWireSet(rects)
    const row = set.pieces.filter(p => Math.abs(p.y1 - 178) < 0.5 && Math.abs(p.y2 - 178) < 0.5)
    const left = row.filter(p => p.x1 < circle.l - 1), right = row.filter(p => p.x1 > circle.r)
    expect(right.every(p => p.color === '#b6fe3b')).toBe(true)
    expect(left.filter(p => p.x1 < circle.l - 40).every(p => p.color === '#dbe6f5')).toBe(true)
    expect(set.dots[1].color).toBe('#b6fe3b')
    expect(set.dots[2].color).toBe('#b6fe3b')
    // ствол бело-серый до первого отвода (ниже к x = −11 примешиваются отрезки отводов), у «Усвоенных» — золотистый
    const trunk = set.pieces.filter(p => p.x1 === p.x2 && p.x1 === -11)
    expect(trunk.length).toBeGreaterThan(20)
    expect(trunk.filter(p => p.y1 < 270).every(p => p.color === '#dbe6f5')).toBe(true)
    // последний отрезок перед «Усвоенными» — почти золотистый (середина отрезка чуть не доходит до конца), бутон — золотистый
    expect(set.pieces.find(p => Math.abs(p.x2 - blocks[2].l) < 9 && Math.abs(p.y1 - 450) < 1).color).toMatch(/^rgb\(2[34]\d, 19\d, [5-9]\d\)$/)
    expect(set.dots[5].color).toBe('#f1bd3c')
  })

  it('сон: зелёная до разрыва, бело-серая после (переход в вырезанном окне)', () => {
    const set = ladderWireSet(rects, { sleeping: true })
    const t = tearWire(set.pieces, set.tearAt)
    const xs = set.pieces.filter(p => !t.pieces.includes(p)).flatMap(p => [p.x1, p.x2])
    const [gr, gl] = [Math.max(...xs), Math.min(...xs)]
    const row = t.pieces.filter(p => Math.abs(p.y1 - 178) < 0.5 && Math.abs(p.y2 - 178) < 0.5 && p.x1 < circle.l + 1)
    expect(row.filter(p => Math.min(p.x1, p.x2) >= gr).every(p => p.color === '#b6fe3b')).toBe(true)
    expect(row.filter(p => Math.max(p.x1, p.x2) <= gl).every(p => p.color === '#dbe6f5')).toBe(true)
    expect(set.dots[2].color).toBe('#b6fe3b')
  })

  it('бутон у шапки — целиком под нижней гранью (центр ниже грани на радиус), труба от него вниз', () => {
    const { dots, flares } = ladderWireSet(rects)
    expect(dots[0].y).toBe(hero.b + dots[0].r)
    expect(dots[0].r).toBe(bulbR(W_MIN))
    expect(flares[0].d).toMatch(/^M /)
  })
})

describe('findLadderWord', () => {
  const ladder = buildLadder([
    { word: 'keep', step: 2, due_on: '2026-10-01' },
    { word: 'make', step: 5, due_on: '2026-11-01', settled_on: '2026-10-01' },
  ])
  it('находит слово на ступени и в постоянной памяти; нет слова — null', () => {
    expect(findLadderWord(ladder, 'keep')).toMatchObject({ perm: false, word: { word: 'keep', step: 2 } })
    expect(findLadderWord(ladder, 'make')).toMatchObject({ perm: true, word: { word: 'make' } })
    expect(findLadderWord(ladder, 'nope')).toBe(null)
    expect(findLadderWord(null, 'keep')).toBe(null)
  })
})
