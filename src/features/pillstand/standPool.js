// Пул пилюль игры (wordLanePool.js) «на месте»: стенд пилюль показывает НАСТОЯЩУЮ пилюлю, но без полёта — она появляется сразу на высоте y (% экрана, как у полёта) и стоит (CONCEPT_PILLSTAND.md).
// Обёртка только меняет выдачу: take — без полёта (flight: false) и сразу place(y); y(k) — постоянная высота (сцена фраз считает, что пилюля в зоне чтения и до края не доедет — «не успел» не бывает);
// rise — пилюля не улетает (зачёт видно на месте до следующей цели); give / giveAll снимают place, иначе вернувшаяся в пул пилюля осталась бы на экране. Остальное — тот же пул.
export function stillPool(pool, y) {
  const held = new Set()
  return {
    ...pool,
    take(lane, o = {}) { const k = pool.take(lane, { ...o, flight: false, edge: false }); if (k != null) { pool.place(k, y); held.add(k) } return k },
    give(k) { if (held.delete(k)) pool.unplace(k); pool.give(k) },
    giveAll() { for (const k of held) pool.unplace(k); held.clear(); pool.giveAll() },
    y: k => (held.has(k) ? y : null),
    rise: () => null,
    hold: () => false,
    coast: () => [],
    tail: () => null,
    held: () => [...held],
  }
}
