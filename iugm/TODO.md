# TODO - iugm-portail (Modernisation Scolarité & Inscriptions)

## Étape 1 — Login minimal (Next.js + Prisma + Postgres)
- [x] Vérifier si un dossier `prisma/` existe déjà
- [x] Mettre en place `prisma/schema.prisma` (modèle Personnel/User + passwordHash + role)
- [x] Créer la page UI `app/login/page.tsx`
- [x] Créer l’endpoint `app/api/auth/login/route.ts` (validation champs + vérif hash)
- [x] Créer un système de session via cookie HTTP-only signée (AUTH_SECRET)
- [x] Créer `app/page.tsx` pour rediriger vers `/login`
- [x] Ajouter `iugm/.env.local` (ex: DATABASE_URL, AUTH_SECRET)



## Étape 2 — Tests
- [ ] Lancer `npm run lint` (si scripts PowerShell autorisés)
- [ ] Exécuter `prisma generate` (si scripts PowerShell autorisés)
- [ ] Exécuter `prisma migrate dev` (si scripts PowerShell autorisés)
- [ ] Tester le flow login/logout


