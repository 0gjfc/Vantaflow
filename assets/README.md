# Local assets

VantaFlow works without any files here: covers and icons are generated as SVG placeholders.
Add real images when you have them.

## Game box art — `assets/covers/`

1. Save the box art as PNG or JPG, ideally 550 × 698 px (Itemzflow's cover size), named by Title ID, for example `assets/covers/CUSA31027.png`.
2. Add a `cover` field to the game in `js/data.js`:

   ```js
   { id: 'CUSA31027', title: 'Ashen Frontier', cover: 'assets/covers/CUSA31027.png', ... }
   ```

Real box art is shown as-is. The blue "PS4" band is only drawn on generated placeholders.

For an application or homebrew icon, use a square image (512 × 512) and an `iconImage` field instead.

## GoldHEN logo — `assets/goldhen/goldhen-logo.png`

Put the official GoldHEN logo (PNG with transparency) at exactly this path. It is detected on load and used in the GoldHEN panel and the top-bar badge. VantaFlow does not redraw or restyle the logo.
