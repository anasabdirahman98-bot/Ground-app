import {
  getConfig, setComplexe, setTerrain, setHoraires, setTarif,
  setModesPaiement, onUsers, addJournalEntry
} from './db.js';
import { createEmployee, toggleEmployeeActive } from './auth.js';
import { todayDate, showToast } from './utils.js';

const $ = id => document.getElementById(id);

let _cfg = {};
let _user = null;
let _unsubs = [];
let _users = [];
let _activeSection = 'complexe';

export function init(config, user) {
  _cfg = config;
  _user = user;
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  _unsubs.push(onUsers(u => { _users = u; _renderSection(); }));
  _renderNav();
  _renderSection();
}

export function destroy() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
}

// ─── NAV ─────────────────────────────────────────────────────────────────────

function _renderNav() {
  $('config-nav').innerHTML = `
    <button class="cnav-btn ${_activeSection === 'complexe' ? 'active' : ''}" data-s="complexe">Complexe</button>
    <button class="cnav-btn ${_activeSection === 'terrains' ? 'active' : ''}" data-s="terrains">Terrains</button>
    <button class="cnav-btn ${_activeSection === 'horaires' ? 'active' : ''}" data-s="horaires">Horaires & Tarifs</button>
    <button class="cnav-btn ${_activeSection === 'employes' ? 'active' : ''}" data-s="employes">Employés</button>
  `;
  $('config-nav').querySelectorAll('.cnav-btn').forEach(btn => {
    btn.onclick = () => { _activeSection = btn.dataset.s; _renderNav(); _renderSection(); };
  });
}

function _renderSection() {
  switch (_activeSection) {
    case 'complexe': return _renderComplexe();
    case 'terrains': return _renderTerrains();
    case 'horaires': return _renderHoraires();
    case 'employes': return _renderEmployes();
  }
}

// ─── COMPLEXE ────────────────────────────────────────────────────────────────

function _renderComplexe() {
  const c = _cfg.complexe || {};
  $('config-body').innerHTML = `
    <h2 class="cfg-title">Informations du complexe</h2>
    <form id="form-complexe">
      <div class="field"><label>Nom</label><input id="cx-nom" type="text" value="${esc(c.nom || '')}" required></div>
      <div class="field"><label>Adresse</label><input id="cx-adresse" type="text" value="${esc(c.adresse || '')}"></div>
      <div class="field"><label>Téléphone</label><input id="cx-tel" type="tel" value="${esc(c.telephone || '')}"></div>
      <div id="cx-err" class="error-msg" hidden></div>
      <button type="submit" class="btn btn-primary">Enregistrer</button>
    </form>`;

  $('form-complexe').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const data = { nom: $('cx-nom').value.trim(), adresse: $('cx-adresse').value.trim(), telephone: $('cx-tel').value.trim() };
      await setComplexe(data);
      _cfg.complexe = data;
      await _log('config_modifie', 'Infos complexe mises à jour');
      showToast('Informations enregistrées.', 'success');
    } catch (err) {
      $('cx-err').textContent = err.message; $('cx-err').hidden = false;
    } finally { btn.disabled = false; }
  };
}

// ─── TERRAINS ────────────────────────────────────────────────────────────────

