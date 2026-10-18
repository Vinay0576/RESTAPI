import {createModuleController} from '../../http/resource-controller.js';

export function createSupportController({resources, service}) {
  return createModuleController('support', resources, service);
}
