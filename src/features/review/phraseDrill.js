// Закрепление фразы (этап 7 системы повторения): все слова фразы окрепли
// (шаг ≥ 3) — в повторение приходит сама фраза: видео фразы (если есть) и
// «собери фразу» из её слов. Ноды собираются на лету по модулю — автору
// ничего готовить не нужно. Играет тот же LessonPlayer, что и карточки.

// Слова фразы для «собери фразу»: по пробелам, без отдельно стоящих знаков
// («·», «—»); апострофы и пунктуация внутри слова остаются как есть
export function phraseTokens(title) {
  return (title ?? '').split(/\s+/).filter(t => /[\p{L}\p{N}]/u.test(t))
}

// module: { id, title, videoUrl } → ноды мини-урока
export function phraseNodes(module) {
  const words = phraseTokens(module.title)
  const assemble = {
    id: 'phrase-assemble', seq: 2, x: 370, y: 0, size: 'max', type: 'phrase_assembly',
    typeData: { phrase_assembly: { words, distractors: [], responseCorrect: '', responseWrong: '', reward: false } },
    triggers: [
      { id: 'phrase-ok', if: 'phrase_correct', then: null },
      { id: 'phrase-bad', if: 'phrase_wrong', then: null },
    ],
  }
  if (!module.videoUrl) return [{ ...assemble, seq: 1, x: 0 }]
  return [
    {
      id: 'phrase-video', seq: 1, x: 0, y: 0, size: 'max', type: 'video',
      typeData: { video: { r2Url: module.videoUrl } },
      triggers: [{ id: 'phrase-video-t', if: 'timer', ms: 1500, then: 'phrase-assemble' }],
    },
    assemble,
  ]
}

// Пункт очереди для ReviewTurn: без слова и без «Знаю» (attempt 2)
export function phraseItem(module) {
  return { key: `phrase:${module.id}`, kind: 'phrase', word: null, attempt: 2, card: { id: 'phrase', nodes: phraseNodes(module) } }
}
