/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

const {
  info, error, rootLogger, CoralogixLogger,
} = require('@adobe/helix-log');
const { wrap } = require('@adobe/helix-status');
const phin = require('phin');
const minimatch = require('minimatch');
const openwhisk = require('openwhisk');
const tar = require('tar-stream');
const { createGunzip } = require('gunzip-stream');
const strip = require('strip-dirs');


/**
 * This is the main function
 * @param {string} name name of the person to greet
 * @returns {object} a greeting
 */
async function main({
  owner, repo, ref, branch, pattern = '**/*.{md,jpg}', token, CORALOGIX_TOKEN, batchsize = 1,
} = {}) {
  rootLogger.loggers.set('coralogix', new CoralogixLogger(
    CORALOGIX_TOKEN, 'test', '/trieloff/helix-index-big-tree',
  ));

  if (!(owner && repo && ref && branch)) {
    error('Required arguments missing');
    return {
      statusCode: 400,
      body: 'Required arguments missing',
    };
  }

  const ow = openwhisk();

  try {
    const prom = new Promise((resolve) => {
      const list = tar.extract();
      const jobs = [];
      const failures = [];
      let batch = [];

      let lastpt = new Date().getTime();
      let count = 0;
      list.on('entry', async (header, stream, next) => {
        const path = strip(header.name, 1);

        if (minimatch(path, pattern)) {
          count += 1;
          if (new Date().getTime() - lastpt > 5000) {
            info('batching #', count, path);
            lastpt = new Date().getTime();
          }
          batch.push(path);
          if (batch.length >= Number.parseInt(batchsize, 10)) {
            const paths = batch.slice();
            // start a new batch
            batch = [];

            info(`invoking #${count} with ${paths.length} items`);
            try {
              ow.actions.invoke({
                name: 'helix-index/index-file@1.2.1',
                blocking: false,
                result: false,
                params: {
                  owner, repo, ref, path, paths, branch, sha: 'initial', token,
                },
              });
              jobs.push(...paths);
            } catch (e) {
              error(e);
              failures.push(...paths);
            }
          }
        }

        stream.on('end', () => {
          next();
        });

        stream.resume();
      });

      list.on('finish', async () => {
        info('tar finished');

        const paths = batch.slice();
        // start a new batch
        batch = [];
        try {
          await ow.actions.invoke({
            name: 'helix-index/index-file@1.2.1',
            blocking: false,
            result: false,
            params: {
              owner, repo, ref, paths, branch, sha: 'initial', token,
            },
          });
          jobs.push(...paths);
        } catch (e) {
          error(e);
          failures.push(...paths);
        }

        resolve({
          statusCode: 201,
          body: {
            delegated: 'update-index',
            jobs: jobs.length,
            failures,
          },
        });
      });

      phin({
        url: `https://github.com/${owner}/${repo}/tarball/${ref}`,
        stream: true,
        followRedirects: true,
      }).then((res) => {
        res
          .pipe(createGunzip())
          .pipe(list);
      });
    });

    info('download started');

    const res = await prom;
    info('completed');
    return res;
  } catch (e) {
    error(e);
    return {
      statusCode: 500,
      body: e.message,
    };
  }
}

module.exports = { main: wrap(main) };
