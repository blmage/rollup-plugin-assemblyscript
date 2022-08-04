/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as ascCompiler from 'assemblyscript/asc';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import fs from 'node:fs/promises';

const ASC_FILE_MARKER = 'asc:';
const ASC_IMPORT_MATCHER = /^asc:(.+)$/;

const DEFAULT_OPTIONS = {
  compilerOptions: {},
  importMatcher: ASC_IMPORT_MATCHER,
};

function asc(options) {
  options = { ...DEFAULT_OPTIONS, ...options };

  return {
    name: 'assemblyscript',

    async resolveId(rawId, importee) {
      const matches = options.importMatcher.exec(rawId);

      if (!matches) {
        return;
      }

      const result = await this.resolve(matches[1], importee);

      if (null === result) {
        return;
      }

      // todo not working? with rollup -c -w
      this.addWatchFile(result.id);

      return ASC_FILE_MARKER + result.id;
    },

    async load(id) {
      if (!id.startsWith(ASC_FILE_MARKER)) {
        return;
      }

      id = id.slice(ASC_FILE_MARKER.length);

      const folder = tmpdir();
      const fileName = basename(id).replace(/\.[^.]+$/, "");
      const wasmFilePath = join(folder, `${fileName}.wasm`);
      const runtimeFilePath = join(folder, `${fileName}.js`);

      options.compilerOptions.bindings = 'raw';

      await new Promise(async (resolve, reject) => {
        const params = [
          id,
          '-o',
          wasmFilePath,
          ...Object.entries(options.compilerOptions).map(([ option, value ]) => (
            (true === value)
              ? `--${option}`
              : `--${option}=${value}`
          ))
        ].flat();

        const { error, stderr } = await ascCompiler.main(params);

        if (!error) {
          resolve();
        } else {
          reject(`ASC compilation failed:\n${error}\n[Details]\n${stderr.toString()}`);
        }
      });

      const wasmSource = await fs.readFile(wasmFilePath);
      const runtimeSource = await fs.readFile(runtimeFilePath);

      const wasmReferenceId = this.emitFile({
        type: 'asset',
        name: `${fileName}.wasm`,
        source: wasmSource,
      });

      if (options.compilerOptions.sourceMap) {
        this.emitFile({
          type: 'asset',
          name: `${fileName}.wasm.map`,
          source: await fs.readFile(`${wasmFilePath}.map`),
        });
      }

      // todo rename instantiateModule for something more relevant (we actually fetch, compile and instantiate!)
      return `
      ${runtimeSource.toString()}

      const WASM_URL = import.meta.ROLLUP_FILE_URL_${wasmReferenceId};

      export default async function instantiateModule(imports = {}) {
        const module = await WebAssembly.compileStreaming(fetch(WASM_URL));
        return await instantiate(module, imports);
      };
      `;
    }
  };
}

export default asc;
