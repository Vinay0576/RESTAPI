import {createModuleController} from '../../http/resource-controller.js';

export function createReputationController({resources, service}) {
  return createModuleController('reputation', resources, service);
}
