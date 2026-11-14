// Copie la bibliothèque Supabase épinglée (devDependency, version exacte) dans vendor/ : le jeu ne dépend d'aucun CDN. Lancer : npm run vendor:supabase
import { copyFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = dirname(createRequire(import.meta.url).resolve('@supabase/supabase-js/package.json'));
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const dst = join(root, 'vendor/supabase-js-' + version + '.umd.js');
copyFileSync(join(pkgDir, 'dist/umd/supabase.js'), dst);
copyFileSync(join(pkgDir, 'LICENSE'), join(root, 'vendor/supabase-js.LICENSE'));
console.log('Copié : vendor/supabase-js-' + version + '.umd.js (sha256 ' + createHash('sha256').update(readFileSync(dst)).digest('hex').slice(0, 16) + '…). Pense à mettre à jour la balise <script> d’index.html si la version change.');
