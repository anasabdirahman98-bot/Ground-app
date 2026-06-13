import {
  onReservationsForDate, createReservation, updateReservation,
  cancelReservation, createPaiement, getPaiementsForDate, getCloture,
  onClients, createClient, addJournalEntry, addRecurrenceException
} from './db.js';
import {
  todayDate, addDays, formatDate, generateSlots, getTarif,
  formatFDJ, formatDateTime, creneauClass, statutLabel, modePaiementLabel, showToast
} from './utils.js';
import {
  init as initRec, destroy as destroyRec, materializeForDate
} from './recurrences.js';
import {
  init as initEvt, destroy as destroyEvt, getBlockedSlot, openEvtDetail
} from './evenements.js';
import {
  attachWaitlist, offerNotifyNext, destroy as destroyWaitlist
} from './waitlist.js';

const $ = id => document.getElementById(id);

let _cfg = {};
let _user = null;
let _date = todayDate();
let _resas = [];
let _clients = [];
let _unsubs = [];
const _materializedDates = new Set();

export function init(config, user) {
  // Clean up any previous subscriptions before re-initializing
  const prevClients = _unsubs.find(fn => fn._key === 'clients');
  if (prevClients) { prevClients(); _unsubs = _unsubs.filter(fn => fn._key !== 'clients'); }

  _cfg = config;
  _user = user;

  // Only reset date and rebind on first init (not config refresh)
  const isFirst = !_unsubs.length;
  if (isFirst) {
    _date = todayDate();
    _bindDateNav();
    _bindFormHandlers();
    _bindSheetHandlers();
  }

  initRec(config, user);
  initEvt(config, user, _renderGrid);
  _startClientsListener();
  _loadDate(_date);
}

export function destroy() {
  destroyRec();
  destroyEvt();
  destroyWaitlist();
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  _materializedDates.clear();
}

// ─── DATE NAVIGATION ─────────────────────────────────────────────────────────

function _bindDateNav() {
  $('date-prev').onclick = () => _loadDate(addDays(_date, -1));
  $('date-next').onclick = () => _loadDate(addDays(_date, 1));
  const picker = $('date-picker');
  $('date-current').onclick = () => picker.showPicker ? picker.showPicker() : picker.click();
  picker.onchange = e => { if (e.target.value) _loadDate(e.target.value); };
  $('date-today').onclick = () => _loadDate(todayDate());
  $('btn-recurrences').onclick = () => openSheet('recurrences');
  $('btn-evenements').onclick = () => openSheet('evenements');
}

// Navigation externe (ex. depuis l'onglet Impayés)
export function gotoDate(date) {
  _loadDate(date);
}

function _loadDate(date) {
  _date = date;
  $('date-label').textContent = formatDate(date);
  $('date-picker').value = date;
  const todayBtn = $('date-today');
  if (todayBtn) todayBtn.hidden = date === todayDate();

  const prev = _unsubs.find(fn => fn._key === 'resas');
  if (prev) { prev(); _unsubs = _unsubs.filter(fn => fn._key !== 'resas'); }

  const unsub = onReservationsForDate(date, resas => {
    _resas = resas;
    if (!_materializedDates.has(date)) {
      _materializedDates.add(date);
      materializeForDate(date, resas, _user, (tid, slot) => !!getBlockedSlot(date, tid, slot))
        .catch(() => {});
    }
    _renderGrid();
  });
  unsub._key = 'resas';
  _unsubs.push(unsub);
}

function _startClientsListener() {
  const unsub = onClients(list => {
    _clients = list.sort((a, b) => a.nom.localeCompare(b.nom));
  });
  unsub._key = 'clients';
  _unsubs.push(unsub);
}

// ─── GRID ────────────────────────────────────────────────────────────────────

