const TZ = 'Africa/Djibouti';

export function todayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

export function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const label = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = todayDate();
  if (dateStr === today) return 'Aujourd\'hui · ' + label;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-CA');
}

export function generateSlots(ouverture, fermeture, dureeMin) {
  const slots = [];
  const [oh, om] = ouverture.split(':').map(Number);
  let cur = oh * 60 + om;

  const [fh, fm] = fermeture.split(':').map(Number);
  let end = fh * 60 + fm;
  if (end <= cur) end += 24 * 60;

  while (cur < end) {
    const h = Math.floor(cur / 60) % 24;
    const min = cur % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    cur += dureeMin;
  }
  return slots;
}

export function isSoirSlot(creneau, heureSoir) {
  const [h, m] = creneau.split(':').map(Number);
  const [sh, sm] = heureSoir.split(':').map(Number);
  return h * 60 + m >= sh * 60 + sm;
}

export function getTarif(terrainId, creneau, tarifs) {
  const t = tarifs?.[terrainId];
  if (!t) return 0;
  return isSoirSlot(creneau, t.heureSoir) ? t.soir : t.jour;
}

export function formatFDJ(amount) {
  if (amount == null || isNaN(amount)) return '— FDJ';
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' FDJ';
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ
  });
}

export function formatDateTime(ts) {
  return new Date(ts).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ
  });
}

export function creneauClass(resa) {
  if (!resa || resa.statut === 'annulee') return 'libre';
  if (resa.statut === 'terminee' || resa.statut === 'noshow') return 'termine';
  if (resa.statutPaiement === 'paye') return 'paye';
  if (resa.statutPaiement === 'acompte') return 'acompte';
  return 'a-payer';
}

export function statutLabel(statut, statutPaiement) {
  if (statut === 'annulee') return 'Annulée';
  if (statut === 'terminee') return 'Terminée';
  if (statut === 'noshow') return 'No-show';
  if (statutPaiement === 'paye') return 'Payé';
  if (statutPaiement === 'acompte') return 'Acompte';
  return 'À payer';
}

export function modePaiementLabel(mode) {
  const labels = { especes: 'Espèces', dmoney: 'D-Money', waafi: 'Waafi', autre: 'Autre' };
  return labels[mode] || mode;
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function showToast(msg, type = 'info', duration = 3000) {
  const ct = document.getElementById('toast-container');
  if (!ct) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  ct.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, duration);
}
