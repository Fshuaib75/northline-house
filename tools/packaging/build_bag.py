import re, sys, pathlib
root = pathlib.Path(sys.argv[1]); out = root/'brand'/'packaging'
src = (root/'brand'/'northline-wordmark-cream.svg').read_text()
vb = re.search(r'viewBox="([^"]+)"', src).group(1)
inner = re.search(r'<svg[^>]*>(.*)</svg>', src, re.S).group(1)
vx, vy, vw, vh = map(float, vb.split())
CREAM, MUTED, BAG, HANDLE = '#EFE8DC', '#A89F90', '#2E2C29', '#4A3426'
FONT = "Jost, Montserrat, 'Helvetica Neue', Arial, sans-serif"

def wordmark(cx, top, width):
    h = width * vh / vw
    return f'<svg x="{cx-width/2:.2f}" y="{top:.2f}" width="{width:.2f}" height="{h:.2f}" viewBox="{vb}">{inner}</svg>', h

def caret(cx, y, w, sw, color=CREAM):
    # same geometry as northline-mark-ink.svg, scaled: 626.4 wide, 98 tall
    s = w/626.4
    pts = [(-313.2,0),(-78.3,0),(0,-98),(78.3,0),(313.2,0)]
    p = ' '.join(f'{cx+x*s:.2f},{y+yy*s:.2f}' for x,yy in pts)
    return f'<polyline points="{p}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linejoin="miter"/>'

def front(ox, oy, W, H):
    wm, h = wordmark(ox+W/2, oy+H*0.36, W*0.62)
    y = oy+H*0.36+h+H*0.075
    est = (f'<line x1="{ox+W/2-W*0.25:.2f}" y1="{y-H*0.009:.2f}" x2="{ox+W/2-W*0.155:.2f}" y2="{y-H*0.009:.2f}" stroke="{MUTED}" stroke-width="{W*0.0022:.2f}"/>'
           f'<text x="{ox+W/2:.2f}" y="{y:.2f}" text-anchor="middle" font-family="{FONT}" font-size="{W*0.026:.2f}" letter-spacing="{W*0.012:.2f}" fill="{MUTED}">EST. 2026</text>'
           f'<line x1="{ox+W/2+W*0.155:.2f}" y1="{y-H*0.009:.2f}" x2="{ox+W/2+W*0.25:.2f}" y2="{y-H*0.009:.2f}" stroke="{MUTED}" stroke-width="{W*0.0022:.2f}"/>')
    return wm + est + caret(ox+W/2, oy+H*0.9, W*0.1, W*0.004)

def back(ox, oy, W, H):
    wm, h = wordmark(ox+W/2, oy+H*0.12, W*0.34)
    q = W*0.2; qx = ox+W/2-q/2; qy = oy+H*0.32
    return (wm + f'<rect x="{qx:.2f}" y="{qy:.2f}" width="{q:.2f}" height="{q:.2f}" fill="none" stroke="{CREAM}" stroke-width="{W*0.003:.2f}" stroke-dasharray="{W*0.012:.2f} {W*0.012:.2f}"/>'
            f'<text x="{ox+W/2:.2f}" y="{qy+q/2+W*0.012:.2f}" text-anchor="middle" font-family="{FONT}" font-size="{W*0.035:.2f}" fill="{CREAM}">QR</text>'
            f'<text x="{ox+W/2:.2f}" y="{qy+q+H*0.1:.2f}" text-anchor="middle" font-family="{FONT}" font-size="{W*0.026:.2f}" letter-spacing="{W*0.006:.2f}" fill="{MUTED}">SCAN TO ORDER ON WHATSAPP</text>'
            f'<text x="{ox+W/2:.2f}" y="{qy+q+H*0.21:.2f}" text-anchor="middle" font-family="{FONT}" font-size="{W*0.036:.2f}" letter-spacing="{W*0.004:.2f}" fill="{CREAM}">@northline_house</text>')

# print-ready flats, 1 unit = 1 mm, 340 x 300
for name, fn in (('front', front), ('back', back)):
    (out/f'bag-{name}.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="340mm" height="300mm" viewBox="0 0 340 300">'
        f'<rect width="340" height="300" fill="{BAG}"/>{fn(0,0,340,300)}</svg>\n')

# presentation mockup
def bag3d(x, label, fn):
    W, H, y = 600, 530, 240
    return (f'<ellipse cx="{x+W/2}" cy="{y+H+42}" rx="{W/2}" ry="26" fill="#000" opacity="0.18"/>'
            f'<path d="M{x+190} {y} C{x+190} {y-140} {x+410} {y-140} {x+410} {y}" fill="none" stroke="{HANDLE}" stroke-width="9" stroke-linecap="round"/>'
            f'<rect x="{x}" y="{y}" width="{W}" height="{H}" fill="{BAG}"/>'
            f'<polygon points="{x+W},{y} {x+W+60},{y+32} {x+W+60},{y+H+30} {x+W},{y+H}" fill="#1F1F1F"/>'
            f'<polygon points="{x},{y} {x+W},{y} {x+W+60},{y+32} {x+60},{y+32}" fill="#383838"/>'
            + fn(x, y, W, H) +
            f'<text x="{x+W/2}" y="{y+H+120}" text-anchor="middle" font-family="{FONT}" font-size="18" letter-spacing="6" fill="{HANDLE}">{label}</text>')
(out/'bag-mockup.svg').write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">'
    '<rect width="1600" height="1000" fill="#CFC6B8"/><rect y="760" width="1600" height="240" fill="#BDB3A3"/>'
    + bag3d(140, 'FRONT', front) + bag3d(800, 'BACK', back) + '</svg>\n')

import cairosvg
cairosvg.svg2png(url=str(out/'bag-mockup.svg'), write_to=str(out/'bag-mockup.png'), output_width=1600)
for n in ('front','back'):
    cairosvg.svg2png(url=str(out/f'bag-{n}.svg'), write_to=str(out/f'bag-{n}-preview.png'), output_width=1360)
