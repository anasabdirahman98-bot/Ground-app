import {
  onReservationsForDate, onPaiementsForDate, onJournalForDate, onUsers,
  getPaiementsForPeriod, getReservationsForPeriod, getCloturesForPeriod
} from './db.js';
import {
  todayDate, addDays, formatDate, formatDateShort, formatFDJ, formatDateTime,
  modePaiementLabel, generateSlots
} from './utils.js';

const $ = id => document.getElementById(id);

let _cfg = {};
let _user = null;
let _date = todayDate();
let _resas = [];
let _paiements = [];
let _journal = [];
let _unsubs = [];
let _statsChart = null;
let _statsPeriod = 7;

export function init(config, user) {
  _cfg = config;
  _user = user;
  _date = todayDate();
  _unsubs.forEach(fn => fn());
  _unsubs = [];

  _unsubs.push(onReservationsForDate(_date, r => { _resas = r; _renderToday(); }));
  _unsubs.push(onPaiementsForDate(_date, p => { _paiements = p; _renderToday(); }));
  _unsubs.push(onJournalForDate(_date, j => { _journal = j; _renderJournal(); }));
  _unsubs.push(onUsers(() => {}));

  _initTabs();
}

export function destroy() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  if (_statsChart) { _statsChart.destroy(); _statsChart = null; }
}

// ─── TABS ────────────────────────────────────────────────────────────────────

function _initTabs() {
  const tabs = [
    { id: 'dash-tab-today', panel: 'dash-panel-today', onActivate: null },
    { id: 'dash-tab-stats', panel: 'dash-panel-stats', onActivate: _loadStats },
    { id: 'dash-tab-clotures', panel: 'dash-panel-clotures', onActivate: _loadClotures }
  ];
  tabs.forEach(({ id, panel, onActivate }) => {
    const btn = $(id);
    if (!btn) return;
    btn.onclick = () => {
      tabs.forEach(t => {
        $(t.id)?.classList.remove('active');
        $(t.panel).hidden = true;
      });
      btn.classList.add('active');
      $(panel).hidden = false;
      onActivate?.();
    };
  });
}

// ─── TODAY TAB ───────────────────────────────────────────────────────────────

function _renderToday() {
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
    annulees: _resas.filter(r => r.statut === 'annulee').length
  };
}

