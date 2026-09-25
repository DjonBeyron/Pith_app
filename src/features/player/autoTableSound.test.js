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
  // Карточка запуска — два файла подряд: LessonLaunchCard.jsx + LaunchPreloader.jsx (прогрев)
  const card   = (read('../lessons/LessonLaunchCard.jsx') + read('../lessons/LaunchPreloader.jsx'))

  it('элемент прогревается настоящим жестом — стартом урока', () => {
    // «Начать урок» — единственный надёжный жест до того, как пойдут таблицы
    expect(card).toContain('primeAudio()')
    const start = card.slice(card.indexOf('function handleStart'))
    expect(start.slice(0, 700)).toContain('primeAudio()')
    // Прогрев тишиной, без сети
    expect(primed).toContain("const SILENCE = 'data:audio/wav;base64,")
    expect(primed).toContain("el.setAttribute('playsinline', '')")
  })

  it('прогрев идёт БЕЗ muted — иначе он ничего не открывает', () => {
    // Приглушённый автозапуск Safari разрешает и без жеста, поэтому такой play
    // не даёт элементу права на ЗВУК. Слышно ничего не будет и так: файл сам
    // по себе тишина
    const prime = primed.slice(primed.indexOf('export function primeAudio'))
    expect(prime.slice(0, 400)).toContain('a.muted = false')
    expect(primed).not.toContain('muted = true')
  })

  it('не прогрелись — пробуем на первом касании', () => {
    // Лог плеера чистится при открытии (PlayerTopBar), поэтому итог прогрева
    // со старта урока в отчёт не попадает — страховка обязана быть внутри урока
    expect(primed).toContain('function armGesture()')
    expect(primed).toContain("document.addEventListener('pointerdown', retry, true)")
    expect(read('./PlayerTopBar.jsx')).toContain('armPrimeOnGesture()')
  })

  it('недоступный запасной путь виден в логе', () => {
    // Раньше playPrimed молча возвращал null, и в отчёте не было НИ ОДНОЙ
    // строки [primed] — нельзя было понять, прогрелись мы или нет
    expect(primed).toContain('[primed] запасной путь недоступен')
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
  // Компонент — обёртка, физика (в т.ч. отступ снизу) живёт в burstParticles.js
  const burst = read('../../shared/ui/BurstConfetti.jsx')
  const physics = read('../../shared/lib/burstParticles.js')

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

  it('салют — над панелями, но под растушёвкой низа; точка рождения у нижнего края', () => {
    // Панели 80 < салют 85 < растушёвка 90: частицы видны с самого низа даже
    // пока панель ещё уезжает, и выныривают сквозь градиент, как сообщения.
    // Рождаются у самого низа окна (bottomInset = 0), а не подняты над ним
    expect(read('./panels/choose-word/ChooseWordPanel.jsx')).toContain('zIndex: 85')
    expect(read('./panels/table-manual/TableManualPanel.jsx')).toContain('zIndex: 85')
    expect(physics).toContain('const H = window.innerHeight - bottomInset')
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
