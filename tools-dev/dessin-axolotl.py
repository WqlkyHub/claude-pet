# Génère le SVG pixel art du compagnon dans index.html.
# Usage : python tools-dev/dessin-axolotl.py src/renderer/index.html
#
# Chaque pixel porte une classe de couleur (c-o, c-g...) : les couleurs viennent
# de variables CSS. Le compagnon a 3 formes d'évolution (axolotl, dragon,
# dragon céleste) qui partagent la même tête et le même visage. Chaque forme
# a une partie qui change selon l'humeur (branchies ou ailes),
# en 4 variantes : normal, up (content), down (fatigué), spiky (surpris).
import re, sys

K = {'X': 'ol', 'O': 'o', 'L': 'l', 'S': 's', 'B': 'b', 'G': 'g', 'T': 't', '#': 'k',
     'w': 'w', 'r': 'r', 'y': 'y', 'Y': 'yy', 'm': 'm', 'p': 'p'}


def rects(pattern, ox, oy, cell=10):
    out = []
    for y, row in enumerate(pattern):
        for x, c in enumerate(row):
            if c != '.':
                out.append(f'<rect class="c-{K[c]}" x="{ox + x * cell:g}" y="{oy + y * cell:g}" '
                           f'width="{cell:g}" height="{cell:g}"/>')
    return ''.join(out)


def mirror(pattern):
    return [r[::-1] for r in pattern]


def pair(pattern, lx, rx, y, cls=''):
    """Même motif à gauche (lx = pixel le plus à gauche) et en miroir à droite
    (rx = pixel le plus à droite)."""
    w = max(len(r) for r in pattern)
    pat = [r.ljust(w, '.') for r in pattern]
    return (f'<g class="{cls} side-left">{rects(pat, lx, y)}</g>'
            f'<g class="{cls} side-right">{rects(mirror(pat), rx - (w - 1) * 10, y)}</g>')


def moodparts(variants, lx, rx, y, cls):
    out = ''
    for name, (pat, dy) in variants.items():
        out += f'<g class="moodpart mp-{name}">{pair(pat, lx, rx, y + dy, cls)}</g>'
    return out


HEAD = ["...XXXXXXXX...",
        ".XXOOOOOOOOXX.",
        "XOLLOOOOOOOOOX",
        "XOLOOOOOOOOOOX",
        "XOOOOOOOOOOOOX",
        "XOOOOOOOOOOOOX",
        "XOOOOOOOOOOOOX",
        "XSOOOOOOOOOOSX",
        ".XSSOOOOOOSSX.",
        "..XXXXXXXXXX.."]

# ---------------------------------------------------------------- stade 1 : axolotl
AXO_BODY = ["XOBBBBBBOX", "XOBBBBBBOX", "XOOBBBBOOX", ".XXXXXXXX."]
AXO_TAIL = ["XX..", "OOX.", "XOOX", ".XXX"]
AXO_GILLS = {
    'normal': (["T..", ".G.", "..G", "...", "TGG", "...", "..G", ".G.", "T.."], 0),
    'up':     (["T.T", ".GG", "T.G", ".GG", "..G", "...", "...", "...", "..."], 0),
    'down':   (["...", "...", "..G", "..G", ".G.", "T.G", "..G", ".G.", "T.."], 0),
    'spiky':  (["...", "TGG", "...", "...", "TGG", "...", "...", "TGG", "..."], 0),
}

# ---------------------------------------------------------------- stade 2 : dragon
DRAGON_BODY = ["XOOBBBBBBOOX",
               "XOOBBBBBBOOX",
               "XOOOBBBBOOOX",
               ".XXXXXXXXXX."]
DRAGON_HIND = ["XOOX", "XSSX", "XXXX"]
DRAGON_HORN = ["X..", "XB.", ".XB"]
DRAGON_TAIL = ["...XTX",
               "...XTX",
               "...XO.",
               "..XOX.",
               "XXOX..",
               "OOX...",
               "XX...."]
DRAGON_WINGS = {
    'normal': (["X...", "XX..", "XGX.", "XGGX", "XGTX", "XGTX", ".XGX", "..XX"], 0),
    'up':     (["X...", "XX..", "XGX.", "XGGX", "XGTX", ".XGX", "..XX"], -20),
    'down':   (["....", "....", "....", "...X", "..XG", "..XG", "..XG", "...X"], 10),
    'spiky':  (["X...", "XX..", "XGX.", "XGGX", "XGTX", "XGTX", "XGTX", "XXXX"], -10),
}

