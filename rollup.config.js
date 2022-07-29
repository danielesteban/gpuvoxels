import fs from 'fs';
import path from 'path';
import copy from 'rollup-plugin-copy';
import { terser } from 'rollup-plugin-terser';

const outputPath = path.resolve(__dirname, 'dist');
const production = !process.env.ROLLUP_WATCH;

export default {
  input: path.join(__dirname, 'src', 'module.js'),
  external: ['gl-matrix'],
  output: {
    file: path.join(outputPath, 'module.js'),
    format: 'esm',
  },
  plugins: [
    copy({
      targets: [
        { src: 'LICENSE', dest: 'dist' },
        { src: 'README.md', dest: 'dist' },
      ],
      copyOnce: !production,
    }),
    {
      name: 'wgsl',
      transform(code, id) {
        if (/\.wgsl$/g.test(id)) {
          return {
            code: `export default ${JSON.stringify(code)};`,
            map: { mappings: '' }
          };
        }
      }
    },
    {
      name: 'package',
      writeBundle() {
        fs.writeFileSync(path.join(outputPath, 'package.json'), JSON.stringify({
          name: 'gpuvoxels',
          author: 'Daniel Esteban Nombela',
          license: 'MIT',
          main: 'module.js',
          type: 'module',
          version: '0.0.6',
          repository: {
            type: 'git',
            url: 'https://github.com/danielesteban/gpuvoxels',
          },
          peerDependencies: {
            'gl-matrix': '>=3.4.3',
          },
        }, null, '  '));
      },
    },
    ...(production ? [terser()] : []),
  ],
  watch: { clearScreen: false },
};
