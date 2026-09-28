#!/usr/bin/env node
// Relais entre Claude Code et Claude Pet.
//
// Claude Code lance ce script pour dessiner sa barre d'état et lui passe, en
// JSON, l'utilisation de ton abonnement Claude (Pro ou Max) : pourcentage
// utilisé sur 5 heures et sur 7 jours. Le script recopie ces chiffres dans
// ~/.claude/claude-pet-usage.json, que le compagnon surveille pour savoir
// s'il doit être fatigué, et affiche une petite ligne dans Claude Code.
//
// Il ne lit ni n'envoie rien d'autre.
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = path.join(os.homedir(), '.claude', 'claude-pet-usage.json');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(input); } catch { /* entrée vide ou illisible */ }
  const limits = data.rate_limits || {};
  const pick = (w) => (w && typeof w.used_percentage === 'number'
    ? { used_percentage: w.used_percentage, resets_at: w.resets_at || null }
    : null);
  const usage = { five_hour: pick(limits.five_hour), seven_day: pick(limits.seven_day) };

  if (usage.five_hour || usage.seven_day) {
    try {
      fs.writeFileSync(OUT, JSON.stringify({ ...usage, updated_at: Math.floor(Date.now() / 1000) }, null, 2));
    } catch { /* on n'empêche jamais Claude Code d'afficher sa barre */ }
  }

  const parts = [];
  if (usage.five_hour) parts.push(`5 h ${Math.round(usage.five_hour.used_percentage)} %`);
  if (usage.seven_day) parts.push(`7 j ${Math.round(usage.seven_day.used_percentage)} %`);
  const model = data.model && data.model.display_name ? `${data.model.display_name} · ` : '';
  process.stdout.write(`✦ ${model}${parts.length ? parts.join(' · ') : 'Claude Pet'}\n`);
});
