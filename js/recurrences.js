import {
  onRecurrences, createRecurrence, updateRecurrence, addRecurrenceException,
  onClients, createReservation, addJournalEntry
} from './db.js';
import {
  todayDate, formatFDJ, generateSlots, getTarif, showToast
} from './utils.js';

const $ = id => document.getElementById(id);

let _cfg = {};
let _user = null;
let _recurrences = [];
let _clients = [];
let _unsubs = [];
let _handlersBound = false;

export function init(config, user) {
  _cfg = config;
  _user = user;
  _unsubs.forEach(fn => fn());
  _unsubs = [];

  _unsubs.push(onRecurrences(list => { _recurrences = list; _render(); }));
  _unsubs.push(onClients(list => { _clients = list.sort((a, b) => a.nom.localeCompare(b.nom)); }));

  if (!_handlersBound) {
    _handlersBound = true;
    _bindHandlers();
  }
}

export function destroy() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
}

// Returns recurrences that apply for a given date (YYYY-MM-DD)
export function getRecurrencesForDate(date) {
  const dow = new Date(date + 'T12:00:00').getDay();
  return _recurrences.filter(rec => {
    if (rec.statut !== 'active') return false;
    if (rec.dateDebut > date) return false;
    if (rec.dateFin && rec.dateFin < date) return false;
    if (!(rec.joursRepetition || []).includes(dow)) return false;
    if (rec.exceptions?.[date]) return false;
    return true;
  });
}

// Auto-create recurring reservations for a date (called by planning.js)
// isBlocked(terrainId, creneau) — skip slots locked by an event
export async function materializeForDate(date, resas, currentUser, isBlocked) {
  const applicable = getRecurrencesForDate(date);
  for (const rec of applicable) {
    const exists = resas.some(r =>
      r.terrainId === rec.terrainId && r.creneau === rec.creneau &&
      r.recurrenceId === rec.id && r.statut !== 'annulee'
    );
    if (exists) continue;
    if (isBlocked?.(rec.terrainId, rec.creneau)) continue;
    try {
      await createReservation(date, {
        terrainId: rec.terrainId,
        creneau: rec.creneau,
        clientId: rec.clientId,
        clientNom: rec.clientNom,
        montant: rec.montant,
        totalPaye: 0,
        statutPaiement: 'a_payer',
        notes: rec.notes || '',
        recurrenceId: rec.id,
        employeId: currentUser.uid,
        employeNom: currentUser.nom
      });
      await addJournalEntry(date, {
        action: 'reservation_recurrente',
        userId: currentUser.uid,
        userNom: currentUser.nom,
        details: `${rec.clientNom} — récurrence auto`
      });
    } catch (_) {
      // Slot taken or already exists — ignore
    }
  }
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function _render() {
  const el = $('rec-list');
  if (!el) return;
  const active = _recurrences.filter(r => r.statut === 'active');
  const suspended = _recurrences.filter(r => r.statut !== 'active');
  const all = [...active, ...suspended];

  if (!all.length) {
    el.innerHTML = '<p class="empty-msg">Aucune récurrence configurée.</p>';
    return;
  }
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  el.innerHTML = all.map(rec => {
    const terrain = _cfg.terrains?.[rec.terrainId];
    const jours = (rec.joursRepetition || [])
      .slice().sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
      .map(d => days[d]).join(', ');
    return `<div class="rec-card${rec.statut !== 'active' ? ' rec-suspended' : ''}">
      <div class="rec-left">
        <div class="rec-nom">${esc(rec.clientNom)}</div>
        <div class="rec-meta">${esc(terrain?.nom || rec.terrainId)} · ${rec.creneau} · ${formatFDJ(rec.montant)}</div>
        <div class="rec-jours">${jours}</div>
        ${rec.dateFin ? `<div class="rec-fin">Fin : ${rec.dateFin}</div>` : ''}
      </div>
      <button class="btn btn-sm btn-ghost rec-toggle-btn" data-rec-id="${rec.id}" data-statut="${rec.statut}">
        ${rec.statut === 'active' ? 'Suspendre' : 'Activer'}
      </button>
    </div>`;
  }).join('');

  el.querySelectorAll('.rec-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const newStatut = btn.dataset.statut === 'active' ? 'suspendue' : 'active';
      try {
        await updateRecurrence(btn.dataset.recId, { statut: newStatut });
        showToast(newStatut === 'active' ? 'Récurrence activée.' : 'Récurrence suspendue.', 'info');
      } catch (e) { showToast(e.message, 'error'); }
    };
  });
}

function _bindHandlers() {
  $('btn-new-rec')?.addEventListener('click', _showForm);
  $('rec-form-back')?.addEventListener('click', _showList);
  $('rec-form')?.addEventListener('submit', async e => { e.preventDefault(); await _submitForm(); });

  const search = $('rec-f-client-search');
  if (search) {
    search.addEventListener('input', e => _filterClients(e.target.value.trim()));
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('#rec-f-client-drop') && !e.target.closest('#rec-f-client-search')) {
        const drop = $('rec-f-client-drop');
        if (drop) drop.hidden = true;
      }
    }, { passive: true });
  }

  $('rec-f-terrain')?.addEventListener('change', _updateMontantHint);
  $('rec-f-creneau')?.addEventListener('change', _updateMontantHint);
}

function _showList() {
  $('rec-list-section').hidden = false;
  $('rec-form-section').hidden = true;
}