# ---------------------------------------------------------------- stade 3 : dragon céleste
# Forme finale : immenses ailes, couronne de cornes, ventre écaillé, griffes,
# étoile flottante et longue queue. Elle déborde du cadre de 200 x 200.
CEL_WINGS = {
    'normal': (["X......", "XX.....", "XGX....", "XGGX...", "XGGGX..", "XTGGGX.",
                "XTTGGGX", ".XTTGGX", ".XTTXGX", "..XX.XX", "......X"], 0),
    'up':     (["w......", "X......", "XX.....", "XGX....", "XGGX...", "XGGGX..", "XTGGGX.",
                "XTTGGGX", ".XTTGGX", ".XTTXGX", "..XX.XX", "......X"], -30),
    'down':   ([".......", ".......", ".......", ".......", "....XX.", "...XGGX",
                "...XGTX", "...XGTX", "....XGX", ".....XX", "......X"], 0),
    'spiky':  (["w.w....", "X.X....", "XXXX...", "XGGGX..", "XGGGGX.", "XTGGGGX",
                "XTTGGGX", "XTTTGGX", ".XTTXGX", "..XX.XX", "......X"], -20),
}
CEL_HORN = ["X....", "XB...", "XBX..", ".XBX.", "..XBX", "...XB"]
CEL_HORN_SMALL = [".X", "XB"]
CEL_STAR = ["..y..", ".yYy.", "yYYYy", ".yYy.", "..y.."]
CEL_BODY = ["XOOBBBBBBOOX",
            "XOOSSSSSSOOX",
            "XOOBBBBBBOOX",
            ".XXXXXXXXXX."]
CEL_HIND = ["XOOX", "XSSX", "wXXw"]
CEL_TAIL = ["...XTTX",
            "...XTTX",
            "....XX.",
            "....XO.",
            "...XOX.",
            "..XOX..",
            "XXOX...",
            "OOX....",
            "XX....."]

EYES = {
    'happy':     ["......", "..##..", ".#..#.", "#....#", "......", "......"],
    'closed':    ["......", "......", "#....#", ".#..#.", "..##..", "......"],
    'sleepy':    ["......", "......", "######", "......", "......", "......"],
    'heart':     [".r..r.", "rrrrrr", "rrrrrr", ".rrrr.", "..rr..", "......"],
    'dizzy':     ["#....#", ".#..#.", "..##..", "..##..", ".#..#.", "#....#"],
    'surprised': [".wwww.", "wwwwww", "ww##ww", "ww##ww", "wwwwww", ".wwww."],
    'ko':        ["##..##", ".####.", "..##..", ".####.", "##..##", "......"],
}
MOUTHS = {
    'smile': ["#......#", ".######."],
    'open':  ["########", "#mmmmmm#", ".######."],
    'o':     ["...##...", "..#..#..", "...##..."],
    'flat':  ["........", "..####.."],
    'wavy':  [".#..#..#", "#.##.##."],
    'think': ["........", ".....##.", "..###..."],
    'ko':    ["########", ".....#p#", "......p."],
}

# Jambes tendues devant lui quand il s'assoit (quota Claude bas).
SIT_LEG = ["XXXX", "XSOO", "XXXX"]
EY = 75

# ---------------------------------------------------------------- KO : couché sur le dos
# Quota Claude vide : il est étalé sur le dos, ventre en l'air, pattes vers le
# ciel, la tête posée de profil (museau à gauche), un œil en croix et la langue
# qui pend. Un sprite à part pour chaque stade, affiché à la place du normal.
KO_HEAD = ["....XXXXXX..",
           "..XXOLLOOOX.",
           "XOLOOOOOOOOX",
           "XOOOOOOOOOOX",
           "XOOOOOOOOOOX",
           "XSOOOOOOOOSX",
           ".XSSOOOOSSX.",
           "..XXXXXXXX.."]
KO_EYE = ["##..##", ".####.", "..##..", ".####.", "##..##"]
KO_MOUTH = ["########",
            "pmmmmmm#",
            "ppp####.",
            "pp......",
            "pp......",
            ".p......"]
KO_GILLS = ["T...T...T",
            ".G..G..G.",
            "..G.G.G..",
            "...GGG..."]
KO_LEG = ["X.X..",
          "XSSX.",
          ".XOX.",
          ".XOOX",
          "..XOX",
          "..XOX"]
KO_LEG_CLAW = ["w.w..",
               "XwwX.",
               ".XOX.",
               ".XOOX",
               "..XOX",
               "..XOX"]
AXO_KO_BODY = ["XXXXXXXXX",
               "BBBBBBBBX",
               "BBBBBBBOX",
               "OOOOOOOSX",
               "XXXXXXXX."]
AXO_KO_TAIL = ["XXX....",
               "OOOXXX.",
               "OOOTTTX",
               "XXXXXXX"]
DRAGON_KO_BODY = ["XXXXXXXXXX",
                  "BBBBBBBBBX",
                  "BBBBBBBBOX",
                  "OOOOOOOOSX",
                  "XXXXXXXXX."]
