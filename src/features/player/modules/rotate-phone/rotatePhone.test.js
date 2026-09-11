import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const mod  = read('./RotatePhoneModule.jsx')
const hook = read('./useLandscapeWatch.js')
const css  = read('../../../../styles/player/modules/rotate-phone.css')

describe('нода «переверни телефон» зарегистрирована везде, где живут типы', () => {
  it('тип, дефолты, редактор, реестр модулей, легенда', () => {
    expect(read('../../../canvas/nodeTypes.js')).toContain("value: 'rotate_phone'")
    expect(read('../../../canvas/nodeTypes.js')).toContain("rotate_phone: 'Поверни'")
    expect(read('../../../canvas/nodeDefaults.js')).toContain("rotate_phone: { if: 'shown' }")
    expect(read('../../../canvas/nodeDefaults.js')).toContain("rotate_phone: 'content'")
    expect(read('../../../canvas/nodeGraph.js')).toContain("rotate_phone:    { content: 'Поверните экран' }")
    expect(read('../../../canvas/NodeContentEditor.jsx')).toContain("node.type === 'rotate_phone'")
    expect(read('../index.js')).toContain('rotate_phone:    RotatePhoneModule')
    expect(read('../../../canvas/lesson-io/lessonSchema.js')).toContain('rotate_phone: {')
    expect(read('../../../../index.css')).toContain("@import './styles/player/modules/rotate-phone.css'")
  })
})

describe('датчик поворота', () => {
  it('первый канал — ориентация экрана, без разрешений', () => {
    expect(hook).toContain("window.matchMedia('(orientation: landscape)')")
    // Разрешение на датчик сам хук не спрашивает — это делает жест «Начать урок»
    expect(hook).not.toContain('DeviceOrientationEvent.requestPermission')
    // Старый Safari — без addEventListener у MediaQueryList
    expect(hook).toContain('mq.addListener?.(check)')
  })

  it('на десктопе «уже горизонтально» не засчитывается', () => {
    // Окно почти всегда альбомное — стрелка гасла бы, не успев показаться
    expect(hook).toContain("if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) check()")
  })

  it('на время ожидания приложение впускает альбомную ориентацию', () => {
    // Иначе послушный поворот встречал бы заглушку «Поверните вертикально»
    expect(hook).toContain("root.setAttribute(ALLOW_LANDSCAPE_ATTR, '')")
    expect(hook).toContain('screen.orientation?.unlock?.()')
    expect(read('../../../../styles/orientation-guard.css')).toContain('html[data-allow-landscape] .orientationGuard { display: none !important; }')
    // …и возвращает всё как было
    expect(hook).toContain('root.removeAttribute(ALLOW_LANDSCAPE_ATTR)')
    expect(hook).toContain("screen.orientation?.lock?.('portrait')")
  })
})

describe('остановка стрелки', () => {
  it('на телефоне крутится до поворота, галочка — только по повороту', () => {
    // Лимит показов и часы — только вне телефона (десктоп, превью админа)
    expect(mod).toContain("const [canRotate] = useState(() => window.matchMedia('(hover: none) and (pointer: coarse)').matches)")
    const iter = mod.slice(mod.indexOf('function onIteration'))
    expect(iter.slice(0, 80)).toContain('if (canRotate) return')
    expect(mod).toContain("{by === 'rotate' && <span className=\"playerRotateCheck\"><Check size={13} /></span>}")
    expect(mod).not.toContain('{stopped && <span className="playerRotateCheck"')
  })

  it('поворот — стоп; вне телефона три показа — стоп; потом onDone', () => {
    expect(mod).toContain('const MAX_SHOWS = 3')
    expect(mod).toContain("useLandscapeWatch(!stopped, useCallback(() => stop('rotate'), [stop]))")
    expect(mod).toContain('onAnimationIteration={onIteration}')
    expect(mod).toContain("onDone?.('shown')")
  })

  it('показы считаются по самой анимации, а часы — только страховка', () => {
    // Число циклов берётся из animationiteration — оно совпадает с тем, что
    // видно на экране. Часы нужны на reduced-motion и скрытую вкладку
    expect(mod).toContain('if (showsRef.current >= MAX_SHOWS)')
    expect(mod).toContain('MAX_SHOWS * CYCLE_MS + 600')
  })

  it('длина цикла в JS и CSS одна и та же', () => {
    const js = Number(mod.match(/const CYCLE_MS = (\d+)/)[1])
    const cssMs = Number(css.match(/animation: playerRotateAsk ([\d.]+)s/)[1]) * 1000
    expect(js).toBe(cssMs)
  })

  it('после остановки значок замирает горизонтально, дуга гаснет', () => {
    expect(css).toContain('.playerRotateCard--stopped .playerRotatePhone {')
    expect(css).toContain('.playerRotateCard--stopped .playerRotateArrows { animation: none; opacity: 0.18; }')
    // Повторно не срабатывает — ни датчик, ни лимит
    expect(mod).toContain('if (doneRef.current) return')
  })
})

