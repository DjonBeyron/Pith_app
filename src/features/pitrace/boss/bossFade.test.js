import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { nextPill, fadeProgress, REVEAL_AT, REVEAL_LINES, DEMO_START } from './bossScale.js'
import { miaColorOn } from '../mia/miaTint.js'
import { miaLine } from '../mia/miaLines.js'
import { miaStays, makeMiaBox } from '../mia/raceMia.js'

describe('выцветание маркера слова (фиолетовый → серый)', () => {
  it('прогресс: от top следующей пилюли в момент конца слова до top ≥ 0 (видна целиком)', () => {
    expect(fadeProgress(-200, -200)).toBe(0); expect(fadeProgress(-200, -100)).toBe(0.5); expect(fadeProgress(-200, 0)).toBe(1); expect(fadeProgress(-200, 30)).toBe(1)
    expect(fadeProgress(10, 10)).toBe(1) // следующая уже видна целиком — маркер сразу серый
    expect(fadeProgress(-200, -400)).toBe(0) // пилюля отъехала назад — не уходит в минус
  })
  it('следующая пилюля: не принятая, не «не успел», не ушедшая вниз; из таких — ближайшая к шкале', () => {
    const pills = [{ top: -300 }, { top: -120 }, { top: 40, locked: true }, { top: 20, failed: true }, { top: 900 }]
    expect(nextPill(pills, 600)).toEqual({ top: -120 }); expect(nextPill([], 600)).toBeNull(); expect(nextPill([{ top: 10, locked: true }], 600)).toBeNull()
  })
})

describe('церемония: цвет дорожек и шкала', () => {
  it('цвет Мии: круг с Мией (fast) или церемония финала с момента падения коробки; без Мии и до падения — обычный', () => {
    const m = { phase: 'in', fast: false }
    expect(miaColorOn(m, { sid: 'boss-ann' }, true)).toBe(true)
    expect(miaColorOn(m, { sid: 'boss-ann' }, false)).toBe(false) // коробка ещё летит — цвета обычные
    expect(miaColorOn(m, { sid: 'a3-ann' }, true)).toBe(false) // обычная церемония Мии: цвет — с круга
    expect(miaColorOn({ phase: 'in', fast: true }, { sid: 'boss' }, false)).toBe(true)
    expect(miaColorOn({ phase: 'off', fast: true }, { sid: 'boss' }, true)).toBe(false)
  })
  it('шкала мигает не с начала «видите шкалу справа», а на этих словах', () => {
    expect(REVEAL_AT).toBeGreaterThan(0.3); expect(REVEAL_AT).toBeLessThan(0.6); expect(REVEAL_LINES[0]).toBe(DEMO_START)
  })
  it('реплика «Сиди тихо, пушистик, теперь командую я»; Пит остаётся в коробке — признак для итога', () => {
    expect(miaLine('boss_mia_hush').text).toBe('Сиди тихо, пушистик, теперь командую я')
    const mb = makeMiaBox(); expect(miaStays(mb)).toBe(false)
    mb.m = { ...mb.m, keep: true, act: 'boss' }; expect(miaStays(mb)).toBe(true)
  })
})

describe('проводка: панель настроек ставит игру на паузу, попап не прячет клавиатуру', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
  it('⚙ открыта — f.pause, закрыта — пауза остаётся (resume только у «Перезапустить ступень»); окно паузы скрыто; Hud сообщает об открытии', () => {
    const game = read('../../player/modules/rotate-phone/WordLaneGame.jsx'), hud = read('../../player/modules/rotate-phone/WordLaneHud.jsx')
    expect(game).toContain("if (open) { if (!f.paused) f.pause('hud') } else if (why === 'stage' && f.paused) pause.resume()")
    expect(game).toContain('!comment && !hudOpen && <WordLanePause')
    expect(hud).toContain('onOpenChange?.(v, why)'); expect(hud).toContain("setOpen(false, 'game')")
  })
  it('попап: тап по галочкам и кнопкам не уводит фокус с поля (preventDefault на mousedown)', () => {
    const src = read('../../../shared/ui/SendLogPopup.jsx')
    expect(src).toContain('e.preventDefault()'); expect((src.match(/onMouseDown=\{keepFocus\}/g) ?? []).length).toBe(4)
  })
  it('линия шкалы под линейкой: зоны и риски выше линии по слою', () => {
    const css = read('../../../styles/player/modules/race-boss.css')
    expect(css).toMatch(/\.wlBossZone \{[^}]*z-index: 1/); expect(css).toMatch(/\.wlBossTick \{[^}]*z-index: 1/); expect(css).toMatch(/\.wlBossLine \{[^}]*right: 6px[^}]*z-index: 2/) // ровно от ствола (его кромка 4–6 px), без зазора и без наложения на него
  })
})

