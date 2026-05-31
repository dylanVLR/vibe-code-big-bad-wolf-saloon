# Big Bad Wolf — Par Sheet (summary)

Human-readable summary of the game math. For the **formal, certification-grade
specification** see [`MATH_SPECIFICATION.md`](MATH_SPECIFICATION.md).

The **canonical source** is [`../src/math/par-sheet.js`](../src/math/par-sheet.js)
(the par sheet) plus [`../src/math/mathcore.js`](../src/math/mathcore.js) (the
evaluation logic); the live game (`app.js`) is bundled from those. Re-verify
anytime with:

```
node tools/sim.js 50000000
```

| Metric | Value |
|---|---|
| **Total RTP** | **≈ 96.99%** (target ~97%) |
| ├ Base game | ≈ 49.4% |
| └ Bonus feature | ≈ 47.6% |
| Bonus trigger rate | ≈ 1 in 179 spins |
| Hit frequency | ≈ 26.4% |
| Volatility (σ per spin) | **9.26 — high** |
| Avg bonus value | ≈ 85.5× bet (given a trigger) |
| Bonus Buy price | **88 × bet** |

> Figures are Monte-Carlo estimates over 50,000,000 spins at $1 bet
> (±~0.13% on the total, 1σ). The base component can be checked exactly by full
> enumeration of the 36,729,792 base screens — see `MATH_SPECIFICATION.md` §10.

---

## 1. Layout & how wins work

- **5 reels × 3 rows**, **243 ways** (no paylines).
- A win = the **same symbol on consecutive reels starting from reel 1**.
- Payout for one symbol = `ways × pays[span] × bet`, where
  `ways` = product of how many times the symbol appears on each winning reel,
  and `span` = how many consecutive reels (3, 4, or 5) it landed on.
- The **Wolf Wild** (centre reel) expands to fill its reel and substitutes for
  everything except the hats. It has no pay of its own; its value shows up inside
  the symbols it extends.

## 2. Paytable (`SYMBOLS[id].pays` — per-way multiple of bet)

| Symbol | 3-of-a-kind | 4 | 5 |
|---|--:|--:|--:|
| 🟡 Yellow Hat *(scatter)* | 1.78 | 7.14 | 35.70 |
| 🟢 Green Hat *(scatter)* | 0.89 | 3.57 | 17.85 |
| 🔴 Red Hat *(scatter)* | 0.71 | 2.86 | 14.28 |
| Suit Pig | 1.43 | 5.36 | 26.52 |
| Builder Pig | 1.07 | 4.28 | 21.42 |
| Shotglass | 0.71 | 2.86 | 14.28 |
| Toolbox | 0.61 | 2.50 | 12.24 |
| Wolf | 0.46 | 1.79 | 8.67 |
| Buzzard | 0.36 | 1.43 | 7.14 |
| Ace / King | 0.26 | 0.89 | 4.46 |
| Queen / Jack | 0.21 | 0.71 | 3.57 |
| Ten | 0.18 | 0.54 | 2.68 |
| Wolf Wild | — | — | — |

The three **hard hats** double as the bonus **scatter** (they pay as symbols
*and* count toward the trigger). Royals are the low-pay filler that carry most of
the base game's hit frequency. (Line pays are 0.51× an earlier revision so the
expanding wild's extra return keeps the total near 97% — see the spec §8.2.)

## 3. Reel composition (`REEL_COUNTS` — the tuning knobs)

