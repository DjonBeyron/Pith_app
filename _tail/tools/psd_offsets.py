# Смещения слоёв по кадрам из кадровой анимации PSD (ресурс 4000 → у слоя метаданные mlst → LaSt).
# Владелец двигал «Хвост n» и «Штрихи n» в своём кадре Photoshop-ом: геометрия в файле лежит без этих сдвигов, сдвиги записаны отдельно
# (VMsk.Ofst: у первой записи — абсолютное положение, дальше — приращения от предыдущей записи; Ofst первой записи — на сколько оно уже сдвинуто от геометрии).
# → {(вид, n): {кадр: (dx, dy)}} в пикселях холста 1600×1920; вид — 'tail' / 'marks'. Проверено по скриншоту кадра 4 из Photoshop владельца (разница 1,6 против 3,7 без сдвигов).
from psd_tools import PSDImage
FRID = [6504309, 4285785, 4302592, 4319399, 4336206, 4353013, 4369820, 4386627, 4403434]   # id кадров 1…9 (порядок воспроизведения, ресурс 4000 → FsFr)

def _mlst(layer):
    for k, v in layer._record.tagged_blocks.items():
        if 'METADATA' in str(k):
            for m in v.data:
                if m.key == b'mlst': return m.data.data if hasattr(m.data, 'data') else m.data

def layer_disp(layer):
    pos = first = None; out = {}
    for e in _mlst(layer)['LaSt']:
        f = FRID.index(e[b'FrLs'][0]) + 1
        vm = e.get(b'VMsk', {}).get(b'Ofst')
        if vm:
            d = (vm[b'Hrzn'], vm[b'Vrtc'])
            if pos is None:
                of = e.get(b'Ofst'); of = (of[b'Hrzn'], of[b'Vrtc']) if of else (0, 0)
                pos = d; first = (d[0] - of[0], d[1] - of[1])
            else: pos = (pos[0] + d[0], pos[1] + d[1])
        out[f] = None if pos is None else (pos[0] - first[0], pos[1] - first[1])
    return out

def all_disp(psd):
    res = {}
    for g in [x for x in psd if x.kind == 'group']:
        k = int(g.name.split()[-1])
        for l in g: res[('tail' if l.name.startswith('Хвост') else 'marks', k)] = layer_disp(l)
    return res