describe('финал: трофеи слова по зоне (было: XP не за красную зону), «не успел» молча, взгляд Пита', () => {
  const read2 = p => readFileSync(new URL(p, import.meta.url), 'utf8')
  it('счётчик в углу: слово экзамена даёт трофеи по зоне — зелёная всё, жёлтая половину, красная почти ничего (правила 2026-11-24; было: красная — 0, остальные — 2 XP); шкала пишет зону, игра читает при принятом слове', async () => {
    const { bossXp, setBossZoneNow, getBossZoneNow } = await import('./bossZoneNow.js'), { TROPHY_PER_WORD, ZONE_SHARE } = await import('./bossTrophies.js')
    setBossZoneNow('slow'); expect(getBossZoneNow()).toBe('slow'); expect(bossXp()).toBe(Math.round(TROPHY_PER_WORD * ZONE_SHARE.slow)); expect(bossXp()).toBeGreaterThan(0)
    setBossZoneNow('mid'); expect(bossXp()).toBe(TROPHY_PER_WORD / 2); setBossZoneNow('fast'); expect(bossXp()).toBe(TROPHY_PER_WORD)
    setBossZoneNow(null); expect(bossXp()).toBe(TROPHY_PER_WORD) // слово принято раньше, чем пилюля коснулась шкалы — зелёная
    const flow = read2('../../player/modules/rotate-phone/useWordLaneFlow.js')
    expect(flow).toContain('if (rep.last && !rep.res?.noXp) { xpApi.current?.add(stages[sRef.current.idx]?.silent ? bossXp() : XP_PER_PILL * rep.count, rect, XP_ARRIVE_MS); return true }')
    expect(read2('./bossScaleDrive.js')).toContain("else if (pills.some(p => !p.locked && !p.failed && p.bottom <= 0)) setBossZoneIdle()") // зона прошлого слова не остаётся следующему
    expect(read2('./bossScaleDrive.js')).toContain('setBossZoneNow(zoneAt(')
  })
  it('«не успел» в финале (silent): ни реплики, ни текста сверху, ни подсказки слова над дорожками', () => {
    const flow = read2('../../player/modules/rotate-phone/useWordLaneFlow.js')
    expect(flow).toContain('failMute(st) ? false : sayLine('); expect(flow).toContain('if (!said && !failMute(st)) flash('); expect(flow).toContain('!st.step.labels.length && !st.silent')
  })
  it('взгляд Пита в коробке: почти неподвижен, редко и плавно чуть сдвигается; зрачки дышат (расширяются / сужаются)', async () => {
    const { eyeLife } = await import('../mia/miaMotion.js')
    const looks = [], pupils = []; for (let t = 0; t < 60; t += 0.05) { const l = eyeLife(t); looks.push(l.look); pupils.push(l.pupil) }
    expect(Math.max(...looks)).toBeLessThan(3.5); expect(Math.min(...looks)).toBeGreaterThan(-3.5) // сдвиги небольшие
    const step = Math.max(...looks.slice(1).map((x, k) => Math.abs(x - looks[k])))
    expect(step).toBeLessThan(0.45) // плавно: никаких скачков (за 0,05 с взгляд сдвигается меньше половины единицы)
    const calm = looks.slice(1).filter((x, k) => Math.abs(x - looks[k]) < 0.03).length
    expect(calm).toBeGreaterThan(looks.length * 0.6) // большую часть времени взгляд стоит (лишь лёгкое дыхание)
    expect(Math.min(...pupils)).toBeLessThan(0.88); expect(Math.max(...pupils)).toBeGreaterThan(1.12); expect(Math.min(...pupils)).toBeGreaterThan(0.7)
  })
})

