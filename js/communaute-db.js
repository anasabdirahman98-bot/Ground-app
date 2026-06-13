import { getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase, ref, get, set, push, update, remove, onValue
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const _app = getApps()[0] || initializeApp(firebaseConfig);
export const auth = getAuth(_app);
const _db = getDatabase(_app);
const r = path => ref(_db, path);

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export function onAuthChange(cb) { return onAuthStateChanged(auth, cb); }
export async function loginJoueur(email, pw) { return signInWithEmailAndPassword(auth, email, pw); }
export async function registerJoueur(email, pw) { return createUserWithEmailAndPassword(auth, email, pw); }
export async function logoutJoueur() { return signOut(auth); }

// ─── PROFIL JOUEUR ────────────────────────────────────────────────────────────
export async function setJoueurPublic(uid, data) { await update(r(`joueurs/${uid}/public`), data); }
export async function setJoueurPrive(uid, data) { await update(r(`joueurs/${uid}/prive`), data); }
export async function getJoueurPublic(uid) { return (await get(r(`joueurs/${uid}/public`))).val(); }
export async function getJoueurPrive(uid) { return (await get(r(`joueurs/${uid}/prive`))).val(); }
export function onJoueurPublic(uid, cb) { return onValue(r(`joueurs/${uid}/public`), s => cb(s.val())); }

// ─── ÉQUIPES ──────────────────────────────────────────────────────────────────
export function onEquipes(cb) {
  return onValue(r('equipes'), s => {
    const raw = s.val() || {};
    cb(Object.entries(raw).map(([id, v]) => ({ id, ...v })));
  });
}
export async function createEquipe(data) {
  const newRef = push(r('equipes'));
  await set(newRef, { ...data, createdAt: Date.now() });
  return newRef.key;
}
export async function updateEquipeCom(id, updates) { await update(r(`equipes/${id}`), updates); }
export async function joinEquipe(equipeId, uid, data) {
  await set(r(`equipes/${equipeId}/membres/${uid}`), { ...data, joinedAt: Date.now() });
}
export async function leaveEquipe(equipeId, uid) {
  await remove(r(`equipes/${equipeId}/membres/${uid}`));
}
export async function deleteEquipe(id) {
  await remove(r(`equipes/${id}`));
}

// ─── MATCHS OUVERTS ──────────────────────────────────────────────────────────
export function onMatchsOuverts(cb) {
  return onValue(r('matchsOuverts'), s => {
    const raw = s.val() || {};
    cb(Object.entries(raw).map(([id, v]) => ({ id, ...v })));
  });
}
export async function createMatchOuvert(data) {
  const newRef = push(r('matchsOuverts'));
  await set(newRef, { ...data, statut: 'ouvert', createdAt: Date.now() });
  return newRef.key;
}
export async function joinMatch(matchId, uid, data) {
  await set(r(`matchsOuverts/${matchId}/participants/${uid}`), {
    ...data, statut: 'inscrit', joinedAt: Date.now()
  });
}
export async function leaveMatch(matchId, uid) {
  await remove(r(`matchsOuverts/${matchId}/participants/${uid}`));
}
export async function updateMatchStatut(matchId, updates) {
  await update(r(`matchsOuverts/${matchId}`), updates);
}

// ─── GESTION EMPLOYÉ ──────────────────────────────────────────────────────────
export async function confirmerMatchOuvert(matchId) {
  const snap = await get(r(`matchsOuverts/${matchId}`));
  const match = snap.val();
  if (!match) throw new Error('Match introuvable.');
  const participants = Object.entries(match.participants || {});
  const updates = {};
  updates[`matchsOuverts/${matchId}/statut`] = 'confirme';
  for (const [uid] of participants) {
    updates[`matchsOuverts/${matchId}/participants/${uid}/statut`] = 'confirme';
    try {
      const pSnap = await get(r(`joueurs/${uid}/prive`));
      const tel = pSnap.val()?.telephone;
      if (tel) updates[`matchsOuverts/${matchId}/participants/${uid}/telephone`] = tel;
    } catch (_) {}
  }
  await update(ref(_db, '/'), updates);
}
export async function annulerMatchOuvert(matchId) {
  await update(r(`matchsOuverts/${matchId}`), { statut: 'annule' });
}
export async function deleteMatchOuvert(matchId) {
  await remove(r(`matchsOuverts/${matchId}`));
}
