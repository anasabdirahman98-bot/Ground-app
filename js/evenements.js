import {
  onEvenements, createEvenement, updateEvenement, addEquipe, updateEquipe,
  createPaiement, addJournalEntry
} from './db.js';
import {
  todayDate, formatFDJ, formatDateShort, generateSlots, showToast
} from './utils.js';

const $ = id => document.getElementById(id);

let _cfg = {};
let _user = null;
let _evenements = [];
let _onChange = null;
let _unsubs = [];
let _handlersBound = false;
let _currentEvt = null;

export function init(config, user, onChange) {
  _cfg = config;
  _user = user;
  _onChange = onChange;
  _unsubs.forEach(fn => fn());
  _unsubs = [];

  _unsubs.push(onEvenements(list => {
    _evenements = list;
    _renderList();
    if (_currentEvt) {
      const fresh = list.find(e => e.id === _currentEvt.id);
      if (fresh) { _currentEvt = fresh; _renderDetail(); }
    }
    _onChange?.();
  }));

  if (!_handlersBound) {
    _handlersBound = true;
    _bindHandlers();
  }
}

export function destroy() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
}

// Events blocking a given date+terrain+slot — used by planning.js to lock cells
export function getBlockedSlot(date, terrainId, creneau) {
  return _evenements.find(evt => {
    if (evt.statut !== 'actif') return false;
    if (evt.dateDebut > date || evt.dateFin < date) return false;
    if (!evt.terrains?.[terrainId]) return false;
    if (evt.creneaux && Object.keys(evt.creneaux).length && !evt.creneaux[creneau]) return false;
    return true;
  }) || null;
}

export function openEvtDetail(evtId) {
  const evt = _evenements.find(e => e.id === evtId);
  if (!evt) return;
  _currentEvt = evt;
  _showSection('detail');
  _renderDetail();
}

// ─── SECTIONS ────────────────────────────────────────────────────────────────

function _showSection(name) {
  $('evt-list-section').hidden = name !== 'list';
  $('evt-form-section').hidden = name !== 'form';
  $('evt-detail-section').hidden = name !== 'detail';
  if (name !== 'detail') _currentEvt = null;
}

// ─── LIST ────────────────────────────────────────────────────────────────────

function _renderList() {
  const el = $('evt-list');
  if (!el) return;
  const sorted = [..._evenements].sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));
  if (!sorted.length) {
    el.innerHTML = '<p class="empty-msg">Aucun événement.</p>';
    return;
  }
  el.innerHTML = sorted.map(evt => {
    const nbEquipes = Object.keys(evt.equipes || {}).length;
    const statutCls = evt.statut === 'actif' ? 'evt-actif' : 'evt-fini';
    return `<button class="evt-card ${statutCls}" data-evt="${evt.id}">
      <div class="evt-left">
        <div class="evt-nom">🏆 ${esc(evt.nom)}</div>
        <div class="evt-meta">${formatDateShort(evt.dateDebut)} → ${formatDateShort(evt.dateFin)} · ${nbEquipes} équipe${nbEquipes > 1 ? 's' : ''}</div>
        ${evt.fraisInscription ? `<div class="evt-frais">Inscription : ${formatFDJ(evt.fraisInscription)}</div>` : ''}
      </div>
      <span class="badge ${evt.statut === 'actif' ? 'badge-paye' : 'badge-off'}">${evt.statut === 'actif' ? 'Actif' : 'Terminé'}</span>
    </button>`;
  }).join('');

  el.querySelectorAll('[data-evt]').forEach(btn => {
    btn.onclick = () => openEvtDetail(btn.dataset.evt);
  });
}

// ─── DETAIL ──────────────────────────────────────────────────────────────────

