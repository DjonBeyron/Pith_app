import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Лог с iPhone: первая авто-таблица урока получает NotAllowedError и крутит
// таймлайн часами, БЕЗ звука, хотя файл найден и src на месте. Вторая таблица
// в том же уроке звучит — но лишь потому, что за четыре секунды до неё человек
// нажимал play на голосовом. То есть звук таблицы зависел от того, трогал ли
// ученик экран незадолго до неё.
describe('авто-таблица звучит без свежего жеста', () => {
  const primed = read('../../shared/lib/primedAudio.js')
  const auto   = read('./panels/table-dictator/useTableDictatorAutostart.js')
  const card   = read('../lessons/LessonLaunchCard.jsx')

  it('элемент прогревается настоящим жестом — стартом урока', () => {
    // «Начать урок» — единственный надёжный жест до того, как пойдут таблицы
    expect(card).toContain('primeAudio()')
    const start = card.slice(card.indexOf('function handleStart'))
    expect(start.slice(0, 700)).toContain('primeAudio()')
    // Прогрев тишиной, без сети
    expect(primed).toContain("const SILENCE = 'data:audio/wav;base64,")
    expect(primed).toContain('el.muted = true')
    expect(primed).toContain("el.setAttribute('playsinline', '')")
  })

  it('отказ родному элементу — не приговор: играет прогретый', () => {
    expect(auto).toContain("import { playPrimed, stopPrimed } from '../../../../shared/lib/primedAudio.js'")
    expect(auto).toContain('const primed = playPrimed(audioSrc, { onEnded: () => endedRef.current?.() })')
    // Таймлайн читает currentTime из audioRef и подмены не замечает
    expect(auto).toContain('audioRef.current = primed')
    expect(auto).toContain('hasPlayedRef.current = true')
  })

  it('часы остаются последним рубежом, а не первым', () => {
    const block = auto.slice(auto.indexOf('logAudioPlayRejected(e, audioSrc)'))
    const upToClock = block.slice(0, block.indexOf('runWithClock()'))
    expect(upToClock).toContain('playPrimed(')
  })

  it('за собой прогретый элемент убирают', () => {
    // Он общий на весь урок: чужой onended достался бы следующему разбору
    expect(auto).toContain('stopPrimed()')
    expect(primed).toContain('el.onended = null')
  })
})

// Салют вылетает снизу экрана, а не из середины чата
describe('точка старта салюта', () => {
  const burst = read('../../shared/ui/BurstConfetti.jsx')

  it('в чате подъём точки рождения больше не задаётся', () => {
    // Было bottomInset = высота растушёвки: на iPhone это 12 + safe-area 34 +
    // wait-slot 28 = 74px, и залп начинался заметно выше нижнего края
    for (const rel of [
      './modules/AnswerBubbles.jsx',
      './modules/photo-choice/PhotoChoiceModule.jsx',
      './modules/word-choice/WordChoiceModule.jsx',
      './panels/table-manual/TableManualPanel.jsx',
    ]) {
      expect(read(rel), `${rel}: салют всё ещё поднят над низом`).not.toContain('bottomInset')
    }
  })

  it('«из-под растушёвки» обеспечивает слой, а не отступ', () => {
    // Портал лежит ниже растушёвки (60 против 65) — частица поднимается сквозь
    // градиент и проявляется сама
    expect(read('./modules/word-choice/WordChoiceModule.jsx')).toContain('zIndex={60}')
    expect(burst).toContain('const H = window.innerHeight - bottomInset')
    expect(burst).toContain('bottomInset = 0')
  })
})

describe('замок «соло» видит и прогретый элемент', () => {
  it('ищет его и вне плеера — он живёт в body', () => {
    // Иначе при игре через запасной путь поверх разбора пускалось бы
    // голосовое из переписки: замок стоит на элементе, а не на панели
    const solo = read('./useSoloMedia.js')
    expect(solo).toContain('?? document.querySelector(`[${SOLO_LOCK}]`)')
    expect(read('../../shared/lib/primedAudio.js')).toContain("el.setAttribute('data-solo-lock', '')")
  })
})
