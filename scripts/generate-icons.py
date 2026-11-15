from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math
out=Path(__file__).resolve().parents[1]/"public"/"icons"
out.mkdir(parents=True, exist_ok=True)
for size in [192, 512]:
    factor=3
    S=size*factor
    im=Image.new("RGBA",(S,S),(7,14,27,255))
    d=ImageDraw.Draw(im)
    def pt(x): return int(x*S/512)
    d.rounded_rectangle((pt(8),pt(8),pt(504),pt(504)), radius=pt(98),fill=(8,27,43,255),outline=(26,112,142,255),width=pt(6))
    hexagon=[(256,66),(417,157),(417,355),(256,446),(95,355),(95,157)]
    inner=[(256,95),(391,174),(391,338),(256,417),(121,338),(121,174)]
    d.line([(pt(x),pt(y)) for x,y in hexagon+[hexagon[0]]],fill=(41,110,141,255),width=pt(11),joint="curve")
    d.line([(pt(x),pt(y)) for x,y in inner+[inner[0]]],fill=(54,215,225,255),width=pt(8),joint="curve")
    for rad,w,col in [(91,9,(70,218,228)),(38,6,(118,242,245))]:
        d.ellipse((pt(256-rad),pt(253-rad),pt(256+rad),pt(253+rad)),outline=col,width=pt(w))
    for x1,y1,x2,y2 in [(256,115,256,189),(256,318,256,392),(117,253,195,253),(316,253,394,253)]:
        d.line((pt(x1),pt(y1),pt(x2),pt(y2)),fill=(85,232,238),width=pt(11))
    d.line((pt(234),pt(253),pt(278),pt(253)),fill=(234,252,254),width=pt(8))
    d.line((pt(256),pt(231),pt(256),pt(275)),fill=(234,252,254),width=pt(8))
    im.resize((size,size),Image.Resampling.LANCZOS).save(out/f"dark-sector-{size}.png",optimize=True)
    print(out/f"dark-sector-{size}.png")
