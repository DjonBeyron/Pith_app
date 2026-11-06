// Подставной слушатель фраз этапа 2 (тот же интерфейс, что у createPhraseListener из racePhraseListen.js по контракту этапа 2): для тестов и стенда (_stand/race), вместо настоящего (racePhraseListen.js)
// или когда речь подаёт драйвер. Ничего не слушает: речь «говорят» вызовом stubSay(text) — по каждой фразе-кандидату считаются её слова, услышанные по порядку (onWord на каждое новое), и доля ratio;
// ratio ≥ PHRASE_OK — onPhrase. Сопоставление простое (слова строчными без знаков по краям), этого хватает для проверки сцены. Чистый модуль без DOM.
export const PHRASE_OK = 0.75

const live = new Set()
const words = text => String(text ?? '').toLowerCase().split(/\s+/).map(t => t.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')).filter(Boolean)

export function createPhraseListener({ phrases = [], onWord = () => {}, onPhrase = () => {}, onError = () => {} } = {}) {
  let list = phrases
  let heard = new Map() // phraseKey → множество услышанных номеров слов
  const me = {
    hear(text) {
      const said = words(text)
      for (const p of list) {
        const got = heard.get(p.key) ?? new Set()
        let from = 0
        p.words.forEach((w, index) => { const at = said.indexOf(w, from); if (at < 0) return; from = at + 1; if (!got.has(index)) { got.add(index); onWord({ phraseKey: p.key, index, text: w }) } })
        heard.set(p.key, got)
        const ratio = p.words.length ? got.size / p.words.length : 0
        if (ratio >= PHRASE_OK) onPhrase({ phraseKey: p.key, ratio, heard: said.join(' ') })
      }
    },
    fail(err) { onError(err) },
    stop() { live.delete(me) },
    reset() { heard = new Map() },
    setPhrases(next) { list = next ?? []; heard = new Map() },
  }
  live.add(me)
  return me
}

/** Драйвер «говорит» text: слышат все живые подставные слушатели */
export const stubSay = text => { for (const l of [...live]) l.hear(text) }

/** Сколько подставных слушателей сейчас живы (тесты: сцена остановила своего) */
export const stubCount = () => live.size