function _renderGrid() {
  const container = $('planning-grid');
  if (!container) return;

  const { terrains = {}, horaires = {}, tarifs = {} } = _cfg;
  const active = Object.entries(terrains)
    .filter(([, t]) => t.actif !== false)
    .sort(([, a], [, b]) => (a.ordre || 99) - (b.ordre || 99));

  if (!active.length || !horaires.ouverture) {
    container.innerHTML = '<p class="empty-grid-msg">Aucun terrain configuré — contactez le gérant.</p>';
    return;
  }

  const slots = generateSlots(
    horaires.ouverture, horaires.fermeture, horaires.dureeCreneauMin || 60
  );

  const resaMap = {};
  _resas.forEach(r => {
    if (r.statut !== 'annulee') resaMap[`${r.terrainId}_${r.creneau}`] = r;
  });

  let html = `<div class="pg-grid" style="--pg-cols:${active.length + 1}">`;

  html += '<div class="pg-corner"></div>';
  active.forEach(([, t]) => {
    html += `<div class="pg-th">${esc(t.nom)}<small>${t.type === 'foot5' ? '5×5' : '7×7'}</small></div>`;
  });

  slots.forEach(slot => {
    html += `<div class="pg-time">${slot}</div>`;
    active.forEach(([tid]) => {
      const resa = resaMap[`${tid}_${slot}`];
      const cls = creneauClass(resa);
      const evt = !resa ? getBlockedSlot(_date, tid, slot) : null;
      if (evt) {
        html += `<button class="pg-cell pg-evt" data-evt="${evt.id}" aria-label="Bloqué — ${esc(evt.nom)}">
          <span class="pg-nom">🏆 ${esc(evt.nom)}</span>
          <span class="pg-evt-label">Événement</span>
        </button>`;
      } else if (!resa) {
        const tarif = getTarif(tid, slot, tarifs);
        html += `<button class="pg-cell pg-libre" data-t="${tid}" data-s="${slot}" data-tarif="${tarif}" aria-label="Réserver ${slot} ${_cfg.terrains?.[tid]?.nom}"></button>`;
      } else {
        const solde = (resa.montant || 0) - (resa.totalPaye || 0);
        html += `<button class="pg-cell pg-${cls}" data-resa="${resa.id}" aria-label="${esc(resa.clientNom)} ${statutLabel(resa.statut, resa.statutPaiement)}">
          <span class="pg-nom">${esc(resa.clientNom || '—')}</span>
          <span class="pg-amt">${formatFDJ(resa.montant)}</span>
          ${solde > 0 && resa.statut === 'confirmee' ? `<span class="pg-solde">+${formatFDJ(solde)}</span>` : ''}
        </button>`;
      }
    });
  });

  html += '</div>';
  container.innerHTML = html;

  container.onclick = e => {
    const cell = e.target.closest('[data-t],[data-resa],[data-evt]');
    if (!cell) return;
    if (cell.dataset.t) {
      _openResaForm(cell.dataset.t, cell.dataset.s, Number(cell.dataset.tarif));
    } else if (cell.dataset.resa) {
      const resa = _resas.find(r => r.id === cell.dataset.resa);
      if (resa) _openResaDetail(resa);
    } else if (cell.dataset.evt) {
      openSheet('evenements');
      openEvtDetail(cell.dataset.evt);
    }
  };
}

// ─── RESERVATION FORM ────────────────────────────────────────────────────────

let _fCtx = {};

function _openResaForm(tid, slot, tarif) {
  _fCtx = { tid, slot, tarif };
  const t = _cfg.terrains?.[tid];

  $('rf-terrain').textContent = t?.nom || tid;
  $('rf-date').textContent = formatDate(_date).replace(/Aujourd'hui · /, '');
  $('rf-slot').textContent = slot;
  $('resa-montant').value = tarif || '';
  $('resa-montant-hint').textContent = tarif ? `Tarif : ${formatFDJ(tarif)}` : '';
  document.querySelector('[name="rstp"][value="a_payer"]').checked = true;
  $('resa-mode-field').hidden = true;
  $('resa-notes').value = '';
  $('rf-client-search').value = '';
  $('rf-client-id').value = '';
  $('rf-client-chip').hidden = true;
  $('rf-client-search').hidden = false;
  $('rf-client-drop').hidden = true;
  $('resa-form-err').hidden = true;
  _fillModeSelect('resa-mode');
  openSheet('resa-form');
  setTimeout(() => $('rf-client-search').focus(), 300);
}

function _bindFormHandlers() {
  document.querySelectorAll('[name="rstp"]').forEach(r => {
    r.onchange = () => {
      const v = document.querySelector('[name="rstp"]:checked')?.value;
      $('resa-mode-field').hidden = !(v === 'acompte' || v === 'paye');
    };
  });

  $('rf-client-search').oninput = e => _filterClients(e.target.value.trim());

  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#rf-client-drop') && !e.target.closest('#rf-client-search')) {
      $('rf-client-drop').hidden = true;
    }
  }, { passive: true });

  $('resa-form').onsubmit = async e => { e.preventDefault(); await _submitResaForm(); };
}

