import {
  onReservationsForDate, onPaiementsForDate, onJournalForDate, onUsers
} from './db.js';
import {
  todayDate, formatFDJ, formatDateTime, modePaiementLabel, generateSlots
} from './utils.js';

const $ = id => document.getElementById(id);

let _cfg = {};
let _user = null;
let _date = todayDate();
let _resas = [];
let _paiements = [];
let _journal = [];
let _users = [];
let _unsubs = [];

export function init(config, user) {
  _cfg = config;
  _user = user;
  _date = todayDate();
  _unsubs.forEach(fn => fn());
  _unsubs = [];

  _unsubs.push(onReservationsForDate(_date, r => { _resas = r; _render(); }));
  _unsubs.push(onPaiementsForDate(_date, p => { _paiements = p; _render(); }));
  _unsubs.push(onJournalForDate(_date, j => { _journal = j; _renderJournal(); }));
  _unsubs.push(onUsers(u => { _users = u; }));
}

export function destroy() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function _render() {
  const ca = _computeCA();
  const stats = _computeStats();
  const occupation = _computeOccupation();

  $('dash-content').innerHTML = `
    <div class="dash-section">
      <h2 class="dash-title">Aujourd'hui</h2>
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">CA encaissé</span>
          <span class="kpi-val lime">${formatFDJ(ca.total)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Réservations</span>
          <span class="kpi-val">${stats.total}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Terminées</span>
          <span class="kpi-val paye">${stats.terminees}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Annulations</span>
          <span class="kpi-val danger">${stats.annulees}</span>
        </div>
      </div>
    </div>

    <div class="dash-section">
      <h3 class="dash-sub">Encaissements par mode</h3>
      <div class="modes-grid">${_renderModes(ca.byMode)}</div>
    </div>

    <div class="dash-section">
      <h3 class="dash-sub">Occupation par terrain</h3>
      <div class="occ-list">${_renderOccupation(occupation)}</div>
    </div>

    <div class="dash-section">
      <h3 class="dash-sub">Fil d'activité</h3>
      <div id="dash-journal">Chargement…</div>
    </div>
  `;

  _renderJournal();
}

function _computeCA() {
  const modes = _cfg.modesPaiement || ['especes', 'dmoney', 'waafi', 'autre'];
  const byMode = {};
  modes.forEach(m => (byMode[m] = 0));
  let total = 0;
  _paiements.forEach(p => {
    const delta = p.type === 'ajustement' ? -Math.abs(p.montant) : p.montant;
    byMode[p.mode] = (byMode[p.mode] || 0) + delta;
    total += delta;
  });
  return { total, byMode };
}

function _computeStats() {
  const active = _resas.filter(r => r.statut !== 'annulee');
  return {
    total: active.length,
    terminees: _resas.filter(r => r.statut === 'terminee').length,
    annulees: _resas.filter(r => r.statut === 'annulee').length,
    noshows: _resas.filter(r => r.statut === 'noshow').length
  };
}

function _computeOccupation() {
  const { terrains = {}, horaires = {} } = _cfg;
  const active = Object.entries(terrains).filter(([, t]) => t.actif !== false);
  if (!active.length || !horaires.ouverture) return [];

  const slots = generateSlots(
    horaires.ouverture, horaires.fermeture, horaires.dureeCreneauMin || 60
  );
  const total = slots.length;

  return active.map(([tid, t]) => {
    const reserved = _resas.filter(r => r.terrainId === tid && r.statut !== 'annulee').length;
    const pct = total > 0 ? Math.round((reserved / total) * 100) : 0;
    return { nom: t.nom, reserved, total, pct };
  });
}

function _renderModes(byMode) {
  const modes = _cfg.modesPaiement || ['especes', 'dmoney', 'waafi', 'autre'];
  return modes.filter(m => byMode[m] !== 0).map(m =>
    `<div class="mode-card">
      <span class="mc-label">${modePaiementLabel(m)}</span>
      <span class="mc-val">${formatFDJ(byMode[m])}</span>
    </div>`
  ).join('') || '<p class="empty-msg">Aucun encaissement.</p>';
}

function _renderOccupation(occ) {
  if (!occ.length) return '<p class="empty-msg">Aucun terrain configuré.</p>';
  return occ.map(o =>
    `<div class="occ-row">
      <span class="occ-nom">${esc(o.nom)}</span>
      <div class="occ-bar-wrap">
        <div class="occ-bar" style="width:${o.pct}%"></div>
      </div>
      <span class="occ-pct">${o.pct}%</span>
      <span class="occ-count">${o.reserved}/${o.total}</span>
    </div>`
  ).join('');
}

function _renderJournal() {
  const el = $('dash-journal');
  if (!el) return;
  if (!_journal.length) {
    el.innerHTML = '<p class="empty-msg">Aucune activité aujourd\'hui.</p>';
    return;
  }

  const actionLabels = {
    reservation_creee: 'Réservation créée',
    encaissement: 'Encaissement',
    checkin: 'Check-in',
    annulation: 'Annulation',
    cloture_caisse: 'Clôture caisse',
    config_modifie: 'Config modifiée',
    employe_cree: 'Employé créé',
    employe_desactive: 'Employé désactivé'
  };

  el.innerHTML = '<div class="journal-feed">' + _journal.slice(0, 30).map(j =>
    `<div class="jf-item">
      <div class="jf-left">
        <span class="jf-action">${actionLabels[j.action] || j.action}</span>
        <span class="jf-detail">${esc(j.details || '')}</span>
      </div>
      <div class="jf-right">
        <span class="jf-who">${esc(j.userNom)}</span>
        <span class="jf-time">${formatDateTime(j.timestamp)}</span>
      </div>
    </div>`
  ).join('') + '</div>';
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
