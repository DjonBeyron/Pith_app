import { useState } from 'react'
import { Snowflake, ShieldCheck, Crown, ChevronDown } from 'lucide-react'
import TicketIcon from '../../shared/ui/TicketIcon.jsx'

// Шторка заморозки/автозаморозки (открывается тапом по карточке в окне
// наград и по строке защиты в окне серии).
//
// Формат — как у интро финального экзамена (ExamIntroDialog): плашка с
// названием, ОДНА строка про пользу, цена с иконкой билета и кнопка. Правила
// (сколько раз сработает, как дружит с PRO) ушли под «Подробнее»: раньше они
// лежали двумя абзацами сверху, и главное — что эта штука вообще делает —
// в них тонуло.
export default function FreezeSheet({
  kind, profile, isPro, busy, onBuyFreeze, onBuyAutoFreeze, onWantPro, onClose,
}) {
  const [more, setMore] = useState(false)
  if (!kind) return null

  const freeze = kind === 'freeze'
  const hasFreeze = !!profile?.has_freeze_charge
  const autoLeft = profile?.auto_freeze_charges_left ?? 0
  const autoActive = isPro || autoLeft > 0
  const cost = freeze ? 2 : 3
  const enough = (profile?.tickets ?? 0) >= cost
  const taken = freeze ? hasFreeze : autoActive

  return (
    <div className="rwInfoOverlay" onClick={onClose}>
      <div className="rwInfoCard" onClick={e => e.stopPropagation()}>
        <h3 className="rwSheetTitle">
          {freeze ? <Snowflake size={18} /> : <ShieldCheck size={18} />}
          {freeze ? 'Заморозка' : 'Авто-защита'}
        </h3>

        <p>
          {freeze
            ? 'Спасёт серию, если пропустишь день. Сработает сама, без твоего участия.'
            : isPro
              ? 'С подпиской PRO серия защищена бесплатно и автоматически.'
              : 'Спасёт серию дважды. Сработает сама, без твоего участия.'}
        </p>

        {taken ? (
          <p className="rwSheetStatus">
            {freeze ? 'Уже куплена — ждёт своего дня.'
              : isPro ? 'Активна благодаря подписке PRO.' : `Осталось ${autoLeft}.`}
          </p>
        ) : (
          <>
            <button
              className="rwSheetBuyBtn"
              disabled={busy || !enough}
              onClick={() => { (freeze ? onBuyFreeze : onBuyAutoFreeze)(); onClose() }}
            >
              {enough ? 'Купить' : 'Нужно'} · {cost} <TicketIcon className="rwSheetBuyBtnIcon" />
            </button>
            {/* Цену человек видит здесь же — здесь и объясняем, где брать */}
            <p className="rwSheetHint">
              Билеты <TicketIcon style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> дают
              за финальный экзамен модуля и за дни серии.
            </p>
          </>
        )}

        <button className="rwSheetMoreBtn" onClick={() => setMore(v => !v)}>
          Подробнее <ChevronDown size={14} style={more ? { transform: 'rotate(180deg)' } : undefined} />
        </button>

        {more && (
          <div className="rwSheetMore">
            {freeze ? (
              <>
                <p>
                  Покрывает ровно один пропущенный день. Про запас держится
                  только одна — купить следующую можно после того, как эта
                  сработает.
                </p>
                {isPro && (
                  <p className="rwInfoPro">
                    У тебя уже есть защита PRO — заморозка пригодится сверх неё,
                    на второй пропуск за неделю, который PRO не покроет.
                  </p>
                )}
              </>
            ) : (
              <>
                <p>
                  Два заряда: закроют и два пропуска подряд, и два отдельных в
                  разные недели. Купить снова можно, когда заряды кончатся.
                </p>
                <p className="rwInfoPro">
                  С подпиской PRO это работает всегда и бесплатно: выходные
                  прощаются в любом случае, плюс один будний день в неделю.
                </p>
              </>
            )}
          </div>
        )}

        {!isPro && (
          <button className="rwSheetProBtn" onClick={() => { onClose(); onWantPro?.() }}>
            <Crown size={15} /> Оформить PRO
          </button>
        )}
      </div>
    </div>
  )
}
