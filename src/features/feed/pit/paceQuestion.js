// Пит-вопрос по поведению (PLAN_NEW_USER.md → B3): три быстрых пролистывания подряд — Пит спрашивает, что не так.
// Чистая логика без React и журнала: счёт быстрых свайпов и кандидат для общего бюджета вопросов Пита (prompts/).
// Ответ превращается в сигнал уровня сам: prompt_answer с id `behavior:*` → pit_answer (level/levelSignals.js),
// поэтому id ответов ровно too_fast | too_easy | fine.
export const PACE_FAST_MS = 2000      // слайд пролистан быстрее этого — «быстрый» (как feedSkips.js)
export const PACE_STREAK = 3          // столько быстрых подряд
export const PACE_AGAIN_SLIDES = 20   // после срабатывания повторно — не раньше чем через столько слайдов
export const PACE_MAX_PER_SESSION = 1 // и не чаще этого числа раз за сессию
export const PACE_ID = 'behavior:pace'

// Следит за свайпами. onSwipe(ms_prev) → true, когда пора спросить. Любой не быстрый свайп (и свайп без времени) обнуляет счёт;
// после срабатывания счёт с нуля, а новые срабатывания закрыты на PACE_AGAIN_SLIDES слайдов и лимит за сессию
export function createPaceWatch({ fastMs = PACE_FAST_MS, streak = PACE_STREAK, againSlides = PACE_AGAIN_SLIDES, maxPerSession = PACE_MAX_PER_SESSION } = {}) {
  let fast = 0     // быстрых подряд
  let fired = 0    // сколько раз сработало за сессию
  let cooldown = 0 // сколько слайдов ещё молчим после срабатывания
  return {
    onSwipe(msPrev) {
      if (cooldown > 0) cooldown -= 1
      if (!(typeof msPrev === 'number' && msPrev >= 0 && msPrev < fastMs)) { fast = 0; return false }
      fast += 1
      if (fast < streak) return false
      if (cooldown > 0 || fired >= maxPerSession) { fast = 0; return false }
      fast = 0
      fired += 1
      cooldown = againSlides
      return true
    },
  }
}

// Кандидат в слот Пита: вопрос «про человека» (не чаще раза за сессию); контрольная группа вопросов по поведению не видит.
// Реплики без «я»: Пит говорит о себе в третьем лице
export function paceCandidate() {
  return {
    id: PACE_ID,
    kind: 'question',
    reason: 'behavior',
    aboutPerson: true,
    text: 'Кажется, не зацепило. Подскажешь, что не так?',
    answers: [
      { id: 'too_fast', label: 'Слишком быстро, не успеваю' },
      { id: 'too_easy', label: 'Слишком просто, хочется сложнее' },
      { id: 'fine', label: 'Всё хорошо, просто смотрю' },
    ],
    reply: {
      too_fast: 'Понял. Пит подберёт что-нибудь поспокойнее',
      too_easy: 'Понял. Пит поищет что-нибудь поинтереснее',
      fine: 'Хорошо, смотри дальше',
    },
  }
}
