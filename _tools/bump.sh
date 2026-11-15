#!/bin/sh
# stamp every page's site.css, site.js and every assets/*.js script tag (engine.js, the
# page scripts, wave3d.js) with one cache-busting version
v=${1:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}
sed -i.bak -E "s/((site\.(css|js)|assets\/[A-Za-z0-9_-]+\.js)\?v=)[A-Za-z0-9]+/\1$v/g" *.html && rm -f *.html.bak
echo "v=$v"
