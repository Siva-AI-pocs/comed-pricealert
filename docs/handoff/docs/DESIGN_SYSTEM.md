# DESIGN_SYSTEM.md — ComEd Price Pulse

This is the design source of truth. Apply these tokens; don't invent colors. Reference renders: `/design-mockups/*.html`.

## Typography
- **Display / headings:** `Bricolage Grotesque` (700–800), tight tracking (-0.02em).
- **UI / body:** `Hanken Grotesk` (400–700).
- Load via Google Fonts; fall back to `system-ui, sans-serif`.
- Big price numbers use Bricolage 800.

## Scale & shape
- Radius: cards 16–18px, pills 999px, inputs 11px.
- Spacing rhythm: 8 / 12 / 14 / 18 / 24.
- Card shadow (dark): `0 18px 40px -22px rgba(0,0,0,.5)`.

## Price-tier scale (SEMANTIC — keep consistent, all themes)
Color encodes price. Always pair with a label/icon, never color alone.

| Tier | Range (¢/kWh) | Meaning |
|---|---|---|
| Negative | < 0 | grid pays you |
| Cheap | 0–3 | run appliances |
| Moderate | 3–8 | normal |
| High | 8–15 | reduce usage |
| Spike | 15+ | avoid |

## Brand themes
Active theme: **Voltaic**. Switch by swapping the `:root` token block. Brand accent never equals a tier color, so it can't be misread as a price.

### Voltaic — electric blue (default)
```css
:root{ /* dark */
  --bg:#0a0f1c; --card:#121a2e; --line:#202941; --txt:#eaf0ff; --dim:#93a4c7; --faint:#5a6b91;
  --accent:#2f72ff; --accent-2:#38bdf8; --on-accent:#ffffff;
  --neg:#06b6d4; --cheap:#10b981; --moderate:#f5b301; --high:#fb7a3c; --spike:#ef4444;
}
:root[data-theme="light"]{
  --bg:#f1f5fc; --card:#ffffff; --line:#e4e9f5; --txt:#0c1426; --dim:#51607e; --faint:#95a1bd;
  --accent:#1f5fff; --accent-2:#2f8bff; --on-accent:#ffffff;
  --neg:#0891b2; --cheap:#059669; --moderate:#d97706; --high:#ea580c; --spike:#dc2626;
}
```

### Grid — control-room teal
```css
:root{ /* dark */
  --bg:#08110f; --card:#0f1c1a; --line:#1c2e2b; --txt:#e9f5f1; --dim:#8fb0a8; --faint:#54716b;
  --accent:#14b8a6; --accent-2:#2dd4bf; --on-accent:#04201c;
  --neg:#0891b2; --cheap:#22c55e; --moderate:#eab308; --high:#f97316; --spike:#f43f5e;
}
:root[data-theme="light"]{
  --bg:#eef5f3; --card:#ffffff; --line:#dfeae7; --txt:#07140f; --dim:#4a655d; --faint:#8aa39b;
  --accent:#0d9488; --accent-2:#14b8a6; --on-accent:#ffffff;
  --neg:#0891b2; --cheap:#16a34a; --moderate:#ca8a04; --high:#ea580c; --spike:#e11d48;
}
```

### Volt — neon lime (bold)
Lime is used ONLY for brand/buttons/active states — never on price data — so it never clashes with the green cheap tier.
```css
:root{ /* dark */
  --bg:#0c0d08; --card:#15170f; --line:#262a1a; --txt:#f3f6e9; --dim:#aeb59a; --faint:#6b7258;
  --accent:#c4f132; --accent-2:#9ade00; --on-accent:#10130a;
  --neg:#06b6d4; --cheap:#16a34a; --moderate:#f59e0b; --high:#f97316; --spike:#dc2626;
}
:root[data-theme="light"]{
  --bg:#f6f7ee; --card:#ffffff; --line:#e9ebda; --txt:#14150c; --dim:#5f6347; --faint:#9aa07f;
  --accent:#5f8c00; --accent-2:#7cb900; --on-accent:#ffffff;
  --neg:#0891b2; --cheap:#16a34a; --moderate:#d97706; --high:#ea580c; --spike:#dc2626;
}
```

> Owner has not finalized the theme. Default = Voltaic. To change: replace the active `:root` block (and confirm in `PRD.md`). Tailwind users: map these to `theme.extend.colors` (e.g. `accent`, `tier-cheap`, …) and reference via `bg-accent`, `text-tier-spike`.

## Component conventions
- **Price hero:** Bricolage 800, ~66px, tier-colored; status pill in the tier color at low opacity (`var(--cheap)1f` bg, full-color text/border).
- **Cards:** `var(--card)` on `var(--line)` border, radius 16–18.
- **Tier in charts:** color bars/segments by tier value; forecast median line tinted by tier; P10–P90 band = `var(--accent)` at ~25% alpha; day-ahead = dashed `var(--faint)`.
- **Buttons:** primary = gradient `accent → accent-2`, text `var(--on-accent)`; secondary = transparent + `var(--line)` border.
- **Toggle/switch:** `var(--accent)` when on.
- **Helper for tier color:** `p<0?neg : p<3?cheap : p<8?moderate : p<15?high : spike`.
- **Nav:** bottom tabs on mobile (Now / Forecast / Alerts / More), top tabs on desktop.
