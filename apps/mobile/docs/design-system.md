# Migo design system v3

## Visual language

Use a photography-first “Gulf dusk” language: bold display typography, quiet surfaces, and sunset-to-night gradients reserved for hero and primary-action moments. Keep variance 6, motion 4, and density 4; avoid turning every content section into the same card grid.

## Color and surface tokens

- Primary/action: `#D61F63`; dark `#A8134B`; soft `#FDE7EF`.
- Accent/highlight: `#FFB020`; soft `#FFF4DC`; use ink text on amber.
- Official/trust: `#0E7C86`; soft `#E1F4F5`. Success remains `#12B76A`.
- Preserve warning `#F79009` / `#FFF4E5`, danger `#E5484D` / `#FDECEC`, and WhatsApp `#25D366`.
- Ink/text: `#140F2E`; secondary `#4B4666`; muted `#6E6A86`; inverse `#FFFFFF`.
- Surfaces: background `#F7F5FB`, white `#FFFFFF`, alternate `#F0EDF7`; borders `#E7E3F0` and `#D3CDE3`.
- Overlay: `rgba(20,15,46,0.55)`.
- Dusk gradient: `#241654 → #7A1E6C → #D61F63 → #FF8A3D`; CTA gradient: `#E0266B → #B8155A`; image overlay ends at `rgba(20,15,46,0.88)`.

## Shape, elevation, and type

- Radius scale: 8, 14, 20, 28, and pill. Cards use 20; sheets and hero panels use 28.
- Shadows use tint `#2A1B5E`: card opacity .08/radius 16/y6, float .16/radius 28/y12, and hover .14/radius 24/y10.
- On web, use Bricolage Grotesque for display and Plus Jakarta Sans with system fallbacks for body text. Arabic web text uses IBM Plex Sans Arabic. Do not assign unloaded display fonts on native.
- Type scale: display 40/44 weight 800; h1 30/36; h2 22/28; h3 17/22; body 16/24; caption and label 13. Use tabular numerals for prices.

## Motion and responsive layout

- Motion durations: press 120ms, fast 160ms, base 220ms; never exceed 300ms. Respect reduced-motion settings and do not autoplay loops.
- Breakpoints: phone `<768`, tablet `768–1023`, desktop `≥1024`. Gutters are 20/32/48px, with a centered 1240px content maximum. Use `useBreakpoint.columns(minItemWidth, gap)` for responsive grids.
- Use shared `Container`, `SectionHeader`, `DateBadge`, and `EventCard` for consistent spacing and event metadata.
- Event cards use 16:10 photography, a localized date badge, accessible 44×44 save/share controls, category, two-line title, one-line venue/city, price, and official provenance.
- Desktop cards lift 2px with the hover shadow unless reduced motion is enabled. Keep controls keyboard-operable with visible focus outlines; inputs and textareas retain their normal focus treatment.
- Arabic layouts set right-to-left direction and use concise localized English and Arabic copy. Preserve horizontal carousel snapping and fit the location control at 320px.
