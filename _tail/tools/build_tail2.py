import json, numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from scipy.interpolate import splprep, splev
al=json.load(open('align.json')); s=al['s']; ox=al['ox']; oy=al['oy']
W,H=439,390; BG=np.array([19,21,27]); UP=3
def place(path):
    im=Image.open(path).convert('RGBA'); w,h=int(im.width*s),int(im.height*s); im=im.resize((w,h),Image.LANCZOS)
    c=Image.new('RGBA',(W,H),(0,0,0,0)); c.paste(im.crop((max(0,-ox),max(0,-oy),w,h)),(max(0,ox),max(0,oy))); return c
mia=place('mia_notail.png'); bodyA=np.array(mia)[:,:,3]>40; bodyD=ndi.binary_dilation(bodyA,iterations=4)
lum=lambda a: a.min(axis=2)
frames=[np.array(Image.open(f'full_{i:02d}.png').convert('RGB')).astype(int) for i in range(9)]
def split(i):
    ga=frames[i]; nb=(np.abs(ga-BG).sum(axis=2)>25); t=nb&~bodyD; t[:,215:]=False
    lab,n=ndi.label(t,structure=np.ones((3,3))); sizes=ndi.sum(t,lab,range(1,n+1))
    keep=np.zeros_like(t)
    for k,sz in enumerate(sizes):
        if sz<20: continue
        yy,xx=np.where(lab==k+1)
        if xx.min()>110 and yy.max()<185: continue
        keep|=(lab==k+1)
    keep=ndi.binary_dilation(keep,iterations=1)&nb&~bodyA
    bright=keep&(lum(ga)>=130)
    markzone=ndi.binary_dilation(bright,iterations=3)&keep
    malpha=np.clip((lum(ga)-22)/208.0,0,1)*markzone                      # физическая прозрачность белой метки над фоном
    rest=keep&~markzone
    lab2,n2=ndi.label(rest,structure=np.ones((3,3))); sz2=ndi.sum(rest,lab2,range(1,n2+1))
    tmask=(lab2==(1+int(np.argmax(sz2)))) if n2 else rest                  # хвост — крупнейшая тёмная компонента
    return ga,tmask,malpha
# --- новый хвост кадра 4 по красной кривой ---
red=np.array(Image.open('/tmp/claude-0/-home-user/13d7a56f-a728-5d74-b9ff-ec01809c14cd/images/11.png').convert('RGB')).astype(int)
rm=(red[...,0]>190)&(red[...,1]<70)&(red[...,2]<70); rm[:195]=False; rm[362:]=False
pts=[]
for y in range(195,362):
    row=np.where(rm[y])[0]
    if len(row): pts.append((row.mean(),y))
pts=np.array(pts)/1.2552
tck,u=splprep([pts[::5,0],pts[::5,1]],s=len(pts[::5])*0.8)
uu=np.linspace(0,1,500); cx,cy=splev(uu,tck)
# v3.3.292: кончик кадра 4 не должен лезть под щёку и усы (владелец: «4-й кадр, хвост странный») — верхняя часть сдвинута влево
sm=lambda t: np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
cx=cx-9*sm((178-cy)/22)
# продлить основание вдоль касательной в тело (будет обрезано телом)
dx,dy=cx[-1]-cx[-6],cy[-1]-cy[-6]; n=np.hypot(dx,dy); dx/=n; dy/=n
ext=np.array([[cx[-1]+dx*k,cy[-1]+dy*k] for k in range(1,40)])
cx=np.concatenate([cx,ext[:,0]]); cy=np.concatenate([cy,ext[:,1]])
SS=6
def draw_tail(width=27,outline=2.2):
    big=Image.new('RGBA',(W*SS,H*SS),(0,0,0,0)); d=ImageDraw.Draw(big)
    for r,col in ((width/2+outline,(34,32,44,255)),(width/2,(95,97,110,255))):
        for x,y in zip(cx,cy): d.ellipse([(x-r)*SS,(y-r)*SS,(x+r)*SS,(y+r)*SS],fill=col)
    return big.resize((W,H),Image.LANCZOS)
newtail=np.array(draw_tail()); newtail[...,3]=np.where(bodyA,0,newtail[...,3])  # обрезка телом
# --- сборка кадров ---
out=[]
for i in range(9):
    ga,tm,ma=split(i)
    if i==3: ma=ma*ndi.binary_dilation(lum(ga)>=150,iterations=1)   # у кадра 4 метки только по ярким пикселям: остатки старого хвоста не берём
    if i==3:
        tail=Image.fromarray(newtail.astype(np.uint8),'RGBA'); tm=np.array(tail)[...,3]>0
    else:
        t=np.zeros((H,W,4),np.uint8); t[...,:3]=ga.astype(np.uint8); t[...,3]=(tm*255).astype(np.uint8); tail=Image.fromarray(t,'RGBA')
    marks=np.zeros((H,W,4),np.uint8); marks[...,:3]=ga.astype(np.uint8); marks[...,3]=(ma*255).astype(np.uint8)
    out.append((tail,marks,tm,ma))
# --- метки не должны касаться хвоста ---
GAP=4
def separate(tm,ma):
    marksM=ma>0.05; lab,n=ndi.label(ndi.binary_dilation(marksM,iterations=2),structure=np.ones((3,3)))
    dist=ndi.distance_transform_edt(~tm)  # расстояние до хвоста
    moved=[]
    res=np.zeros_like(ma)
    for k in range(1,n+1):
        comp=(lab==k)&marksM
        if not comp.any(): continue
        ys,xs=np.where(comp); dmin=dist[comp].min()
        dxy=(0,0)
        if dmin<2.0:
            # направление наружу: от ближайшей точки хвоста
            ty,tx=np.where(tm); cy0,cx0=ys.mean(),xs.mean()
            j=np.argmin((ty-cy0)**2+(tx-cx0)**2); vx,vy=cx0-tx[j],cy0-ty[j]; nn=np.hypot(vx,vy) or 1; vx/=nn; vy/=nn
            sh=0
            while True:
                sh+=1; yy=np.clip(np.round(ys+vy*sh).astype(int),0,H-1); xx=np.clip(np.round(xs+vx*sh).astype(int),0,W-1)
                if dist[yy,xx].min()>=GAP or sh>12: break
            dxy=(round(vx*sh),round(vy*sh)); moved.append((k,dxy,round(float(dmin),1)))
        for y,x in zip(ys,xs):
            yy=min(max(y+dxy[1],0),H-1); xx=min(max(x+dxy[0],0),W-1); res[yy,xx]=max(res[yy,xx],ma[y,x])
    return res,moved
final=[]
for i,(tail,marks,tm,ma) in enumerate(out):
    ga=frames[i]
    res,moved=separate(tm,ma)
    m=np.zeros((H,W,4),np.uint8); m[...,:3]=255 if False else ga.astype(np.uint8)
    # цвет меток: для сдвинутых берём белёсый
    m[...,:3]=np.where(res[...,None]>0,np.array([226,228,236]),0).astype(np.uint8); m[...,3]=(res*255).astype(np.uint8)
    final.append((tail,Image.fromarray(m,'RGBA')))
    print('кадр',i+1,'сдвиги меток',moved)
import pickle; pickle.dump([(np.array(a),np.array(b)) for a,b in final],open('tail_final.pkl','wb'))
