#!/usr/bin/env python3
"""Run before each deploy. Ensures every page has the PWA tags + command palette,
and re-stamps a version on local CSS/JS so browsers never serve a stale cached copy.
Idempotent. Usage: python3 sync/deploy_prep.py"""
import glob, os, re, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VER = str(int(time.time()))
HEAD = ('<link rel="manifest" href="manifest.webmanifest">\n'
        '<meta name="theme-color" content="#07070d">\n'
        '<link rel="apple-touch-icon" href="assets/img/willpower-bird.png">')
SCRIPTS = ('<script src="assets/js/palette.js"></script>\n'
           '<script src="assets/js/pwa.js"></script>')

for f in glob.glob(os.path.join(ROOT, '*.html')):
    s = open(f).read()
    # 1. PWA head tags (after the icon link), once
    if 'manifest.webmanifest' not in s:
        s = re.sub(r'(<link rel="icon"[^>]*>)', r'\1\n' + HEAD, s, count=1)
    # 2. palette + pwa scripts before </body>, once
    if 'assets/js/palette.js' not in s:
        s = s.replace('</body>', SCRIPTS + '\n</body>', 1)
    # 3. cache-bust local css/js (strip any existing ?v= then add fresh)
    s = re.sub(r'(href|src)="(assets/(?:css|js)/[^"?]+\.(?:css|js))(\?v=[^"]*)?"', r'\1="\2?v=' + VER + '"', s)
    open(f, 'w').write(s)

print('deploy_prep: version', VER, 'applied to', len(glob.glob(os.path.join(ROOT, '*.html'))), 'pages')
