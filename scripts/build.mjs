// Copie le site statique dans dist/ (aucun bundler nécessaire) et y écrit la configuration Supabase publique. Lancer : npm run build
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveConfig, renderConfig } from './supabase-config.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const local = join(root, 'js/supabase/config.js');
const cfg = resolveConfig({ env: process.env, fileText: existsSync(local) ? readFileSync(local, 'utf8') : null });
if (cfg.error) { console.error('ERREUR : ' + cfg.error); process.exit(1); }
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const p of ['index.html', 'manifest.webmanifest', 'css', 'js', 'img', 'vendor']) cpSync(join(root, p), join(out, p), { recursive: true });
writeFileSync(join(out, 'js/supabase/config.js'), renderConfig(cfg));
/* PWA : liste de précache (fichiers essentiels, hors masques du musée chargés à l'usage) et identifiant de version = empreinte du contenu. */
const walk = (d, base = '') => readdirSync(join(d, base)).flatMap(n => { const rel = base ? base + '/' + n : n; return statSync(join(d, rel)).isDirectory() ? walk(d, rel) : [rel]; });
const all = walk(out).filter(f => f !== 'sw.js').sort();
const pre = all.filter(f => !f.startsWith('img/masks/') && f !== 'img/hero.jpg');
const hash = createHash('sha256'); for (const f of all) { hash.update(f); hash.update(readFileSync(join(out, f))); }
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const buildId = pkgVersion + '-' + hash.digest('hex').slice(0, 10);
const sw = readFileSync(join(root, 'sw.js'), 'utf8').replace("'__BUILD__'", JSON.stringify(buildId)).replace('/*__PRECACHE__*/[]', JSON.stringify(pre));
writeFileSync(join(out, 'sw.js'), sw);
console.log('PWA : version ' + buildId + ', ' + pre.length + ' fichiers préchargés sur ' + all.length);
if (cfg.warning) console.warn('Attention : ' + cfg.warning);
console.log('Site statique prêt dans dist/ (à servir avec n’importe quel serveur de fichiers). Comptes : ' + (cfg.url ? 'Supabase configuré (' + (cfg.source === 'env' ? 'variables d’environnement' : 'js/supabase/config.js') + ')' : 'désactivés'));
