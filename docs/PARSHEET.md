# Big Bad Wolf — Par Sheet

Human-readable summary of the game math. The **canonical source** is
[`../src/math/par-sheet.js`](../src/math/par-sheet.js) (the par sheet) plus
[`../src/math/mathcore.js`](../src/math/mathcore.js) (the evaluation logic); the
live game (`app.js`) is bundled from those. Re-verify anytime with:

```
node tools/sim.js 10000000
```

| Metric | Value |
|---|---|
| **Total RTP** | **≈ 102.3%** |
| ├ Base game | ≈ 59.4% |
| └ Bonus feature | ≈ 42.9% |
| Bonus trigger rate | ≈ 1 in 177 spins |
| Avg bonus value | ≈ 75.8× bet (given a trigger) |
| Volatility | **high** (rare, large bonus/jackpot swings) |
| Bonus Buy price | **80 × bet** |

> Figures are Monte-Carlo estimates over 10,000,000 spins at $1 bet.
>
> ⚠️ **Design target vs. reality:** this game was originally tuned to **~97%**
> RTP, but the par sheet has since drifted to **~102%** (the base game pays more
> than the original ~50% design). The numbers above are the *measured* values, not
> the target. To pull it back to 97%, trim base-game `pays` and/or the bonus
> award magnitudes in `par-sheet.js` and re-run `node tools/sim.js` until it
> converges. (At 102%, the 80× Bonus-Buy price is also slightly player-favorable.)

---

## 1. Layout & how wins work

- **5 reels × 3 rows**, **243 ways** (no paylines).
- A win = the **same symbol on consecutive reels starting from reel 1**.
- Payout for one symbol = `ways × pays[span] × bet`, where
  `ways` = product of how many times the symbol appears on each winning reel,
  and `span` = how many consecutive reels (3, 4, or 5) it landed on.

## 2. Paytable (`SYMBOLS[id].pays` — per-way multiple of bet)

| Symbol | 3-of-a-kind | 4 | 5 |
|---|--:|--:|--:|
| 🟡 Yellow Hat *(scatter)* | 3.5 | 14 | 70 |
| 🟢 Green Hat *(scatter)* | 1.75 | 7 | 35 |
| 🔴 Red Hat *(scatter)* | 1.4 | 5.6 | 28 |
| Suit Pig | 2.8 | 10.5 | 52 |
| Builder Pig | 2.1 | 8.4 | 42 |
| VLR Medallion | 1.4 | 5.6 | 28 |
| Toolbox | 1.2 | 4.9 | 24 |
| Wolf | 0.9 | 3.5 | 17 |
| Buzzard | 0.7 | 2.8 | 14 |
| Ace / King | 0.5 | 1.75 | 8.75 |
| Queen / Jack | 0.42 | 1.4 | 7 |
| Ten | 0.35 | 1.05 | 5.25 |

The three **hard hats** double as the bonus **scatter** (they pay as symbols
*and* count toward the trigger). Royals are the low-pay filler that carry most of
the base game's hit frequency.

## 3. Reel composition (`REEL_COUNTS` — the tuning knobs)

Counts of each symbol on each reel. Strips are built by `buildStrip()`, which
spreads fillers evenly and drops hats in **2-symbol clusters** (so a 3-cell
window can show 2 hats — that's what makes a 6-hat trigger reachable).

| Symbol | R1 | R2 | R3 | R4 | R5 | Total |
|---|--:|--:|--:|--:|--:|--:|
| Yellow Hat | 2 | 1 | 1 | 1 | 1 | 6 |
| Green Hat | 1 | 1 | 1 | 1 | 1 | 5 |
| Red Hat | 1 | 1 | 1 | 1 | 0 | 4 |
| Suit Pig | 2 | 1 | 2 | 1 | 1 | 7 |
| Builder Pig | 1 | 2 | 1 | 2 | 1 | 7 |
| VLR Medallion | 1 | 1 | 2 | 1 | 1 | 6 |
| Toolbox | 2 | 2 | 1 | 2 | 1 | 8 |
| Wolf | 2 | 2 | 2 | 2 | 2 | 10 |
| Buzzard | 1 | 1 | 1 | 1 | 1 | 5 |
| Ace | 4 | 4 | 4 | 4 | 4 | 20 |
| King | 4 | 4 | 4 | 4 | 4 | 20 |
| Queen | 4 | 4 | 4 | 4 | 4 | 20 |
| Jack | 4 | 4 | 4 | 4 | 4 | 20 |
| Ten | 4 | 4 | 4 | 4 | 5 | 21 |
| **Strip length** | 33 | 32 | 32 | 32 | 30 | **159** |
| **Hats (all 3)** | 4 | 3 | 3 | 3 | 2 | **15** |

**Hats are 15 / 159 ≈ 9.4% of reel positions** — that density is what sets the
~1-in-166 bonus rate. More hats → more frequent (and steeply so, because the
trigger needs 6+ at once); fewer hats → rarer.

## 4. Bonus feature — Hard Hat Free Spins (`BONUS_CONFIG`)

- **Trigger:** 6+ hard hats on a spin → **6 free spins**.
- **Retrigger:** 3+ hats in a free spin → **+1 free spin**.
- **Houses:** each hat upgrades the cell it lands on: straw → stick → brick.
- **Wolf reveal:** when free spins end, the wolf huffs every house down for a cash prize:

| House (tier) | Normal award (× bet) | Jackpot |
|---|---|---|
| 🏚️ Straw (1) | 0.4 – 2.1 | — |
| 🏠 Stick (2) | 2.1 – 8.4 | 4% chance → **25×** (Mini) |
| 🏰 Brick (3) | 6.3 – 38 | 4% chance → **126×** (Minor) |

- **Mansion Jackpot:** building **3+ brick houses** awards
  `bet × (21 + random up to 17 × brickCount)`.
- Free spins also pay normal 243-ways line wins while they play out.

Average bonus is worth **≈ 78× bet** (E[value | trigger]).

## 5. Bonus Buy

Pay **80 × bet** to skip the base game and start the feature immediately
(button: **💰 BUY BONUS**). Priced so the buy's RTP (~97.6%) ≈ the game's RTP —
buying is neither better nor worse value than spinning for it.

> Price math: `fair price = E[bonus | trigger] ÷ game RTP = 78.1 ÷ 0.969 ≈ 80×`.
> The buy generates a trigger grid by rejection-sampling real spins until 6+ hats,
> so the purchased bonus is drawn from the same distribution as a natural one.

## 6. How to verify

- **Headless:** `node tools/sim.js [spins]` — prints RTP (base/bonus/total),
  trigger rate, hit frequency, volatility, per-symbol contribution, reel
  composition, and bonus-buy pricing.
- **In-game:** the **📊 SIM** button runs the same Monte Carlo with charts; the
  **🧮 MATH** button shows a plain-English RTP/trigger/composition summary.
  All three read the same numbers, so they agree within Monte-Carlo noise.

## 7. Where the numbers live

| Thing | Location |
|---|---|
| Paytable, reel counts, bonus config (canonical) | `src/math/par-sheet.js` |
| 243-ways evaluation + bonus award rolls | `src/math/mathcore.js` |
| Live bonus presentation (uses the same award rolls) | `src/game/bonus.js` |
| Bundled game the browser runs | `app.js` (generated from `src/` by `tools/build.js`) |
| Headless RTP verifier | `tools/sim.js` |
