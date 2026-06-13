import {
  onWaitlistForSlot, getWaitlistForSlot, addToWaitlist, removeFromWaitlist
} from './db.js';
import { formatDate, showToast } from './utils.js';

const $ = id => document.getElementById(id);

let _unsub = null;

// ─── HELPERS ───────────────────────────────────────────────────────────────

function _slotKey(resa) { return `${resa.terrainId}_${resa.creneau}`; }

function _waPhone(tel) {
  const d = (tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 8) return '253' + d;
  return d;
}

function _waLink(tel, text) {
  const p = _waPhone(tel);
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : '';
}

function _dateLabel(date) {
  return formatDate(date).replace(/Aujourd'hui · /, '');
}

function _msgWaitlist(resa, date, terrainNom) {
  return `Bonjour ! Vous êtes en file d'attente pour ${terrainNom || resa.terrainId} · ` +
    `${resa.creneau} le ${_dateLabel(date)}. Nous vous prévenons si le créneau se libère.`;
}

function _msgFreed(resa, date, terrainNom) {
  return `Bonne nouvelle ! Le créneau ${terrainNom || resa.terrainId} · ${resa.creneau} ` +
    `du ${_dateLabel(date)} vient de se libérer. Toujours intéressé(e) ?`;
}

// Manipulation directe des classes pour éviter une dépendance circulaire avec planning.js
function _openSheet(name) {
  $(`sheet-${name}`)?.classList.add('open');
  $('sheet-overlay')?.classList.remove('hidden');
}
function _closeSheet(name) {
  $(`sheet-${name}`)?.classList.remove('open');
  if (!document.querySelector('.sheet.open')) $('sheet-overlay')?.classList.add('hidden');
}

// ─── ATTACHE À LA FICHE RÉSERVATION ──────────────────────────────────────────
// Ajoute un bloc « file d'attente » à la fin du sheet de détail déjà ouvert.

export function attachWaitlist(resa, date, user, terrainNom) {
  if (_unsub) { _unsub(); _unsub = null; }
  const body = $('sheet-resa-detail-body');
  if (!body) return;

  const sec = document.createElement('div');
  sec.className = 'wl-section';
  sec.innerHTML = `
    <h3 class="dash-sub">File d'attente</h3>
    <div id="wl-list" class="wl-list"></div>
    <form id="wl-form" class="wl-form" novalidate>
      <input type="text" id="wl-nom" placeholder="Nom du client" autocomplete="off" required>
      <input type="tel" id="wl-tel" placeholder="Téléphone" inputmode="tel" autocomplete="off">
      <button type="submit" class="btn btn-sm btn-secondary">+ Ajouter</button>
    </form>`;
  body.appendChild(sec);

  const slotKey = _slotKey(resa);
  _unsub = onWaitlistForSlot(date, slotKey,
    list => _renderList(list, resa, date, slotKey, terrainNom));

  $('wl-form').onsubmit = async e => {
    e.preventDefault();
    const nom = $('wl-nom').value.trim();
    if (!nom) return;
    const tel = $('wl-tel').value.trim();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await addToWaitlist(date, slotKey, {
        nom,
        telephone: tel,
        employeId: user?.uid || '',
        employeNom: user?.nom || ''
      });
      $('wl-nom').value = '';
      $('wl-tel').value = '';
      showToast('Ajouté à la file d\'attente.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };
}

function _renderList(list, resa, date, slotKey, terrainNom) {
  const el = $('wl-list');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<p class="wl-empty">Personne en attente.</p>';
    return;
  }
  el.innerHTML = list.map((w, i) => {
    const link = _waLink(w.telephone, _msgWaitlist(resa, date, terrainNom));
    return `<div class="wl-row">
      <span class="wl-pos">${i + 1}</span>
      <div class="wl-info">
        <span class="wl-nom">${esc(w.nom)}</span>
        ${w.telephone ? `<span class="wl-tel">${esc(w.telephone)}</span>` : ''}
      </div>
      ${link ? `<a class="btn btn-sm btn-wa" href="${link}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
      <button class="btn-icon wl-del" data-id="${w.id}" aria-label="Retirer de la file">✕</button>
    </div>`;
  }).join('');

  el.querySelectorAll('.wl-del').forEach(b => {
    b.onclick = async () => {
      try {
        await removeFromWaitlist(date, slotKey, b.dataset.id);
      } catch (e) {
        showToast(e.message, 'error');
      }
    };
  });
}

// ─── PRÉVENIR LE SUIVANT (après annulation) ──────────────────────────────────

export async function offerNotifyNext(resa, date, user, terrainNom) {
  const slotKey = _slotKey(resa);
  let list = [];
  try {
    list = await getWaitlistForSlot(date, slotKey);
  } catch (_) {
    return;
  }
  if (!list.length) return;

  const first = list[0];
  const body = $('waitlist-body');
  if (!body) return;

  const link = _waLink(first.telephone, _msgFreed(resa, date, terrainNom));
  body.innerHTML = `
    <p class="wl-freed-intro">Créneau libéré — ${list.length} personne(s) en attente.</p>
    <div class="wl-next">
      <div class="wl-info">
        <span class="wl-nom">${esc(first.nom)}</span>
        ${first.telephone ? `<span class="wl-tel">${esc(first.telephone)}</span>` : ''}
      </div>
      ${link
        ? `<a class="btn btn-wa btn-full" href="${link}" target="_blank" rel="noopener noreferrer">Prévenir ${esc(first.nom)}</a>`
        : '<p class="wl-empty">Aucun numéro enregistré pour cette personne.</p>'}
    </div>
    <button class="btn btn-ghost btn-full" id="wl-remove-next" style="margin-top:var(--sp-3)">Retirer de la file (prévenu)</button>`;

  _openSheet('waitlist');

  $('wl-remove-next').onclick = async () => {
    try {
      await removeFromWaitlist(date, slotKey, first.id);
      _closeSheet('waitlist');
      showToast('Retiré de la file.', 'info');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
}

export function destroy() {
  if (_unsub) { _unsub(); _unsub = null; }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
