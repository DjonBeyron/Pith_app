// Шторка-объяснение для карточек заморозок (RewardsPopup → rwFreezeRow).
// Карточка целиком тапабельна и просто открывает эту шторку с описанием
// механики; кнопка покупки/оформления PRO живёт здесь же, а не рядом с
// карточкой — так карточка остаётся одним цельным тап-таргетом.
export default function FreezeSheet({
  kind, profile, isPro, busy, onBuyFreeze, onBuyAutoFreeze, onWantPro, onClose,
}) {
  if (!kind) return null

  const hasFreeze = !!profile?.has_freeze_charge
  const autoLeft = profile?.auto_freeze_charges_left ?? 0
  const autoActive = isPro || autoLeft > 0

  return (
    <div className="rwInfoOverlay" onClick={onClose}>
      <div className="rwInfoCard" onClick={e => e.stopPropagation()}>
        {kind === 'freeze' ? (
          <>
            <h3>🧊 Заморозка</h3>
            <p>
              Покупается заранее, не стакается — можно накопить-купить
              только одну про запас. Если пропустишь день, она сработает
              сама и спасёт серию, без твоего участия. Стоит 2 🎟.
            </p>
            {hasFreeze ? (
              <p className="rwSheetStatus">Уже куплена — сработает сама, если пропустишь день.</p>
            ) : (
              <button className="rwSheetBuyBtn" disabled={busy} onClick={() => { onBuyFreeze(); onClose() }}>
                Купить · 2 🎟
              </button>
            )}
          </>
        ) : (
          <>
            <h3>♾️ Авто заморозка</h3>
            {isPro ? (
              <p>
                С твоей подпиской PRO серия защищена всегда и бесплатно:
                суббота и воскресенье прощаются в любом случае, плюс один
                будний день в неделю — автоматически, покупать не нужно.
              </p>
            ) : (
              <>
                <p>
                  Покупка защищает серию на 2 пропущенных дня подряд —
                  сработает сама, без твоего участия. Повторная покупка
                  недоступна, пока защита не закончится. Стоит 3 🎟.
                </p>
                <p className="rwInfoPro">
                  С подпиской PRO это работает всегда и бесплатно — суббота
                  и воскресенье прощаются в любом случае, плюс один будний
                  день в неделю.
                </p>
              </>
            )}
            {autoActive ? (
              <p className="rwSheetStatus">
                {isPro ? 'Активна благодаря подписке PRO.' : `Осталось ${autoLeft}.`}
              </p>
            ) : (
              <button className="rwSheetBuyBtn" disabled={busy} onClick={() => { onBuyAutoFreeze(); onClose() }}>
                Купить · 3 🎟
              </button>
            )}
            {!isPro && (
              <button className="rwSheetProBtn" onClick={() => { onClose(); onWantPro?.() }}>
                👑 Оформить PRO
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
