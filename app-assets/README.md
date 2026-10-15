# App icon and splash

`icon.html` (1024×1024) and `splash.html` (2732×2732) are drawn in HTML/SVG; the unicorn is
`noto-unicorn.svg` (Noto Emoji, Apache 2.0, see `LICENSE-ASSETS`). To regenerate (needs Playwright):

```bash
node app-assets/render.mjs                 # writes icon-rgba.png and splash-rgba.png here
# App Store icons must have no alpha channel: convert to RGB, then copy into
# ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png and the three Splash.imageset files.
```
