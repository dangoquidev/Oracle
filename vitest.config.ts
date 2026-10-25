import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test-support/**', 'src/main.ts'],
      thresholds: {
        'src/domain/**': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/application/**': { lines: 95, branches: 90, functions: 95, statements: 95 },
      },
    },
  },
});