describe('эпилог финала кончается, когда договорили', () => {
  it('bossEnd: красные = слова без верно названных не в красной зоне; Пит остаётся, когда собрано меньше 40 % трофеев (правила 2026-11-24; было: хоть одно слово не названо верно, v3.3.295)', async () => {
    const { bossEnd } = await import('../mia/raceMia.js')
    expect(bossEnd({ total: 8, won: { 0: 1, 1: 1, 2: 1 }, redWins: 0, reds: 0 })).toMatchObject({ won: 3, reds: 5, missed: 5, keep: true, got: 60, max: 160, lost: 100, outcome: 'stay' }) // 3 зелёных из 8 — 37 %
    expect(bossEnd({ total: 8, won: { 0: 1, 1: 1, 2: 1, 3: 1 }, redWins: 0, reds: 0 })).toMatchObject({ reds: 4, missed: 4, keep: false, outcome: 'mid' }) // 4 зелёных из 8 — ровно 50 %: Пит свободен, потерянное у Мии (было keep: true)
    expect(bossEnd({ total: 4, won: { 0: 1, 1: 1, 2: 1, 3: 1 }, zones: { 2: 'slow', 3: 'slow' }, redWins: 2, reds: 0 })).toMatchObject({ reds: 2, missed: 0, keep: false, got: 46, outcome: 'mid' }) // все названы: два были в красной зоне — верные, но трофеев за них почти нет (57 %)
  })
  it('директор: эпилог «Допроса» держится по длине реплик Мии и Пита (не фиксированные 11 с), с потолком st.ms; эпилог ЭКЗАМЕНА отпускает реальный конец речи (boss/examEndWait.js)', () => {
    const src = readFileSync(new URL('../useRaceActs.js', import.meta.url), 'utf8')
    expect(src).toContain("st?.mia !== 'end' ? rh.holdMs(st) : endHoldMs(st, mb, mspeech)"); expect(readFileSync(new URL('./raceEndHold.js', import.meta.url), 'utf8')).toContain('Math.min(st.ms, pre + Math.max(2500,'); expect(readFileSync(new URL('./raceEndHold.js', import.meta.url), 'utf8')).toContain("if (st.act === 'boss') return st.ms"); expect(src).toContain('afterCount: switchWait(examEnd(boxFree.afterCount))')
  })
})

