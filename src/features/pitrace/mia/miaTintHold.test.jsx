import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { useMiaTint, TINT_HOLD_MS } from './miaTint.js'

// Цвет Мии на дорожках не мигает на стыке стадий: выключение — с выдержкой, включение — сразу
function Probe({ on }) { return <i>{useMiaTint(on) ? 'in' : 'off'}</i> }

describe('выдержка выключения цвета Мии (useMiaTint)', () => {
  it('первый показ: цвет есть — сразу «in», цвета нет — сразу «off» (выдержка только после включённого)', () => {
    expect(renderToStaticMarkup(<Probe on />)).toBe('<i>in</i>')
    expect(renderToStaticMarkup(<Probe on={false} />)).toBe('<i>off</i>')
  })
  it('выдержка 0,2 с — короче приседания Мии перед прыжком (0,3 с): цвет возвращается ещё до полёта', () => {
    expect(TINT_HOLD_MS).toBe(200)
    const src = readFileSync(new URL('./miaTint.js', import.meta.url), 'utf8')
    expect(src).toContain('if (on && off) setOff(false)') // включение — в том же рендере
    expect(src).toContain('const id = setTimeout(() => setOff(true), TINT_HOLD_MS); return () => clearTimeout(id)') // выключение — таймером, новый on его снимает
    expect(src).toContain('return on || !off')
  })
  it('игра красит дорожки по выдержанному признаку и отмечает перекраску для трассера лагов', () => {
    const game = readFileSync(new URL('../../player/modules/rotate-phone/WordLaneGame.jsx', import.meta.url), 'utf8')
    expect(game).toContain('const miaTint = useMiaTint(miaColorOn(')
    expect(game).toContain("data-mia={miaTint ? 'in' : undefined}")
  })
})
