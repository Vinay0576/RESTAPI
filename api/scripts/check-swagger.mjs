import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import SwaggerParser from '@apidevtools/swagger-parser';
import {buildApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {modules} from '../src/modules/index.js';

const app = await buildApp(loadConfig(), {logger: false});
try {
  const response = await app.inject({method: 'GET', url: '/openapi.json'});
  assert.equal(response.statusCode, 200);
  const spec = response.json();
  await SwaggerParser.validate(structuredClone(spec));
  const saved = JSON.parse(await readFile(new URL('../docs/openapi.json', import.meta.url), 'utf8'));
  assert.deepEqual(spec, saved, 'Live Swagger differs from the saved API specification; review and export intentional API changes.');
  const docs = await app.inject({method: 'GET', url: '/docs/'});
  assert.equal(docs.statusCode, 200);
  assert.match(docs.headers['content-type'], /text\/html/);

  const counts = [];
  for (const module of modules) {
    const resources = app.resources.filter(resource => resource.domain === module.domain);
    for (const resource of resources) {
      const itemPath = resource.itemPath.replace(/:([a-z_]+)/g, '{$1}');
      const collectionMethods = resource.readOnly ? ['get'] : ['get', 'post'];
      const itemMethods = ['get', ...(resource.mode !== 'append' ? ['patch'] : []), ...(resource.mode === 'archive' ? ['delete'] : [])];
      for (const [path, expected] of [[resource.path, collectionMethods], [itemPath, itemMethods]]) {
        assert.deepEqual(Object.keys(spec.paths[path]).sort(), expected.sort(), path);
        for (const method of expected) {
          const operation = spec.paths[path][method];
          assert.deepEqual(operation.tags, [module.domain], `${method} ${path}: module tag`);
          assert.equal(operation['x-resource'], resource.name);
          assert.ok(operation.responses[method === 'post' ? '201' : method === 'delete' ? '204' : '200']);
        }
      }
    }
    const operations = Object.values(spec.paths).flatMap(path => Object.values(path))
      .filter(operation => operation.tags?.includes(module.domain)).length;
    counts.push({module: module.domain, resources: resources.length, operations});
  }
  assert.deepEqual(spec.paths['/v1/admin/finance/booking-balances'].get.tags, ['finance']);
  assert.ok(spec.paths['/v1/resources'].get);
  assert.ok(spec.paths['/v1/transactions'].post);
  assert.deepEqual(spec.security, [{apiKey: []}]);
  assert.equal(counts.length, 16);
  assert.equal(counts.reduce((sum, row) => sum + row.resources, 0), 122);
  assert.equal(counts.reduce((sum, row) => sum + row.operations, 0) + 2, 463);
  console.table(counts);
  console.log('Swagger UI and live OpenAPI verified: 16 modules, 122 resources, 463 operations; saved specification matches.');
} finally {
  await app.close();
}
