import { onClients, createClient, updateClient, getReservationsForDate } from './db.js';
import { formatFDJ, formatDateShort, showToast, todayDate, addDays } from './utils.js';
import { gotoDate } from './planning.js';

const $ = id => document.getElementById(id);

let _cfg = {};
let _user = null;
let _clients = [];
let _unsubs = [];
let _activeTab = 'list';
let _detailId = null;

export function init(config, user) {
  _cfg = config;
  _user = user;
  _unsubs.forEach(fn => fn());
  _unsubs = [];

  _unsubs.push(onClients(clients => {
    _clients = clients.sort((a, b) => a.nom.localeCompare(b.nom));
    _renderActive();
  }));

  $('client-search').oninput = e => _renderActive(e.target.value.trim());
  $('client-tab-list').onclick = () => _switchTab('list');
  $('client-tab-unpaid').onclick = () => _switchTab('unpaid');
  $('btn-new-client').onclick = () => _openClientForm();
  _bindClientForm();
}

export function destroy() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  _detailId = null;
}

// ─── TABS ────────────────────────────────────────────────────────────────────

function _switchTab(tab) {
  _activeTab = tab;
  $('client-tab-list').classList.toggle('active', tab === 'list');
  $('client-tab-unpaid').classList.toggle('active', tab === 'unpaid');
  $('clients-list-panel').hidden = tab !== 'list';
  $('clients-unpaid-panel').hidden = tab !== 'unpaid';
  _renderActive();
}

function _renderActive(q = $('client-search').value.trim()) {
  if (_activeTab === 'list') _renderList(q);
  else _renderUnpaid();
}

// ─── CLIENT LIST ─────────────────────────────────────────────────────────────

function _renderList(q = '') {
  const ql = q.toLowerCase();
  const filtered = q.length >= 2
    ? _clients.filter(c => c.nom.toLowerCase().includes(ql) || (c.telephone || '').includes(q))
    : _clients;

  if (!filtered.length) {
    $('clients-list-panel').innerHTML = `<p class="empty-msg">${q ? 'Aucun client trouvé.' : 'Aucun client enregistré.'}</p>`;
    return;
  }

  $('clients-list-panel').innerHTML = '<div class="client-list">' + filtered.map(c =>
    `<button class="client-card" data-id="${c.id}">
      <div class="cc-left">
        <span class="cc-nom">${esc(c.nom)}</span>
        ${c.telephone ? `<span class="cc-tel">${esc(c.telephone)}</span>` : ''}
      </div>
      <div class="cc-right">
        <span class="cc-type">${c.type === 'equipe' ? 'Équipe' : 'Individu'}</span>
        <span class="cc-arrow">›</span>
      </div>
    </button>`
  ).join('') + '</div>';

  $('clients-list-panel').querySelectorAll('.client-card').forEach(btn => {
    btn.onclick = () => _showClientDetail(btn.dataset.id);
  });
}

// ─── UNPAID ──────────────────────────────────────────────────────────────────

async function _renderUnpaid() {
  const panel = $('clients-unpaid-panel');
  panel.innerHTML = '<p class="loading-msg">Chargement…</p>';

  // Scan last 30 days
  const unpaid = [];
  const today = todayDate();
  const promises = [];
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, -i);
    promises.push(getReservationsForDate(d).then(resas => ({ d, resas })));
  }
  const results = await Promise.all(promises);

  results.forEach(({ d, resas }) => {
    resas.forEach(r => {
      if (r.statut === 'confirmee' && (r.statutPaiement === 'a_payer' || r.statutPaiement === 'acompte')) {
        const client = _clients.find(c => c.id === r.clientId);
        unpaid.push({ ...r, date: d, clientObj: client });
      }
    });
  });

  if (!unpaid.length) {
    panel.innerHTML = '<p class="empty-msg">Aucun impayé sur les 30 derniers jours.</p>';
    return;
  }

  panel.innerHTML = '<div class="client-list">' + unpaid.map(r => {
    const solde = r.montant - (r.totalPaye || 0);
    return `<button class="unpaid-card" data-date="${r.date}">
      <div class="uc-top">
        <span class="uc-client">${esc(r.clientNom)}</span>
        <span class="uc-solde">${formatFDJ(solde)}</span>
      </div>
      <div class="uc-meta">
        ${_cfg.terrains?.[r.terrainId]?.nom || r.terrainId} · ${r.creneau} · ${formatDateShort(r.date)} ›
      </div>
    </button>`;
  }).join('') + '</div>';

  // Ouvrir le planning à la date de l'impayé pour encaisser directement
  panel.querySelectorAll('.unpaid-card').forEach(card => {
    card.onclick = () => {
      const date = card.dataset.date;
      document.querySelector('#bottom-nav [data-view="planning"]')?.click();
      gotoDate(date);
    };
  });
}

