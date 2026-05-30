/**
 * @module options-drawer
 * @description The right-side options drawer. Clicking the edge handle slides the
 * panel open/closed; clicking anywhere outside closes it. The buttons inside keep
 * their original IDs, so their behaviour is wired by their own modules — this
 * module only handles the open/close of the drawer itself.
 */
'use strict';

const drawer = document.getElementById('options-drawer');
const tab    = document.getElementById('options-tab');

if (drawer && tab) {
  tab.addEventListener('click', e => { e.stopPropagation(); drawer.classList.toggle('open'); });

  // close when clicking outside the drawer
  document.addEventListener('click', e => {
    if (drawer.classList.contains('open') && !drawer.contains(e.target)) {
      drawer.classList.remove('open');
    }
  });

  // tidy up: close the drawer when an option opens a full-screen modal
  ['btn-rtp', 'btn-size', 'btn-deposit', 'btn-buy-bonus', 'btn-info', 'btn-simulate', 'btn-math', 'btn-force-extreme'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', () => drawer.classList.remove('open'));
  });
}
