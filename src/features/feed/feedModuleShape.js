// Строка curricula → объект модуля ленты. Одна функция на два потребителя: ленту
// (useFeedModules) и предпросмотр в окне «Сигналы ленты» (admin/signals) — чтобы
// предпросмотр ранжировал ровно те же поля, что видит лента.
export function rowToFeedModule(r) {
  return {
    id: r.id,
    title: r.title,
    // Переводы названия: полный (раскрывается под фразой) и пословный
    // ([{ w, t }] — тап по слову, см. WordTranslateLine)
    titleTranslation: r.title_translation ?? '',
    wordTranslations: r.word_translations ?? [],
    lessonIds: r.lesson_ids ?? [],
    videoUrl: r.video_url ?? null,
    posterUrl: r.poster_url ?? null,
    posterCrop: r.poster_crop ?? null,
    // Сцена библиотеки вместо видео (curricula.scene_id; нет колонки/сцены — null).
    // Слайд грузит сцену сам по id; у ученика draft-сцена не придёт (RLS) — покажет видео
    sceneId: r.scene_id ?? null,
    difficulty: r.difficulty ?? null,
    difficultyVotes: r.difficulty_votes ?? 0,
    // Сложность от админа (curricula.difficulty_admin, нет колонки — null): действует, пока голосов мало (effectiveDifficulty)
    difficultyAdmin: r.difficulty_admin ?? null,
    saveCount: r.save_count ?? 0,
    repostCount: r.repost_count ?? 0,
    // Превью-статус: виден в ленте, но «Изучить фразу» скрыта (см. FeedSlide)
    previewOnly: !!r.preview_only,
    // «Ловля слов в ленте» на этой фразе (feed_catch_enabled; нет колонки — включено)
    feedCatchEnabled: r.feed_catch_enabled !== false,
  }
}

// Черновики в ленту не попадают (и у админа тоже — честное превью)
export const publishedFeedModules = rows => rows.filter(r => r.published).map(rowToFeedModule)
