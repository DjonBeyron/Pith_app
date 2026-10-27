// «Ловля слов» под единым бюджетом вопросов Пита (shared/lib/prompts, PLAN_NEW_USER.md → A1). Старые лимиты (feedCatch.js:
// раз в 5 видео, 3 в день; catchLater.js) остаются внутри, бюджет — сверху: задание показывается, только когда слот выбрал
// кандидата `catch:<moduleId>` (вид offer, game_offer). «Ловля» — не шторка, а накрытие слайда, поэтому бюджет для неё — разрешение:
// слот выбрал → показываем и сразу answer('shown'), слот свободен (показ остаётся записанным в бюджете). Не выбрал за текущий
// слайд — задание не показываем, оно отложено. Без слота (null: тесты, старые вызовы) — разрешено всегда, как раньше.
// Функции чистые относительно React: слот — объект из usePromptSlot (current, request, answer, cancel); побочные вызовы слота
// откладываются микрозадачей, потому что claim зовётся прямо в рендере слайда (слот эмитит подписчикам — setState в чужих
// компонентах во время рендера React не прощает).
export const CATCH_PREFIX = 'catch:'

export const catchCandidate = moduleId => ({ id: `${CATCH_PREFIX}${moduleId}`, kind: 'offer', reason: 'game_offer' })

// Слот выбрал именно эту фразу? Нет слота — да
export const catchGranted = (slot, moduleId) => !slot || slot.current?.id === `${CATCH_PREFIX}${moduleId}`

// Просим слот выбрать фразу (идемпотентно: слот сам не берёт повторно). Прошлую ждущую фразу снимаем: ждёт не больше одной
export function requestCatch(slot, moduleId, pending) {
  if (!slot || pending.id === moduleId) return
  const old = pending.id
  pending.id = moduleId
  queueMicrotask(() => {
    if (old) slot.cancel?.(catchCandidate(old).id)
    slot.request(catchCandidate(moduleId))
  })
}

// Задание поставлено: показ записан в бюджете, слот свободен
export function consumeCatch(slot, moduleId, pending) {
  if (!slot) return
  if (pending.id === moduleId) pending.id = null
  const id = catchCandidate(moduleId).id
  queueMicrotask(() => { if (slot.current?.id === id) slot.answer('shown') })
}