function _showForm() {
  _resetForm();
  $('rec-list-section').hidden = true;
  $('rec-form-section').hidden = false;
  _fillTerrainSelect();
  _fillCreneauSelect();
  $('rec-f-date-debut').value = todayDate();
  $('rec-f-date-fin').value = '';
  setTimeout(() => $('rec-f-client-search')?.focus(), 100);
}

function _resetForm() {
  $('rec-f-client-search').value = '';
  $('rec-f-client-id').value = '';
  $('rec-f-client-chip').hidden = true;
  $('rec-f-client-search').hidden = false;
  $('rec-f-client-drop').hidden = true;
  $('rec-f-montant').value = '';
  $('rec-f-notes').value = '';
  $('rec-form-err').hidden = true;
  document.querySelectorAll('.day-toggle').forEach(cb => { cb.checked = false; });
}

function _fillTerrainSelect() {
  const sel = $('rec-f-terrain');
  if (!sel) return;
  const terrains = Object.entries(_cfg.terrains || {})
    .filter(([, t]) => t.actif !== false)
    .sort(([, a], [, b]) => (a.ordre || 99) - (b.ordre || 99));
  sel.innerHTML = terrains.map(([id, t]) => `<option value="${id}">${esc(t.nom)}</option>`).join('');
}

function _fillCreneauSelect() {
  const sel = $('rec-f-creneau');
  if (!sel || !_cfg.horaires?.ouverture) return;
  const slots = generateSlots(
    _cfg.horaires.ouverture, _cfg.horaires.fermeture, _cfg.horaires.dureeCreneauMin || 60
  );
  sel.innerHTML = slots.map(s => `<option value="${s}">${s}</option>`).join('');
}

function _updateMontantHint() {
  const tid = $('rec-f-terrain')?.value;
  const creneau = $('rec-f-creneau')?.value;
  const montantEl = $('rec-f-montant');
  if (!tid || !creneau || !montantEl || montantEl.value) return;
  const tarif = getTarif(tid, creneau, _cfg.tarifs);
  if (tarif) montantEl.value = tarif;
}

function _filterClients(q) {
  const drop = $('rec-f-client-drop');
  if (q.length < 2) { drop.hidden = true; return; }
  const ql = q.toLowerCase();
  const hits = _clients.filter(c =>
    c.nom.toLowerCase().includes(ql) || (c.telephone || '').includes(q)
  ).slice(0, 7);

  drop.innerHTML = hits.map(c =>
    `<button type="button" class="drop-item" data-id="${c.id}" data-nom="${esc(c.nom)}">
      <span class="di-nom">${esc(c.nom)}</span>
      ${c.telephone ? `<span class="di-tel">${esc(c.telephone)}</span>` : ''}
    </button>`
  ).join('');
  drop.hidden = false;

  drop.onclick = e => {
    const item = e.target.closest('.drop-item');
    if (!item) return;
    drop.hidden = true;
    _selectClient(item.dataset.id, item.dataset.nom);
  };
}

function _selectClient(id, nom) {
  $('rec-f-client-id').value = id;
  $('rec-f-client-search').hidden = true;
  const chip = $('rec-f-client-chip');
  chip.innerHTML = `<span>${esc(nom)}</span><button type="button" aria-label="Retirer">✕</button>`;
  chip.hidden = false;
  chip.querySelector('button').onclick = () => {
    $('rec-f-client-id').value = '';
    $('rec-f-client-search').hidden = false;
    $('rec-f-client-search').value = '';
    chip.hidden = true;
    $('rec-f-client-search').focus();
  };
}

async function _submitForm() {
  const errEl = $('rec-form-err');
  errEl.hidden = true;

  const clientId = $('rec-f-client-id').value.trim();
  const clientNom = $('rec-f-client-chip').querySelector('span')?.textContent?.trim()
    || $('rec-f-client-search').value.trim();
  const terrainId = $('rec-f-terrain').value;
  const creneau = $('rec-f-creneau').value;
  const montant = parseInt($('rec-f-montant').value, 10);
  const dateDebut = $('rec-f-date-debut').value;
  const dateFin = $('rec-f-date-fin').value || null;
  const notes = $('rec-f-notes').value.trim();
  const joursRepetition = Array.from(document.querySelectorAll('.day-toggle:checked'))
    .map(cb => Number(cb.value));

  if (!clientId) { errEl.textContent = 'Sélectionner un client.'; errEl.hidden = false; return; }
  if (!terrainId) { errEl.textContent = 'Terrain requis.'; errEl.hidden = false; return; }
  if (!creneau) { errEl.textContent = 'Créneau requis.'; errEl.hidden = false; return; }
  if (isNaN(montant) || montant < 0) { errEl.textContent = 'Montant invalide.'; errEl.hidden = false; return; }
  if (!dateDebut) { errEl.textContent = 'Date de début requise.'; errEl.hidden = false; return; }
  if (!joursRepetition.length) { errEl.textContent = 'Sélectionnez au moins un jour.'; errEl.hidden = false; return; }

  const btn = $('rec-form').querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    await createRecurrence({
      clientId,
      clientNom,
      terrainId,
      creneau,
      montant,
      dateDebut,
      dateFin,
      notes,
      joursRepetition,
      statut: 'active',
      exceptions: {},
      employeId: _user.uid,
      employeNom: _user.nom
    });
    _showList();
    showToast('Récurrence créée.', 'success');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
