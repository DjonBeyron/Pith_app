// Раунд 2 «Слушай и лови» → стадии: по стадии на заход (три). Тип discern — три пилюли на трёх дорожках (сцена order движка), внутри каждой русский перевод (prompt.caps); Пит называет английское слово ТОЛЬКО голосом
// (sayText, пилюли written — молчат), ответ — голосом: слушатель Vosk (stage.step: цель — верное слово, extra — чужие слова и двойники) «тапает» верную дорожку (stage.speak, wordLaneOrderScene.js).
// СНАЧАЛА СЛОВО, ПОТОМ ПИЛЮЛИ: слово звучит сразу при начале захода (sayAt 0), а пилюли с переводами выезжают только когда оно кончилось + CATCH_AFTER_WORD_MS (prompt.lead = длина озвучки слова + пауза; пока Пит
// ещё говорит, заход не стартует: pitLeft, как у пилюль «Разгона»); речь ученика не считается, пока не открылась последняя пилюля (prompt.voiceFrom: тап по закрытой пилюле движок не принимает). В повторном заходе после промаха — то же: слово, потом пилюли.
// Чужое слово или «не успел» — провал подсказки, заход повторяется (maxTries = 1 + retries) с тем же словом. «Тап вместо речи» — тап по пилюле.
import { DISCERN_STAGGER_MS, SAY_AFTER_OPEN_MS } from '../rehearsal/rehearsalDiscern.js'
import { TRAVEL_MS } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { stepOf } from './raceStageKit.js'
import { vocabOf } from './raceWords.js'

export const CATCH_AFTER_WORD_MS = 300 // пауза между концом слова Пита и выездом первой пилюли

export function catchStages(kit, act) {
  const { push, announce, msOf } = kit
  announce(act)
  act.sets.forEach((c, i) => {
    const sid = `catch-${i}`
    const lead = Math.round(msOf(c.text) + CATCH_AFTER_WORD_MS) // слово звучит с первой миллисекунды захода; первая пилюля выезжает, когда оно кончилось
    const prompt = { id: `${sid}-p`, parts: [0], answer: [c.answer], slots: c.slots, texts: c.texts, caps: c.caps, stagger: DISCERN_STAGGER_MS, lead, voiceFrom: lead + (c.slots.length - 1) * DISCERN_STAGGER_MS + TRAVEL_MS + SAY_AFTER_OPEN_MS, text: c.text, written: true, sayAt: 0, edge: true }
    const step = stepOf(sid, { parts: [0], text: c.text, chunks: [c.text], chunkMs: [msOf(c.text)], reps: [{ parts: [0] }], extra: vocabOf([c.text], [...c.decoys, ...c.word.confusers, ...kit.doubles(c.text)]), maxWords: 1 })
    push({ type: 'discern', act: 'catch', sid, ci: i, prompts: [prompt], sayText: c.text, speak: true, maxTries: (act.retries ?? 1) + 1, step, word: c.word })
  })
}
