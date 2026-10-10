// Реестр «как засчитан XP ноды» в одном прохождении урока (живёт в useSayCantXp.js, по ключу — id ноды).
// Нужен для тихой компенсации XP при «Я не могу говорить» (say_cant) и трёх неудачах (say_wrong): тот же XP, что дал бы верный ответ, но ровно один раз на ноду.
//  - quiet — XP засчитан без анимации (say_cant / say_wrong);  real — обычное начисление панелью (handleXpEarned: счётчик + «+N XP» в чате).
// Правила:
//  - quiet(nodeId, amount) вернёт amount только если ноду ещё не засчитывали (ни тихо, ни по-настоящему) — иначе 0: двойной вызов onNodeDone,
//    возврат на ту же ноду по циклу сценария, say_wrong → say_cant (и наоборот) и say_cant / say_wrong после настоящего успеха XP повторно не дают;
//  - real(nodeId, amount) вернёт, сколько добавить в счётчик: 0, если нода уже засчитана тихо (счётчик уже содержит её долю), иначе amount —
//    поведение остальных типов нод не меняется (повторное настоящее начисление считается, как и раньше);
//  - revoke(nodeId) — шаг назад админа: нода снова «не засчитана», можно пройти и получить XP заново.
export function createXpLedger() {
  const marks = new Map() // nodeId → 'quiet' | 'real'
  return {
    quiet(nodeId, amount) {
      if (!nodeId || !(amount > 0) || marks.has(nodeId)) return 0
      marks.set(nodeId, 'quiet')
      return amount
    },
    real(nodeId, amount) {
      if (!nodeId) return amount
      const was = marks.get(nodeId)
      marks.set(nodeId, 'real')
      return was === 'quiet' ? 0 : amount
    },
    revoke(nodeId) { marks.delete(nodeId) },
    has: nodeId => marks.has(nodeId),
  }
}
