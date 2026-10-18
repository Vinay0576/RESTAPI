import {createModuleController} from '../../http/resource-controller.js';

export function createIdentityController({resources, service}) {
  return createModuleController('identity', resources, service);
}
