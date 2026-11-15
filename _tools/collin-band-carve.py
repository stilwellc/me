# source drawing: https://en.wikipedia.org/wiki/File:Snoopy_Peanuts.png  (run: carve.py Snoopy_Peanuts.png ../assets/collin-band.png 2 0.72; needs Pillow)
# carve.py <src rgba png> <out png> [dilate] [crop_frac] : found line drawing -> two-tone band carve
# (figure white, lines + ground black), mirrored to face right; the nose gets a white rim so it shows on the stripes.
import sys
from PIL import Image, ImageFilter, ImageOps, ImageChops, ImageDraw
src, out = sys.argv[1], sys.argv[2]; dil = int(sys.argv[3]) if len(sys.argv) > 3 else 0; cropf = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
im = ImageOps.mirror(Image.open(src).convert('RGBA'))
K = 4; im = im.resize((im.width * K, im.height * K), Image.LANCZOS)
a = im.split()[3]; lum = Image.alpha_composite(Image.new('RGBA', im.size, (255, 255, 255, 255)), im).convert('L')
sil = a.point(lambda v: 255 if v > 110 else 0).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
ink = lum.point(lambda v: 255 if v > 205 else 0)
if dil: ink = ink.filter(ImageFilter.MinFilter(2 * dil + 1))
pad_t, pad_s = 40, 60
W, H = im.width + 2 * pad_s, im.height + pad_t
S = Image.new('L', (W, H), 0); S.paste(sil, (pad_s, pad_t)); I = Image.new('L', (W, H), 255); I.paste(ink, (pad_s, pad_t))
# nose rim: grow the silhouette around the nose only
box = (pad_s + 960, pad_t + 380, W, pad_t + 620)
m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).rectangle(box, fill=255)
grown = S.filter(ImageFilter.MaxFilter(45))
S = Image.composite(grown, S, m)
fig = ImageChops.multiply(S, I)
if cropf < 1: fig = fig.crop((0, 0, W, int(H * cropf)))
fig.save(out); print(fig.size)
