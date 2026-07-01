const KEY_XP = 'pithy_xp'

export function getLocalXp() {
  return parseInt(localStorage.getItem(KEY_XP) ?? '0', 10) || 0
}

export function addLocalXp(amount) {
  const next = getLocalXp() + amount
  localStorage.setItem(KEY_XP, String(next))
  return next
}

export function setLocalXp(amount) {
  localStorage.setItem(KEY_XP, String(amount))
}

export function clearLocalXp() {
  localStorage.removeItem(KEY_XP)
}
