import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const mod = read('./AudioModule.jsx')

// В переписке звучит что-то одно (useSoloMedia): запуск соседнего голосового
// ставит текущее на паузу МИМО toggle(). Раньше isPlaying меняли только свои
// же обработчики, и остановленное со стороны сообщение продолжало показывать
// ⏸ и «играющие» полосы.
// Замер после правки: во время — кнопка pause, 72 полосы «играют»;
// после запуска соседнего — кнопка play, полос «играют» 0, позиция цела.
describe('кнопка голосового отражает сам элемент', () => {
  it('слушает pause/play элемента, а не только свои нажатия', () => {
    expect(mod).toContain("audio.addEventListener('pause', onPause)")
    expect(mod).toContain("audio.addEventListener('play', onPlay)")
    expect(mod).toContain("audio.removeEventListener('pause', onPause)")
    expect(mod).toContain("audio.removeEventListener('play', onPlay)")
  })

  it('на паузе гасит и цикл кадров — иначе он крутился бы впустую', () => {
    const onPause = mod.slice(mod.indexOf('const onPause = () =>'))
    expect(onPause.slice(0, 90)).toContain('stopRAF()')
    expect(onPause.slice(0, 90)).toContain('setIsPlaying(false)')
  })

  it('возобновление снаружи поднимает цикл кадров обратно', () => {
    // Тулбар снимает заморозку сам, минуя кнопку: без этого волна осталась бы
    // стоять, пока звук идёт
    expect(mod).toContain('const tickRef         = useRef(null)')
    expect(mod).toContain('tickRef.current = tick')
    expect(mod).toContain('function ensureTick()')
  })

  it('цикл кадров ровно один — возобновление приходит с двух сторон', () => {
    // Событие 'play' и промис audio.play() срабатывают оба; если каждый
    // заведёт свой rAF, дальше они перебивают друг друга через общий rafRef
    expect(mod).toContain('if (!rafRef.current && tickRef.current) rafRef.current = requestAnimationFrame(tickRef.current)')
    // Оба пути возобновления зовут ensureTick, а не свой rAF. Внутри самого
    // tick перепланирование остаётся — это его собственный шаг, не старт
    const resume = mod.slice(mod.indexOf('const onPlay = () =>'))
    expect(resume.slice(0, 120)).toContain('ensureTick()')
    const promise = mod.slice(mod.indexOf("pLog('AudioModule: play() resolved OK')"))
    expect(promise.slice(0, 260)).toContain('ensureTick()')
    expect((mod.match(/requestAnimationFrame\(tickRef\.current\)/g) ?? [])).toHaveLength(1)
  })
})

// Кнопка на паузе — чистый серый, а не «грязно-зелёный». Полупрозрачный лайм
// поверх тёмного фона давал болотный оттенок: цвет читался как испорченный
// зелёный, а не как «выключено». Замер: lime rgb(182,254,59) → пауза
// rgb(154,160,180) — зелёный не доминирует, оттенок холодный нейтральный.
describe('кнопка голосового на паузе', () => {
  const css = readFileSync(fileURLToPath(new URL('../../../../styles/player/modules/audio.css', import.meta.url)), 'utf8')

  it('серый задан своим цветом, а не прозрачностью лайма', () => {
    const rule = css.slice(css.indexOf('.playerAudioBtnPaused {'))
    const body = rule.slice(0, rule.indexOf('}'))
    expect(body).toContain('background: #9aa0b4')
    expect(body).toContain('border-color: #9aa0b4')
    // Ни opacity, ни filter — они и давали грязь
    expect(body).not.toContain('opacity')
    expect(body).not.toContain('filter')
  })

  it('серым становится только НАЧАТОЕ и остановленное сообщение', () => {
    // У непрослушанного ▶ остаётся лаймовым: это зов нажать
    expect(mod).toContain('const [startedOnce,     setStartedOnce]     = useState(false)')
    expect(mod).toContain("playerAudioBtn${!isPlaying && startedOnce ? ' playerAudioBtnPaused' : ''}")
    expect(mod).toContain('setStartedOnce(true)')
  })
})
