# Pages de secours et diagnostic des sources

Vérification : **28 septembre 2026**. Les liens ci-dessous ont été vérifiés sur les sites des diffuseurs ou de leurs distributeurs. Ce sont des pages externes de visionnage ; elles ne remplacent pas les flux du catalogue. L'accès effectif dépend du pays, du compte et de l'offre du service.

## Pages sélectionnées

La correspondance utilise l'identifiant IPTV-org complet, sensible à la casse. Une autre édition, langue ou déclinaison conserve son propre site. Les pages CANAL+ peuvent présenter du replay et demander un abonnement : le libellé ne promet pas un direct gratuit.

| Identifiant exact | Page vérifiée | Libellé |
| --- | --- | --- |
| `arte.fr` | [ARTE — direct](https://www.arte.tv/fr/direct/) | Direct sur ARTE |
| `TF1.fr` | [TF1+ — direct TF1](https://www.tf1.fr/tf1/direct) | Direct sur TF1+ |
| `M6.fr` | [M6+ — direct M6](https://www.m6.fr/m6/direct) | Direct sur M6+ |
| `Gulli.fr` | [M6+ — direct Gulli](https://www.m6.fr/gulli/direct) | Gulli sur M6+ |
| `CNews.fr` | [CNEWS — direct](https://www.cnews.fr/le-direct) | Direct sur CNEWS |
| `NickelodeonJunior.fr` | [CANAL+ — Nickelodeon Junior](https://www.canalplus.com/chaines/nickelodeon-junior) | Voir sur CANAL+ |

Pour Nickelodeon Junior, le lecteur précise : « Compte et abonnement requis ; disponibilité selon votre pays. »

Pour les autres chaînes, le site provient du champ `website` de l'[API officielle du projet IPTV-org](https://iptv-org.github.io/api/channels.json), après validation HTTP(S), sans identifiants intégrés ni caractères de contrôle. Son libellé reste « Site de la chaîne » : il ne garantit pas la présence d'un lecteur. Le snapshot du 28 septembre 2026 à 10:31:32 UTC contient 9 422 sites pour 10 801 chaînes ; 7 662 de ces liens utilisent HTTPS. Les URL HTTP fournies par la source ne sont pas transformées en HTTPS sans vérification.

## Cas Nickelodeon

Le catalogue courant contient 24 entrées dont le nom ou l'identifiant contient « Nickelodeon ». Chacune n'a qu'une source ; 11 sont uniquement HTTP. `Nickelodeon.fr`, la chaîne principale française, est présente dans les métadonnées IPTV-org mais absente de la playlist : aucune entrée ni aucun flux n'a été inventé pour elle. `NickelodeonJunior.fr` est une chaîne différente, présente avec un seul flux HTTP.

Sondages ponctuels réalisés depuis cet environnement le 28 septembre 2026, avec un en-tête `Origin` Fréquence. Les manifestes et au plus les premiers 1 024 octets d'un segment ont été contrôlés ; ces résultats ne constituent pas une vérification complète de décodage ou d'identité du contenu.

| Entrée du catalogue | Observation | Conséquence pratique |
| --- | --- | --- |
| `NickelodeonJunior.fr` | Manifeste principal et variante : HTTP 200, CORS `*`. Segment : HTTP 206, type `video/MP2T`. Tous les liens sont HTTP. | Le transport HTTP empêche la lecture dans la page HTTPS. Le fichier M3U permet un essai dans VLC sans modifier les URL. La page CANAL+ donne une autre possibilité officielle. |
| `Nickelodeon.de` | Manifeste HTTPS 200, CORS `*` ; segment HTTPS 206, CORS `*`. | Source joignable lors du sondage ; édition allemande, pas un remplacement de l'édition française. |
| `Nickelodeon.br` | Manifeste HTTPS 200, mais segment demandé : HTTP 404. | La présence d'un manifeste ne suffit pas à conclure que la vidéo fonctionne. |
| `Nickelodeon.ro` | Connexion réinitialisée (`ECONNRESET`). | Échec de la source pendant le sondage. |
| `Nickelodeon.uk` | Aucune réponse après neuf secondes. | Source indisponible pendant le sondage ; les tentatives du lecteur restent bornées. |
| `Nickelodeon.us@East` | Manifeste HTTP 200, aucun en-tête CORS. | Cette URL ne convient pas à une intégration HLS dans Fréquence HTTPS. |
| `NickelodeonPlutoTV.us` et `NickelodeonClassics.de@DACH` | Redirection vers un manifeste Pluto HTTPS 200, avec `Access-Control-Allow-Origin: http://pluto.tv`. | Cet en-tête n'autorise pas Fréquence. Utiliser le site Pluto proposé pour l'édition concernée ; ne pas contourner cette restriction. |

Sur tout le catalogue, 1 996 chaînes ne proposent que des URL HTTP. Le secours entre sources ne peut pas résoudre à lui seul une chaîne ne disposant que d'une URL, un segment supprimé ou une restriction du diffuseur.

Contrôle supplémentaire du flux `NickelodeonJunior.fr` le même jour : `ffprobe` termine avec le code 0 et identifie une vidéo H.264 1 920 × 1 080 ainsi qu'une piste audio AAC. Cela confirme la présence de pistes média lisibles par l'outil ; aucun décodage intégral ni essai dans une application VLC installée n'est revendiqué.

## Autres pages officielles consultées

- [Nickelodeon sur CANAL+ France](https://www.canalplus.com/chaines/nickelodeon/) et [conditions d'accès CANAL+](https://boutique.canalplus.com/experience-canal-plus/chaines/nickelodeon/) : la chaîne principale est proposée dans les offres indiquées par le distributeur, en France métropolitaine. Cette page n'est pas associée aux éditions étrangères du catalogue.
- [blue Premium avec CANAL+](https://www.blueplus.ch/fr/films-et-series/premium-fr) : le distributeur suisse référence Nickelodeon et Nickelodeon Junior dans son offre francophone avec abonnement. Cette page commerciale générale n'a pas été ajoutée au lecteur.
- [Assistance officielle Nickelodeon](https://viacom.helpshift.com/hc/en/8-nick/section/347-nick/) : l'accès à la chaîne et aux contenus à la demande passe aussi par les fournisseurs TV. Cette information ne démontre pas la disponibilité d'un flux public intégrable.
- [Page officielle Nickelodeon Pluto TV](https://pluto.tv/us/watch/live-tv/31617/) : au moment de la consultation, elle redirige vers un message d'indisponibilité géographique dans l'environnement de recherche. Elle n'a pas été substituée aux éditions France ou Suisse.

Aucun proxy, extraction de jeton, contournement de géoblocage ou de DRM, ni flux supplémentaire provenant d'un site tiers n'a été ajouté.
