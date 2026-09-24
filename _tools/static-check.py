#!/usr/bin/env python3
"""Static laws for the site. Run from the repo root; exits non-zero on any violation."""
import base64, glob, hashlib, re, sys, subprocess
from pathlib import Path

fail = []
html = sorted(glob.glob('*.html'))
text_files = html + ['site.js', 'site.css'] + glob.glob('assets/*.js') + glob.glob('assets/js/*.js')

# 1. no email address, no house number, no AI-tool credit in visible site files
for f in text_files:
    s = Path(f).read_text(encoding='utf-8')
    if re.search(r'mailto:|[\w.+-]+@(?:gmail|nyu|collin)\.\w+', s): fail.append(f'{f}: email address')
    if re.search(r'\b1122\b', s): fail.append(f'{f}: house number 1122')
    if re.search(r'built with claude|made with claude', s, re.I): fail.append(f'{f}: AI tool credit')

# 2. CSS braces balance (a stray brace once disabled the phone footer)
css = Path('site.css').read_text()
if css.count('{') != css.count('}'): fail.append('site.css: unbalanced braces')

# 3. no inline event handlers; inline <script> only if its hash is in the page CSP
for f in html:
    s = Path(f).read_text(encoding='utf-8')
    if re.search(r'\son[a-z]+\s*=\s*"', s): fail.append(f'{f}: inline on* handler')
    csp = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', s)
    allowed = csp.group(1) if csp else ''
    for attrs, body in re.findall(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', s, re.S):
        if not body.strip() or 'application/ld+json' in attrs: continue
        if 'speculationrules' in attrs and "'sha256-" in allowed: pass
        h = "'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'"
        if h not in allowed: fail.append(f'{f}: inline script not allowed by CSP ({h[:24]}...)')

# 4. every local href/src resolves to a file
for f in html:
    s = Path(f).read_text(encoding='utf-8')
    for ref in re.findall(r'(?:href|src)="([^"#?]+)', s):
        if re.match(r'(https?:|data:|blob:|javascript:|/)', ref) or ref in ('', './'): continue
        if not Path(ref).exists(): fail.append(f'{f}: missing {ref}')

# 5. one cache-busting version across pages
vs = set()
for f in html:
    vs |= set(re.findall(r'(?:site\.(?:css|js)|engine\.js)\?v=(\w+)', Path(f).read_text()))
if len(vs) > 1: fail.append(f'?v= differs across pages: {sorted(vs)}')

# 6. JS syntax
for f in ['site.js'] + glob.glob('assets/*.js') + glob.glob('assets/js/*.js'):
    if subprocess.run(['node', '--check', f], capture_output=True).returncode: fail.append(f'{f}: syntax error')

print('\n'.join(fail) or 'static checks: ok')
sys.exit(1 if fail else 0)
