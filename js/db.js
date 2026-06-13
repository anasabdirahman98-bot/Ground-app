import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase, ref, get, set, push, update, remove,
  onValue, runTransaction, query, orderByChild, equalTo
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const database = getDatabase(app);

function r(path) { return ref(database, path); }

// ─── CONNEXION RÉSEAU ────────────────────────────────────────────────────────

export function onConnected(cb) {
  return onValue(r('.info/connected'), snap => cb(!!snap.val()));
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────

export async function getConfig() {
  const snap = await get(r('config'));
  return snap.val() || {};
}

export function onConfig(cb) {
  return onValue(r('config'), snap => cb(snap.val() || {}));
}

export async function setComplexe(data) {
  await set(r('config/complexe'), data);
}

export async function setTerrain(id, data) {
  await set(r(`config/terrains/${id}`), data);
}

export async function setHoraires(data) {
  await set(r('config/horaires'), data);
}

export async function setTarif(terrainId, data) {
  await set(r(`config/tarifs/${terrainId}`), data);
}

export async function setModesPaiement(modes) {
  await set(r('config/modesPaiement'), modes);
}

// ─── UTILISATEURS ────────────────────────────────────────────────────────────

export async function getUser(uid) {
  const snap = await get(r(`users/${uid}`));
  return snap.val();
}

export async function setUser(uid, data) {
  await set(r(`users/${uid}`), data);
}

export async function updateUser(uid, updates) {
  await update(r(`users/${uid}`), updates);
}

export function onUsers(cb) {
  return onValue(r('users'), snap => {
    const raw = snap.val() || {};
    cb(Object.entries(raw).map(([uid, u]) => ({ uid, ...u })));
  });
}

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

export function onClients(cb) {
  return onValue(r('clients'), snap => {
    const raw = snap.val() || {};
    cb(Object.entries(raw).map(([id, c]) => ({ id, ...c })));
  });
}

export async function getClients() {
  const snap = await get(r('clients'));
  const raw = snap.val() || {};
  return Object.entries(raw).map(([id, c]) => ({ id, ...c }));
}

export async function createClient(data) {
  const newRef = push(r('clients'));
  await set(newRef, { ...data, createdAt: Date.now() });
  return newRef.key;
}

export async function updateClient(id, updates) {
  await update(r(`clients/${id}`), updates);
}

// ─── RÉSERVATIONS ────────────────────────────────────────────────────────────

export function onReservationsForDate(date, cb) {
  return onValue(r(`reservations/${date}`), snap => {
    const raw = snap.val() || {};
    cb(Object.entries(raw).map(([id, v]) => ({ id, ...v })));
  });
}

export async function getReservationsForDate(date) {
  const snap = await get(r(`reservations/${date}`));
  const raw = snap.val() || {};
  return Object.entries(raw).map(([id, v]) => ({ id, ...v }));
}

export async function createReservation(date, data) {
  const slotKey = `${data.terrainId}_${data.creneau}`;
  const slotRef = r(`slots/${date}/${slotKey}`);

  const resaRef = push(r(`reservations/${date}`));
  const resaId = resaRef.key;

  const result = await runTransaction(slotRef, current => {
    if (current !== null) return; // abort — créneau pris
    return resaId;
  });

  if (!result.committed) {
    throw new Error('Créneau déjà pris. Actualisez la grille.');
  }

  try {
    await set(resaRef, {
      ...data,
      totalPaye: data.totalPaye ?? 0,
      statut: 'confirmee',
      motifAnnulation: null,
      recurrenceId: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  } catch (err) {
    // Libérer le slot sinon le créneau resterait verrouillé par une résa fantôme
    await set(slotRef, null).catch(() => {});
    throw err;
  }

  return resaId;
}

export async function updateReservation(date, id, updates) {
  await update(r(`reservations/${date}/${id}`), { ...updates, updatedAt: Date.now() });
}

export async function cancelReservation(date, id, motif, resa) {
  await update(r(`reservations/${date}/${id}`), {
    statut: 'annulee',
    motifAnnulation: motif,
    updatedAt: Date.now()
  });
  await set(r(`slots/${date}/${resa.terrainId}_${resa.creneau}`), null);
}

// ─── PAIEMENTS ───────────────────────────────────────────────────────────────

export async function createPaiement(date, data) {
  const newRef = push(r(`paiements/${date}`));
  await set(newRef, { ...data, timestamp: Date.now() });
  return newRef.key;
}

export function onPaiementsForDate(date, cb) {
  return onValue(r(`paiements/${date}`), snap => {
    const raw = snap.val() || {};
    cb(Object.entries(raw).map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.timestamp - a.timestamp));
  });
}

export async function getPaiementsForDate(date) {
  const snap = await get(r(`paiements/${date}`));
  const raw = snap.val() || {};
  return Object.entries(raw).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ─── CLÔTURES ────────────────────────────────────────────────────────────────

export async function getCloture(date) {
  const snap = await get(r(`clotures/${date}`));
  return snap.val();
}

export function onCloture(date, cb) {
  return onValue(r(`clotures/${date}`), snap => cb(snap.val()));
}

export async function createCloture(date, data) {
  const existing = await getCloture(date);
  if (existing) throw new Error('Clôture déjà effectuée pour cette journée.');
  await set(r(`clotures/${date}`), { ...data, timestamp: Date.now() });
}

// ─── JOURNAL ─────────────────────────────────────────────────────────────────

export async function addJournalEntry(date, data) {
  const newRef = push(r(`journal/${date}`));
  await set(newRef, { ...data, timestamp: Date.now() });
}

export function onJournalForDate(date, cb) {
  return onValue(r(`journal/${date}`), snap => {
    const raw = snap.val() || {};
    cb(Object.entries(raw).map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.timestamp - a.timestamp));
  });
}

// ─── RÉCURRENCES ─────────────────────────────────────────────────────────────

export function onRecurrences(cb) {
  return onValue(r('recurrences'), snap => {
    const raw = snap.val() || {};
    cb(Object.entries(raw).map(([id, v]) => ({ id, ...v })));
  });
}

export async function createRecurrence(data) {
  const newRef = push(r('recurrences'));
  await set(newRef, { ...data, createdAt: Date.now() });
  return newRef.key;
}

export async function updateRecurrence(id, updates) {
  await update(r(`recurrences/${id}`), updates);
}

export async function addRecurrenceException(recurrenceId, date) {
  await set(r(`recurrences/${recurrenceId}/exceptions/${date}`), true);
}

// ─── ÉVÉNEMENTS / TOURNOIS ───────────────────────────────────────────────────

export function onEvenements(cb) {
  return onValue(r('evenements'), snap => {
    const raw = snap.val() || {};
    cb(Object.entries(raw).map(([id, v]) => ({ id, ...v })));
  });
}

export async function createEvenement(data) {
  const newRef = push(r('evenements'));
  await set(newRef, { ...data, createdAt: Date.now() });
  return newRef.key;
}

export async function updateEvenement(id, updates) {
  await update(r(`evenements/${id}`), updates);
}

export async function addEquipe(evtId, data) {
  const newRef = push(r(`evenements/${evtId}/equipes`));
  await set(newRef, { ...data, createdAt: Date.now() });
  return newRef.key;
}

export async function updateEquipe(evtId, equipeId, updates) {
  await update(r(`evenements/${evtId}/equipes/${equipeId}`), updates);
}

// ─── STATISTIQUES PÉRIODE ────────────────────────────────────────────────────

function _nextDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return dt.toLocaleDateString('en-CA');
}

function _datesBetween(dateDebut, dateFin) {
  const dates = [];
  let cur = dateDebut;
  while (cur <= dateFin) { dates.push(cur); cur = _nextDate(cur); }
  return dates;
}

// Requêtes parallèles : une par jour, toutes lancées en même temps
async function _getNodeForPeriod(node, dateDebut, dateFin) {
  const dates = _datesBetween(dateDebut, dateFin);
  const snaps = await Promise.all(dates.map(d => get(r(`${node}/${d}`))));
  return dates.map((date, i) => ({ date, val: snaps[i].val() }));
}

export async function getPaiementsForPeriod(dateDebut, dateFin) {
  const days = await _getNodeForPeriod('paiements', dateDebut, dateFin);
  const results = [];
  days.forEach(({ date, val }) => {
    Object.entries(val || {}).forEach(([id, v]) => results.push({ id, date, ...v }));
  });
  return results;
}

export async function getReservationsForPeriod(dateDebut, dateFin) {
  const days = await _getNodeForPeriod('reservations', dateDebut, dateFin);
  const results = [];
  days.forEach(({ date, val }) => {
    Object.entries(val || {}).forEach(([id, v]) => results.push({ id, date, ...v }));
  });
  return results;
}

export async function getCloturesForPeriod(dateDebut, dateFin) {
  const days = await _getNodeForPeriod('clotures', dateDebut, dateFin);
  return days.filter(({ val }) => val).map(({ date, val }) => ({ date, ...val }));
}
