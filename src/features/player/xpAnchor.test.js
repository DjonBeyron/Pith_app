import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// «+N XP» вылетает из одного места на все модули: объявляет ПАНЕЛЬ (она знает,
// что ответ верный, и знает место тапа), а точку старта выбирает xpAnchor.js —
// пузырь с ответом, если он появился в переписке, иначе последний тап.
//
// Тест грепает исходники: до этой правки каждый модуль решал по-своему, и
// разъехаться обратно легко — ни линт, ни сборка такого не увидят.
describe('откуда вылетает XP', () => {
  const anchor = read('./xpAnchor.js')
  const player = read('./LessonPlayer.jsx')

  it('точку старта считает один модуль, и он ждёт пузырь', () => {
    expect(anchor).toContain('export function resolveXpOrigin(nodeId, done)')
    expect(anchor).toContain('export function rememberTap(rect)')
    expect(anchor).toContain("export const XP_ANCHOR = 'data-xp-anchor'")
    // Ждём не только появления пузыря, но и конца его въезда снизу: первые
    // ~200мс он ещё едет, и старт от промежуточной точки был бы мимо ответа
    expect(anchor).toContain("a.playState === 'running'")
    expect(anchor).toMatch(/const WAIT_MS = \d+/)
  })

  it('плеер откладывает полёт, но не начисление', () => {
    const fn = player.slice(player.indexOf('function handleXpEarned'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    // Счётчик в шапке растёт сразу — иначе итог урока зависел бы от анимации
    expect(body.indexOf('setEarnedXp')).toBeLessThan(body.indexOf('resolveXpOrigin'))
    expect(body).toContain('resolveXpOrigin(nodeId,')
  })

  it('каждый пузырь с ответом ученика помечен якорем', () => {
    // Таблица и «собери фразу» — общие пузыри
    expect(read('./modules/AnswerBubbles.jsx')).toContain('{...xpAnchor(nodeId)}')
    expect(read('./modules/table/TableModule.jsx')).toContain('nodeId={props.node.id}')
    expect(read('./modules/phrase-assembly/PhraseAssemblyModule.jsx')).toContain('nodeId={node?.id ?? null}')
    // Выбор слова: якорь на ПОСЛЕДНЕМ пузыре ряда — на реплике, если она есть,
    // иначе на выбранном слове
    const wc = read('./modules/word-choice/WordChoiceModule.jsx')
    expect(wc).toContain('const anchorOnPick = !text')
    expect(wc).toContain('{...(anchorOnPick ? xpAnchor(node?.id) : {})}')
    expect(wc).toContain('{...xpAnchor(node?.id)}')
    // Фото
    expect(read('./modules/photo-choice/PhotoChoiceModule.jsx')).toContain('{...xpAnchor(node?.id)}')
  })

  it('каждая панель помечает место тапа — это запасная точка старта', () => {
    for (const [name, src] of [
      ['выбор слова',   read('./panels/choose-word/ChooseWordPanel.jsx')],
      ['собери фразу',  read('./panels/phrase-assembly/PhraseAssemblyPanel.jsx')],
      ['ручная таблица', read('./panels/table-manual/TableManualPanel.jsx')],
      ['авто-таблица',  read('./panels/table-dictator/TableDictatorPanel.jsx')],
      ['выбор фото',    read('./panels/photo-choice/PhotoChoicePanel.jsx')],
    ]) {
      expect(src, `${name}: нет импорта rememberTap`).toContain("import { rememberTap } from")
      expect(src, `${name}: rememberTap не вызывается`).toMatch(/rememberTap\(/)
    }
  })

  it('модули больше не стреляют XP сами — иначе точек старта снова две', () => {
    for (const rel of [
      './modules/AnswerBubbles.jsx',
      './modules/photo-choice/PhotoChoiceModule.jsx',
      './modules/table/TableModule.jsx',
      './PlayerMessage.jsx',
      './PlayerFeedNodes.jsx',
    ]) {
      expect(read(rel), `${rel}: остался старый канал XP`).not.toMatch(/onXpEarned|onPhotoXpFired|rewardXp/)
    }
  })

  it('таблица начисляет XP даже без пузыря в переписке', () => {
    // Раньше XP стрелял из AnswerBubbles, а при выключенной галочке «отправить
    // ответ ученика» TableModule возвращал null — награды за таблицу не было
    // вовсе. Теперь объявляет проверка, независимо от пузырей.
    const check = read('./panels/table-manual/manualCheck.js')
    expect(check).toContain('if (xpAmount > 0) onXpEarned?.(xpAmount)')
    const dictator = read('./panels/table-dictator/TableDictatorPanel.jsx')
    expect(dictator).toContain('if (isCorrect && xpAmount > 0 && !xpFiredRef.current)')
  })
})

describe('двойной блеск на верном ответе', () => {
  const css = read('../../styles/player/modules/text.css')

  it('зелёного свечения больше нет — его съедал салют сверху', () => {
    expect(css).not.toContain('answerGlow')
  })

  it('блик белый, а не брендовый лайм', () => {
    // Лаймовая полоса на тёмно-синем пузыре по яркости почти совпадала с
    // фоном: движение было, блеска не читалось
    const sheen = css.slice(css.indexOf('.playerMsgBubble--responseOk::before'))
    const block = sheen.slice(0, sheen.indexOf('}'))
    expect(block).toContain('rgba(255, 255, 255, 0.95)')
    expect(block).not.toMatch(/182, 254, 59/)
  })

  it('два прохода слева направо, и только потом — галочка', () => {
    expect(css).toContain('@keyframes answerSheen')
    expect(css).toContain('@keyframes answerMarkFlash')
    // Ровно два прохода, а не бесконечный повтор
    const run = css.match(/animation: answerSheen ([\d.]+)s [^;]*?\s2 both/)
    expect(run, 'блик должен идти двумя тактами').toBeTruthy()
    // Слева направо: позиция дорожки убывает от 100% к отрицательной
    const frames = css.slice(css.indexOf('@keyframes answerSheen'))
    expect(frames.slice(0, frames.indexOf('}\n'))).toContain('background-position: 100% 0')
    expect(frames).toContain('background-position: -20% 0')
    // Галочка стартует не раньше конца второго прохода
    const delay = parseFloat(css.match(/answerMarkFlash [\d.]+s [^;]*?\s([\d.]+)s both/)[1])
    const one   = parseFloat(run[1])
    const start = parseFloat(css.match(/animation: answerSheen [\d.]+s [^;]*?\s([\d.]+)s 2 both/)[1])
    expect(delay).toBeGreaterThanOrEqual(start + one * 2)
  })

  it('пузырю не режут края — на нём может висеть эмодзи-реакция', () => {
    // ::before лежит ровно по пузырю (inset: 0) и наследует скругление,
    // поэтому overflow: hidden не нужен. С ним срезало бы эмодзи реакции,
    // выступающее за край (reaction.css)
    const sheen = css.slice(css.indexOf('.playerMsgBubble--responseOk::before'))
    const block = sheen.slice(0, sheen.indexOf('}'))
    expect(block).toContain('inset: 0')
    expect(block).toContain('border-radius: inherit')
    expect(block).toContain('pointer-events: none')
    const okRule = css.match(/\.playerMsgBubble--responseOk \{[^}]*\}/)
    expect(okRule?.[0] ?? '').not.toContain('overflow: hidden')
  })

  it('у кого движение выключено — вспышка на месте, но НЕ пустота', () => {
    // Гасить нечего: это не украшение, а сигнал «ответ принят». Убираем
    // только перемещение, сама белая вспышка и такт галочки остаются
    const at = css.indexOf('@media (prefers-reduced-motion: reduce)')
    const rm = css.slice(at, css.indexOf('.playerMsgBubble--teacherErr', at))
    expect(rm).not.toContain('.playerMsgBubble--responseOk::before { animation: none')
    expect(rm).toContain('answerSheenStill')
    expect(rm).toContain('answerMarkFlash')
  })
})
