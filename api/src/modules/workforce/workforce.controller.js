import {createModuleController} from '../../http/resource-controller.js';

export function createWorkforceController({resources, service}) {
  return createModuleController('workforce', resources, service);
}