function _filterClients(q) {
  if (q.length < 2) { $('rf-client-drop').hidden = true; return; }
  const ql = q.toLowerCase();
  const hits = _clients.filter(c =>
    c.nom.toLowerCase().includes(ql) || (c.telephone || '').includes(q)
  ).slice(0, 7);

  let html = hits.map(c =>
    `<button type="button" class="drop-item" data-id="${c.id}" data-nom="${esc(c.nom)}">
      <span class="di-nom">${esc(c.nom)}</span>
      ${c.telephone ? `<span class="di-tel">${esc(c.telephone)}</span>` : ''}
    </button>`
  ).join('');
  html += `<button type="button" class="drop-item drop-create" data-q="${esc(q)}">+ Créer « ${esc(q)} »</button>`;

  const drop = $('rf-client-drop');
  drop.innerHTML = html;
  drop.hidden = false;

  drop.onclick = async e => {
    const item = e.target.closest('.drop-item');
    if (!item) return;
    drop.hidden = true;
    if (item.dataset.q) {
      await _createClientInline(item.dataset.q);
    } else {
      _selectClient(item.dataset.id, item.dataset.nom);
    }
  };
}

function _selectClient(id, nom) {
  $('rf-client-id').value = id;
  $('rf-client-search').hidden = true;
  const chip = $('rf-client-chip');
  chip.innerHTML = `<span>${esc(nom)}</span><button type="button" aria-label="Retirer">✕</button>`;
  chip.hidden = false;
  chip.querySelector('button').onclick = () => {
    $('rf-client-id').value = '';
    $('rf-client-search').hidden = false;
    $('rf-client-search').value = '';
    chip.hidden = true;
    $('rf-client-search').focus();
  };
}

