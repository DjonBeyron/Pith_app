// Каталог будущих сигналов ранжирования (status 'collecting' | 'planned').
// Сейчас все они нейтральны (compute → 0.5, без эффекта) — это описание для
// админки: что сигнал будет значить, откуда данные, как считать и чем рискует.
// Когда сигнал реализуют — переносят в LIVE_SIGNALS (signalRegistry.js) и
// ставят status 'live'. Веса здесь — заготовка на тот момент.
const neutral = () => ({ value: 0.5, reason: 'сигнал пока не считается' })

const sig = (o) => ({ defaultEnabled: false, compute: neutral, ...o })

export const FUTURE_SIGNALS = [
  sig({
    id: 'review_urgency',
    title: 'Срочность повтора',
    description: 'Фраза со словом, у которого срок повтора сегодня или просрочен, — выше: лента сама подсовывает то, что пора повторить. Считать: ближайший due_on среди слов фразы относительно сегодня. Риск: лента превращается в «повторялку» — ограничить долю (rules.reviewShareMax).',
    group: 'memory', source: 'word_memory.due_on (learnView.dueOf)',
    status: 'collecting', defaultWeight: 25,
  }),
  sig({
    id: 'interest_topic',
    title: 'Интерес к теме',
    description: 'Темы/теги фраз, на которых человек задерживается, открывает перевод и доучивает, — выше. Считать: доля «удержанных» просмотров по тегу за 30 дней. Нужны теги у модулей — их пока нет. Риск: пузырь одной темы.',
    group: 'behavior', source: 'app_events feed_view/feed_reveal + теги модуля (нет)',
    status: 'planned', defaultWeight: 15,
  }),
  sig({
    id: 'search_boost',
    title: 'Искал словом',
    description: 'Фразы со словами, которые человек недавно искал в поиске ленты, — выше на несколько дней. Считать: совпадение слов фразы с последними запросами. Риск: текст запроса не пишется в журнал (приватность) — хранить локально.',
    group: 'behavior', source: 'app_events feed_search (только длина) + localStorage',
    status: 'planned', defaultWeight: 10,
  }),
  sig({
    id: 'type_affinity',
    title: 'Любимый тип слайда',
    description: 'Если появятся разные типы слайдов (видео, SVG-сцена, карточка), поднимать тот, что человек досматривает чаще. Считать: средняя доля досмотра по типу. Риск: один тип вытесняет остальные — парное правило maxSameTypeInRow.',
    group: 'content', source: 'app_events feed_view (ms) + тип модуля (нет)',
    status: 'planned', defaultWeight: 10,
  }),
  sig({
    id: 'swipe_back',
    title: 'Вернулся назад',
    description: 'Фраза, к которой вернулись свайпом вверх, явно зацепила — похожие (общее слово) выше. Считать: feed_swipe dir=prev по module_id за 14 дней. Риск: случайные возвраты — учитывать только с удержанием > 2 с.',
    group: 'behavior', source: 'app_events feed_swipe',
    status: 'collecting', defaultWeight: 8,
  }),
  sig({
    id: 'replay',
    title: 'Пересмотры',
    description: 'Фразы, которые смотрели несколько раз подряд или замедляли (feed_slow), — важны человеку; похожие выше, сама фраза — ниже (уже видел). Риск: путает «нравится» и «не понял».',
    group: 'behavior', source: 'app_events feed_view / feed_slow',
    status: 'collecting', defaultWeight: 8,
  }),
  sig({
    id: 'explicit_feedback',
    title: 'Лайк / закладка / «не интересно»',
    description: 'Явная оценка: лайк и закладка — похожие фразы выше; «не интересно» (кнопки пока нет) — ниже. Считать: реакции по словам фразы. Риск: мало данных у новичка — вес включать мягко.',
    group: 'social', source: 'module_reactions, module_bookmarks (feed_like / feed_save)',
    status: 'collecting', defaultWeight: 12,
  }),
  sig({
    id: 'fatigue',
    title: 'Усталость',
    description: 'Долгая сессия (много слайдов подряд, падает доля досмотра) — проще и короче фразы выше. Считать: длина текущей сессии и тренд ms просмотра. Риск: ложная «усталость» при быстром пролистывании знакомого.',
    group: 'behavior', source: 'app_events feed_view / feed_swipe (сессия)',
    status: 'collecting', defaultWeight: 8,
  }),
  sig({
    id: 'time_of_day',
    title: 'Время дня',
    description: 'Утром — повтор и лёгкое, вечером — новое и сложнее (гипотеза). Считать: час устройства → профиль. Риск: гипотеза не проверена — включать только после A/B.',
    group: 'mix', source: 'часы устройства',
    status: 'planned', defaultWeight: 5,
  }),
  sig({
    id: 'streak_mode',
    title: 'Режим серии',
    description: 'Серия под угрозой (день не отмечен, вечер) — выше фразы, которые быстро дают «сделанный день» (короткий урок-слово). Считать: streak-статус профиля. Риск: манипулятивно — держать вес маленьким.',
    group: 'mix', source: 'профиль (streak), streakApi',
    status: 'planned', defaultWeight: 5,
  }),
]
