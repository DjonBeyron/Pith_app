import { SANDBOX_ID } from './feedSandbox.js'

// Синтетический модуль ленты для песочницы: без видео и уроков, без лайков и сложности. previewOnly и
// feedCatchEnabled=false — на случай, если такой модуль попадёт в обычный слайд; сам слайд — SandboxSlide
// (FeedSlideEntry выбирает его по isSandbox). sandboxAt — «версия» песочницы: новая запись пересоздаёт слайд.
export function sandboxModule(sb) {
  return {
    id: SANDBOX_ID,
    title: sb.scene?.title || 'Тест сцены',
    titleTranslation: '',
    wordTranslations: [],
    lessonIds: [],
    videoUrl: null,
    posterUrl: null,
    posterCrop: null,
    sceneId: SANDBOX_ID,
    difficulty: null,
    difficultyVotes: 0,
    saveCount: 0,
    repostCount: 0,
    previewOnly: true,
    feedCatchEnabled: false,
    isSandbox: true,
    sandboxAt: sb.createdAt,
  }
}

// Модуль песочницы только для админа и только если запись есть; иначе null (обычный пользователь — никогда)
export const pickSandboxModule = (isAdmin, sb) => (isAdmin && sb ? sandboxModule(sb) : null)

// Песочница — В НАЧАЛО круга, мимо ранжирования и латча (без модуля список возвращается тем же массивом)
export const mixSandbox = (ranked, mod) => (mod ? [mod, ...ranked] : ranked)