describe('финал: колкость после ошибки, порог «хоть одно неверное», линия у конвейера', () => {
  it('ошибка (miss): только красный счёт, без речи (ученик успеет поправиться); «пилюля ушла» (fail): Мия коротко подкалывает один раз на слово — первой и сразу, за ней Пит (верное слово, «следующее слово»)', async () => {
    const { reduceMia, miaInit } = await import('../mia/raceMia.js')
    const stage = { mia: 'round', silent: true, act: 'boss', words: [1, 2, 3, 4, 5, 6].map(i => ({ text: 'w' + i })) }
    const m = reduceMia({ ...miaInit(), phase: 'in', act: 'boss' }, { t: 'enter', stage }).mia
    const a = reduceMia(m, { t: 'miss', stage, idx: 0 })
    expect(a.say).toEqual([]); expect(a.mia.reds).toBe(1)
    const b = reduceMia(a.mia, { t: 'fail', stage, idx: 0 })
    expect(b.say.map(c => c.who)).toEqual(['mia', 'pit', 'pit']); expect(b.say[0]).toMatchObject({ who: 'mia', delay: 0 }); expect(b.say[0].id).toMatch(/^boss_mia_miss/); expect(b.say[1]).toMatchObject({ id: 'boss_help_1', word: 'w1' }); expect(b.say[2].id).toBe('boss_pit_next'); expect(b.mia.reds).toBe(1) // красных по-прежнему одно слово; было: одна колкость с задержкой MISS_AT (после слова Пита)
    expect(reduceMia(b.mia, { t: 'fail', stage, idx: 0 }).say).toEqual([]) // та же пилюля — вторая колкость не нужна
    expect(reduceMia(b.mia, { t: 'fail', stage, idx: 1 }).say.filter(c => c.who === 'mia')).toHaveLength(1)
  })
  it('Пит остаётся, когда собрано меньше 40 % трофеев (правила «трофеи на кону» 2026-11-24; было с v3.3.295 — хоть одно слово неверно или не названо)', async () => {
    const mia = await import('../mia/raceMia.js'), { bossEnd } = mia
    expect(mia.keepNeed).toBeUndefined() // порога «хоть одно неверное» больше нет: исход — по доле трофеев (boss/bossTrophies.js)
    expect(bossEnd({ total: 6, won: { 0: 1, 1: 1 }, redWins: 0, reds: 0 })).toMatchObject({ won: 2, reds: 4, missed: 4, keep: true, outcome: 'stay' }) // 33 %
    expect(bossEnd({ total: 6, won: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 }, redWins: 0, reds: 0 })).toMatchObject({ missed: 1, keep: false, outcome: 'free' }) // одно слово не названо — 83 %: Пит свободен (было keep: true)
    expect(bossEnd({ total: 6, won: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, zones: { 0: 'slow', 1: 'slow', 2: 'slow', 3: 'slow', 4: 'slow', 5: 'slow' }, redWins: 6, reds: 0 })).toMatchObject({ reds: 6, missed: 0, keep: true, outcome: 'stay' }) // все названы, но все в красной зоне — 15 % трофеев: Пит остаётся (было keep: false)
    expect(bossEnd({ total: 0, won: {}, redWins: 0, reds: 0 })).toMatchObject({ keep: false })
  })
  it('Пит говорит верное слово, когда пилюля ушла (после ошибки тоже: ученик успевает поправиться), один раз на слово; линия шкалы упирается в левую полосу конвейера; колонки без жёлтой заливки', () => {
    const src = readFileSync(new URL('../useRaceActs.js', import.meta.url), 'utf8')
    expect(src).toContain("if (kind === 'fail' && running.act === 'boss') redAlarm()"); expect(src).toContain("if (kind === 'miss' && running.act === 'boss') redAlarm()"); expect(src).not.toContain('sayCorrect') // верное слово теперь ставит в очередь машина Мии (один раз на слово: dug), после колкости
    expect(readFileSync(new URL('./bossMia.js', import.meta.url), 'utf8')).toContain("const dig = t === 'fail' && !m.dug?.[gi]") // круг экзамена вынесен из машины Мии в boss/bossMia.js
    expect(readFileSync(new URL('./bossScaleDrive.js', import.meta.url), 'utf8')).toContain("setProperty('--bl'")
    expect(readFileSync(new URL('../../../styles/player/modules/race-boss.css', import.meta.url), 'utf8')).toMatch(/\.wlBossLine \{[^}]*left: var\(--bl, 0px\)/)
  })
})

describe('комментарии 2026-11-15 (v3.3.256): уход Мии, пауза перед коробкой, одно последнее слово фразы', () => {
  it('Мия ушла после трёх верных — круг кончается, директор идёт к следующему этапу; перед церемонией пауза короче', () => {
    const src = readFileSync(new URL('../useRaceActs.js', import.meta.url), 'utf8')
    expect(src).toContain("miaView.mia.phase === 'out' && miaView.mia.why === 'win' && running?.mia === 'round' && !running.silent"); expect(src).toContain('jump(nextIdx(running.idx + 1))')
    expect(src).toContain("miaComesNext(st) ? MIA.EXIT_MS : st?.act === 'boss' && st.type === 'student' ? BOSS_EXIT_MS : undefined") // круг экзамена: пауза выхода — время взлёта принятой пилюли
  })
  it('константы: пауза перед Мией короче обычной (1,3 с), коробка падает быстрее (≤ 1,2 с)', async () => {
    const { MIA } = await import('../mia/raceMia.js')
    expect(MIA.EXIT_MS).toBeLessThan(1300); expect(MIA.DROP_AT).toBeLessThanOrEqual(1200); expect(MIA.LEAVE_JUMP_MS).toBeGreaterThan(800)
  })
  it('фраза: одно последнее слово длинной фразы не считается её концом (итог по затвору не рвёт заход); с двумя словами и в короткой фразе — как раньше', async () => {
    const { gateReason } = await import('../racePhraseEarlyFinal.js')
    const sc = hits => [{ ratio: 0.25, hits }]
    expect(gateReason({ scores: sc([false, false, false, true]), current: 'from', curHit: true, tail: 0 })).toBeNull()
    expect(gateReason({ scores: sc([false, true, true, true]), current: 'are you from', curHit: true, tail: 0 })).toBe('ends')
    expect(gateReason({ scores: sc([false, true]), current: 'you', curHit: true, tail: 0 })).toBe('ends') // фраза из двух слов
  })
})

