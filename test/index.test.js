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

/* eslint-env mocha */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
// const NodeHttpAdapter = require('@pollyjs/adapter-node-http');
// const FSPersister = require('@pollyjs/persister-fs');
// const setupPolly = require('@pollyjs/core').setupMocha;

describe('Index Tests', () => {
  /*
  // polly screws up the recording of tar.gz downloads. enable at your own risk
  setupPolly({
    logging: false,
    recordFailedRequests: true,
    recordIfMissing: true,
    adapters: [NodeHttpAdapter],
    persister: FSPersister,
    persisterOptions: {
      fs: {
        recordingsDir: 'test/fixtures',
      },
    },
    matchRequestsBy: {
      headers: {
        exclude: ['authorization', 'user-agent'],
      },
    },
  });
  */


  let index;
  let invoke;
  beforeEach(() => {
    invoke = sinon.fake();
    index = proxyquire('../src/index.js', {
      openwhisk: () => ({
        actions: {
          invoke,
        },
      }),
    }).main;
  });

  it('index function bails if neccessary arguments are missing', async () => {
    const res = await index();
    assert.equal(res.statusCode, 400);
    assert.equal(res.body, 'Required arguments missing');
  });

  it('index function makes HTTP requests', async () => {
    const result = await index({
      owner: 'trieloff',
      repo: 'helix-demo',
      ref: 'e266e69024853cc6b25fdcfb963d2d0014162f1c',
      branch: 'master',
    });
    assert.equal(typeof result, 'object');
    assert.deepEqual(result.body, {
      delegated: 'update-index',
      jobs: 1,
    });

    sinon.assert.callCount(invoke, result.body.jobs);
  }).timeout(2000);

  it('index filters by pattern', async () => {
    const result = await index({
      owner: 'trieloff',
      repo: 'helix-demo',
      ref: 'ca8959afbb2668c761e47a4563f054da2444ab30',
      branch: 'master',
      pattern: '**/*.{md,html}',
    });
    assert.equal(typeof result, 'object');
    assert.deepEqual(result.body, {
      delegated: 'update-index',
      jobs: 7,
    });
    sinon.assert.callCount(invoke, result.body.jobs);
  }).timeout(50000);

  it.only('index super large repo', async () => {
    const result = await index({
      owner: 'MicrosoftDocs',
      repo: 'azure-docs',
      ref: 'a28fc7ad76fcbf92cbdcba7f2908ec1226e494ad',
      branch: 'master',
      pattern: '**/*.md',
    });
    assert.equal(typeof result, 'object');
    assert.deepEqual(result.body, {
      delegated: 'update-index',
      jobs: 7,
    });
    sinon.assert.callCount(invoke, result.body.jobs);
  }).timeout(5000000);
});
