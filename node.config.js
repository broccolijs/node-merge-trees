import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import typescript from 'rollup-plugin-typescript';

const packageJson = require('./package');
const name = packageJson.name;
const version = packageJson.version;

export default {
  entry: 'src/index.ts',
  moduleName: name,
  external: [
    'fs',
    'can-symlink',
    'fs-tree-diff',
    'heimdalljs',
    'heimdalljs-logger',
    'rimraf',
    'symlink-or-copy'
  ],
  plugins: [
    typescript({
      include: [
        'src/**/*'
      ],
      exclude: [
        'node_modules/**'
      ]
    }),
    nodeResolve({
      jsnext: true,
      browser: false,
      module:true,
      main: true,
      preferBuiltins: true,
      skip: [
        'fs',
        'can-symlink',
        'fs-tree-diff',
        'heimdalljs',
        'heimdalljs-logger',
        'rimraf',
        'symlink-or-copy'
      ]
    }),
    commonjs({ include: 'node_modules/**' })
  ],
  targets: [
    { dest: `dist/${name}.cjs.js`, format: 'cjs' }
  ]
};