async function _createClientInline(nom) {
  try {
    const id = await createClient({ nom, telephone: '', type: 'equipe', notes: '' });
    _selectClient(id, nom);
    showToast(`Client « ${nom} » créé.`, 'success');
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

async function _submitResaForm() {
  const err = $('resa-form-err');
  err.hidden = true;

  const clientId = $('rf-client-id').value;
  if (!clientId) {
    err.textContent = 'Veuillez sélectionner ou créer un client.';
    err.hidden = false;
    return;
  }

  const montant = parseInt($('resa-montant').value, 10);
  if (isNaN(montant) || montant < 0) {
    err.textContent = 'Montant invalide.';
    err.hidden = false;
    return;
  }

  const clientNom = $('rf-client-chip').querySelector('span')?.textContent || '';
  const statutPaiement = document.querySelector('[name="rstp"]:checked')?.value || 'a_payer';
  const mode = $('resa-mode').value || 'especes';
  const notes = $('resa-notes').value.trim();

  const btn = $('resa-form').querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'En cours…';

  try {
    if (statutPaiement !== 'a_payer' && !(await _confirmIfCloturee(_date))) return;
    const resaId = await createReservation(_date, {
      terrainId: _fCtx.tid,
      creneau: _fCtx.slot,
      clientId,
      clientNom,
      montant,
      totalPaye: 0,
      statutPaiement,
      notes,
      employeId: _user.uid,
      employeNom: _user.nom
    });

    if (statutPaiement !== 'a_payer') {
      await createPaiement(_date, {
        resaId,
        montant,
        mode,
        type: 'paiement',
        motif: null,
        employeId: _user.uid,
        employeNom: _user.nom
      });
      await updateReservation(_date, resaId, { totalPaye: montant, statutPaiement: 'paye' });
    }

    await addJournalEntry(_date, {
      action: 'reservation_creee',
      userId: _user.uid,
      userNom: _user.nom,
      details: `${clientNom} — ${_cfg.terrains?.[_fCtx.tid]?.nom} ${_fCtx.slot} ${formatFDJ(montant)}`
    });

    closeSheet('resa-form');
    showToast('Réservation créée !', 'success');
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Réserver ce créneau';
  }
}

// ─── RESERVATION DETAIL ──────────────────────────────────────────────────────

async function _openResaDetail(resa) {
  const paiements = await getPaiementsForDate(_date);
  const rp = paiements.filter(p => p.resaId === resa.id);
  const totalPaye = rp.reduce((s, p) => s + (p.type === 'ajustement' ? -Math.abs(p.montant) : p.montant), 0);
  const solde = Math.max(0, resa.montant - totalPaye);
  const terrain = _cfg.terrains?.[resa.terrainId];
  const statLabel = statutLabel(resa.statut, resa.statutPaiement);
  const client = _clients.find(c => c.id === resa.clientId);
  const waPhone = _waPhone(client?.telephone);
  const waDate = formatDate(_date).replace(/Aujourd'hui · /, '');
  const waText = waPhone ? encodeURIComponent(
    `Bonjour ${resa.clientNom} ! Rappel réservation :\n` +
    `${terrain?.nom || resa.terrainId} · ${resa.creneau} · ${waDate}\n` +
    `Montant : ${formatFDJ(resa.montant)}`
  ) : '';

  const canPay = resa.statut === 'confirmee' && solde > 0;
  const canCheckin = resa.statut === 'confirmee';
  const canCancel = resa.statut === 'confirmee';
  const canNoshow = resa.statut === 'confirmee';

  let rpHtml = '';
  if (rp.length) {
    rpHtml = '<div class="rp-list">' + rp.map(p => {
      const sign = p.type === 'ajustement' ? '−' : '+';
      return `<div class="rp-row">
        <span>${formatDateTime(p.timestamp)} · ${modePaiementLabel(p.mode)}</span>
        <span class="${p.type === 'ajustement' ? 'neg' : 'pos'}">${sign}${formatFDJ(Math.abs(p.montant))}</span>
      </div>`;
    }).join('') + '</div>';
  }

  $('sheet-resa-detail-body').innerHTML = `
    <div class="det-status">
      <span class="badge badge-${resa.statut === 'annulee' ? 'annulee' : resa.statutPaiement}">${statLabel}</span>
      ${resa.recurrenceId ? '<span class="rec-badge">↻ Récurrence</span>' : ''}
    </div>
    <dl class="det-dl">
      <div class="det-row"><dt>Terrain</dt><dd>${esc(terrain?.nom || resa.terrainId)}</dd></div>
      <div class="det-row"><dt>Créneau</dt><dd>${resa.creneau}</dd></div>
      <div class="det-row"><dt>Client</dt><dd>${esc(resa.clientNom)}</dd></div>
      <div class="det-row"><dt>Montant</dt><dd class="det-amount">${formatFDJ(resa.montant)}</dd></div>
      ${totalPaye > 0 ? `<div class="det-row"><dt>Payé</dt><dd class="pos">${formatFDJ(totalPaye)}</dd></div>` : ''}
      ${solde > 0 && resa.statut === 'confirmee' ? `<div class="det-row"><dt>Solde dû</dt><dd class="solde">${formatFDJ(solde)}</dd></div>` : ''}
      ${resa.notes ? `<div class="det-row"><dt>Notes</dt><dd>${esc(resa.notes)}</dd></div>` : ''}
      <div class="det-row"><dt>Employé</dt><dd>${esc(resa.employeNom)} · ${formatDateTime(resa.createdAt)}</dd></div>
    </dl>
    ${rpHtml}
    ${resa.motifAnnulation ? `<p class="cancel-reason">Motif annulation : ${esc(resa.motifAnnulation)}</p>` : ''}
    <div class="det-actions">
      ${canPay ? `<button class="btn btn-primary" id="da-pay">Encaisser ${formatFDJ(solde)}</button>` : ''}
      ${canCheckin ? `<button class="btn btn-secondary" id="da-checkin">Check-in ✓</button>` : ''}
      ${waPhone ? `<a class="btn btn-wa" href="https://wa.me/${waPhone}?text=${waText}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
      ${canNoshow ? `<button class="btn btn-ghost btn-sm" id="da-noshow">No-show</button>` : ''}
      ${canCancel ? `<button class="btn btn-danger btn-sm" id="da-cancel">Annuler</button>` : ''}
    </div>`;

  openSheet('resa-detail');

  // Phase 4 — file d'attente sur ce créneau (bloc ajouté en bas de la fiche)
  attachWaitlist(resa, _date, _user, terrain?.nom);

  if (canPay) $('da-pay').onclick = () => _openPaySheet(resa, solde);

  if (canCheckin) $('da-checkin').onclick = async () => {
    try {
      await updateReservation(_date, resa.id, { statut: 'terminee' });
      await addJournalEntry(_date, { action: 'checkin', userId: _user.uid, userNom: _user.nom, details: `${resa.clientNom} ${resa.creneau}` });
      closeSheet('resa-detail');
      showToast('Check-in effectué.', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
  if (canNoshow) $('da-noshow').onclick = async () => {
    try {
      await updateReservation(_date, resa.id, { statut: 'noshow' });
      closeSheet('resa-detail');
      showToast('Marqué no-show.', 'info');
    } catch (e) { showToast(e.message, 'error'); }
  };
  if (canCancel) $('da-cancel').onclick = () => {
    closeSheet('resa-detail');
    _openCancelModal(resa);
  };
}

// ─── PAYMENT SHEET ───────────────────────────────────────────────────────────

// Garde-fou : la caisse de cette date est-elle déjà clôturée ?
// Retourne true si on peut encaisser (pas de clôture, ou confirmation explicite).
async function _confirmIfCloturee(date, message) {
  let cl = null;
  try { cl = await getCloture(date); } catch (_) { return true; }
  if (!cl) return true;
  return confirm(message ||
    '⚠ La caisse de cette journée est déjà clôturée.\nEnregistrer quand même cet encaissement ? L\'écart de clôture ne correspondra plus.');
}

function _openPaySheet(resa, solde) {
  closeSheet('resa-detail');
  _fillModeSelect('payment-mode');
  $('payment-montant').value = solde;
  $('pay-client').textContent = resa.clientNom;
  $('pay-solde').textContent = formatFDJ(solde);
  $('payment-err').hidden = true;

  openSheet('payment');

  $('payment-form').onsubmit = async e => {
    e.preventDefault();
    const montant = parseInt($('payment-montant').value, 10);
    const mode = $('payment-mode').value;
    const errEl = $('payment-err');
    if (isNaN(montant) || montant <= 0) {
      errEl.textContent = 'Montant invalide.';
      errEl.hidden = false;
      return;
    }
    const btn = $('payment-form').querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      if (!(await _confirmIfCloturee(_date))) return;
      await createPaiement(_date, {
        resaId: resa.id, montant, mode,
        type: 'paiement', motif: null,
        employeId: _user.uid, employeNom: _user.nom
      });
      const allP = await getPaiementsForDate(_date);
      const resaP = allP.filter(p => p.resaId === resa.id);
      const totalPaye = resaP.reduce((s, p) => s + (p.type === 'ajustement' ? -Math.abs(p.montant) : p.montant), 0);
      const newStat = totalPaye >= resa.montant ? 'paye' : 'acompte';
      await updateReservation(_date, resa.id, { totalPaye, statutPaiement: newStat });
      await addJournalEntry(_date, {
        action: 'encaissement', userId: _user.uid, userNom: _user.nom,
        details: `${resa.clientNom} ${formatFDJ(montant)} (${modePaiementLabel(mode)})`
      });
      closeSheet('payment');
      showToast(`${formatFDJ(montant)} encaissé.`, 'success');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  };
}

// ─── CANCEL MODAL ────────────────────────────────────────────────────────────

async function _openCancelModal(resa) {
  $('cancel-motif').value = '';
  $('cancel-err').hidden = true;

  // Montant réellement payé, recalculé depuis les paiements (le champ
  // totalPaye de la résa peut être périmé si un encaissement vient d'avoir lieu)
  let paid = resa.totalPaye || 0;
  try {
    const paiements = await getPaiementsForDate(_date);
    paid = paiements.filter(p => p.resaId === resa.id)
      .reduce((s, p) => s + (p.type === 'ajustement' ? -Math.abs(p.montant) : p.montant), 0);
  } catch (_) {}

  // Show refund option if reservation was paid
  const refundRow = $('cancel-refund-row');
  if (refundRow) {
    if (paid > 0) {
      refundRow.hidden = false;
      $('cancel-refund-label').textContent =
        `Rembourser ${formatFDJ(paid)} (annulation)`;
      $('cancel-refund-check').checked = true;
      _fillModeSelect('cancel-refund-mode');
    } else {
      refundRow.hidden = true;
    }
  }

  $('modal-cancel').hidden = false;
  $('modal-overlay').classList.remove('hidden');

  const closeCancel = () => {
    $('modal-cancel').hidden = true;
    $('modal-overlay').classList.add('hidden');
  };
  $('cancel-close').onclick = closeCancel;
  $('modal-overlay').onclick = e => { if (e.target === $('modal-overlay')) closeCancel(); };

  $('cancel-confirm').onclick = async () => {
    const motif = $('cancel-motif').value.trim();
    if (!motif) {
      $('cancel-err').textContent = 'Le motif est obligatoire.';
      $('cancel-err').hidden = false;
      return;
    }
    $('cancel-confirm').disabled = true;
    try {
      await cancelReservation(_date, resa.id, motif, resa);
      if (resa.recurrenceId) {
        await addRecurrenceException(resa.recurrenceId, _date);
      }
      // Créer un ajustement négatif si remboursement coché
      if ($('cancel-refund-check')?.checked && paid > 0) {
        const okCloture = await _confirmIfCloturee(_date,
          '⚠ La caisse de cette journée est déjà clôturée.\nEnregistrer quand même le remboursement ?\n(Sinon la réservation sera annulée sans remboursement.)');
        if (okCloture) {
          const mode = $('cancel-refund-mode')?.value || 'especes';
          await createPaiement(_date, {
            resaId: resa.id,
            montant: paid,
            mode,
            type: 'ajustement',
            motif: `Remboursement — ${motif}`,
            employeId: _user.uid,
            employeNom: _user.nom
          });
        }
      }
      await addJournalEntry(_date, {
        action: 'annulation', userId: _user.uid, userNom: _user.nom,
        details: `${resa.clientNom} ${resa.creneau} — ${motif}`
      });
      closeCancel();
      showToast('Réservation annulée.', 'info');
      // Phase 4 — proposer de prévenir le premier de la file d'attente
      offerNotifyNext(resa, _date, _user, _cfg.terrains?.[resa.terrainId]?.nom).catch(() => {});
    } catch (err) {
      $('cancel-err').textContent = err.message;
      $('cancel-err').hidden = false;
    } finally {
      $('cancel-confirm').disabled = false;
    }
  };
}

// ─── SHEET MANAGER ───────────────────────────────────────────────────────────

function _bindSheetHandlers() {
  document.querySelectorAll('.sheet-close').forEach(btn => {
    btn.onclick = () => closeSheet(btn.dataset.sheet);
  });
  $('sheet-overlay').onclick = () => {
    document.querySelectorAll('.sheet.open').forEach(s => s.classList.remove('open'));
    $('sheet-overlay').classList.add('hidden');
  };
}

export function openSheet(name) {
  $(`sheet-${name}`)?.classList.add('open');
  $('sheet-overlay').classList.remove('hidden');
}

export function closeSheet(name) {
  $(`sheet-${name}`)?.classList.remove('open');
  if (!document.querySelector('.sheet.open')) {
    $('sheet-overlay').classList.add('hidden');
  }
}

function _fillModeSelect(id) {
  const modes = _cfg.modesPaiement || ['especes', 'dmoney', 'waafi', 'autre'];
  const labels = { especes: 'Espèces', dmoney: 'D-Money', waafi: 'Waafi', autre: 'Autre' };
  $(id).innerHTML = modes.map(m => `<option value="${m}">${labels[m] || m}</option>`).join('');
}

function _waPhone(tel) {
  const d = (tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 8) return '253' + d;
  if (d.startsWith('253')) return d;
  return d;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
