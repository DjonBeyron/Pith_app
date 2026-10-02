import { COSMETIC_KINDS } from '../../shared/lib/achievementKinds.js'

// «Просмотренные» достижения-кастомизации: какие открытые виды пользователь уже видел на экране «Кастомизация профиля».
// Пока есть открытая и непросмотренная косметика, блок «Кастомизация профиля» в профиле блестит (ProfileV2). Хранится на
// устройстве по id пользователя — серверу это знать незачем
const key = uid => `pithy_ach_seen_v1:${uid}`

export function readSeen(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(key(uid)) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

// Все сейчас открытые виды считаются просмотренными (зовём, когда экран кастомизации показал их)
export function markSeen(uid, achievements) {
  try { localStorage.setItem(key(uid), JSON.stringify([...new Set([...readSeen(uid), ...achievements.map(a => a.kind)])])) } catch { /* приватный режим */ }
}

// Есть ли открытая косметика, которую ещё не просматривали
export function hasUnseenCosmetic(achievements, seen) {
  return achievements.some(a => COSMETIC_KINDS.includes(a.kind) && !seen.includes(a.kind))
}
