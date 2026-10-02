// Есть ли неполученная награда серии: так же считает окно наград (RewardsPopup: «Забрать награду» доступна, пока серия
// длиннее уже забранных дней). По этому признаку в профиле блестит блок «Ежедневные награды»
export const hasUnclaimedStreak = profile => (profile?.current_streak ?? 0) > (profile?.last_claimed_streak_day ?? 0)