function _renderTerrains() {
  const terrains = _cfg.terrains || {};
  const sorted = Object.entries(terrains)
    .sort(([, a], [, b]) => (a.ordre || 99) - (b.ordre || 99));

  let html = '<h2 class="cfg-title">Terrains</h2><div class="terrain-list">';
  sorted.forEach(([id, t]) => {
    html += `<div class="terrain-card ${t.actif === false ? 'inactive' : ''}">
      <div class="tc-info">
        <span class="tc-nom">${esc(t.nom)}</span>
        <span class="tc-type">${t.type === 'foot5' ? '5×5' : '7×7'}</span>
        ${t.actif === false ? '<span class="badge badge-off">Inactif</span>' : ''}
      </div>
      <div class="tc-actions">
        <button class="btn btn-sm btn-secondary" data-edit="${id}">Modifier</button>
        <button class="btn btn-sm ${t.actif === false ? 'btn-ghost' : 'btn-danger'}" data-toggle="${id}" data-actif="${t.actif !== false}">
          ${t.actif === false ? 'Activer' : 'Désactiver'}
        </button>
      </div>
    </div>`;
  });
  html += '</div><button class="btn btn-primary" id="btn-add-terrain">+ Ajouter un terrain</button>';

  $('config-body').innerHTML = html;

  $('config-body').querySelectorAll('[data-edit]').forEach(btn => _openTerrainForm(btn.dataset.edit));
  $('config-body').querySelectorAll('[data-toggle]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.toggle;
      const nowActif = btn.dataset.actif === 'true';
      const t = terrains[id];
      await setTerrain(id, { ...t, actif: !nowActif });
      showToast(`Terrain ${nowActif ? 'désactivé' : 'activé'}.`, 'info');
    };
  });
  $('config-body').querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => _openTerrainForm(btn.dataset.edit);
  });
  $('btn-add-terrain').onclick = () => _openTerrainForm(null);
}

function _openTerrainForm(id) {
  const t = id ? (_cfg.terrains?.[id] || {}) : {};
  const terrains = _cfg.terrains || {};
  const maxOrdre = Object.values(terrains).reduce((m, x) => Math.max(m, x.ordre || 0), 0);

  $('config-body').innerHTML = `
    <div class="det-header">
      <button class="btn-back" id="terrain-back">← Retour</button>
    </div>
    <h2 class="cfg-title">${id ? 'Modifier le terrain' : 'Nouveau terrain'}</h2>
    <form id="form-terrain">
      <div class="field"><label>Nom</label><input id="tr-nom" type="text" value="${esc(t.nom || '')}" required placeholder="Terrain A"></div>
      <div class="field"><label>Type</label>
        <select id="tr-type">
          <option value="foot5" ${t.type === 'foot5' ? 'selected' : ''}>Foot à 5</option>
          <option value="foot7" ${t.type === 'foot7' ? 'selected' : ''}>Foot à 7</option>
        </select>
      </div>
      <div class="field"><label>Ordre d'affichage</label><input id="tr-ordre" type="number" min="1" value="${t.ordre || maxOrdre + 1}"></div>
      <div class="field-row">
        <label><input id="tr-actif" type="checkbox" ${t.actif !== false ? 'checked' : ''}> Actif</label>
      </div>
      <div id="tr-err" class="error-msg" hidden></div>
      <button type="submit" class="btn btn-primary">Enregistrer</button>
    </form>

    ${id ? `<div class="field mt-6">
      <h3 class="cfg-sub">Tarifs</h3>
      <form id="form-tarif">
        <div class="field-row">
          <div class="field">
            <label>Tarif jour (FDJ)</label>
            <input id="ta-jour" type="number" min="0" step="500" value="${_cfg.tarifs?.[id]?.jour || 8000}" required>
          </div>
          <div class="field">
            <label>Tarif soir (FDJ)</label>
            <input id="ta-soir" type="number" min="0" step="500" value="${_cfg.tarifs?.[id]?.soir || 12000}" required>
          </div>
        </div>
        <div class="field"><label>Heure bascule soir</label>
          <input id="ta-heure" type="time" value="${_cfg.tarifs?.[id]?.heureSoir || '17:00'}" required>
        </div>
        <div id="ta-err" class="error-msg" hidden></div>
        <button type="submit" class="btn btn-secondary">Enregistrer tarifs</button>
      </form>
    </div>` : ''}`;

  $('terrain-back').onclick = _renderTerrains;

  $('form-terrain').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const tid = id || `t${Date.now()}`;
      const data = {
        nom: $('tr-nom').value.trim(),
        type: $('tr-type').value,
        ordre: parseInt($('tr-ordre').value, 10) || maxOrdre + 1,
        actif: $('tr-actif').checked
      };
      if (!data.nom) throw new Error('Le nom est requis.');
      await setTerrain(tid, data);
      if (!_cfg.terrains) _cfg.terrains = {};
      _cfg.terrains[tid] = data;
      // Seed default tarif for new terrain
      if (!id) {
        await setTarif(tid, { jour: 8000, soir: 12000, heureSoir: '17:00' });
      }
      await _log('config_modifie', `Terrain ${data.nom} ${id ? 'modifié' : 'créé'}`);
      showToast('Terrain enregistré.', 'success');
      _renderTerrains();
    } catch (err) {
      $('tr-err').textContent = err.message; $('tr-err').hidden = false; btn.disabled = false;
    }
  };

  if (id) {
    $('form-tarif').onsubmit = async e => {
      e.preventDefault();
      const btn = e.target.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        const data = {
          jour: parseInt($('ta-jour').value, 10),
          soir: parseInt($('ta-soir').value, 10),
          heureSoir: $('ta-heure').value
        };
        await setTarif(id, data);
        if (!_cfg.tarifs) _cfg.tarifs = {};
        _cfg.tarifs[id] = data;
        await _log('config_modifie', `Tarifs ${_cfg.terrains?.[id]?.nom} mis à jour`);
        showToast('Tarifs enregistrés.', 'success');
      } catch (err) {
        $('ta-err').textContent = err.message; $('ta-err').hidden = false;
      } finally { btn.disabled = false; }
    };
  }
}

