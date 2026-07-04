# Rovrum — Brand & Social Kit

> *Aye, that Rotherham. Said proper.*
> Everything you need to set up the Rovrum social accounts consistently.

---

## 1. Voice

Warm, cheeky, unmistakably **local** — but still credible. The name *Rovrum* is how a Rotherham accent says "Rotherham"; the brand is in on the joke and proud of it. Lean on light dialect (*aye, tha', an', reyt, faffing*) as seasoning, not as a full phonetic rewrite. Keep the layout/visuals clean so the voice reads as confident, not gimmicky.

- **Do:** "Everything Rovrum, in one spot." / "We'll give tha' a shout."
- **Don't:** write whole paragraphs in heavy phonetics, or mock the accent. It's *by us, for us*.

---

## 2. Colour palette

| Name | Hex | Use |
|---|---|---|
| **Ink** | `#141518` | Primary dark ground, avatar background, body text on light |
| **Paper** | `#f7f5f2` | Light ground (warm off-white — *not* pure white) |
| **Rovrum Red** | `#b23a2e` | The one accent — the full stop, tagline, links, hearts. Use sparingly |
| **Stone** | `#8a8578` | Muted labels, eyebrows, secondary text |
| **Slate** | `#2a2c31` | Cards, footers, secondary surfaces |
| **Line** | `#e2ddd4` | Hairline borders on light ground |

**Rule:** one accent, used once per view. If red starts to feel loud, it's overused.

---

## 3. Typography

Served via **[Bunny Fonts](https://fonts.bunny.net)** (privacy-first, GDPR-friendly, Google-Fonts-compatible). Embed:

```html
<link rel="preconnect" href="https://fonts.bunny.net" crossorigin>
<link rel="stylesheet" href="https://fonts.bunny.net/css?family=bitter:600,700,700i|inter:400,600">
```

- **Display / wordmark / headings:** **Bitter** (Bunny Fonts) — a sturdy, screen-friendly slab-ish serif. Warm and contemporary rather than traditional/newspapery; suits a broad local hub. Bold (700). Fallback: Georgia, serif.
- **Body / UI:** **Inter** (Bunny Fonts) — clean neutral humanist sans (400 / 600). Fallback: system-ui stack.
- **Labels / eyebrows:** Inter, UPPERCASE, letter-spaced ~0.2em, in Stone.
- **Tagline:** Bitter *italic* (700i), in Rovrum Red.

> The **logo files are outlined to vector paths** (`*-outlined.svg`) so they render identically everywhere with no font dependency. The website loads Bitter/Inter live from Bunny so page text matches the logos.

---

## 4. Logo assets

All in `brand/` (source SVG) and `brand/png/` (ready-to-upload).

All logo SVGs are **outlined to vector paths** (Bitter Bold baked in as shapes) — no font needs to be installed to render them.

| File | What it is |
|---|---|
| `rovrum-avatar-outlined.svg` / `png/rovrum-avatar-1000.png` / `-400.png` | Square profile avatar — R. monogram + red dot on ink. Use everywhere as the profile picture. |
| `rovrum-logo-light-outlined.svg` / `png/rovrum-logo-light-1800.png` | Wordmark for **light** backgrounds (ink text) |
| `rovrum-logo-dark-outlined.svg` / `png/rovrum-logo-dark-1800.png` | Wordmark for **dark** backgrounds (paper text) |
| `rovrum-cover-outlined.svg` / `png/rovrum-cover-1500x500.png` | Master banner/cover (X / Twitter header) |
| `png/rovrum-cover-facebook-1640x856.png` | Facebook Page cover |
| `rovrum-cover-linkedin-outlined.svg` / `png/rovrum-cover-linkedin-1128x376.png` | LinkedIn-ratio cover |

Outlined SVGs are the source of truth — re-render any size with `rsvg-convert -w <width> file.svg -o out.png` (no font dependency). The `fonts/` folder holds the Bitter TTF/woff2 used to generate them, kept for regenerating assets later.

---

## 5. Per-platform image specs

Upload the **avatar** (square) and a **cover** to each. Platforms crop avatars to a circle, so the monogram is centred with room to spare.

| Platform | Avatar | Cover / banner | Notes |
|---|---|---|---|
| **X** | 400×400 (min), square | **1500×500** | Use `rovrum-cover-1500x500.png` as-is. Avatar shown as circle. |
| **Facebook** (Page) | 320×320+ | 1640×856 (desktop) / safe 1080×608 | Re-render cover at 1640×856 if needed; keep text in centre. |
| **Instagram** | 320×320 | *(no cover)* | Circle avatar only. |
| **LinkedIn** (Company) | 300×300 | **1128×376** | Use `rovrum-cover-linkedin-1128x376.png`. |
| **TikTok** | 200×200+ | *(no cover)* | Circle avatar only. Keep monogram bold — shown small. |

To make any custom-size cover from the master:
`rsvg-convert -w <W> -h <H> rovrum-cover-outlined.svg -o png/rovrum-cover-<W>x<H>.png`

---

## 6. Profile descriptions (tailored per platform)

Handles registered: **X** @rovrumtown · **FB/IG/TikTok** rovrum.town · **LinkedIn** rovrumtown.

### X / Twitter  *(bio ≤ 160 chars)*
> Everything Rovrum, in one spot. 📍 Local news, sport, events & jobs from Rotherham — so tha' never has to go lookin'. Launching soon 👇

`Location: Rotherham, UK` · `Website: rovrum.town`

### Facebook  *(Page — short intro + longer About)*
**Intro:** Everything Rovrum, in one spot. Local news, sport, events & jobs from Rotherham.

**About:** Rovrum rounds up everything worth knowing about in Rotherham — the news, sport, events an' jobs from right across the town, plus what's on and where to eat — and brings it together in one place. Aye, that Rotherham. Said proper. Launching soon at rovrum.town.

### Instagram  *(bio ≤ 150 chars)*
> Everything Rovrum, in one spot 📍
> Rotherham news · sport · events · jobs
> Aye, that Rotherham. Said proper 👇
> rovrum.town

### LinkedIn  *(Company — tagline + About; lighter on dialect for the professional context)*
**Tagline (≤120 chars):** Everything Rotherham, in one place — local news, sport, events and jobs.

**About:** Rovrum is a new home for everything Rotherham. We gather the local news, sport, events and jobs from across the town and bring them together in one place — with a smart, automated content platform behind it. Proudly built in Rotherham. Launching soon at rovrum.town.

### TikTok  *(bio ≤ 80 chars)*
> Everything Rovrum, in one spot 📍 Rotherham news, sport & what's on. Coming soon 👇

`Link: rovrum.town`

---

## 7. Consistency checklist (per account)

- [ ] Avatar uploaded (`rovrum-avatar` PNG)
- [ ] Cover uploaded (where supported)
- [ ] Bio/description pasted from §6
- [ ] Website set to **rovrum.town**
- [ ] Location set to **Rotherham, UK** (where supported)
- [ ] Display name: **Rovrum** (not "Rovrum.town" — keep it clean)
