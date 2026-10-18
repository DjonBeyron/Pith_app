import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { exportLesson } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { buildLegend } from './lessonSchema.js'
import { readSayData } from '../../../shared/lib/speech/sayPhraseData.js'
import { makeNode } from '../nodeGraph.js'

// playOwnVoice: при верном ответе (и включённом voiceReply) голосовое ученика проигрывается само — его реальный голос, не озвучка эталона.
// Нет поля = включено; false — молчим. Поле идёт через экспорт/импорт, в пузырь попадает флаг autoPlay.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const node = extra => { const n = makeNode(1, 0, 0, 'say_phrase'); n.typeData.say_phrase = { ...n.typeData.say_phrase, phrase: 'I need to talk to you', ...extra }; return n }

describe('say_phrase — playOwnVoice', () => {
  it('нет поля / мусор = включено; только false выключает', () => {
    expect(readSayData({ phrase: 'x' }).playOwnVoice).toBe(true)
    expect(readSayData(undefined).playOwnVoice).toBe(true)
    expect(readSayData({ playOwnVoice: false }).playOwnVoice).toBe(false)
    for (const v of [0, '', 'false', null]) expect(readSayData({ playOwnVoice: v }).playOwnVoice, String(v)).toBe(true)
  })

  it('false идёт туда и обратно через JSON, у новой ноды поля нет', () => {
    expect(makeNode(1, 0, 0, 'say_phrase').typeData.say_phrase.playOwnVoice).toBeUndefined()
    const out = exportLesson([node({ voiceReply: true, playOwnVoice: false })], { title: 'Say' })
    expect(out.nodes[0].data.playOwnVoice).toBe(false)
    const back = importLesson(JSON.parse(JSON.stringify(out))).nodes[0].typeData.say_phrase
    expect(readSayData(back).playOwnVoice).toBe(false)
  })

  it('легенда описывает поле', () => {
    expect(JSON.stringify(buildLegend())).toContain('playOwnVoice')
  })

  it('проводка: панель отдаёт autoPlay только к реальному голосовому, пузырь играет клип сам после показа', () => {
    expect(read('../../player/panels/say-phrase/SayPhrasePanel.jsx')).toContain("'correct', true, voiceId, !!voiceId && data.playOwnVoice")
    expect(read('../../player/usePlayerAnswers.js')).toContain('autoPlay: true')
    expect(read('../../player/modules/AnswerBubbles.jsx')).toContain('autoPlay={!!b.autoPlay && !b.arriving}')
    expect(read('../../player/modules/say-phrase/SayVoiceReply.jsx')).toMatch(/autoPlay[\s\S]*toggle\(\)/)
  })
})
