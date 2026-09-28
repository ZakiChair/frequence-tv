# Fréquence

Une télé web en français, publiée sur Vercel, utilisant exclusivement les flux de https://iptv-org.github.io/iptv/index.m3u.

## Expérience

La découverte est le point d'entrée : sélections visuelles, catégories et destinations conduisent au lecteur ou au catalogue. Le direct conserve une liste de zapping et le catalogue complet en dessous. Recherche, filtres par pays et catégorie, favoris locaux, liens partageables et affichage progressif. Pas de compte. Les sources linguistiques restent distinctes, les variantes de qualité sont regroupées.

## Direction visuelle

Une console audiovisuelle contemporaine : anthracite violet #18171e, panneaux #211f29, séparateurs #35313d, texte ivoire #f6f3f0, corail #ff956e, lavande #c7b5d7. Manrope pour l'identité et les titres, DM Sans pour les commandes. Un grand écran 16:9 en premier, une colonne de chaînes sur ordinateur, une seule colonne sur mobile. Pas de programmes ou d'images d'émissions inventés.

## Architecture et vérification

React/Vite statique. Un instantané du catalogue garantit une première ouverture fiable. Mise à jour directe depuis la source en arrière-plan et à la demande. HLS.js chargé lors de la lecture, vidéo native pour Safari. Les restrictions des diffuseurs sont affichées sans proxy ni contournement. Vérification du parsing M3U, de la compilation, des parcours navigateur ordinateur/mobile et de la lecture réelle avant publication.

## Accueil et navigation modernes

L'accueil est désormais une page de découverte : grande mise en avant France 24, une invitation TV5MONDE Chefs, huit chaînes éditoriales variées, sept catégories, six destinations et un accès aux chaînes récentes et favorites. « Tendances à découvrir » est explicitement une sélection Fréquence et ne prétend pas mesurer les audiences. Les photographies sont des images d'ambiance, pas des captures des programmes en cours.

Trois entrées permanentes : Accueil, Chaînes, Mes favoris. Le catalogue et les favoris ont leurs liens propres, avec filtres catégorie/pays/recherche dans l'URL. La vue du direct propose une recherche de zapping et un onglet de favoris. Un clic explicite sur une carte lance la lecture ; une arrivée directe par URL attend une interaction.

Un seul lecteur reste monté pendant la navigation. Une lecture commencée reste en miniature sur les autres pages. Agrandir la miniature préserve la vidéo ; la fermer suspend la lecture et libère HLS. Les contrôles Précédent/Suivant du navigateur restaurent la page et ses filtres.
