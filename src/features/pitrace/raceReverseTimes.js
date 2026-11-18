// Тайминг разворота в реверс по СКОРОСТИ КОНВЕЙЕРА (владелец, v3.3.277: «пилюли разворота должны выезжать по конвейеру, со скоростью конвейера, а у Мии она другая; в диалогах запускать их заранее, чтобы они с обычной скоростью всё успели»).
// Пилюли приезжают на скорости конвейера v = SPEED · k (k — множитель скорости последней ступени, convSpeed.v; у Мии — с её ускорением), равномерно до точки торможения, потом постоянное замедление до нуля в центре (REV_RAMP_PCT % высоты);
// отъезд — зеркально: постоянное ускорение с нуля до v на REV_RAMP_PCT %, дальше равномерно до края. Приезд и отъезд = (путь + REV_RAMP_PCT) / v. Множитель зажат в [REV_SPEED_MIN, REV_SPEED_MAX]: ни слишком долго, ни рывком.
// Чистые функции без DOM; convSpeed.v пишет привод дорожек (laneConveyorDrive) при каждой смене скорости.
import { SPEED, ENTER_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'

export const REV_PAUSE_MS = 200
export const REV_TURN_MS = 400
export const REV_RAMP_PCT = 18 // % высоты: торможение до остановки / разгон с места (постоянное ускорение)
export const REV_SPEED_MIN = 0.8
export const REV_SPEED_MAX = 1.6
export const REV_MID_Y = 50    // центр пилюль при остановке, % высоты
export const convSpeed = { v: 1 } // множитель скорости конвейера сейчас (пишет laneConveyorDrive)

export const clampSpeed = s => Math.min(REV_SPEED_MAX, Math.max(REV_SPEED_MIN, Number(s) > 0 ? Number(s) : 1))

/** Времена разворота (мс) при множителе скорости speed: arrive / leave — приезд и отъезд, lead — до конца поворота (с него стартует отъезд), total — вся стадия с запасом; linear — равномерная часть приезда / отъезда */
export function revTimes(speed = convSpeed.v) {
  const v = SPEED * clampSpeed(speed), path = Math.abs(REV_MID_Y - ENTER_Y)
  const arrive = Math.round(((path + REV_RAMP_PCT) / v) * 1000), linear = Math.round(((path - REV_RAMP_PCT) / v) * 1000)
  const lead = arrive + REV_PAUSE_MS + REV_TURN_MS
  return { arrive, leave: arrive, linear, ramp: arrive - linear, lead, total: lead + arrive + 120 }
}