describe('экзамен: слова блоками (английские, потом русские), счёт по блокам', () => {
  const round1 = { mia: 'round', silent: true, act: 'boss', sid: 'boss', offset: 0, words: [1, 2, 3].map(i => ({ text: 'w' + i })) }
  const round2 = { mia: 'round', silent: true, act: 'boss', sid: 'boss2', offset: 3, words: [4, 5, 6].map(i => ({ text: 'w' + i })) }
  it('второй блок не сбрасывает первый: итог по общему счёту (6 слов), номера слов блока 2 — со смещением', async () => {
    const { reduceMia, miaInit, bossEnd } = await import('../mia/raceMia.js')
    let m = reduceMia({ ...miaInit(), phase: 'in', act: 'boss' }, { t: 'enter', stage: round1 }).mia
    m = reduceMia(m, { t: 'win', stage: round1, idx: 0 }).mia; m = reduceMia(m, { t: 'fail', stage: round1, idx: 1 }).mia
    expect(m.total).toBe(3)
    const hold = reduceMia(m, { t: 'enter', stage: { mia: 'hold', act: 'boss', say: 'boss_mia_ru' } })
    expect(hold.mia).toBe(m); expect(hold.say.map(c => c.id)).toEqual(['boss_mia_ru']) // Мия остаётся и говорит про русские слова
    m = reduceMia(m, { t: 'enter', stage: round2 }).mia
    expect(m.total).toBe(6); expect(Object.keys(m.won)).toEqual(['0']) // первый блок на месте
    m = reduceMia(m, { t: 'win', stage: round2, idx: 0 }).mia
    expect(Object.keys(m.won).sort()).toEqual(['0', '3']) // слово 0 второго блока — номер 3 в общем счёте, с первым не путается
    expect(bossEnd(m)).toMatchObject({ won: 2, reds: 4, missed: 4, keep: true })
  })
  it('Мия не уходит на служебной стадии между блоками (обычная неМиина стадия отпустила бы её)', async () => {
    const { reduceMia, miaInit, isMiaStage } = await import('../mia/raceMia.js')
    expect(isMiaStage({ mia: 'hold' })).toBe(true)
    const m = { ...miaInit(), phase: 'in', act: 'boss' }
    expect(reduceMia(m, { t: 'enter', stage: { type: 'announce', act: 'boss', sid: 'boss-sw', mia: 'hold' } }).mia.phase).toBe('in')
    expect(reduceMia(m, { t: 'enter', stage: { type: 'announce', act: 'boss', sid: 'x' } }).mia.phase).toBe('out')
  })
  it('слух: русский блок финала не возвращает английскую модель, пока идёт; русская не загрузилась — блок идёт по-английски', () => {
    const sw = readFileSync(new URL('../useRaceSwitch.js', import.meta.url), 'utf8'), st = readFileSync(new URL('./raceStagesBoss.js', import.meta.url), 'utf8')
    expect(sw).toContain("act !== 'catch' && !ruStage && sw.state() === 'ru'"); expect(sw).toContain('x.demote && x.act === actNow')
    expect(st).toContain('demote()'); expect(st).toContain("lang: 'ru'")
  })
})

describe('пауза смены языка длится, пока Мия объявляет', () => {
  it('holdMs служебной стадии = реплика Мии + короткий хвост (не меньше SWITCH_MS); дальше пилюлю держит очередь речи — реальный конец звука (было: + пауза очереди + 300 мс)', () => {
    const src = readFileSync(new URL('../useRaceActs.js', import.meta.url), 'utf8')
    expect(src).toContain("if (st?.mia === 'hold') return Math.max(st.ms ?? 0, st.say ? mspeech.msOf(st.say) + BOSS_SAY_TAIL_MS : 0)")
  })
})
