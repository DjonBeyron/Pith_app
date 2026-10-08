import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Кнопка «Проверить» всех панелей ответа — один источник вида (phrase-assembly.css).
// Тест-читатель исходников: вне этого файла у кнопки не должно быть своих размеров/формы/шрифта.
const stylesDir = fileURLToPath(new URL('../../../styles/', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const SOURCE = 'player/panels/phrase-assembly.css'

function cssFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? cssFiles(full) : name.endsWith('.css') ? [full] : []
  })
}

// Все правила файла: [{ selector, body }] (без комментариев и @media-обёрток — вложенные правила тоже видны)
function rules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selector: m[1].trim(), body: m[2] }))
}

const BTN = /\.(?:phraseCheckBtn|tmCheckBtn|fbCheckBtn)(?![\w-])/
// Размер, форма, рамка, шрифт и цвет — только в источнике. Остаются отступ и показ/скрытие
const FORBIDDEN = /(?:^|[\s;])(?:width|height|min-width|min-height|max-width|max-height|padding(?:-[a-z]+)?|border(?:-[a-z-]+)?|border-radius|font(?:-[a-z]+)?|line-height|white-space|box-sizing|background(?:-[a-z]+)?|color)\s*:/

describe('«Проверить» — один источник вида (.phraseCheckBtn)', () => {
  it('вне phrase-assembly.css нет правил для кнопки с размером, формой, рамкой, шрифтом или цветом', () => {
    const offenders = []
    for (const file of cssFiles(stylesDir)) {
      if (file.endsWith(SOURCE)) continue
      for (const r of rules(readFileSync(file, 'utf8'))) {
        if (BTN.test(r.selector) && FORBIDDEN.test(` ${r.body}`)) offenders.push(`${file}: ${r.selector}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('источник задаёт 46px, радиус 12px, лаймовую рамку, шрифт clamp(13px, 3.6vw, 16px)/700, одну строку, всю ширину', () => {
    const src = rules(read(`../../../styles/${SOURCE}`))
    const main = src.find(r => r.selector.includes('.phraseCheckBtn') && !r.selector.includes(':'))
    expect(main).toBeTruthy()
    expect(main.selector).toContain('.tmCheckBtn')
    expect(main.selector).toContain('.fbCheckBtn')
    expect(main.body).toContain('height: 46px;')
    expect(main.body).toContain('border-radius: 12px;')
    expect(main.body).toContain('border: 2px solid #b6fe3b;')
    expect(main.body).toContain('font-size: clamp(13px, 3.6vw, 16px);')
    expect(main.body).toContain('font-weight: 700;')
    expect(main.body).toContain('white-space: nowrap;')
    expect(main.body).toContain('width: 100%;')
  })

  it('источник подключён в index.css раньше table-manual.css и fill-blanks.css (их transition перекрывает общий)', () => {
    const idx = read('../../../index.css')
    const at = name => idx.indexOf(`styles/player/panels/${name}.css`)
    expect(at('phrase-assembly')).toBeGreaterThan(-1)
    expect(at('phrase-assembly')).toBeLessThan(at('table-manual'))
    expect(at('phrase-assembly')).toBeLessThan(at('fill-blanks'))
  })

  it('шторка «Ловли» берёт тот же класс и держит ту же высоту 46px', () => {
    expect(read('../../feed/catch/CatchSheet.jsx')).toContain('className="phraseCheckBtn catchMainBtn"')
    const sheet = rules(read('../../../styles/feed-catch-sheet.css')).find(r => r.selector === '.catchMainBtn')
    expect(sheet.body).toContain('min-height: 46px;')
  })

  it('панели используют класс: собери фразу и напечатай слово — .phraseCheckBtn', () => {
    expect(read('./phrase-assembly/PhraseAssemblyPanel.jsx')).toContain('className="phraseCheckBtn"')
    expect(read('./type-word/TypeWordPanel.jsx')).toContain('className="phraseCheckBtn"')
    expect(read('./table-manual/TableManualPanel.jsx')).toContain('tmCheckBtn')
    expect(read('./fill-blanks/FillBlanksPanel.jsx')).toContain('fbCheckBtn')
  })
})
