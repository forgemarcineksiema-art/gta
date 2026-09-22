import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

// Layering (docs/ARCHITECTURE.md), enforced on imports:
//   sim       -> sim only (+ rapier). Headless: no three, no DOM.
//   input     -> input only
//   platform  -> platform only
//   render    -> render, sim (+ three)
//   audio     -> audio, sim
//   ui        -> ui, sim
//   app       -> everything
//   main.ts   -> unclassified entry point (not linted for boundaries)
const LAYERS = {
  sim: { elements: ['sim'], external: ['@dimforge/rapier3d-compat'] },
  input: { elements: ['input'], external: [] },
  platform: { elements: ['platform'], external: [] },
  render: { elements: ['render', 'sim'], external: ['three', 'three/addons/*'] },
  audio: { elements: ['audio', 'sim'], external: [] },
  ui: { elements: ['ui', 'sim'], external: [] },
  app: { elements: ['app', 'sim', 'input', 'platform', 'render', 'audio', 'ui'], external: ['three'] },
};

const policies = Object.entries(LAYERS).map(([type, l]) => ({
  from: { element: { type } },
  allow: [
    { to: { element: { types: { anyOf: l.elements } } } },
    ...l.external.map((source) => ({ to: { module: { origin: 'external', source } } })),
  ],
}));

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'output/**', 'perf/**', 'screens/**', 'test-results/**', 'playwright-report/**'] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'sim', pattern: 'src/sim/**' },
        { type: 'input', pattern: 'src/input/**' },
        { type: 'platform', pattern: 'src/platform/**' },
        { type: 'render', pattern: 'src/render/**' },
        { type: 'audio', pattern: 'src/audio/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        { type: 'app', pattern: 'src/app/**' },
      ],
      'boundaries/ignore': ['**/*.css', '**/*.d.ts'],
      'import/resolver': { node: { extensions: ['.ts', '.js', '.mjs'] } },
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', checkAllOrigins: true, policies }],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['tests/**/*.ts', 'e2e/**/*.ts', 'tools/**/*.mjs', 'tools/**/*.ts', '*.ts', '*.js', '*.mjs'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-floating-promises': 'off' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
