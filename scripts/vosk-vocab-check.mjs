// Проверка, знает ли модель Vosk слова из сокращений «Повтори за диктором» (i'm, can't, cannot, …).
// Модель в репозитории не хранится: скачайте vosk-model-small-en-us-0.15 (VOSK_MODEL_URL в src/shared/lib/vosk/voskConfig.js), распакуйте и передайте путь к graph/words.txt:
//   node scripts/vosk-vocab-check.mjs путь/к/vosk-model-small-en-us-0.15/graph/words.txt
// В словаре «слово ID» по строке. Слова, которых нет в словаре, Vosk молча выбрасывает из грамматики (в журнале: «Ignoring word missing in vocabulary»), а сказанное приходит как [unk].
import { readFileSync } from 'node:fs'
import { CONTRACTIONS, phraseForms } from '../src/shared/lib/speech/speechMatch.js'

const path = process.argv[2]
if (!path) { console.error('Использование: node scripts/vosk-vocab-check.mjs <путь к graph/words.txt>'); process.exit(2) }
const vocab = new Set(readFileSync(path, 'utf8').split('\n').map(l => l.split(/\s+/)[0]).filter(Boolean))
const words = new Set()
for (const [c, full] of Object.entries(CONTRACTIONS)) {
  for (const f of phraseForms(full)) f.split(' ').forEach(w => words.add(w))
  words.add(c)
}
const missing = [...words].filter(w => !vocab.has(w)).sort()
console.log(`Слов проверено: ${words.size}, словарь модели: ${vocab.size}`)
if (missing.length) console.log(`НЕТ В СЛОВАРЕ (передайте в targetGrammar как known или не используйте): ${missing.join(', ')}`)
else console.log('Все слова есть в словаре.')
process.exit(missing.length ? 1 : 0)
