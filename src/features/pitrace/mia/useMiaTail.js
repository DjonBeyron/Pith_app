import { useEffect, useState } from 'react'

// Хвост Мии (владелец, v3.3.274: «как у Пита, но игривее — извивается, будто психует кошка; на верный ответ хвост становится прямее и пушистее»). Движение — CSS (race-mia.css, miaTail),
// здесь только состояние «довольна»: верный ответ (m.wins вырос) — PLEASED_MS хвост прямой и пушистый; ошибка (серия сброшена) — сразу обратно к нервному.
export const PLEASED_MS = 2600

/** → true, пока хвост «довольный». wins — число верных ответов эпизода (m.wins), streak — серия верных подряд (0 — ошибка) */
export function useMiaTail({ wins, streak, live }) {
  const [until, setUntil] = useState({ wins: 0, on: false })
  useEffect(() => {
    if (!live || !wins) return undefined
    const t0 = setTimeout(() => setUntil({ wins, on: true }), 0)
    const t1 = setTimeout(() => setUntil(u => (u.wins === wins ? { wins, on: false } : u)), PLEASED_MS)
    return () => { clearTimeout(t0); clearTimeout(t1) }
  }, [wins, live])
  return live && until.on && until.wins === wins && streak > 0
}
