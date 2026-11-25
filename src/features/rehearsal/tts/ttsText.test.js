import { describe, it, expect } from 'vitest'
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { MIA_LINES } from '../../pitrace/mia/miaLines.js'
import { wordAtMs as raceWordAt, hasWord } from '../../pitrace/raceLineWord.js'
import { LAUNCH_WORD } from '../../pitrace/raceOpening.js'
import { byeAtMs } from '../../pitrace/boss/lineWordAt.js'
import { revealAtMs } from '../../pitrace/boss/bossScale.js'
import { mouthTrack } from '../../player/modules/rotate-phone/wordLaneVisemes.js'
import { normalizeLines, linesToSave, playableLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { saveLineText, saveLineTts } from '../../admin/speech/raceLineText.js'
import { ttsProblem, bareWords, withEnd, dictorText, dictorSource, isOpenLine, TTS_OF } from './ttsText.js'

// «Текст для диктора»: знаки препинания для интонации ElevenLabs живут в поле tts реплики, а чистый text (правило «нет . … ! — –», rehearsalLines.test.js / raceLines.test.js / miaLines.test.js)
// остаётся для подписи, аудита, рта и привязок «момент слова».
const CATALOG = [...RACE_LINES, ...MIA_LINES]
const LETTER = /[a-zа-яё]/i
// тайминги слов, как их отдаёт edge-функция tts-elevenlabs (wordTimingsFromAlignment): слово — кусок между пробелами СО ЗНАКАМИ
const timings = (tts, from = 0.2, step = 0.4) => tts.split(/\s+/).map((w, i) => ({ w, t: from + i * step, e: from + i * step + 0.3 }))

describe('каталог: tts отличается от text только знаками и регистром', () => {
  it('у каждой реплики с tts слова те же и в том же порядке; тире и отдельных знаков нет; фраза кончается знаком', () => {
    const withTts = CATALOG.filter(l => l.tts)
    expect(withTts.length).toBeGreaterThan(70)
    for (const l of withTts) {
      expect(ttsProblem(l.text, l.tts), l.id).toBeNull()
      expect(bareWords(l.tts), l.id).toEqual(bareWords(l.text))
      expect(l.tts, l.id).not.toMatch(/[—–[\]<>]/) // тире владелец намеренно не использует; тегов eleven_v3 в текстах нет (v2 прочитал бы их вслух)
      expect(l.tts, l.id).toMatch(l.open ? /:$/ : /[.!?…]$/)
      expect(l.tts.split(/\s+/).filter(w => LETTER.test(w)).length, l.id).toBe(l.text.split(/\s+/).filter(w => LETTER.test(w)).length) // так считает слова рот (mouthTrack)
    }
  })
  it('tts есть у всех реплик «Встряхни память», кроме одного слова-связки; «фраза продолжается» — без конечной точки', () => {
    expect(CATALOG.filter(l => !l.tts).map(l => l.id)).toEqual(['race_trap_pre'])
    expect(CATALOG.filter(l => l.open).map(l => l.id)).toEqual(['race_trap_pre', 'race_trap_mid', 'race_slip_word', 'boss_help_1', 'boss_help_2', 'boss_help_3'])
    expect(dictorText('race_trap_pre', { text: 'это' })).toBe('это'); expect(dictorText('boss_help_1', { text: 'это значит' })).toBe('Это значит:')
    expect(isOpenLine('rh_blind_hint_pre')).toBe(true); expect(dictorText('rh_blind_hint_pre', { text: 'Начни с' })).toBe('Начни с')
  })
  it('знаки из задания владельца на месте', () => {
    expect(TTS_OF.race_start).toBe('Встряхнём память! Я говорю слова, а ты переводишь вслух. Запускаю конвейер слов!')
    expect(TTS_OF.boss_mia_look).toBe('Эй, вы, за экраном! Это экзамен для вашей памяти. Шкала покажет, насколько крепко вы помните слова.')
    expect(TTS_OF.boss_mia_bye).toBe('Коробка мне ещё пригодится. Пока!'); expect(TTS_OF.mia_ok_1).toBe('Допустим.'); expect(TTS_OF.race_good_4).toBe('Как носитель… ну, почти!')
    expect(TTS_OF.boss_pit_try).toBe('Эй, ты куда?! Так и оставишь меня в коробке?'); expect(TTS_OF.race_done).toBe('Финиш! Завтра ещё заезд?')
  })
})

describe('проверка «отличается только знаками» — словами для человека', () => {
  it('знаки и регистр — можно; другое, лишнее, пропущенное слово, отдельный знак и теги — нельзя', () => {
    expect(ttsProblem('да, это оно', 'Да, это оно!')).toBeNull(); expect(ttsProblem('кое-кто ответит', 'Кое-кто ответит.')).toBeNull(); expect(ttsProblem('любой текст', '  ')).toBeNull()
    expect(ttsProblem('да, это оно', 'Да — это оно!')).toMatch(/знак «—» стоит отдельно/)
    expect(ttsProblem('да, это оно', 'Да, вот оно!')).toMatch(/слово № 2: в реплике «это», у диктора «вот»/)
    expect(ttsProblem('да, это оно', 'Да, это оно самое!')).toMatch(/лишнее слово «самое!»/)
    expect(ttsProblem('да, это оно', 'Да, это!')).toMatch(/не хватает слова «оно»/)
    expect(ttsProblem('да, это оно', '[смеётся] Да, это оно!')).toMatch(/слово № 1|теги/)
    expect(ttsProblem('кое-кто', 'кое кто')).not.toBeNull() // дефис внутри слова — часть слова
  })
})

describe('что уходит диктору', () => {
  it('своя правка → каталог → текст + точка; вопрос и готовый конечный знак не трогаются', () => {
    const text = RACE_LINES.find(l => l.id === 'race_good_ok').text
    expect(dictorText('race_good_ok', { text })).toBe('Отлично!'); expect(dictorSource('race_good_ok', { text })).toBe('catalog')
    expect(dictorText('race_good_ok', { text, tts: 'Отлично…' })).toBe('Отлично…'); expect(dictorSource('race_good_ok', { text, tts: 'Отлично…' })).toBe('own')
    expect(dictorText('race_good_ok', { text: 'Супер', custom: true, tts: 'Отлично…' })).toBe('Супер.') // текст поправили в админке: ни своя правка, ни tts каталога к нему не подходят
    expect(dictorSource('race_good_ok', { text: 'Супер' })).toBe('auto')
    expect(dictorText('rh_take', { text: 'поехали' })).toBe('поехали.'); expect(withEnd('Хочешь ещё?')).toBe('Хочешь ещё?'); expect(withEnd('Ну…')).toBe('Ну…'); expect(withEnd('')).toBe('')
  })
  it('настройки хранят свою правку (tts) и то, что ушло диктору (saidTts); правка текста реплики убирает неподходящую правку диктора', async () => {
    let raw = { lines: { race_good_ok: { text: 'Отлично', url: 'u', duration: 1, said: 'Отлично', saidTts: 'Отлично.', tts: ' Отлично… ' } } }
    const deps = { load: async () => raw, save: async v => { raw = v } }
    expect(normalizeLines(raw).race_good_ok).toMatchObject({ tts: 'Отлично…', saidTts: 'Отлично.' })
    expect(linesToSave(normalizeLines(raw)).lines.race_good_ok).toMatchObject({ tts: 'Отлично…', saidTts: 'Отлично.' })
    expect(playableLines(normalizeLines(raw)).race_good_ok.url).toBe('u') // игра файл играет: слова те же
    await expect(saveLineTts('race_good_ok', 'Супер!', deps)).rejects.toThrow('Текст для диктора не подходит: слово № 1: в реплике «Отлично», у диктора «Супер!»')
    await saveLineTts('race_good_ok', 'ОТЛИЧНО!', deps); expect(raw.lines.race_good_ok).toMatchObject({ tts: 'ОТЛИЧНО!', url: 'u', said: 'Отлично' })
    await saveLineTts('race_good_ok', '', deps); expect(raw.lines.race_good_ok.tts).toBeUndefined() // пусто — своя правка убрана
    await saveLineTts('race_good_2', 'Звучит… очень хорошо!', deps); expect(raw.lines.race_good_2).toMatchObject({ tts: 'Звучит… очень хорошо!', url: null }) // правка без озвучки тоже сохраняется
    await saveLineText('race_good_2', 'звучит отлично', deps); expect(raw.lines.race_good_2.tts).toBeUndefined(); expect(raw.lines.race_good_2).toMatchObject({ text: 'звучит отлично', custom: true })
    await expect(saveLineTts('нет_такой', 'x', deps)).rejects.toThrow('нет реплики')
  })
})

describe('тайминги слов со знаками не ломают рот и привязки «момент слова»', () => {
  it('рот: слов столько же, сколько в чистом тексте, — каждое слово встаёт на своё время из записи', () => {
    for (const l of CATALOG.filter(x => x.tts)) {
      const words = timings(l.tts), total = words.at(-1).e + 0.2, ms = total * 1000
      const track = mouthTrack(l.text, ms, words, total)
      expect(track.length, l.id).toBeGreaterThan(0)
      expect(track[0].at, l.id).toBeCloseTo(200, 0) // первое слово — с 0,2 с файла (по таймингам), а не с нуля (как без таймингов)
      expect(mouthTrack(l.text, ms)[0].at, l.id).toBe(0)
    }
  })
  it('«запускаю» (плашка этапа), «шкала» (появление шкалы), «пока» (уход Мии) находятся в записи со знаками и с заглавной буквы', () => {
    const rec = id => { const l = CATALOG.find(x => x.id === id), words = timings(l.tts), duration = words.at(-1).e + 0.2; return { text: l.text, words, duration } }
    const at = (r, stem) => Math.round(r.words.find(w => w.w.toLowerCase().startsWith(stem)).t / r.duration * 10000)
    const start = rec('race_start'); expect(start.words.some(w => w.w === 'Запускаю')).toBe(true)
    expect(hasWord(start, LAUNCH_WORD)).toBe(true); expect(raceWordAt(start, 10000, LAUNCH_WORD)).toBe(at(start, 'запуска'))
    const look = rec('boss_mia_look'); expect(look.words.some(w => w.w === 'Шкала')).toBe(true); expect(revealAtMs(look, 10000)).toBe(at(look, 'шкал'))
    const bye = rec('boss_mia_bye'); expect(bye.words.at(-1).w).toBe('Пока!'); expect(byeAtMs('boss_mia_bye', bye, 10000)).toBe(at(bye, 'пока'))
    expect(byeAtMs('boss_mia_bye', { ...bye, words: null }, 10000)).toBeGreaterThan(5000) // без таймингов — по месту слова в чистом тексте, как раньше
  })
})
