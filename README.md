# Rugby Live — Top 14 & Pro D2

Scores en direct et classements du Top 14 et de la Pro D2 sur GitHub Pages.

## Comment ça marche

- **Frontend** : site statique (`index.html`, `site.css`, `site.js`) qui lit les JSON dans `data/`.
- **Scraper** : `.github/workflows/scrape.yml` tourne toutes les 5 minutes, récupère les matchs en direct et le classement sur `top14.lnr.fr` et `prod2.lnr.fr`, puis committe les fichiers `data/top14.json` et `data/prod2.json`.
- **Déploiement** : `.github/workflows/pages.yml` publie automatiquement le repo sur GitHub Pages à chaque push.

## Tester en local

```bash
node scripts/scrape.js      # régénère data/*.json
python3 -m http.server 8000 # sert le site, puis ouvre http://localhost:8000
```

## Données

Sources officielles : [top14.lnr.fr](https://top14.lnr.fr) et [prod2.lnr.fr](https://prod2.lnr.fr). Mise à jour ~5 min (latence liée à l'intervalle de scraping, pas au temps réel).

> Non affilié à la LNR.