CEL_KO_BODY = ["XXXXXXXXXX",
               "BBBBBBBBBX",
               "SSSSSSSSOX",
               "BBBBBBBBOX",
               "OOOOOOOOSX",
               "XXXXXXXXX."]
DRAGON_KO_TAIL = [".....XTX",
                  "XXX..XTX",
                  "OOOXXOX.",
                  "XXXOOX..",
                  "..XXX..."]
KO_HORN = ["....X", "...XB", "..XB.", ".XB..", "XB..."]
KO_HORN_SMALL = [".X", "XB"]
# aile molle qui dépasse de derrière le ventre, retombée sur le côté
DRAGON_KO_WING = ["XX......",
                  "XGX.....",
                  "XGGXX...",
                  "XGTGGXX.",
                  ".XGTTGGX",
                  ".XGXGXGX",
                  "..X.X.XX"]
CEL_KO_WING = ["w.........",
               "XX........",
               "XGX.......",
               "XGGXX.....",
               "XGTGGXX...",
               ".XGTTGGXX.",
               ".XGTTTGGGX",
               "..XGXGXGXX",
               "...X.X.X.w"]


# ---------------------------------------------------------------- accessoires (module activity)
# Moitié gauche, dessinée en demi-pixels (5 px) ; la moitié droite est en miroir.
# Lunettes quand tu codes depuis un moment : autour des yeux (x 30 à 100).
GLASSES = ["...########...",
           "...#w.....#...",
           "####......####",
           "...#......#...",
           "...#......#...",
           "...#......#...",
           "...########..."]
# Casque quand tu écoutes de la musique : arceau au-dessus de la tête (x 20 à 100).
HEADPHONES = ["..........######",
              "......####......",
              "....##..........",
              "..##............",
              ".##.............",
              ".#..............",
              ".#..............",
              ".#..............",
              ".#..............",
              "####............",
              "#rr#............",
              "#wr#............",
              "#rr#............",
              "#rr#............",
              "#rr#............",
              "####............"]


def halves(pattern, x, y, cls):
    w = max(len(r) for r in pattern)
    pat = [r.ljust(w, '.') for r in pattern]
    return f'<g class="gear {cls}">{rects(pat, x, y, 5)}{rects(mirror(pat), 100, y, 5)}</g>'


def ko_sprite(n, body, tail, legs, wing_x=0, claws=False, horns=False, wing=None, dx=-15, ground=185):
    """Un stade couché sur le dos. dx recentre l'ensemble (plus long que haut)."""
    leg = KO_LEG_CLAW if claws else KO_LEG
    top = ground - len(body) * 10          # dessus du ventre
    bx = 100 + dx
    back = ''
    if wing:
        back += f'<g class="ko-wing">{rects(wing, bx + wing_x, top - len(wing) * 10 + 10)}</g>'
    back += f'<g class="ko-tail">{rects(tail, bx + len(body[0]) * 10 - 10, ground - len(tail) * 10)}</g>'
    torso = (f'<g class="ko-torso"><g class="ko-legs">'
             + ''.join(f'<g class="ko-leg">{rects(leg if i == 0 else mirror(leg), bx + x, top - len(leg) * 10 + 10)}</g>'
                       for i, x in enumerate(legs))
             + f'</g>{rects(body, bx, top)}</g>')
    hx, hy = dx, ground - 80
    head = '<g class="ko-head">'
    if horns:
        head += rects(KO_HORN, hx + 80, hy - 40) + rects(KO_HORN_SMALL, hx + 60, hy - 10)
    else:
        head += f'<g class="ko-gills">{rects(KO_GILLS, hx + 35, hy - 30)}</g>'
    head += rects(KO_HEAD, hx, hy)
    head += (f'<g class="ko-eye">{rects(KO_EYE, hx + 25, hy + 20, 5)}</g>'
             f'<rect class="c-p" x="{hx + 45}" y="{hy + 45}" width="10" height="5"/>'
             f'<g class="ko-mouth">{rects(KO_MOUTH, hx - 5, hy + 45, 5)}</g></g>')
    return stage(n, back, torso, head)


def stage(n, *parts):
    return f'<g class="stage stage-{n}">' + ''.join(parts) + '</g>'