describe('вид карточки', () => {
  it('крутится HTML-обёртка, а не SVG-группа — Safari', () => {
    // CSS-поворот <g> Safari проигрывает ненадёжно (transform-origin у группы
    // считается иначе); span крутится везде одинаково
    expect(mod).toContain('<span className="playerRotatePhone" onAnimationIteration={onIteration}>')
    expect(mod).toContain('<svg className="playerRotateArrows"')
    expect(mod).not.toContain('<g className="playerRotatePhone"')
  })

  it('свечение без краёв и анимация даже при reduced-motion', () => {
    // Квадрат с рамкой читался как «свет с границами»
    expect(css).toContain('background: radial-gradient(circle at 50% 50%,')
    expect(css).not.toContain('border: 1px solid rgba(182, 254, 59, 0.25)')
    // Поворот — само содержание сообщения, его не глушим
    const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduce).not.toContain('playerRotatePhone')
  })

  it('тексты: заголовок редактируется, подпись постоянная, «ладно» убрано', () => {
    expect(mod).toContain("const title = node.typeData?.rotate_phone?.content || 'Поверните экран'")
    expect(mod).toContain('Переверните телефон горизонтально')
    expect(mod).not.toContain('Ладно, идём дальше')
    // Индикация для проверки датчика — только при настоящем повороте
    expect(mod).toContain("{by === 'rotate' && <span className=\"playerRotateHit\">Телефон повёрнут ✓</span>}")
  })
})

// Системный замок поворота: экран остаётся портретным, что бы человек ни
// делал с телефоном, — и matchMedia молчит. Датчик движения на замок не
// смотрит: видит сам поворот в руках
describe('замок поворота: второй канал — наклон устройства', () => {
  const perm = read('../../../../shared/lib/motionPermission.js')

  it('наклон gamma засчитывается наравне с поворотом экрана', () => {
    expect(hook).toContain("window.addEventListener('deviceorientation', onTilt)")
    expect(hook).toContain('const TILT_DEG = 55')
    expect(hook).toContain('if (Math.abs(e.gamma) > TILT_DEG)')
    // Оба канала ведут в одну точку и срабатывают один раз
    expect(hook).toContain("const check = () => { if (mq.matches) hit('экран') }")
    expect(hook).toContain('if (fired) return')
  })

  it('на iOS разрешение спрашивается на «Начать урок», один раз, и запоминается', () => {
    const card = read('../../../lessons/LessonLaunchCard.jsx')
    const start = card.slice(card.indexOf('function handleStart'))
    expect(start.slice(0, 900)).toContain('requestMotionPermission()')
    // Согласие помним; при следующих запусках тихо продлеваем на первом касании
    expect(perm).toContain("const REMEMBER_KEY = 'pithy_motion_ok_v1'")
    expect(perm).toContain('export function armMotionOnGesture()')
    expect(read('../../../../app/ShellV2.jsx')).toContain('armMotionOnGesture()')
    expect(perm).toContain('DeviceOrientationEvent.requestPermission()')
    // Без разрешения канал молчит, а не падает
    expect(hook).toContain('const useTilt = motionAllowed()')
  })

  it('где разрешения не существует — датчик доступен и без жеста', () => {
    // Android/десктоп: превью админа из канваса запускается без «Начать урок»
    expect(perm).toContain("typeof DeviceOrientationEvent.requestPermission !== 'function'")
  })
})