function _computeOccupation() {
  const { terrains = {}, horaires = {} } = _cfg;
  const active = Object.entries(terrains).filter(([, t]) => t.actif !== false);
  if (!active.length || !horaires.ouverture) return [];
  const slots = generateSlots(horaires.ouverture, horaires.fermeture, horaires.dureeCreneauMin || 60);
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
      <div class="occ-bar-wrap"><div class="occ-bar" style="width:${o.pct}%"></div></div>
      <span class="occ-pct">${o.pct}%</span>
      <span class="occ-count">${o.reserved}/${o.total}</span>
    </div>`
  ).join('');
}

function _renderJournal() {
  const el = $('dash-journal');
  if (!el) return;
  if (!_journal.length) { el.innerHTML = '<p class="empty-msg">Aucune activité aujourd\'hui.</p>'; return; }
  const labels = {
    reservation_creee: 'Réservation créée', reservation_recurrente: 'Récurrence',
    encaissement: 'Encaissement', checkin: 'Check-in',
    annulation: 'Annulation', cloture_caisse: 'Clôture caisse',
    config_modifie: 'Config modifiée', employe_cree: 'Employé créé',
    employe_desactive: 'Employé désactivé',
    evenement_cree: 'Événement créé', evenement_modifie: 'Événement modifié'
  };
  el.innerHTML = '<div class="journal-feed">' + _journal.slice(0, 30).map(j =>
    `<div class="jf-item">
      <div class="jf-left">
        <span class="jf-action">${labels[j.action] || j.action}</span>
        <span class="jf-detail">${esc(j.details || '')}</span>
      </div>
      <div class="jf-right">
        <span class="jf-who">${esc(j.userNom)}</span>
        <span class="jf-time">${formatDateTime(j.timestamp)}</span>
      </div>
    </div>`
  ).join('') + '</div>';
}

// ─── STATS TAB ───────────────────────────────────────────────────────────────

async function _loadStats() {
  const el = $('stats-content');
  if (!el) return;
  el.innerHTML = '<p class="loading-msg">Chargement…</p>';

  const today = todayDate();
  const dateDebut = addDays(today, -(_statsPeriod - 1));
  const paiements = await getPaiementsForPeriod(dateDebut, today);

  // Daily CA
  const dailyCA = {};
  let cur = dateDebut;
  while (cur <= today) { dailyCA[cur] = 0; cur = _addOneDay(cur); }
  paiements.forEach(p => {
    const delta = p.type === 'ajustement' ? -Math.abs(p.montant) : p.montant;
    if (dailyCA[p.date] !== undefined) dailyCA[p.date] += delta;
  });

  // Employee CA
  const empCA = {};
  paiements.forEach(p => {
    const delta = p.type === 'ajustement' ? -Math.abs(p.montant) : p.montant;
    empCA[p.employeNom] = (empCA[p.employeNom] || 0) + delta;
  });

  const totalCA = paiements.reduce((s, p) =>
    s + (p.type === 'ajustement' ? -Math.abs(p.montant) : p.montant), 0);

  const dates = Object.keys(dailyCA).sort();
  const caValues = dates.map(d => dailyCA[d]);

  el.innerHTML = `
    <div class="dash-section">
      <div class="period-sel">
        <button class="period-btn${_statsPeriod === 7 ? ' active' : ''}" data-p="7">7 jours</button>
        <button class="period-btn${_statsPeriod === 30 ? ' active' : ''}" data-p="30">30 jours</button>
      </div>
      <div class="stats-total">CA total période : <strong class="lime">${formatFDJ(totalCA)}</strong></div>
    </div>
    <div class="dash-section">
      <h3 class="dash-sub">CA par jour (FDJ)</h3>
      <div class="chart-wrap"><canvas id="ca-chart"></canvas></div>
    </div>
    <div class="dash-section">
      <h3 class="dash-sub">CA par employé</h3>
      <div class="emp-table">${_renderEmpTable(empCA)}</div>
    </div>
    <div class="dash-section">
      <h3 class="dash-sub">Export données</h3>
      <div class="export-btns">
        <button class="btn btn-ghost btn-sm" id="btn-export-paiements">↓ CSV Paiements</button>
        <button class="btn btn-ghost btn-sm" id="btn-export-resas">↓ CSV Réservations</button>
      </div>
    </div>
  `;

  el.querySelectorAll('[data-p]').forEach(btn => {
    btn.onclick = () => { _statsPeriod = Number(btn.dataset.p); _loadStats(); };
  });

  _drawChart('ca-chart', dates, caValues);

  $('btn-export-paiements').onclick = () => _exportCSV('paiements', dateDebut, today, paiements);
  $('btn-export-resas').onclick = async () => {
    const resas = await getReservationsForPeriod(dateDebut, today);
    _exportCSV('reservations', dateDebut, today, resas);
  };
}

function _renderEmpTable(empCA) {
  const rows = Object.entries(empCA).sort(([, a], [, b]) => b - a);
  if (!rows.length) return '<p class="empty-msg">Aucun encaissement.</p>';
  return '<div class="emp-list">' + rows.map(([nom, ca]) =>
    `<div class="emp-row">
      <span class="emp-nom">${esc(nom)}</span>
      <span class="emp-ca lime">${formatFDJ(ca)}</span>
    </div>`
  ).join('') + '</div>';
}

function _drawChart(canvasId, labels, data) {
  if (_statsChart) { _statsChart.destroy(); _statsChart = null; }
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext('2d');
  _statsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(d => formatDateShort(d)),
      datasets: [{
        data,
        backgroundColor: 'rgba(47,143,70,.55)',
        borderColor: 'rgba(182,240,156,.85)',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#93A398', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.05)' } },
        y: {
          ticks: { color: '#93A398', font: { size: 10 }, callback: v => v >= 1000 ? (v / 1000) + 'k' : v },
          grid: { color: 'rgba(255,255,255,.06)' },
          beginAtZero: true
        }
      }
    }
  });
}

function _exportCSV(type, dateDebut, dateFin, data) {
  let lines;
  if (type === 'paiements') {
    lines = [
      ['Date', 'Horodatage', 'Employé', 'Mode', 'Type', 'Montant FDJ', 'Motif', 'ReservationId'].join(';'),
      ...data.map(p => [
        p.date,
        new Date(p.timestamp).toLocaleString('fr-FR', { timeZone: 'Africa/Djibouti' }),
        p.employeNom, modePaiementLabel(p.mode), p.type,
        // Montant signé : les ajustements (remboursements) sortent en négatif
        p.type === 'ajustement' ? -Math.abs(p.montant) : p.montant,
        p.motif || '', p.resaId
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    ];
  } else {
    lines = [
      ['Date', 'Terrain', 'Créneau', 'Client', 'Montant FDJ', 'Payé FDJ', 'Statut', 'Paiement', 'Employé', 'Notes'].join(';'),
      ...data.map(r => [
        r.date, r.terrainId, r.creneau, r.clientNom, r.montant, r.totalPaye || 0,
        r.statut, r.statutPaiement, r.employeNom, r.notes || ''
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    ];
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ground-${type}-${dateDebut}-${dateFin}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── CLÔTURES TAB ────────────────────────────────────────────────────────────

async function _loadClotures() {
  const el = $('clotures-content');
  if (!el) return;
  el.innerHTML = '<p class="loading-msg">Chargement…</p>';

  const today = todayDate();
  const dateDebut = addDays(today, -29);
  const clotures = await getCloturesForPeriod(dateDebut, today);

  if (!clotures.length) {
    el.innerHTML = '<p class="empty-msg">Aucune clôture ces 30 derniers jours.</p>';
    return;
  }

  el.innerHTML = '<div class="clotures-list">' + [...clotures].reverse().map(cl => {
    const hasEcart = cl.ecart !== 0;
    const sign = cl.ecart > 0 ? '+' : '';
    return `<div class="cl-card${hasEcart ? ' cl-bad' : ' cl-ok'}">
      <div class="cl-date">${formatDate(cl.date)}</div>
      <div class="cl-rows">
        <div class="cl-row"><span>Théorique espèces</span><span>${formatFDJ(cl.theoriqueEspeces)}</span></div>
        <div class="cl-row"><span>Compté</span><span>${formatFDJ(cl.compteEspeces)}</span></div>
        <div class="cl-row cl-ecart-row ${hasEcart ? 'neg' : 'ok'}">
          <span>Écart</span><span>${sign}${formatFDJ(cl.ecart)}</span>
        </div>
        ${cl.commentaire ? `<div class="cl-comment">${esc(cl.commentaire)}</div>` : ''}
        <div class="cl-meta">${esc(cl.employeNom)} · ${formatDateTime(cl.timestamp)}</div>
      </div>
    </div>`;
  }).join('') + '</div>';
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _addOneDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return dt.toLocaleDateString('en-CA');
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
