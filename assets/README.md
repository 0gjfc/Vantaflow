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

## etaHEN logo — `assets/etahen/etahen-logo.jpg`

The official etaHEN icon (PS5), used unaltered in the HEN panel and the top-bar badge when Settings → Console is PS5.

## GoldHEN logo — `assets/goldhen/goldhen-logo.png`

The official GoldHEN logo, used in the GoldHEN panel and the top-bar badge. It came as a JPEG on white; the white was converted to transparency (colour-to-alpha, so the soft shadow keeps its edge) and the empty margin trimmed. As the owner specified, a gold star sits on each side of the words, drawn in the logo's own face (#E5D304) and extrusion (#B29800) colours. The lettering is unchanged. To replace it, overwrite this file with another transparent PNG.
