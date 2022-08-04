import asc from '../dist/index.mjs';

export default {
  input: 'main.js',
  output: {
    file: 'build/main.js',
    name: 'test',
    format: 'umd',
  },
  plugins: [
    asc({
      compilerOptions: {
        optimizeLevel: 3,
        exportRuntime: true
      }
    })
  ]
};