// ─── CLIENT DETAIL ───────────────────────────────────────────────────────────

async function _showClientDetail(id) {
  const client = _clients.find(c => c.id === id);
  if (!client) return;
  _detailId = id;

  const panel = $('clients-list-panel');
  panel.innerHTML = `<div class="det-header">
    <button class="btn-back" id="client-back">← Retour</button>
    <button class="btn-edit" id="client-edit">Modifier</button>
  </div>
  <div class="client-det">
    <h2 class="cdet-nom">${esc(client.nom)}</h2>
    ${client.telephone ? `<p class="cdet-tel">${esc(client.telephone)}</p>` : ''}
    <p class="cdet-type">${client.type === 'equipe' ? 'Équipe' : 'Individu'}</p>
    ${client.notes ? `<p class="cdet-notes">${esc(client.notes)}</p>` : ''}
  </div>
  <h3 class="section-title">Historique</h3>
  <div id="client-history">Chargement…</div>`;

  $('client-back').onclick = () => _renderList();
  $('client-edit').onclick = () => _openClientForm(client);

  // Load history
  const today = todayDate();
  const promises = [];
  for (let i = 0; i < 60; i++) {
    const d = addDays(today, -i);
    promises.push(getReservationsForDate(d).then(r => ({ d, r })));
  }
  const results = await Promise.all(promises);
  const history = [];
  let totalDepense = 0;

  results.forEach(({ d, r }) => {
    r.filter(x => x.clientId === id).forEach(x => {
      history.push({ ...x, date: d });
      totalDepense += x.totalPaye || 0;
    });
  });

  history.sort((a, b) => b.date.localeCompare(a.date));

  let histHtml = `<div class="client-stat"><span>Total dépensé</span><span class="cs-val">${formatFDJ(totalDepense)}</span></div>`;
  if (!history.length) {
    histHtml += '<p class="empty-msg">Aucune réservation trouvée.</p>';
  } else {
    histHtml += '<div class="client-list">' + history.slice(0, 20).map(r => {
      const solde = (r.montant || 0) - (r.totalPaye || 0);
      return `<div class="hist-card">
        <div class="hc-top">
          <span>${_cfg.terrains?.[r.terrainId]?.nom || r.terrainId} · ${r.creneau}</span>
          <span class="hc-date">${formatDateShort(r.date)}</span>
        </div>
        <div class="hc-bottom">
          <span class="hc-montant">${formatFDJ(r.montant)}</span>
          ${solde > 0 && r.statut === 'confirmee' ? `<span class="hc-solde">Dû : ${formatFDJ(solde)}</span>` : ''}
          <span class="hc-statut hc-${r.statut}">${r.statut === 'annulee' ? 'Annulée' : r.statut === 'terminee' ? 'Terminée' : 'En cours'}</span>
        </div>
      </div>`;
    }).join('') + '</div>';
  }

  $('client-history').innerHTML = histHtml;
}

// ─── CLIENT FORM ─────────────────────────────────────────────────────────────

function _openClientForm(client = null) {
  $('cf-title').textContent = client ? 'Modifier le client' : 'Nouveau client';
  $('cf-id').value = client?.id || '';
  $('cf-nom').value = client?.nom || '';
  $('cf-tel').value = client?.telephone || '';
  $('cf-type').value = client?.type || 'equipe';
  $('cf-notes').value = client?.notes || '';
  $('cf-err').hidden = true;
  openClientSheet();
}

function _bindClientForm() {
  $('cf-close').onclick = closeClientSheet;
  $('client-form').onsubmit = async e => {
    e.preventDefault();
    const id = $('cf-id').value;
    const data = {
      nom: $('cf-nom').value.trim(),
      telephone: $('cf-tel').value.trim(),
      type: $('cf-type').value,
      notes: $('cf-notes').value.trim()
    };
    if (!data.nom) {
      $('cf-err').textContent = 'Le nom est requis.';
      $('cf-err').hidden = false;
      return;
    }
    const btn = $('client-form').querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      if (id) {
        await updateClient(id, data);
        showToast('Client mis à jour.', 'success');
      } else {
        await createClient(data);
        showToast('Client créé.', 'success');
      }
      closeClientSheet();
    } catch (err) {
      $('cf-err').textContent = err.message;
      $('cf-err').hidden = false;
      btn.disabled = false;
    }
  };
}

function openClientSheet() {
  $('sheet-client-form').classList.add('open');
  $('sheet-overlay').classList.remove('hidden');
}

function closeClientSheet() {
  $('sheet-client-form').classList.remove('open');
  if (!document.querySelector('.sheet.open')) {
    $('sheet-overlay').classList.add('hidden');
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
