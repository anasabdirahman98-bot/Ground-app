/**
 * GROUND — Script de données de démonstration
 *
 * Exécution : coller dans la console du navigateur une fois connecté en tant que gérant.
 * Remplit une semaine de données réalistes.
 *
 * Usage :
 *   1. Ouvrir l'app GROUND dans Chrome/Firefox
 *   2. Se connecter avec un compte gérant
 *   3. Ouvrir la console développeur (F12)
 *   4. Coller et exécuter ce script
 */

(async function seedGround() {
  // ─── Firebase imports ────────────────────────────────────────────────────
  const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getDatabase, ref, set, push } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');

  const app = getApps()[0];
  if (!app) { console.error('App Firebase non initialisée. Assurez-vous d\'être connecté.'); return; }
  const db = getDatabase(app);
  const auth = getAuth(app);
  const uid = auth.currentUser?.uid;
  if (!uid) { console.error('Non connecté.'); return; }

  const r = path => ref(db, path);

  function fmt(date) {
    return date.toLocaleDateString('en-CA', { timeZone: 'Africa/Djibouti' });
  }

  function today() {
    const d = new Date();
    return new Date(d.toLocaleDateString('en-CA', { timeZone: 'Africa/Djibouti' }));
  }

  function dateStr(d, offset = 0) {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + offset);
    return fmt(nd);
  }

  const now = today();

  // ─── CONFIG ───────────────────────────────────────────────────────────────
  console.log('📋 Configuration du complexe…');
  await set(r('config'), {
    complexe: { nom: 'Complexe Sportif El-Nour', adresse: 'Balbala, Djibouti-ville', telephone: '+253 77 12 34 56' },
    terrains: {
      t1: { nom: 'Terrain A', type: 'foot5', actif: true, ordre: 1 },
      t2: { nom: 'Terrain B', type: 'foot5', actif: true, ordre: 2 },
      t3: { nom: 'Terrain C', type: 'foot7', actif: true, ordre: 3 }
    },
    horaires: { ouverture: '08:00', fermeture: '00:00', dureeCreneauMin: 60 },
    tarifs: {
      t1: { jour: 8000,  soir: 12000, heureSoir: '17:00' },
      t2: { jour: 8000,  soir: 12000, heureSoir: '17:00' },
      t3: { jour: 10000, soir: 15000, heureSoir: '17:00' }
    },
    modesPaiement: ['especes', 'dmoney', 'waafi', 'autre']
  });

  // ─── CLIENTS ──────────────────────────────────────────────────────────────
  console.log('👥 Création des clients…');
  const clients = {
    c1: { nom: 'FC Balbala', telephone: '+253 77 11 22 33', type: 'equipe', notes: 'Équipe régulière, jeudi soir' },
    c2: { nom: 'Étoile du Stade', telephone: '+253 77 44 55 66', type: 'equipe', notes: '' },
    c3: { nom: 'AS Renaissance', telephone: '+253 77 77 88 99', type: 'equipe', notes: 'Réserve le vendredi' },
    c4: { nom: 'Mohamed Ali', telephone: '+253 77 22 33 44', type: 'individu', notes: '' },
    c5: { nom: 'Club Inter Djibouti', telephone: '+253 77 55 66 77', type: 'equipe', notes: '' },
    c6: { nom: 'Aden United', telephone: '+253 77 99 00 11', type: 'equipe', notes: '' }
  };
  for (const [id, data] of Object.entries(clients)) {
    await set(r(`clients/${id}`), { ...data, createdAt: Date.now() - 30 * 86400000 });
  }

  // ─── RESERVATIONS & PAIEMENTS ─────────────────────────────────────────────
  console.log('📅 Création des réservations…');

  const sessions = [
    // J-6
    { d: -6, t: 't1', c: '08:00', cl: 'c4', cn: 'Mohamed Ali', m: 8000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -6, t: 't2', c: '10:00', cl: 'c1', cn: 'FC Balbala', m: 8000, sp: 'paye', mode: 'dmoney', st: 'terminee' },
    { d: -6, t: 't3', c: '19:00', cl: 'c2', cn: 'Étoile du Stade', m: 15000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -6, t: 't1', c: '20:00', cl: 'c5', cn: 'Club Inter Djibouti', m: 12000, sp: 'paye', mode: 'waafi', st: 'terminee' },
    { d: -6, t: 't2', c: '21:00', cl: 'c6', cn: 'Aden United', m: 12000, sp: 'acompte', mode: 'especes', st: 'terminee', tp: 6000 },
    // J-5
    { d: -5, t: 't1', c: '17:00', cl: 'c3', cn: 'AS Renaissance', m: 12000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -5, t: 't2', c: '18:00', cl: 'c1', cn: 'FC Balbala', m: 12000, sp: 'paye', mode: 'dmoney', st: 'terminee' },
    { d: -5, t: 't3', c: '20:00', cl: 'c2', cn: 'Étoile du Stade', m: 15000, sp: 'paye', mode: 'especes', st: 'terminee' },
    // J-4
    { d: -4, t: 't1', c: '09:00', cl: 'c4', cn: 'Mohamed Ali', m: 8000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -4, t: 't2', c: '19:00', cl: 'c5', cn: 'Club Inter Djibouti', m: 12000, sp: 'paye', mode: 'waafi', st: 'terminee' },
    { d: -4, t: 't3', c: '20:00', cl: 'c3', cn: 'AS Renaissance', m: 15000, sp: 'acompte', mode: 'especes', st: 'terminee', tp: 8000 },
    { d: -4, t: 't1', c: '21:00', cl: 'c6', cn: 'Aden United', m: 12000, sp: 'paye', mode: 'especes', st: 'terminee' },
    // J-3 (vendredi — jour de pointe)
    { d: -3, t: 't1', c: '16:00', cl: 'c1', cn: 'FC Balbala', m: 12000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -3, t: 't2', c: '16:00', cl: 'c2', cn: 'Étoile du Stade', m: 12000, sp: 'paye', mode: 'dmoney', st: 'terminee' },
    { d: -3, t: 't3', c: '17:00', cl: 'c3', cn: 'AS Renaissance', m: 15000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -3, t: 't1', c: '18:00', cl: 'c5', cn: 'Club Inter Djibouti', m: 12000, sp: 'paye', mode: 'waafi', st: 'terminee' },
    { d: -3, t: 't2', c: '19:00', cl: 'c6', cn: 'Aden United', m: 12000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -3, t: 't3', c: '20:00', cl: 'c4', cn: 'Mohamed Ali', m: 15000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -3, t: 't1', c: '21:00', cl: 'c1', cn: 'FC Balbala', m: 12000, sp: 'paye', mode: 'dmoney', st: 'terminee' },
    // J-2
    { d: -2, t: 't1', c: '18:00', cl: 'c2', cn: 'Étoile du Stade', m: 12000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -2, t: 't2', c: '19:00', cl: 'c1', cn: 'FC Balbala', m: 12000, sp: 'paye', mode: 'dmoney', st: 'annulee', motif: 'Joueurs absents' },
    { d: -2, t: 't3', c: '20:00', cl: 'c3', cn: 'AS Renaissance', m: 15000, sp: 'paye', mode: 'waafi', st: 'terminee' },
    // J-1
    { d: -1, t: 't1', c: '17:00', cl: 'c5', cn: 'Club Inter Djibouti', m: 12000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -1, t: 't2', c: '18:00', cl: 'c6', cn: 'Aden United', m: 12000, sp: 'acompte', mode: 'especes', st: 'terminee', tp: 6000 },
    { d: -1, t: 't3', c: '19:00', cl: 'c4', cn: 'Mohamed Ali', m: 15000, sp: 'paye', mode: 'especes', st: 'terminee' },
    { d: -1, t: 't1', c: '20:00', cl: 'c2', cn: 'Étoile du Stade', m: 12000, sp: 'noshow', mode: null, st: 'noshow' },
    // Aujourd'hui
    { d: 0, t: 't1', c: '08:00', cl: 'c1', cn: 'FC Balbala', m: 8000, sp: 'paye', mode: 'especes', st: 'confirmee' },
    { d: 0, t: 't2', c: '10:00', cl: 'c3', cn: 'AS Renaissance', m: 8000, sp: 'a_payer', mode: null, st: 'confirmee' },
    { d: 0, t: 't3', c: '17:00', cl: 'c5', cn: 'Club Inter Djibouti', m: 15000, sp: 'acompte', mode: 'especes', st: 'confirmee', tp: 7000 },
    { d: 0, t: 't1', c: '19:00', cl: 'c2', cn: 'Étoile du Stade', m: 12000, sp: 'paye', mode: 'dmoney', st: 'confirmee' },
    { d: 0, t: 't2', c: '20:00', cl: 'c6', cn: 'Aden United', m: 12000, sp: 'a_payer', mode: null, st: 'confirmee' },
    { d: 0, t: 't3', c: '21:00', cl: 'c4', cn: 'Mohamed Ali', m: 15000, sp: 'paye', mode: 'waafi', st: 'confirmee' }
  ];

  for (const s of sessions) {
    const d = dateStr(now, s.d);
    const ts = Date.now() - (Math.abs(s.d) * 86400000) + Math.floor(Math.random() * 3600000);
    const resaRef = push(r(`reservations/${d}`));
    const resaId = resaRef.key;

    const resa = {
      terrainId: s.t, creneau: s.c, clientId: s.cl, clientNom: s.cn,
      montant: s.m, totalPaye: s.tp || (s.sp === 'paye' ? s.m : 0),
      statutPaiement: s.sp, statut: s.st,
      motifAnnulation: s.motif || null, notes: '', recurrenceId: null,
      employeId: uid, employeNom: 'Gérant (Démo)',
      createdAt: ts, updatedAt: ts
    };

    await set(resaRef, resa);

    // Slot (only for non-cancelled)
    if (s.st !== 'annulee') {
      await set(r(`slots/${d}/${s.t}_${s.c}`), resaId);
    }

    // Payment record
    if (s.sp !== 'a_payer' && s.st !== 'noshow' && s.mode) {
      const pRef = push(r(`paiements/${d}`));
      await set(pRef, {
        resaId, montant: s.tp || s.m, mode: s.mode,
        type: 'paiement', motif: null,
        employeId: uid, employeNom: 'Gérant (Démo)',
        timestamp: ts + 60000
      });
    }
  }

  // ─── CLÔTURE (J-1) ────────────────────────────────────────────────────────
  const yd = dateStr(now, -1);
  const espTheo = sessions
    .filter(s => s.d === -1 && s.mode === 'especes' && s.sp !== 'a_payer' && s.st !== 'noshow')
    .reduce((sum, s) => sum + (s.tp || s.m), 0);
  await set(r(`clotures/${yd}`), {
    theoriqueEspeces: espTheo,
    compteEspeces: espTheo - 500,
    ecart: -500,
    commentaire: 'Manque 500 FDJ',
    employeId: uid,
    employeNom: 'Gérant (Démo)',
    timestamp: Date.now() - 86400000 + 79200000
  });

  // ─── JOURNAL ──────────────────────────────────────────────────────────────
  const td = dateStr(now, 0);
  const journalRef = push(r(`journal/${td}`));
  await set(journalRef, {
    action: 'seed_data',
    userId: uid,
    userNom: 'Gérant (Démo)',
    details: 'Jeu de données de démo chargé.',
    timestamp: Date.now()
  });

  console.log('✅ Seed terminé ! Actualisez la page pour voir les données.');
})();