def build():
    svg = []
    aura = [(10, 10), (178, 6), (4, 150), (186, 146), (40, -8), (150, -10),
            (-20, 60), (214, 70), (-10, 120), (206, 20), (60, -40), (140, -44)]
    svg.append('<g class="aura">' + ''.join(
        f'<rect class="c-yy" x="{x}" y="{y}" width="6" height="6" style="animation-delay:{i * 0.35:.2f}s"/>'
        for i, (x, y) in enumerate(aura)) + '</g>')
    svg.append('<rect class="ground-shadow" x="40" y="186" width="120" height="6" fill="#000" opacity="0.18"/>')

    # ce qui passe derrière la tête
    svg += [
        stage(1, f'<g class="tail">{rects(AXO_TAIL, 150, 140)}</g>',
              f'<g class="foot side-left">{rects(["XSX"], 60, 170)}</g><g class="foot side-right">{rects(["XSX"], 110, 170)}</g>',
              f'<g class="body">{rects(AXO_BODY, 50, 130)}</g>',
              f'<g class="arm">{rects(["S", "X"], 40, 140)}</g><g class="arm">{rects(["S", "X"], 150, 131)}</g>',
              moodparts(AXO_GILLS, 0, 190, 30, 'gills')),
        stage(2, moodparts(DRAGON_WINGS, 0, 190, 20, 'wing'),
              f'<g class="tail">{rects(DRAGON_TAIL, 150, 110)}</g>',
              pair(DRAGON_HIND, 20, 170, 160, 'foot'),
              f'<g class="body">{rects(DRAGON_BODY, 40, 130)}</g>',
              f'<g class="arm">{rects(["S", "X"], 30, 140)}</g><g class="arm">{rects(["S", "X"], 160, 140)}</g>'),
        stage(3, moodparts(CEL_WINGS, -30, 220, -10, 'wing'),
              f'<g class="tail">{rects(CEL_TAIL, 150, 90)}</g>',
              pair(CEL_HIND, 20, 170, 160, 'foot'),
              f'<g class="body">{rects(CEL_BODY, 40, 130)}</g>',
              f'<g class="arm">{rects(["S", "w"], 30, 140)}</g><g class="arm">{rects(["S", "w"], 160, 140)}</g>'),
    ]
    # jambes quand il est assis, à côté du corps de chaque stade
    svg += [
        stage(1, pair(SIT_LEG, 10, 180, 150, 'sit-legs')),
        stage(2, pair(SIT_LEG, 0, 190, 150, 'sit-legs')),
        stage(3, pair(SIT_LEG, 0, 190, 150, 'sit-legs')),
    ]
    svg.append(f'<g class="head">{rects(HEAD, 30, 30)}</g>')
    # ce qui passe devant la tête
    svg.append(stage(2, pair(DRAGON_HORN, 40, 160, 0, 'horn')))
    svg.append(stage(3, pair(CEL_HORN, 20, 180, -30, 'horn'), pair(CEL_HORN_SMALL, 70, 130, 10, 'horn'),
                     f'<g class="star">{rects(CEL_STAR, 80, -48, 8)}</g>'))
    svg.append(halves(HEADPHONES, 20, 15, 'gear-headphones'))
    svg.append('<g class="ko-sprite">'
               + ko_sprite(1, AXO_KO_BODY, AXO_KO_TAIL, [10, 50])
               + ko_sprite(2, DRAGON_KO_BODY, DRAGON_KO_TAIL, [10, 50], wing_x=85, claws=True, horns=True, wing=DRAGON_KO_WING)
               + ko_sprite(3, CEL_KO_BODY, DRAGON_KO_TAIL, [10, 50], wing_x=85, claws=True, horns=True, wing=CEL_KO_WING, dx=-28)
               + '</g>')
    svg.append(f'<g class="spark">{rects([".y.", "yYy", ".y."], 90, 12, 6.67)}</g>')
    svg.append('<rect class="cheek c-p" x="40" y="100" width="10" height="5"/>'
               '<rect class="cheek c-p" x="150" y="100" width="10" height="5"/>')

    def openeye(side, x):
        return (f'<g class="eye-lid" id="lid-{side}"><rect class="c-k" x="{x}" y="{EY}" width="20" height="25"/>'
                f'<rect class="c-w" x="{x + 10}" y="{EY + 5}" width="5" height="5"/></g>')
    svg.append('<g class="eyes eyes-open">' + openeye('left', 55) + openeye('right', 125) + '</g>')
    for n, p in EYES.items():
        svg.append(f'<g class="eyes eyes-{n}"><g class="eye">{rects(p, 50, EY, 5)}</g>'
                   f'<g class="eye">{rects(p, 120, EY, 5)}</g></g>')
    for n, p in MOUTHS.items():
        svg.append(f'<g class="mouth mouth-{n}">' + rects(p, 80, 105, 5) + '</g>')
    svg.append(halves(GLASSES, 30, 70, 'gear-glasses'))
    inner = '\n            '.join(svg)
    return (f'<svg id="creature" viewBox="0 0 200 200" shape-rendering="crispEdges" '
            f'xmlns="http://www.w3.org/2000/svg">\n            {inner}\n          </svg>')


path = sys.argv[1]
html = open(path, encoding='utf-8').read()
html = re.sub(r'<svg id="creature".*?</svg>', lambda _: build(), html, flags=re.S)
open(path, 'w', encoding='utf-8').write(html)
