import { describe, it, expect } from 'vitest'
import { checkSpriteSvg, spriteCheckSummary, FORBIDDEN_TAGS } from './spriteCheck.js'

const GOOD_PROP = `<?xml version="1.0"?>
<!-- кружка от дизайнера -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -36 30 36">
  <title>Кружка</title>
  <g data-part="mug">
    <rect x="-10" y="-22" width="20" height="22" rx="3" fill="#e04e5c"/>
    <path d="M10 -16 q10 0 10 7" fill="none" stroke="currentColor" stroke-width="3.5"/>
    <circle r="2" fill="rgb(255, 255, 255)"/>
  </g>
</svg>`

function catSvg(extra = '') {
  return `<svg viewBox="0 0 200 240">
  <g data-part="cat">
    <g data-part="tail"><path d="M0 0 L1 1" stroke="#000"/></g>
    <g data-part="body"><ellipse rx="10" ry="10" fill="#fff"/></g>
    <g data-part="head">
      <g data-part="eyes"><circle r="3" fill="#000"/></g>
      <g data-part="mouth">
        <g data-viseme="closed"><path d="M0 0" stroke="#000"/></g>
        <g data-viseme="half"><ellipse rx="1" ry="1"/></g>
        <g data-viseme="open"><ellipse rx="2" ry="2"/></g>
      </g>
    </g>
  </g>${extra}
</svg>`
}

describe('checkSpriteSvg — хорошие файлы', () => {
  it('предмет с группой data-part, viewBox и допустимыми цветами — чисто', () => {
    expect(checkSpriteSvg(GOOD_PROP, 'prop')).toEqual([])
    const s = spriteCheckSummary(GOOD_PROP, 'prop')
    expect(s.ok).toBe(true)
    expect(s.nodes).toBe(4)
  })

  it('кот с обязательными группами и тремя виземами — чисто', () => {
    expect(checkSpriteSvg(catSvg(), 'cat')).toEqual([])
  })
})

describe('checkSpriteSvg — плохие файлы', () => {
  it('запрещённые теги называются по именам со строкой', () => {
    const bad = `<svg viewBox="0 0 10 10"><g data-part="x">
<filter id="f"/>
<mask id="m"/>
<clipPath id="c"/>
<foreignObject/>
<script>alert(1)</script>
<image href="http://x/y.png"/>
<linearGradient id="g"/>
<rect width="1" height="1"/></g></svg>`
    const out = checkSpriteSvg(bad, 'prop')
    for (const tag of ['filter', 'mask', 'clipPath', 'foreignObject', 'script', 'image', 'linearGradient']) {
      expect(out.some(o => o.includes(`<${tag}>`)), tag).toBe(true)
    }
    expect(out.find(o => o.includes('<filter>'))).toMatch(/строка 2/)
    expect(FORBIDDEN_TAGS).toContain('use')
  })

  it('внешние ссылки, url(), обработчики, плохие цвета', () => {
    const bad = `<svg viewBox="0 0 10 10"><g data-part="x">
<rect width="1" height="1" fill="url(#grad)"/>
<path d="M0 0" stroke="blurple" onclick="x()"/>
<circle r="1" style="filter: blur(2px)" fill="#fff"/>
<polygon points="0,0 1,1" xlink:href="#a"/>
</g></svg>`
    const out = checkSpriteSvg(bad, 'prop')
    expect(out.some(o => o.includes('url(…)'))).toBe(true)
    expect(out.some(o => o.includes('stroke="blurple"'))).toBe(true)
    expect(out.some(o => o.includes('onclick'))).toBe(true)
    expect(out.some(o => o.includes('В style запрещены'))).toBe(true)
    expect(out.some(o => o.includes('xlink:href'))).toBe(true)
  })

  it('viewBox: отсутствует / не тот размер для кота / предмет больше сцены', () => {
    expect(checkSpriteSvg('<svg><g data-part="a"><rect/></g></svg>', 'prop')).toContain('У <svg> нужен viewBox="x y w h"')
    expect(checkSpriteSvg(catSvg().replace('0 0 200 240', '0 0 100 100'), 'cat').some(o => o.includes('200×240'))).toBe(true)
    expect(checkSpriteSvg('<svg viewBox="0 0 400 700"><g data-part="a"><rect/></g></svg>', 'prop').some(o => o.includes('больше сцены'))).toBe(true)
  })

  it('лимит узлов по типу и отсутствие фигур', () => {
    const many = `<svg viewBox="0 0 10 10"><g data-part="a">${'<rect/>'.repeat(13)}</g></svg>`
    expect(checkSpriteSvg(many, 'prop').some(o => o.includes("> 12 для типа 'prop'"))).toBe(true)
    expect(checkSpriteSvg('<svg viewBox="0 0 10 10"></svg>', 'prop')).toContain('В файле нет фигур')
  })

  it('обязательные группы: предмет без data-part, кот без хвоста/виземы, фон без пола', () => {
    expect(checkSpriteSvg('<svg viewBox="0 0 10 10"><rect/></svg>', 'prop').some(o => o.includes('хотя бы одна группа'))).toBe(true)
    const noTail = catSvg().replace('data-part="tail"', 'data-part="tale"')
    expect(checkSpriteSvg(noTail, 'cat')).toContain('Нет группы data-part="tail"')
    const noOpen = catSvg().replace('data-viseme="open"', 'data-viseme="wide"')
    expect(checkSpriteSvg(noOpen, 'cat')).toContain('Нет группы рта data-viseme="open"')
    const bg = '<svg viewBox="0 0 360 640"><g data-part="wall"><rect/></g></svg>'
    expect(checkSpriteSvg(bg, 'background')).toContain('Нет группы data-part="floor"')
  })

  it('не svg, пустой, неизвестный тип', () => {
    expect(checkSpriteSvg('<div>нет</div>', 'prop')).toContain('Файл должен начинаться с <svg …>')
    expect(checkSpriteSvg('', 'prop')).toEqual(['Пустой файл'])
    expect(checkSpriteSvg(GOOD_PROP, 'dog')[0]).toMatch(/Неизвестный тип/)
    expect(checkSpriteSvg(`<svg viewBox="0 0 1 1"><g data-part="a"><rect/><video/></g></svg>`, 'prop').some(o => o.includes('Неизвестный тег <video>'))).toBe(true)
  })
})
