#!/usr/bin/env python3
"""Fail if any image carries GPS or camera metadata."""
import glob, sys
from PIL import Image
bad = []
for f in glob.glob('assets/**/*.*', recursive=True):
    if not f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')): continue
    try: ex = Image.open(f).getexif()
    except Exception: continue
    if 34853 in ex or 271 in ex or 272 in ex: bad.append(f)  # GPSInfo, Make, Model
print('\n'.join(bad) or 'exif: clean'); sys.exit(1 if bad else 0)