function _renderDetail() {
  const evt = _currentEvt;
  const el = $('evt-detail');
  if (!el || !evt) return;

  const terrains = Object.keys(evt.terrains || {})
    .map(tid => _cfg.terrains?.[tid]?.nom || tid).join(', ');
  const creneaux = evt.creneaux && Object.keys(evt.creneaux).length
    ? Object.keys(evt.creneaux).sort().join(', ') : 'Toute la journée';
  const equipes = Object.entries(evt.equipes || {}).map(([id, e]) => ({ id, ...e }));
  const totalInscriptions = equipes.reduce((s, e) => s + (e.totalPaye || 0), 0);

  el.innerHTML = `
    <div class="det-status">
      <span class="badge ${evt.statut === 'actif' ? 'badge-paye' : 'badge-off'}">${evt.statut === 'actif' ? 'Actif' : 'Terminé'}</span>
    </div>
    <dl class="det-dl">
      <div class="det-row"><dt>Nom</dt><dd>${esc(evt.nom)}</dd></div>
      <div class="det-row"><dt>Période</dt><dd>${formatDateShort(evt.dateDebut)} → ${formatDateShort(evt.dateFin)}</dd></div>
      <div class="det-row"><dt>Terrains</dt><dd>${esc(terrains)}</dd></div>
      <div class="det-row"><dt>Créneaux</dt><dd>${esc(creneaux)}</dd></div>
      <div class="det-row"><dt>Frais</dt><dd class="det-amount">${formatFDJ(evt.fraisInscription || 0)}</dd></div>
      <div class="det-row"><dt>Encaissé</dt><dd class="pos">${formatFDJ(totalInscriptions)}</dd></div>
      ${evt.notes ? `<div class="det-row"><dt>Notes</dt><dd>${esc(evt.notes)}</dd></div>` : ''}
    </dl>

    <h3 class="dash-sub">Équipes inscrites (${equipes.length})</h3>
    <div class="equipe-list">
      ${equipes.length ? equipes.map(e => {
        const solde = Math.max(0, (evt.fraisInscription || 0) - (e.totalPaye || 0));
        return `<div class="equipe-row">
          <div class="eq-left">
            <span class="eq-nom">${esc(e.nom)}</span>
            ${e.telephone ? `<span class="eq-tel">${esc(e.telephone)}</span>` : ''}
          </div>
          ${solde > 0
            ? `<button class="btn btn-sm btn-primary eq-pay" data-eq="${e.id}" data-solde="${solde}">Encaisser ${formatFDJ(solde)}</button>`
            : '<span class="badge badge-paye">Payé</span>'}
        </div>`;
      }).join('') : '<p class="empty-msg" style="padding:var(--sp-4)">Aucune équipe inscrite.</p>'}
    </div>

    <form id="equipe-form" class="equipe-form">
      <div class="field-row">
        <div class="field" style="margin-bottom:0">
          <input type="text" id="eq-f-nom" placeholder="Nom de l'équipe" required>
        </div>
        <div class="field" style="margin-bottom:0">
          <input type="tel" id="eq-f-tel" placeholder="Téléphone (opt.)" inputmode="tel">
        </div>
      </div>
      <button type="submit" class="btn btn-secondary btn-full" style="margin-top:var(--sp-3)">+ Inscrire l'équipe</button>
    </form>

    ${evt.statut === 'actif' ? `<button class="btn btn-ghost btn-full" id="evt-close-btn" style="margin-top:var(--sp-4)">Clore l'événement</button>` : ''}
  `;

  el.querySelectorAll('.eq-pay').forEach(btn => {
    btn.onclick = () => _payEquipe(btn.dataset.eq, Number(btn.dataset.solde), btn);
  });

  $('equipe-form').onsubmit = async e => {
    e.preventDefault();
    const nom = $('eq-f-nom').value.trim();
    if (!nom) return;
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await addEquipe(evt.id, {
        nom,
        telephone: $('eq-f-tel').value.trim(),
        totalPaye: 0
      });
      showToast(`Équipe « ${nom} » inscrite.`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  const closeBtn = $('evt-close-btn');
  if (closeBtn) closeBtn.onclick = async () => {
    if (!confirm(`Clore « ${evt.nom} » ? Les créneaux seront libérés.`)) return;
    try {
      await updateEvenement(evt.id, { statut: 'termine' });
      showToast('Événement clos.', 'info');
      _showSection('list');
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function _payEquipe(equipeId, solde, btn) {
  const evt = _currentEvt;
  const equipe = evt.equipes?.[equipeId];
  if (!equipe) return;
  btn.disabled = true;
  try {
    await createPaiement(todayDate(), {
      resaId: `evt:${evt.id}:${equipeId}`,
      montant: solde,
      mode: 'especes',
      type: 'paiement',
      motif: `Inscription ${evt.nom} — ${equipe.nom}`,
      employeId: _user.uid,
      employeNom: _user.nom
    });
    await updateEquipe(evt.id, equipeId, { totalPaye: (equipe.totalPaye || 0) + solde });
    await addJournalEntry(todayDate(), {
      action: 'encaissement',
      userId: _user.uid,
      userNom: _user.nom,
      details: `Inscription ${evt.nom} — ${equipe.nom} ${formatFDJ(solde)}`
    });
    showToast(`${formatFDJ(solde)} encaissé.`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
  }
}

// ─── FORM ────────────────────────────────────────────────────────────────────

function _bindHandlers() {
  $('btn-new-evt')?.addEventListener('click', _showForm);
  $('evt-form-back')?.addEventListener('click', () => _showSection('list'));
  $('evt-detail-back')?.addEventListener('click', () => _showSection('list'));
  $('evt-form')?.addEventListener('submit', async e => { e.preventDefault(); await _submitForm(); });
}

function _showForm() {
  _showSection('form');
  $('evt-f-nom').value = '';
  $('evt-f-debut').value = todayDate();
  $('evt-f-fin').value = todayDate();
  $('evt-f-frais').value = '';
  $('evt-f-notes').value = '';
  $('evt-form-err').hidden = true;
  _fillTerrainChecks();
  _fillCreneauChecks();
}

function _fillTerrainChecks() {
  const wrap = $('evt-f-terrains');
  const terrains = Object.entries(_cfg.terrains || {})
    .filter(([, t]) => t.actif !== false)
    .sort(([, a], [, b]) => (a.ordre || 99) - (b.ordre || 99));
  wrap.innerHTML = terrains.map(([id, t]) =>
    `<label class="day-toggle-label evt-check"><input type="checkbox" class="evt-terrain-check" value="${id}"><span>${esc(t.nom)}</span></label>`
  ).join('');
}

function _fillCreneauChecks() {
  const wrap = $('evt-f-creneaux');
  if (!_cfg.horaires?.ouverture) { wrap.innerHTML = ''; return; }
  const slots = generateSlots(
    _cfg.horaires.ouverture, _cfg.horaires.fermeture, _cfg.horaires.dureeCreneauMin || 60
  );
  wrap.innerHTML = slots.map(s =>
    `<label class="day-toggle-label evt-check"><input type="checkbox" class="evt-creneau-check" value="${s}"><span>${s}</span></label>`
  ).join('');
}

async function _submitForm() {
  const errEl = $('evt-form-err');
  errEl.hidden = true;

  const nom = $('evt-f-nom').value.trim();
  const dateDebut = $('evt-f-debut').value;
  const dateFin = $('evt-f-fin').value;
  const frais = parseInt($('evt-f-frais').value, 10) || 0;
  const notes = $('evt-f-notes').value.trim();
  const terrains = {};
  document.querySelectorAll('.evt-terrain-check:checked').forEach(cb => { terrains[cb.value] = true; });
  const creneaux = {};
  document.querySelectorAll('.evt-creneau-check:checked').forEach(cb => { creneaux[cb.value] = true; });

  if (!nom) { errEl.textContent = 'Nom requis.'; errEl.hidden = false; return; }
  if (!dateDebut || !dateFin || dateFin < dateDebut) {
    errEl.textContent = 'Période invalide.'; errEl.hidden = false; return;
  }
  if (!Object.keys(terrains).length) {
    errEl.textContent = 'Sélectionnez au moins un terrain.'; errEl.hidden = false; return;
  }

  const btn = $('evt-form').querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    await createEvenement({
      nom,
      dateDebut,
      dateFin,
      terrains,
      creneaux: Object.keys(creneaux).length ? creneaux : null,
      fraisInscription: frais,
      notes,
      statut: 'actif',
      equipes: {},
      employeId: _user.uid,
      employeNom: _user.nom
    });
    await addJournalEntry(todayDate(), {
      action: 'evenement_cree',
      userId: _user.uid,
      userNom: _user.nom,
      details: `${nom} (${dateDebut} → ${dateFin})`
    });
    _showSection('list');
    showToast('Événement créé.', 'success');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
