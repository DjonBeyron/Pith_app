import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import FillSheet from '../fill/FillSheet.jsx'
import PictureSheet from '../picture/PictureSheet.jsx'

// Шторки игр «Дополни реплику» и «Картинка» — разметка до ответа и после (эффекты звука в статическом рендере не идут;
// ход раунда проверен чистыми функциями в useOptionRound.test.js)
const noop = () => {}
const render = (Sheet, item) => renderToStaticMarkup(<Sheet item={item} onFinishStats={noop} onClose={noop} />)

const fillItem = over => ({
  word: 'sheep', result: null,
  task: {
    text: 'I see a sheep.', before: 'I see a ', after: '.', answer: 'sheep', options: ['ship', 'sheep', 'chip'],
    audio: { url: 'https://r2.dev/a.mp3', steps: [] }, ...over,
  },
})

describe('FillSheet «Дополни реплику»', () => {
  it('реплика с «мяу» на месте слова, три варианта, «Послушать ещё»; итога и «Дальше» нет', () => {
    const html = render(FillSheet, fillItem())
    expect(html).toContain('aria-label="Дополни реплику"')
    expect(html).toContain('I see a ')
    expect(html).toMatch(/fillGap[^>]*>мяу</)
    expect(html).not.toMatch(/fillGap[^>]*>sheep</)
    for (const w of ['ship', 'sheep', 'chip']) expect(html).toContain(`>${w}</button>`)
    expect(html.match(/gameOption gameOption--idle/g)).toHaveLength(3)
    expect(html).toContain('Послушать ещё')
    expect(html).not.toContain('Дальше')
    expect(html).toContain('aria-label="Закрыть"')
  })

  it('звука нет: только текст, кнопки «Послушать» нет, шторка помечена', () => {
    const html = render(FillSheet, fillItem({ audio: null }))
    expect(html).not.toContain('Послушать')
    expect(html).toContain('fillSheet--text')
    expect(html).toMatch(/fillGap[^>]*>мяу</) // «мяу» — надписью
  })

  it('после ответа: «Верно!» и «Дальше» (для ошибившегося — верное слово)', () => {
    expect(render(FillSheet, { ...fillItem(), result: { ok: true } })).toContain('Верно!')
    const bad = render(FillSheet, { ...fillItem(), result: { ok: false } })
    expect(bad).toContain('Получилось — верно: sheep')
    expect(bad).toContain('Дальше')
  })
})

const pictureItem = over => ({
  word: 'keep', result: null,
  task: {
    options: ['a', 'b', 'c'].map((x, i) => ({ id: x, url: `https://r2.dev/${x}.png`, alt: `картинка ${x}`, correct: i === 1 })),
    audioUrl: 'https://r2.dev/keep.mp3', ...over,
  },
})

describe('PictureSheet «Слово голосом → картинка»', () => {
  it('со звуком: кнопка «Послушай слово», слово текстом не показано, три картинки с alt', () => {
    const html = render(PictureSheet, pictureItem())
    expect(html).toContain('aria-label="Слово голосом — картинка"')
    expect(html).toContain('Послушай слово')
    expect(html).not.toContain('pictureWord')
    expect(html.match(/<img /g)).toHaveLength(3)
    expect(html).toContain('alt="картинка a"')
    expect(html.match(/pictureOption pictureOption--idle/g)).toHaveLength(3)
    expect(html).not.toContain('Дальше')
  })

  it('звука нет: вместо озвучки слово текстом', () => {
    const html = render(PictureSheet, pictureItem({ audioUrl: null }))
    expect(html).toContain('class="pictureWord">keep<')
    expect(html).not.toContain('Послушай')
    expect(html).toContain('pictureSheet--text')
  })

  it('после ответа: итог и «Дальше»', () => {
    const html = render(PictureSheet, { ...pictureItem(), result: { ok: true } })
    expect(html).toContain('Верно!')
    expect(html).toContain('Дальше')
  })

  it('картинки — не больше трёх вариантов, ни label, ни ответа в разметке нет', () => {
    const html = render(PictureSheet, pictureItem())
    expect(html).not.toContain('correct')
    expect(html).not.toContain('keep.mp3')
  })
})
