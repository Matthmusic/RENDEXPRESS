# Release notes (interne)

Points à retenir pour les prochaines versions :
- Le backend Python doit être embarqué : `extraResources` et `files` pointent vers `../python_backend` (chemin relatif à `electron-react` quand electron-builder s’exécute).
- Le runtime Python est embarqué dans `python_runtime` (Python embed Windows). `PYTHON` n’est plus requis en production.
- Le workflow de release ne publie que l’EXE (et le blockmap NSIS) ; pas de ZIP produit par défaut.
- Construire une release : `git tag vX.Y.Z && git push origin main --tags` (déclenche le workflow Windows qui installe les deps Python, build renderer, pack NSIS et uploade l’EXE).

Vérifications avant de tagger :
- `npm run build` passe en local.
- Le logo/nom/titre sont à jour et la version affichée en UI correspond à la version du tag.
- Python est trouvable (variable `PYTHON` si besoin) et `python_backend/requirements.txt` couvre les dépendances.
