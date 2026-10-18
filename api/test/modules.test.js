import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {modules} from '../src/modules/index.js';
import {validateModuleCoverage} from '../src/modules/register.js';

const model = JSON.parse(await readFile(new URL('../model/model.json', import.meta.url), 'utf8'));
const resources = model.tables.map(table => ({...table, domain: table.name.split('.')[0]}));

test('module registry covers every model resource exactly once', () => {
  validateModuleCoverage(resources);
  assert.equal(modules.length, 16);
  assert.equal(modules.flatMap(module => module.routes).length, 122);
});

test('module registration rejects missing, duplicate and misplaced resource routes', () => {
  const first = modules[0];
  assert.throws(() => validateModuleCoverage(resources, modules.slice(1)), /Missing resource routes/);
  assert.throws(() => validateModuleCoverage(resources, [...modules, first]), /Duplicate module/);
  assert.throws(() => validateModuleCoverage(resources, [
    {...first, routes: [...first.routes, first.routes[0]]}, ...modules.slice(1),
  ]), /Duplicate resource route/);
  assert.throws(() => validateModuleCoverage(resources, [
    {...first, routes: [...first.routes, modules[1].routes[0]]}, ...modules.slice(1),
  ]), /Unknown or misplaced resource route/);
  assert.throws(() => validateModuleCoverage(resources, [
    {...first, routes: [...first.routes, {resourceName: 'identity.nonexistent'}]}, ...modules.slice(1),
  ]), /Unknown or misplaced resource route/);
});