// ─── HORAIRES ────────────────────────────────────────────────────────────────

function _renderHoraires() {
  const h = _cfg.horaires || { ouverture: '08:00', fermeture: '00:00', dureeCreneauMin: 60 };
  const modes = _cfg.modesPaiement || ['especes', 'dmoney', 'waafi', 'autre'];
  const allModes = ['especes', 'dmoney', 'waafi', 'autre'];
  const modeLabels = { especes: 'Espèces', dmoney: 'D-Money', waafi: 'Waafi', autre: 'Autre' };

  $('config-body').innerHTML = `
    <h2 class="cfg-title">Horaires</h2>
    <form id="form-horaires">
      <div class="field-row">
        <div class="field"><label>Ouverture</label><input id="h-open" type="time" value="${h.ouverture}" required></div>
        <div class="field"><label>Fermeture</label><input id="h-close" type="time" value="${h.fermeture === '00:00' ? '00:00' : h.fermeture}" required></div>
      </div>
      <div class="field">
        <label>Durée d'un créneau</label>
        <select id="h-duree">
          <option value="60" ${h.dureeCreneauMin === 60 ? 'selected' : ''}>60 minutes</option>
          <option value="90" ${h.dureeCreneauMin === 90 ? 'selected' : ''}>90 minutes</option>
        </select>
      </div>
      <div id="h-err" class="error-msg" hidden></div>
      <button type="submit" class="btn btn-primary">Enregistrer</button>
    </form>

    <h2 class="cfg-title mt-6">Modes de paiement actifs</h2>
    <form id="form-modes">
      ${allModes.map(m => `
        <label class="checkbox-label">
          <input type="checkbox" name="mode" value="${m}" ${modes.includes(m) ? 'checked' : ''}>
          ${modeLabels[m]}
        </label>`).join('')}
      <div id="mo-err" class="error-msg" hidden></div>
      <button type="submit" class="btn btn-primary">Enregistrer</button>
    </form>`;

  $('form-horaires').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const data = {
        ouverture: $('h-open').value,
        fermeture: $('h-close').value,
        dureeCreneauMin: parseInt($('h-duree').value, 10)
      };
      await setHoraires(data);
      _cfg.horaires = data;
      await _log('config_modifie', 'Horaires mis à jour');
      showToast('Horaires enregistrés.', 'success');
    } catch (err) {
      $('h-err').textContent = err.message; $('h-err').hidden = false;
    } finally { btn.disabled = false; }
  };

  $('form-modes').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const checked = [...document.querySelectorAll('[name="mode"]:checked')].map(i => i.value);
      if (!checked.length) throw new Error('Sélectionnez au moins un mode.');
      await setModesPaiement(checked);
      _cfg.modesPaiement = checked;
      await _log('config_modifie', 'Modes de paiement mis à jour');
      showToast('Modes de paiement enregistrés.', 'success');
    } catch (err) {
      $('mo-err').textContent = err.message; $('mo-err').hidden = false;
    } finally { btn.disabled = false; }
  };
}

