import {ApiError} from '../../errors.js';
import {errors, noQuery, listQuery, resourceSchemas} from '../../http/schemas.js';
import {createContractsController} from './contracts.controller.js';

export const CONTRACT_RESOURCE = 'finance.contracts';

// Registered below the application's authentication and error-handling hooks.
export async function contractsRoutes(app, {resource, service}) {
  if (!resource || resource.name !== CONTRACT_RESOURCE || resource.mode !== 'append') {
    throw new Error('Finance contracts require the append-only finance.contracts resource.');
  }
  const controller = createContractsController(service, resource);
  const {base, one, list} = resourceSchemas(resource);

  app.get(resource.path, {
    schema: {...base, summary: `List ${resource.name}`, querystring: listQuery, response: {...errors, 200: list}},
  }, controller.list);

  app.get(resource.itemPath, {
    schema: {...base, summary: `Get ${resource.name}`, params: resource.keySchema, querystring: noQuery, response: {...errors, 200: one}},
  }, controller.get);

  app.post(resource.path, {
    schema: {...base, summary: `Create ${resource.name}`, body: resource.createSchema, querystring: noQuery, response: {...errors, 201: one}},
  }, controller.create);

  app.route({
    method: ['PATCH', 'DELETE', 'PUT'],
    url: resource.itemPath,
    schema: {hide: true},
    handler: async () => {
      throw new ApiError(405, 'OPERATION_NOT_ALLOWED', 'This resource does not support replacement, hard deletion or append-only mutation.');
    },
  });
}
