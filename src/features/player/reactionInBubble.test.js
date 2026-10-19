import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('реакция «в пузыре» (flow)', () => {
  const module_ = read('./modules/reaction/ReactionModule.jsx')
  const bubble = read('./PlayerBubble.jsx')
  const css = read('../../styles/player/modules/reaction.css')

  it('flow-посадка у текста учителя и ответа ученика, без одиночных эмодзи и голосового ответа', () => {
    expect(module_).toContain("const FLOW_SEL = '.playerMsgBubble--response, .playerMsgBubble--text'")
    expect(module_).toContain('.playerMsgBubble--emojiOnly')
    expect(module_).toContain('.playerMsgBubble--voice')
  })

  it('рост пузыря рисует PlayerBubble: ReactionModule шлёт pbresize ДО отрисовки (layout-эффект)', () => {
    expect(module_).toContain('useLayoutEffect')
    expect(module_).toContain("new Event('pbresize')")
    expect(bubble).toContain("el.addEventListener('pbresize', onResize)")
    // абсолютные дети (плашка реакции) не должны раздувать измеренную высоту — иначе пузырь растёт без конца
    expect(bubble).toMatch(/position === 'absolute'\) continue/)
  })

  it('история и разбор (isHistory) — без роста: флаг data-react-instant', () => {
    expect(module_).toContain("setAttribute('data-react-instant', '1')")
    expect(bubble).toContain('el.dataset.reactInstant')
  })

  it('в разборе реакция ищет пузырь ПЕРЕД своей строкой (anchorRef)', () => {
    expect(module_).toContain('DOCUMENT_POSITION_PRECEDING')
    expect(read('../canvas/review/PlayerLikeFeed.jsx')).toContain('anchorRef={ref}')
  })

  it('плавный рост: нижнее поле растёт тем же переходом (иначе коробка ниже суммы полей прыгает и стоит)', () => {
    expect(module_).toContain("target.setAttribute('data-pad-from', getComputedStyle(target).paddingBottom)")
    expect(bubble).toContain('padding-bottom ${GROW_MS}ms')
    expect(bubble).toContain("el.style.paddingBottom = ''")
    expect(css).toContain('.reactionInBubble--in')
  })

  it('CSS: нижнее поле у пузыря и абсолютная плашка внутри', () => {
    expect(css).toContain('.playerMsgBubble.playerMsgBubbleReactedFlow')
    expect(css).toContain('.reactionInBubble--flow')
  })
})

describe('отступ системных плашек и закрепов', () => {
  it('один класс pinSystemRowGap у системной плашки, закрепа и закрепа в разборе, поле 20px', () => {
    expect(read('./modules/system/SystemModule.jsx')).toContain('pinSystemRowGap')
    expect(read('./modules/pin-message/PinMessageModule.jsx')).toContain('pinSystemRowGap')
    expect(read('../canvas/review/PlayerLikeFeed.jsx')).toContain('pinSystemRow pinSystemRowGap')
    expect(read('../../styles/player/modules/pin-message.css')).toMatch(/\.pinSystemRowGap \{\s*margin: 20px 0;/)
  })
})