// ─── EMPLOYÉS ────────────────────────────────────────────────────────────────

function _renderEmployes() {
  const employes = _users.filter(u => u.role === 'employe');
  let html = '<h2 class="cfg-title">Employés</h2><div class="employe-list">';
  employes.forEach(e => {
    html += `<div class="employe-card ${e.actif ? '' : 'inactive'}">
      <div class="ec-info">
        <span class="ec-nom">${esc(e.nom)}</span>
        <span class="ec-email">${esc(e.email || '')}</span>
      </div>
      <div class="ec-actions">
        <span class="badge ${e.actif ? 'badge-paye' : 'badge-off'}">${e.actif ? 'Actif' : 'Inactif'}</span>
        <button class="btn btn-sm ${e.actif ? 'btn-danger' : 'btn-secondary'}" data-uid="${e.uid}" data-actif="${e.actif}">
          ${e.actif ? 'Désactiver' : 'Réactiver'}
        </button>
      </div>
    </div>`;
  });
  html += '</div><button class="btn btn-primary" id="btn-new-emp">+ Ajouter un employé</button>';
  $('config-body').innerHTML = html;

  $('config-body').querySelectorAll('[data-uid]').forEach(btn => {
    btn.onclick = async () => {
      const nowActif = btn.dataset.actif === 'true';
      const uid = btn.dataset.uid;
      const emp = _users.find(u => u.uid === uid);
      if (!confirm(`${nowActif ? 'Désactiver' : 'Réactiver'} ${emp?.nom} ?`)) return;
      btn.disabled = true;
      try {
        await toggleEmployeeActive(uid, !nowActif);
        await _log(nowActif ? 'employe_desactive' : 'employe_cree', `${emp?.nom}`);
        showToast(`Employé ${nowActif ? 'désactivé' : 'réactivé'}.`, 'info');
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    };
  });

  $('btn-new-emp').onclick = _openEmployeForm;
}

function _openEmployeForm() {
  $('config-body').innerHTML = `
    <div class="det-header">
      <button class="btn-back" id="emp-back">← Retour</button>
    </div>
    <h2 class="cfg-title">Nouvel employé</h2>
    <form id="form-employe">
      <div class="field"><label>Nom complet</label><input id="em-nom" type="text" required placeholder="Prénom Nom"></div>
      <div class="field"><label>Email</label><input id="em-email" type="email" required placeholder="employe@example.com"></div>
      <div class="field"><label>Mot de passe provisoire</label><input id="em-pwd" type="password" required minlength="8" placeholder="••••••••"></div>
      <div class="field"><label>Téléphone (optionnel)</label><input id="em-tel" type="tel"></div>
      <div id="em-err" class="error-msg" hidden></div>
      <button type="submit" class="btn btn-primary">Créer le compte</button>
    </form>`;

  $('emp-back').onclick = _renderEmployes;

  $('form-employe').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Création en cours…';
    try {
      const uid = await createEmployee({
        nom: $('em-nom').value.trim(),
        email: $('em-email').value.trim(),
        password: $('em-pwd').value,
        telephone: $('em-tel').value.trim()
      });
      await _log('employe_cree', `${$('em-nom').value.trim()} (${$('em-email').value.trim()})`);
      showToast('Compte employé créé.', 'success');
      _renderEmployes();
    } catch (err) {
      $('em-err').textContent = err.message; $('em-err').hidden = false;
      btn.disabled = false;
      btn.textContent = 'Créer le compte';
    }
  };
}

async function _log(action, details) {
  try {
    await addJournalEntry(todayDate(), { action, userId: _user.uid, userNom: _user.nom, details });
  } catch (_) {}
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
