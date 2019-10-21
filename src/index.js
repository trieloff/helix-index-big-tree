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

const { wrap } = require('@adobe/helix-status');
const request = require('request-promise-native');
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
  owner, repo, ref, branch, pattern = '**/*.{md,jpg}', token,
} = {}) {
  if (!(owner && repo && ref && branch)) {
    throw new Error('Required arguments missing');
  }

  const ow = openwhisk();

  const list = tar.extract();
  const jobs = [];

  list.on('entry', (header, stream, next) => {
    const path = strip(header.name, 1);

    if (minimatch(path, pattern)) {
      ow.actions.invoke({
        name: 'helix-index/index-file@1.2.1',
        blocking: false,
        result: false,
        params: {
          owner, repo, ref, path, branch, sha: 'initial', token,
        },
      });
      jobs.push(path);
    }

    stream.on('end', () => {
      next();
    });

    stream.resume();
  });

  await request(
    `https://github.com/${owner}/${repo}/tarball/${ref}`,
  )
    .pipe(createGunzip())
    .pipe(list);

  return {
    statusCode: 201,
    body: {
      delegated: 'update-index',
      jobs,
    },
  };
}

module.exports = { main: wrap(main) };
