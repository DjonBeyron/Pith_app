import { describe, it, expect } from 'vitest'
import { crossfadeHeads, FADE_MS, OUT_CLASS } from './wordLaneCatFade.js'

// Голова-подделка: classList, порядок в DOM (pos) и WAAPI-animate с ручным завершением
function head(pos, withAnimate = true) {
  const classes = new Set()
  const h = {
    pos, classes, anims: [],
    classList: { add: c => classes.add(c), remove: c => classes.delete(c) },
    compareDocumentPosition: other => (other.pos > h.pos ? 4 : 2),
  }
  if (withAnimate) {
    h.animate = (frames, opts) => {
      const a = { frames, opts, canceled: false, onfinish: null, oncancel: null, cancel() { this.canceled = true; this.oncancel?.() }, finish() { this.onfinish?.() } }
      h.anims.push(a)
      return a
    }
  }
  return h
}

describe('смена лица кота: перекрёстное проявление, без щелчка', () => {
  it('новая голова стоит в DOM после прежней (рисуется поверх): она проявляется 0 → 1 на FADE_MS, прежняя остаётся видимой, пока идёт переход', () => {
    const prev = head(0); const next = head(1)
    crossfadeHeads(prev, next)
    expect(prev.classes.has(OUT_CLASS)).toBe(true)
    expect(next.anims).toHaveLength(1)
    expect(next.anims[0].frames).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(next.anims[0].opts.duration).toBe(FADE_MS)
    expect(prev.anims).toHaveLength(0)
    next.anims[0].finish()
    expect(prev.classes.has(OUT_CLASS)).toBe(false)
  })

  it('новая голова стоит до прежней (под ней): прозрачность меняет верхняя — прежняя уходит 1 → 0, просвета нет', () => {
    const prev = head(2); const next = head(0)
    crossfadeHeads(prev, next)
    expect(prev.anims[0].frames).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(next.anims).toHaveLength(0)
    expect(prev.classes.has(OUT_CLASS)).toBe(true)
    prev.anims[0].finish()
    expect(prev.classes.has(OUT_CLASS)).toBe(false)
  })

  it('отмена доводит переход до конца сразу: класс снят, анимация отменена; повторный finish безвреден', () => {
    const prev = head(0); const next = head(1)
    const cancel = crossfadeHeads(prev, next)
    cancel()
    expect(prev.classes.has(OUT_CLASS)).toBe(false)
    expect(next.anims[0].canceled).toBe(true)
    expect(() => next.anims[0].finish()).not.toThrow()
  })

  it('нет WAAPI (старый WebView), нет головы или голова та же — смена без перехода, ничего не ломается', () => {
    const prev = head(0); const next = head(1, false)
    expect(crossfadeHeads(prev, next)).toBeTypeOf('function')
    expect(prev.classes.has(OUT_CLASS)).toBe(false)
    expect(() => crossfadeHeads(undefined, head(1))()).not.toThrow()
    const same = head(1)
    crossfadeHeads(same, same)
    expect(same.anims).toHaveLength(0)
  })
})
