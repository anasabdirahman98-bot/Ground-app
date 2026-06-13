import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { auth, getUser, setUser, updateUser } from './db.js';

let _user = null;
let _userData = null;
const _listeners = [];

export function getCurrentUser() { return _user; }
export function getCurrentUserData() { return _userData; }

export function onUserChange(fn) {
  _listeners.push(fn);
}

onAuthStateChanged(auth, async firebaseUser => {
  if (firebaseUser) {
    const data = await getUser(firebaseUser.uid);
    if (!data?.actif) {
      await fbSignOut(auth);
      return;
    }
    _user = firebaseUser;
    _userData = data;
  } else {
    _user = null;
    _userData = null;
  }
  _listeners.forEach(fn => fn(_user, _userData));
});

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const data = await getUser(cred.user.uid);
  if (!data?.actif) {
    await fbSignOut(auth);
    throw new Error('Compte désactivé. Contactez votre gérant.');
  }
  return cred.user;
}

export async function logout() {
  await fbSignOut(auth);
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function createEmployee({ nom, email, password, telephone }) {
  const secName = 'ground-secondary';
  let secApp;
  try {
    secApp = getApp(secName);
  } catch {
    secApp = initializeApp(firebaseConfig, secName);
  }
  const secAuth = getAuth(secApp);

  const cred = await createUserWithEmailAndPassword(secAuth, email, password);
  const uid = cred.user.uid;

  await setUser(uid, {
    nom,
    email,
    telephone: telephone || '',
    role: 'employe',
    actif: true,
    createdAt: Date.now()
  });

  await fbSignOut(secAuth);
  return uid;
}

export async function toggleEmployeeActive(uid, actif) {
  await updateUser(uid, { actif });
}
