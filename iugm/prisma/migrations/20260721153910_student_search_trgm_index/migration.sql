-- Index trigram (pg_trgm) pour accélérer les recherches "contains" insensibles
-- à la casse sur les dossiers étudiants (nom, matricule, reçu, filière,
-- département, CIN, parcours). Sans ça, chaque recherche fait un scan complet
-- de la table ; avec l'index GIN + gin_trgm_ops, Postgres peut l'utiliser
-- même pour une sous-chaîne au milieu du texte (contrairement à un index
-- B-tree classique, qui n'aide que pour une recherche "commence par").
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Student_fullName_trgm_idx" ON "Student" USING gin ("fullName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Student_matricule_trgm_idx" ON "Student" USING gin ("matricule" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Student_receiptNumber_trgm_idx" ON "Student" USING gin ("receiptNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Student_program_trgm_idx" ON "Student" USING gin ("program" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Student_department_trgm_idx" ON "Student" USING gin ("department" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Student_cin_trgm_idx" ON "Student" USING gin ("cin" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Student_track_trgm_idx" ON "Student" USING gin ("track" gin_trgm_ops);
