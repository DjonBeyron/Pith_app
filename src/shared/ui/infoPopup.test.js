import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import InfoPopup from './InfoPopup.jsx'

// InfoPopup: в проекте нет testing-library/jsdom, поэтому — разметка закрытого состояния через renderToStaticMarkup
// (aria-атрибуты кнопки) + сторож по исходнику для поведения (открытие/закрытие) и по CSS (размеры, reduced-motion).
// Положение и защита от выхода за экран — infoPopupPlace.test.js
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const code = read('./InfoPopup.jsx').replace(/\/\/.*$/gm, '')
const css = read('../../styles/info-popup.css').replace(/\/\*[\s\S]*?\*\//g, '')

describe('InfoPopup — кнопка «i» (закрытое состояние)', () => {
  const html = renderToStaticMarkup(createElement(InfoPopup, { title: 'Заголовок', testId: 't1' }, 'Длинный текст пояснения'))

  it('кнопка с aria-label «Пояснение», type=button, aria-expanded=false, aria-haspopup=dialog; значок скрыт от скринридера', () => {
    expect(html).toContain('<button')
    expect(html).toContain('type="button"')
    expect(html).toContain('aria-label="Пояснение"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('data-testid="t1"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('aria-controls') // пока закрыт — ссылки на несуществующий диалог нет
  })

  it('пока попап закрыт, текст пояснения в разметке отсутствует (панель не растягивается)', () => {
    expect(html).not.toContain('Длинный текст пояснения')
    expect(html).not.toContain('Заголовок')
  })

  it('label можно переопределить', () => {
    expect(renderToStaticMarkup(createElement(InfoPopup, { label: 'Подробнее' }, 'x'))).toContain('aria-label="Подробнее"')
  })
})

describe('InfoPopup — поведение (по исходнику)', () => {
  it('кнопка переключает попап: повторное нажатие закрывает (toggle), клик не всплывает в холст', () => {
    expect(code).toContain('setPlace(p => (p ? null :')
    expect(code).toMatch(/onClick=\{e => \{ stop\(e\); toggle\(\) \}\}/)
    expect(code).toContain('onMouseDown={stop} onPointerDown={stop}')
  })

  it('закрытие: тап мимо (pointerdown вне попапа и кнопки), Esc, resize, прокрутка/колесо вне попапа; слушатели снимаются', () => {
    expect(code).toContain("document.addEventListener('pointerdown', onDown, true)")
    expect(code).toContain("e.key === 'Escape'")
    expect(code).toContain("window.addEventListener('resize', close)")
    expect(code).toContain("window.addEventListener('scroll', onMove, true)")
    expect(code).toContain("window.addEventListener('wheel', onMove,")
    expect(code).toMatch(/popRef\.current\?\.contains\(e\.target\)/)
    expect(code).toMatch(/btnRef\.current\?\.contains\(e\.target\)/)
    for (const ev of ['pointerdown', 'keydown']) expect(code).toContain(`document.removeEventListener('${ev}'`)
    for (const ev of ['resize', 'scroll', 'wheel']) expect(code).toContain(`window.removeEventListener('${ev}'`)
  })

  it('попап — портал в body, role=dialog с aria-label, id связан с aria-controls кнопки; позиция из placeInfoPopup', () => {
    expect(code).toContain('createPortal(')
    expect(code).toContain('document.body')
    expect(code).toContain('role="dialog"')
    expect(code).toContain('aria-label={title ?? label}')
    expect(code).toContain('aria-controls={open ? id : undefined}')
    expect(code).toContain("from '../lib/infoPopupPlace.js'")
    expect(code).toContain('maxHeight: place.maxHeight')
  })
})

describe('info-popup.css', () => {
  it('значок ≈22px, зона касания ≥ 36px (::after с inset отрицательным)', () => {
    const btn = css.match(/\.infoPopBtn \{[^}]*\}/)[0]
    const w = Number(btn.match(/width: (\d+)px/)[1])
    expect(w).toBeGreaterThanOrEqual(20)
    expect(w).toBeLessThanOrEqual(24)
    const inset = Number(css.match(/\.infoPopBtn::after \{[^}]*inset: -(\d+)px/)[1])
    expect(w + 2 * inset).toBeGreaterThanOrEqual(36)
  })

  it('попап: fixed, выше холста, прокрутка внутри (не растягивает экран), без анимации при prefers-reduced-motion', () => {
    const pop = css.match(/\.infoPop \{[^}]*\}/)[0]
    expect(pop).toContain('position: fixed')
    expect(pop).not.toContain('overflow') // иначе обрежется уголок ::before
    expect(css.match(/\.infoPopBody \{[^}]*\}/)[0]).toContain('overflow-y: auto')
    expect(Number(pop.match(/z-index: (\d+)/)[1])).toBeGreaterThan(1300)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.infoPop, \.infoPop--up \{ animation: none; \}/)
  })

  it('файл подключён в index.css', () => {
    expect(read('../../index.css')).toContain("@import './styles/info-popup.css';")
  })
})
