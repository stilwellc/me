import math, random
INK='#161616'; TAN='#C9A85F'; TAN2='#9F7C3A'; TEAL='#4F8A91'; TEAL_D='#2A555B'; TEAL_L='#86B5BA'; RED='#B3261E'; RED_D='#6E1410'; TOOTH='#F6F3EC'; IRIS='#D9261C'
W, H = 200, 250
cx, cy = 100, 132
random.seed(7)
def P(x, y): return '%.1f %.1f' % (x, y)
def mane():
    pts = []
    n = 120
    for i in range(n):
        t = 2 * math.pi * i / n - math.pi / 2
        s, c = math.sin(t), math.cos(t)
        rx = 97 * (1 - 0.55 * max(0.0, -s) ** 1.4)      # narrow toward the crown, hidden behind the crest
        ry = 112 if s < 0 else 116
        shag = random.uniform(0, 11) if abs(s) < 0.985 else 0
        # strands droop: push the shag a little downward on the sides
        x = cx + (rx + shag) * c; y = cy + (ry + shag * 0.6) * s + (shag * 0.8 if abs(c) > 0.5 else 0)
        pts.append((x, y))
    return 'M' + ' L'.join(P(*p) for p in pts) + 'Z'
def strands():
    out = []
    for i in range(46):
        t = 2 * math.pi * i / 46 - math.pi / 2 + 0.05
        s, c = math.sin(t), math.cos(t)
        if s < -0.55: continue                                  # the crest covers the top
        rx = 96 * (1 - 0.42 * max(0.0, -s) ** 1.6); ry = 118
        r0 = random.uniform(0.80, 0.9)
        x0, y0 = cx + rx * c * r0, cy + ry * s * r0
        dx, dy = 6 * c, 10 + 4 * max(0, s)
        out.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>' % (x0, y0, x0 + dx, y0 + dy))
    return '<g stroke="%s" stroke-width="2" stroke-linecap="round" opacity="0.85">%s</g>' % (TAN2, ''.join(out))
def crest_hair():
    out = []
    for i in range(11):
        k = (i - 5) / 5.0
        x0, y0 = 100 + 3 * k, 24
        x1, y1 = 100 + 34 * k, 70 - 10 * abs(k)
        out.append('<path d="M%.1f %.1fQ%.1f %.1f %.1f %.1f" fill="none"/>' % (x0, y0, (x0 + x1) / 2 + 4 * k, (y0 + y1) / 2, x1, y1))
    return '<g stroke="%s" stroke-width="2.3" stroke-linecap="round">%s</g>' % (TEAL_D, ''.join(out))
svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d">' % (W, H)]; A = svg.append
A('<circle cx="12" cy="126" r="11" fill="%s" stroke="%s" stroke-width="3"/><circle cx="188" cy="126" r="11" fill="%s" stroke="%s" stroke-width="3"/>' % (TAN, INK, TAN, INK))
A('<circle cx="12" cy="126" r="5" fill="%s"/><circle cx="188" cy="126" r="5" fill="%s"/>' % (TAN2, TAN2))
A('<path d="%s" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/>' % (mane(), TAN, INK))
A(strands())
# face plate: narrow crest, wide cheeks, chin
A('<path d="M100 12C80 12 68 30 62 58C40 74 22 98 24 128C26 174 50 220 100 242C150 220 174 174 176 128C178 98 160 74 138 58C132 30 120 12 100 12Z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/>' % (TEAL, INK))
# crest, lighter, with combed hair
A('<path d="M100 15C84 17 72 40 64 74C88 64 112 64 136 74C128 40 116 17 100 15Z" fill="%s"/>' % TEAL_L)
A(crest_hair())
# brow: heavy, a V over the nose
A('<path d="M28 110C54 82 88 84 100 98C112 84 146 82 172 110C146 104 112 102 100 114C88 102 54 104 28 110Z" fill="%s"/>' % TEAL_D)
A('<path d="M40 100C60 88 86 90 100 100C114 90 140 88 160 100" fill="none" stroke="%s" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>' % TEAL_L)
# sockets, eyes
A('<ellipse cx="68" cy="120" rx="26" ry="17" fill="%s"/><ellipse cx="132" cy="120" rx="26" ry="17" fill="%s"/>' % (TEAL_D, TEAL_D))
A('<ellipse cx="50" cy="156" rx="15" ry="22" fill="%s" opacity="0.9"/><ellipse cx="150" cy="156" rx="15" ry="22" fill="%s" opacity="0.9"/>' % (TEAL_L, TEAL_L))
for ex in (68, 132):
    A('<ellipse cx="%d" cy="121" rx="12" ry="8.5" fill="%s" stroke="%s" stroke-width="1.6"/>' % (ex, TOOTH, INK))
    A('<circle cx="%d" cy="121.5" r="5.6" fill="%s"/><circle cx="%d" cy="121.5" r="2.7" fill="%s"/><circle cx="%.1f" cy="119.5" r="1.3" fill="#fff"/>' % (ex, IRIS, ex, INK, ex - 1.8))
    A('<path d="M%d 113C%d 108 %d 108 %d 113" fill="none" stroke="%s" stroke-width="3.2" stroke-linecap="round"/>' % (ex - 13, ex - 6, ex + 6, ex + 13, INK))
# nose, small and dark between the sockets
A('<path d="M94 106L106 106L110 126L120 128L124 146L76 146L80 128L90 126Z" fill="%s" stroke="%s" stroke-width="1.4" stroke-linejoin="round"/>' % (TEAL_D, INK))
A('<ellipse cx="90" cy="140" rx="5" ry="3" fill="%s"/><ellipse cx="110" cy="140" rx="5" ry="3" fill="%s"/>' % (INK, INK))
# lip band, then the mouth
A('<path d="M30 152C58 140 142 140 170 152C178 196 142 238 100 242C58 238 22 196 30 152Z" fill="%s" stroke="%s" stroke-width="2.8" stroke-linejoin="round"/>' % (TEAL_L, INK))
A('<path d="M40 160C66 148 134 148 160 160C164 196 136 228 100 232C64 228 36 196 40 160Z" fill="%s" stroke="%s" stroke-width="2.8" stroke-linejoin="round"/>' % (RED, INK))
A('<path d="M66 184C88 176 112 176 134 184C132 208 118 218 100 218C82 218 68 208 66 184Z" fill="%s"/>' % RED_D)
A('<g fill="%s" stroke="%s" stroke-width="1.4" stroke-linejoin="round">' % (TOOTH, INK))
A('<path d="M55 159L63 190L71 159Z"/><path d="M129 159L137 190L145 159Z"/>')
for x in (80, 90, 100, 110): A('<rect x="%d" y="157" width="8" height="9" rx="1.8"/>' % x)
A('<path d="M52 224L60 196L68 224Z"/><path d="M132 224L140 196L148 224Z"/>')
for x in (82, 91, 100, 109): A('<rect x="%d" y="217" width="6.5" height="7" rx="1.5"/>' % x)
A('</g>')
A('</svg>')
open('/private/tmp/claude-501/-Users-collin/d0228fab-dcad-4e14-901d-16b88e6ce15e/scratchpad/ape-draw.svg', 'w').write(''.join(svg)); print('ok', sum(len(s) for s in svg))
