import {createModuleController} from '../../http/resource-controller.js';

export function createSchedulingController({resources, service}) {
  return createModuleController('scheduling', resources, service);
}
