# Fréquence

Une télé web en français, publiée sur Vercel, utilisant exclusivement les flux de https://iptv-org.github.io/iptv/index.m3u.

## Expérience

L'écran de télévision est le point d'entrée. Une liste de zapping propose d'autres chaînes. Le catalogue complet se trouve juste en dessous avec recherche, filtres par pays et catégorie, favoris locaux, liens partageables et affichage progressif. Pas de compte. Les sources linguistiques restent distinctes, les variantes de qualité sont regroupées.

## Direction visuelle

Une console audiovisuelle contemporaine : anthracite violet #18171e, panneaux #211f29, séparateurs #35313d, texte ivoire #f6f3f0, corail #ff956e, lavande #c7b5d7. Manrope pour l'identité et les titres, DM Sans pour les commandes. Un grand écran 16:9 en premier, une colonne de chaînes sur ordinateur, une seule colonne sur mobile. Pas de programmes ou d'images d'émissions inventés.

## Architecture et vérification

React/Vite statique. Un instantané du catalogue garantit une première ouverture fiable. Mise à jour directe depuis la source en arrière-plan et à la demande. HLS.js chargé lors de la lecture, vidéo native pour Safari. Les restrictions des diffuseurs sont affichées sans proxy ni contournement. Vérification du parsing M3U, de la compilation, des parcours navigateur ordinateur/mobile et de la lecture réelle avant publication.
