/* Serveur de développement uniquement (le build copie les fichiers sans Vite, voir scripts/build.mjs).
   supabase-js charge @opentelemetry/api en option par import() dynamique ; le module n'existe pas dans le navigateur et la bibliothèque
   renvoie alors null. Vite échoue à résoudre ce nom : on remplace l'import par ce même résultat, null. */
export default {
  plugins: [{
    name: 'nzassa-supabase-sans-opentelemetry',
    enforce: 'pre',
    transform(code, id) {
      if (!/vendor[\\/]supabase-js-[^\\/]*\.umd\.js$/.test(id)) return null;
      return { code: code.replace(/import\(\s*[`'"]@opentelemetry\/api[`'"]\s*\)/g, 'Promise.resolve(null)'), map: null };
    }
  }]
};
