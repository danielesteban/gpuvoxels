import fs from 'fs';
import path from 'path';
import alias from '@rollup/plugin-alias';
import copy from 'rollup-plugin-copy';
import html from '@rollup/plugin-html';
import livereload from 'rollup-plugin-livereload';
import postcss from 'rollup-plugin-postcss';
import resolve from '@rollup/plugin-node-resolve';
import serve from 'rollup-plugin-serve';
import { terser } from 'rollup-plugin-terser';

const outputPath = path.resolve(__dirname, 'dist');
const production = !process.env.ROLLUP_WATCH;
const token = production ? (
  'AocN2Pmq4zNS/s+17/8pCsjM6O8UUhvGA8NnGQmWqBPAIhC8DF5ep7TL7YUDVUXpvvNUF0AVOfFVazeFwrg4ggoAAABVeyJvcmlnaW4iOiJodHRwczovL2dwdXZveGVscy5nYXR1bmVzLmNvbTo0NDMiLCJmZWF0dXJlIjoiV2ViR1BVIiwiZXhwaXJ5IjoxNjc1MjA5NTk5fQ=='
) : (
  'AkoE8+yWvZMfOjxrWIWvq/aMz5KEEkAlww7Bx2CAzx3UG3J1wdvOGTgLm48isIN9VbQbJjo0AKfKDVktsf4q7AoAAABJeyJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjgwODAiLCJmZWF0dXJlIjoiV2ViR1BVIiwiZXhwaXJ5IjoxNjc1MjA5NTk5fQ=='
);

export default {
  input: path.join(__dirname, 'src', 'main.js'),
  output: {
    dir: outputPath,
    format: 'iife',
  },
  plugins: [
    ...(!production ? [
      alias({
        entries: { gpuvoxels: path.join(__dirname, '..', 'dist') },
      }),
    ] : []),
    resolve({
      browser: true,
      moduleDirectories: [path.join(__dirname, 'node_modules')],
    }),
    postcss({
      extract: 'main.css',
      minimize: production,
    }),
    html({
      template: ({ files }) => (
        fs.readFileSync(path.join(__dirname, 'src', 'index.html'), 'utf8')
          .replace('__TOKEN__', token)
          .replace(
            '<link rel="stylesheet">',
            (files.css || [])
              .map(({ fileName }) => `<link rel="stylesheet" href="/${fileName}">`)
              .join('\n')
          )
          .replace(
            '<script></script>',
            (files.js || [])
              .map(({ fileName }) => `<script defer src="/${fileName}"></script>`)
              .join('\n')
          )
      ),
    }),
    copy({
      targets: [
        { src: 'models', dest: 'dist' },
        { src: 'screenshot.png', dest: 'dist' }
      ],
    }),
    ...(production ? [
      terser({ format: { comments: false } }),
      {
        writeBundle() {
          fs.writeFileSync(path.join(outputPath, 'CNAME'), 'gpuvoxels.gatunes.com');
        },
      },
    ] : [
      serve({
        contentBase: outputPath,
        port: 8080,
      }),
      livereload(outputPath),
    ]),
  ],
  watch: { clearScreen: false },
};
