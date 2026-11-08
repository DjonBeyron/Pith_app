// Подставной слушатель фраз этапа 2 (тот же интерфейс, что у createPhraseListener из racePhraseListen.js по контракту этапа 2): для тестов и стенда (_stand/race), вместо настоящего (racePhraseListen.js)
// или когда речь подаёт драйвер. Ничего не слушает: речь «говорят» вызовом stubSay(text) — по каждой фразе-кандидату считаются её слова, услышанные по порядку (onWord на каждое новое), и доля ratio;
// ratio ≥ PHRASE_OK — onPhrase; непустая речь — onEar({ kind: 'partial' | 'final', text }) (как у настоящего: отладочная полоска сцены, на заливку не влияет), слова отдаются подтверждёнными (draft: false); stubDraft(text) — то же черновиком (draft: true, без onPhrase); stubLevel(rms) — уровень микрофона (onLevel). Сопоставление простое (слова строчными без знаков по краям), этого хватает для проверки сцены. Чистый модуль без DOM.
export const PHRASE_OK = 0.75

const live = new Set()
const words = text => String(text ?? '').toLowerCase().split(/\s+/).map(t => t.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')).filter(Boolean)

export function createPhraseListener({ phrases = [], onWord = () => {}, onEar = () => {}, onLevel = () => {}, onPhrase = () => {}, onError = () => {} } = {}) {
  let list = phrases
  let heard = new Map() // phraseKey → множество услышанных номеров слов
  const me = {
    hear(text, draft = false) {
      const said = words(text)
      if (said.length) onEar({ kind: draft ? 'partial' : 'final', text: said.join(' ') })
      for (const p of list) {
        const got = heard.get(p.key) ?? new Set()
        let from = 0
        p.words.forEach((w, index) => { const at = said.indexOf(w, from); if (at < 0) return; from = at + 1; if (!got.has(index)) { if (!draft) got.add(index); onWord({ phraseKey: p.key, index, text: w, draft }) } })
        heard.set(p.key, got)
        const ratio = p.words.length ? got.size / p.words.length : 0
        if (!draft && ratio >= PHRASE_OK) onPhrase({ phraseKey: p.key, ratio, heard: said.join(' ') })
      }
    },
    level(rms, held = false) { onLevel(rms, held) },
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

/** Драйвер «говорит» text черновиком: слова приходят с draft: true, зачёта нет */
export const stubDraft = text => { for (const l of [...live]) l.hear(text, true) }

/** Драйвер подаёт уровень микрофона rms (0…1; held — говорит Пит): как onLevel настоящего слушателя — сцена «Скажи» им не заливает (только распознанные слова): проверка «шум не заливает» */
export const stubLevel = (rms, held = false) => { for (const l of [...live]) l.level(rms, held) }

/** Сколько подставных слушателей сейчас живы (тесты: сцена остановила своего) */
export const stubCount = () => live.size
