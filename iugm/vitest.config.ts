import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup/load-test-env.ts"],
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    // Les tests d'intégration partagent une seule base Postgres de test et
    // font des DELETE entre chaque cas (voir tests/setup/db.ts) : les lancer
    // en parallèle ferait courir les cas les uns après les autres de toute
    // façon (mêmes tables), avec le risque en plus de se marcher dessus.
    fileParallelism: false,
    // Marge pour les machines lentes ou chargées (CI partagée, antivirus) : le
    // TRUNCATE de resetDb et le hachage bcrypt peuvent dépasser les 10 s par défaut.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"], 
      include: ["lib/**/*.ts", "app/**/*.ts"],
      exclude: ["**/*.test.ts", "**/actions.ts", "**/route.ts"],
    },
  },
});
