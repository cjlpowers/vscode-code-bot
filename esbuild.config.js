const { build } = require('esbuild');

build({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node14',
  outfile: 'out/extension.js',
  external: ['vscode']
}).catch(() => process.exit(1));
