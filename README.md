# Fréquence

Une télévision web en français à partir de la [playlist IPTV-org](https://iptv-org.github.io/iptv/index.m3u), avec lecture HLS, zapping, recherche, filtres pays/catégorie, favoris locaux et liens partageables.

L'accueil propose une sélection éditoriale, des catégories, des destinations et les chaînes récentes. Navigation Accueil / Chaînes / Mes favoris, lecture en un clic, mini-lecteur persistant pendant l'exploration et retour navigateur conservant les filtres. Les tendances sont une sélection Fréquence, sans statistiques d'audience inventées.

## Développement

```sh
npm ci
npm run dev
npm test
npm run test:e2e
npm run build
```

Node.js 22 ou ultérieur. `npm run catalog` reconstruit `public/catalog.json` depuis la playlist exacte et les métadonnées publiques IPTV-org. Le navigateur charge cet instantané puis vérifie la playlist en arrière-plan, et permet une actualisation manuelle. Une panne de la source ne supprime pas l'instantané affiché.

Les langues et éditions régionales sont distinctes ; les variantes de qualité sont regroupées. Les données upstream sont utilisées comme données non fiables : rendu React échappé, schémas d'URL HTTP/HTTPS uniquement et aucun HTML injecté. Les favoris et l'historique restent dans le navigateur.

## Lecture

La lecture commence à la demande. Safari utilise la vidéo HLS native, les autres navigateurs HLS.js, chargé séparément. Les MP4/WebM sont confiés à la vidéo native. Les flux restent chez les diffuseurs : aucun proxy vidéo, aucune copie et aucun contournement des restrictions de pays, de CORS ou d'accès. Les flux HTTP sur un site HTTPS, DASH et les codecs non pris en charge nécessitent un lecteur externe. Certaines sources peuvent être hors ligne.

## Publication

Site Vite statique, configuré dans `vercel.json`.

```sh
vercel project inspect --non-interactive
vercel deploy --prod
```

Projet Vercel `frequence-tv`, équipe `zakichair-4589s-projects`.

Site public : https://frequence-tv.vercel.app

Vérification navigateur en production :

```sh
FREQUENCE_BASE_URL=https://frequence-tv.vercel.app npm run test:e2e
```

Les tests navigateur couvrent les filtres, la recherche sans accents, les favoris persistants, le partage, les liens directs, la pagination, les raccourcis, le dialogue d'aide et les largeurs de 320 à 1440 pixels. Ils utilisent le catalogue réellement déployé avec sa mise à jour en arrière-plan bloquée pour stabiliser les résultats. La lecture réelle est vérifiée séparément : France 24 français en 1920 × 1080, état « En direct », vidéo en lecture sur la version publique.

## Sources

- Playlist : https://iptv-org.github.io/iptv/index.m3u
- Métadonnées : https://iptv-org.github.io/api/channels.json et https://iptv-org.github.io/api/feeds.json
- Logos : adresses référencées dans la playlist, propriétés de leurs diffuseurs respectifs.
- Polices : Manrope et DM Sans via Google Fonts.