Counts of each symbol on each reel. Strips are built by `buildStrip()`, which
spreads fillers evenly and drops hats in **2-symbol clusters** (so a 3-cell
window can show 2 hats — that's what makes a 6-hat trigger reachable).

| Symbol | R1 | R2 | R3 | R4 | R5 | Total |
|---|--:|--:|--:|--:|--:|--:|
| Yellow Hat | 2 | 1 | 1 | 1 | 1 | 6 |
| Green Hat | 1 | 1 | 1 | 1 | 1 | 5 |
| Red Hat | 1 | 1 | 1 | 1 | 0 | 4 |
| Suit Pig | 2 | 1 | 1 | 1 | 1 | 6 |
| Builder Pig | 1 | 2 | 1 | 1 | 1 | 6 |
| Shotglass | 1 | 1 | 1 | 1 | 1 | 5 |
| Toolbox | 2 | 2 | 1 | 2 | 1 | 8 |
| Wolf | 2 | 2 | 2 | 2 | 2 | 10 |
| Buzzard | 1 | 1 | 1 | 1 | 1 | 5 |
| **Wolf Wild** | 0 | 0 | **1** | 0 | 0 | **1** |
| Ace | 4 | 4 | 4 | 4 | 4 | 20 |
| King | 4 | 4 | 4 | 4 | 4 | 20 |
| Queen | 4 | 4 | 4 | 4 | 4 | 20 |
| Jack | 4 | 4 | 4 | 4 | 4 | 20 |
| Ten | 5 | 4 | 6 | 6 | 6 | 27 |
| **Strip length** | 34 | 32 | 33 | 33 | 31 | **163** |
| **Hats (all 3)** | 4 | 3 | 3 | 3 | 2 | **15** |

**Hats are 15 / 163 ≈ 9.2% of reel positions** — that density (with 2-hat
clustering) sets the ~1-in-179 bonus rate. The exact physical strips are listed
in the spec (§7.2).

## 4. Bonus feature — Hard Hat Free Spins (`BONUS_CONFIG`)

- **Trigger:** 6+ hard hats on a spin → **6 free spins**.
- **Retrigger:** 3+ hats in a free spin → **+1 free spin**.
- **Houses:** each hat upgrades the cell it lands on: straw → stick → brick (persistent).
- **Wolf reveal:** when free spins end, the wolf huffs every house down for a cash prize:

| House (tier) | Normal award (× bet) | Jackpot | E[award] |
|---|---|---|--:|
| 🏚️ Straw (1) | 0.46 – 2.44 | — | 1.45× |
| 🏠 Stick (2) | 2.44 – 9.74 | 4% chance → **29×** (Mini) | 7.01× |
| 🏰 Brick (3) | 7.31 – 44.08 | 4% chance → **146×** (Minor) | 30.51× |

- **Mansion Jackpot:** building **3+ brick houses** awards
  `bet × (24.4 + random up to 19.7 × brickCount)`.
- Free spins also pay normal 243-ways wins while they play out.

Average bonus is worth **≈ 85.5× bet** (E[value | trigger]); ≈ 7.3 free spins
per bonus; ≈ 0.23 mansion awards per bonus.

## 5. Bonus Buy

Pay **88 × bet** to skip the base game and start the feature immediately
(button: **💰 BUY BONUS**). Priced so the buy's RTP (~97.1%) ≈ the game's RTP —
buying is neither better nor worse value than spinning for it.

> Price math: `fair price = E[bonus | trigger] ÷ game RTP = 85.5 ÷ 0.970 ≈ 88×`.
> The buy generates a trigger grid drawn from the same distribution as a natural
> trigger, so the purchased bonus is statistically identical to a spun one.

## 6. How to verify

- **Headless:** `node tools/sim.js [spins]` — prints RTP (base/bonus/total),
  trigger rate, hit frequency, volatility, per-symbol contribution, reel
  composition, and bonus-buy pricing. (A 6+-hat spin pays bonus-only, matching
  the live game — see spec §8.1.)
- **In-game:** the **📊 SIM** button runs the same Monte Carlo with charts; the
  **🧮 MATH** button shows a plain-English RTP/trigger/composition summary.
  All three read the same `mathcore.js`, so they agree within Monte-Carlo noise.

## 7. Where the numbers live

| Thing | Location |
|---|---|
| Paytable, reel counts, bonus config (canonical) | `src/math/par-sheet.js` |
| 243-ways evaluation + bonus award rolls | `src/math/mathcore.js` |
| Live bonus presentation (uses the same award rolls) | `src/game/bonus.js` |
| Bundled game the browser runs | `app.js` (generated from `src/` by `tools/build.js`) |
| Headless RTP verifier | `tools/sim.js` |
| **Formal math specification** | **`docs/MATH_SPECIFICATION.md`** |
