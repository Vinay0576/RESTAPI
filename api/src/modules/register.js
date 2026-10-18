import {modules} from './index.js';

// A missing, duplicate or misplaced route must fail startup instead of silently losing an API.
export function validateModuleCoverage(resources, definitions = modules) {
  const byName = new Map(resources.map(resource => [resource.name, resource]));
  const seen = new Set(), domains = new Set();
  for (const module of definitions) {
    if (domains.has(module.domain)) throw new Error(`Duplicate module: ${module.domain}`);
    domains.add(module.domain);
    for (const route of module.routes) {
      const resource = byName.get(route.resourceName);
      if (!resource || resource.domain !== module.domain) throw new Error(`Unknown or misplaced resource route: ${route.resourceName}`);
      if (seen.has(resource.name)) throw new Error(`Duplicate resource route: ${resource.name}`);
      seen.add(resource.name);
    }
  }
  const missing = resources.filter(resource => !seen.has(resource.name));
  if (missing.length) throw new Error(`Missing resource routes: ${missing.map(resource => resource.name).join(', ')}`);
}

export async function registerModules(app, {resources, service, db}) {
  validateModuleCoverage(resources);
  const byName = new Map(resources.map(resource => [resource.name, resource]));
  for (const module of modules) {
    await app.register(async function domainRoutes(scope) {
      const controller = module.createController({resources, service, db});
      for (const route of module.routes) {
        await scope.register(route.register, {resource: byName.get(route.resourceName), controller});
      }
      for (const route of module.extraRoutes ?? []) await scope.register(route, {controller});
    });
  }
}
