/**
 * @module shortcuts
 * @description One central keyboard map for the whole game. It drives the real
 * controls (it clicks the actual buttons / nudges the real sliders) so every
 * shortcut inherits the exact same guards and side-effects as a mouse click —
 * no duplicated game logic lives here.
 *
 * Two contexts:
 *   • Panel CLOSED → game shortcuts (Space = spin, ↑/↓ = bet, A/T/B, etc.)
 *   • Panel OPEN   → arrow-key navigation between the drawer controls, with
 *                    ←/→ to drag the focused volume slider and Enter/Space to
 *                    activate the highlighted control.
 *
 * A summary table ships as docs/Keyboard_Shortcuts.pdf (tools/shortcuts-pdf.cjs).
 */
'use strict';

const $ = id => document.getElementById(id);
const drawerEl = () => $('options-drawer');
const panelEl  = () => $('options-panel');

const isDrawerOpen = () => { const d = drawerEl(); return !!d && d.classList.contains('open'); };
const openModal    = () => document.querySelector('.modal-overlay:not(.hidden)');

/** Fire a control's own click handler (keeps all its guards). */
function click(id) { const el = $(id); if (el && !el.disabled) el.click(); }

/** Visible, enabled, focusable controls inside the drawer, top-to-bottom. */
function focusables() {
  const p = panelEl();
  if (!p) return [];
  return [...p.querySelectorAll('button, input')].filter(el => el.offsetParent !== null && !el.disabled);
}

/** Roving focus: move the highlight up/down the drawer controls, wrapping around. */
function moveFocus(dir) {
  const items = focusables();
  if (!items.length) return;
  const cur = items.indexOf(document.activeElement);
  const next = cur === -1 ? (dir > 0 ? 0 : items.length - 1) : (cur + dir + items.length) % items.length;
  items[next].focus();
}

/** Drag a focused volume slider by ±delta (clamped 0–100) and fire its input handler. */
function nudgeSlider(slider, delta) {
  const v = Math.max(0, Math.min(100, (parseInt(slider.value, 10) || 0) + delta));
  slider.value = v;
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

function openDrawer()  { const d = drawerEl(); if (d) d.classList.add('open'); }
function closeDrawer() { const d = drawerEl(); if (d) d.classList.remove('open'); }
function toggleDrawer() {
  const d = drawerEl();
  if (!d) return;
  d.classList.toggle('open');
  if (d.classList.contains('open')) {
    requestAnimationFrame(() => { const f = focusables()[0]; if (f) f.focus(); });  // land on the first control
  }
}

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;            // never hijack browser / OS chords (⌘R, ⌘V…)

  const t = e.target, tag = t && t.tagName;
  const typing = (tag === 'INPUT' && t.type !== 'range') || tag === 'TEXTAREA' || (t && t.isContentEditable);
  if (typing) return;                                        // let people type in real fields

  const key = e.key;

  // ── Esc — close the top-most surface (popup → drawer) ──
  if (key === 'Escape') {
    const m = openModal();
    if (m) { const c = m.querySelector('.modal-close'); if (c) c.click(); return; }
    if (isDrawerOpen()) closeDrawer();
    return;
  }
  if (openModal()) return;   // a popup owns the keyboard (e.g. HELP's ←/→ page turns)

  // ── Panel OPEN — arrow-key navigation ──
  if (isDrawerOpen()) {
    if (key === 'ArrowDown') { e.preventDefault(); moveFocus(1);  return; }
    if (key === 'ArrowUp')   { e.preventDefault(); moveFocus(-1); return; }
    if ((key === 'ArrowRight' || key === 'ArrowLeft') && tag === 'INPUT' && t.type === 'range') {
      e.preventDefault(); nudgeSlider(t, key === 'ArrowRight' ? 5 : -5); return;
    }
    if (e.code === 'Space' || key === 'Enter') return;       // let the focused control activate natively
    if (key.toLowerCase() === 'o') { e.preventDefault(); closeDrawer(); return; }
    // any other key falls through to the global shortcuts below
  }

  // ── Global game shortcuts (panel closed, or letter keys while open) ──
  if ((e.code === 'Space' || key === 'Enter') && !isDrawerOpen()) { e.preventDefault(); click('btn-spin'); return; }
  if (!isDrawerOpen()) {
    if (key === 'ArrowUp')   { e.preventDefault(); click('btn-bet-up');   return; }
    if (key === 'ArrowDown') { e.preventDefault(); click('btn-bet-down'); return; }
  }
  if (key === '+' || key === '=') { click('btn-bet-up');   return; }
  if (key === '-' || key === '_') { click('btn-bet-down'); return; }

  switch (key.toLowerCase()) {
    case 'a': click('btn-auto'); break;                          // auto-spin on/off
    case 't': { const c = $('chk-turbo'); if (c) c.click(); break; }   // turbo on/off
    case 'b': click('btn-buy-bonus'); break;                     // buy bonus
    case 'h': click('btn-help'); break;                          // help
    case 'r': click('btn-rules'); break;                         // rules
    case 'm': openDrawer(); click('btn-vol-mute'); break;        // mute all / unmute
    case 'v': openDrawer(); click('btn-sound'); break;           // open/close the volume panel
    case 'o': toggleDrawer(); break;                             // open/close the side options panel
    default: return;
  }
}

document.addEventListener('keydown', onKey);
