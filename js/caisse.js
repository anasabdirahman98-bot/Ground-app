import {
  onPaiementsForDate, onCloture, createCloture, addJournalEntry
} from './db.js';
import { todayDate, formatFDJ, formatDateTime, modePaiementLabel, showToast } from './utils.js';

const $ = id => document.getElementById(id);

let _cfg = {};
let _user = null;
let _date = todayDate();
let _paiements = [];
let _cloture = null;
let _unsubs = [];

export function init(config, user) {
  _cfg = config;
  _user = user;
  _date = todayDate();
  _unsubs.forEach(fn => fn());
  _unsubs = [];

  _unsubs.push(onPaiementsForDate(_date, p => { _paiements = p; _render(); }));
  _unsubs.push(onCloture(_date, cl => { _cloture = cl; _renderClotureState(); }));

  $('btn-cloture').onclick = _openClotureModal;
  $('cloture-cancel').onclick = _closeClotureModal;
  $('cloture-compte').oninput = _updateEcart;
  $('cloture-confirm').onclick = _submitCloture;
}

export function destroy() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function _render() {
  const { grand, byMode } = _totals();
  _renderSummary(grand, byMode);
  _renderList();
}

function _totals() {
  const modes = _cfg.modesPaiement || ['especes', 'dmoney', 'waafi', 'autre'];
  const byMode = {};
  modes.forEach(m => (byMode[m] = 0));
  let grand = 0;
  _paiements.forEach(p => {
    const delta = p.type === 'ajustement' ? -Math.abs(p.montant) : p.montant;
    byMode[p.mode] = (byMode[p.mode] || 0) + delta;
    grand += delta;
  });
  return { grand, byMode };
}

function _renderSummary(grand, byMode) {
  const modes = _cfg.modesPaiement || ['especes', 'dmoney', 'waafi', 'autre'];
  let html = `<div class="ca-total"><span>CA encaissé</span><span class="ca-val">${formatFDJ(grand)}</span></div>`;
  const used = modes.filter(m => byMode[m] !== 0);
  if (used.length > 1) {
    html += '<div class="ca-modes">' + used.map(m =>
      `<div class="ca-mode-row"><span>${modePaiementLabel(m)}</span><span>${formatFDJ(byMode[m])}</span></div>`
    ).join('') + '</div>';
  }
  $('caisse-summary').innerHTML = html;
}

function _renderList() {
  if (!_paiements.length) {
    $('caisse-list').innerHTML = '<p class="empty-msg">Aucun encaissement aujourd\'hui.</p>';
    return;
  }
  const sorted = [..._paiements].sort((a, b) => b.timestamp - a.timestamp);
  $('caisse-list').innerHTML = '<div class="feed">' + sorted.map(p => {
    const sign = p.type === 'ajustement' ? '−' : '+';
    return `<div class="feed-item">
      <div class="fi-left">
        <span class="fi-mode">${modePaiementLabel(p.mode)}</span>
        <span class="fi-meta">${esc(p.employeNom)} · ${formatDateTime(p.timestamp)}</span>
        ${p.motif ? `<span class="fi-motif">${p.type === 'ajustement' ? 'Ajustement : ' : ''}${esc(p.motif)}</span>` : ''}
      </div>
      <span class="fi-amt ${p.type === 'ajustement' ? 'neg' : 'pos'}">${sign}${formatFDJ(Math.abs(p.montant))}</span>
    </div>`;
  }).join('') + '</div>';
}

function _renderClotureState() {
  const btn = $('btn-cloture');
  if (_cloture) {
    btn.disabled = true;
    const sign = _cloture.ecart >= 0 ? '+' : '';
    btn.textContent = `Clôturée — Écart espèces : ${sign}${formatFDJ(_cloture.ecart)}`;
  } else {
    btn.disabled = false;
    btn.textContent = 'Clôturer la caisse';
  }
}

// ─── CLOTURE MODAL ───────────────────────────────────────────────────────────

function _espTheorique() {
  return _paiements
    .filter(p => p.mode === 'especes')
    .reduce((s, p) => s + (p.type === 'ajustement' ? -Math.abs(p.montant) : p.montant), 0);
}

function _openClotureModal() {
  if (_cloture) { showToast('Caisse déjà clôturée.', 'info'); return; }
  const theo = _espTheorique();
  $('cloture-theorique').innerHTML =
    `<span>Total espèces (théorique)</span><span class="theo-val">${formatFDJ(theo)}</span>`;
  $('cloture-compte').value = '';
  $('cloture-ecart-row').hidden = true;
  $('cloture-commentaire').value = '';
  $('cloture-err').hidden = true;
  $('cloture-confirm').disabled = false;
  $('modal-cloture').hidden = false;
  $('modal-overlay').classList.remove('hidden');
  $('modal-overlay').onclick = e => { if (e.target === $('modal-overlay')) _closeClotureModal(); };
  setTimeout(() => $('cloture-compte').focus(), 100);
}

function _closeClotureModal() {
  $('modal-cloture').hidden = true;
  $('modal-overlay').classList.add('hidden');
}

function _updateEcart() {
  const theo = _espTheorique();
  const compte = parseInt($('cloture-compte').value, 10);
  const row = $('cloture-ecart-row');
  if (isNaN(compte)) { row.hidden = true; return; }
  const ecart = compte - theo;
  row.hidden = false;
  $('cloture-ecart-val').textContent = `${ecart >= 0 ? '+' : ''}${formatFDJ(ecart)}`;
  $('cloture-ecart-val').className = ecart === 0 ? 'ok' : ecart > 0 ? 'pos' : 'neg';
}

async function _submitCloture() {
  const errEl = $('cloture-err');
  errEl.hidden = true;
  const theo = _espTheorique();
  const compte = parseInt($('cloture-compte').value, 10);
  if (isNaN(compte) || compte < 0) {
    errEl.textContent = 'Saisir un montant valide.';
    errEl.hidden = false;
    return;
  }
  const ecart = compte - theo;
  $('cloture-confirm').disabled = true;
  try {
    await createCloture(_date, {
      theoriqueEspeces: theo,
      compteEspeces: compte,
      ecart,
      commentaire: $('cloture-commentaire').value.trim(),
      employeId: _user.uid,
      employeNom: _user.nom
    });
    await addJournalEntry(_date, {
      action: 'cloture_caisse',
      userId: _user.uid,
      userNom: _user.nom,
      details: `Théo. ${formatFDJ(theo)} · Compté ${formatFDJ(compte)} · Écart ${formatFDJ(ecart)}`
    });
    _closeClotureModal();
    showToast('Caisse clôturée.', 'success');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
    $('cloture-confirm').disabled = false;
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
