import {createModuleController} from '../../http/resource-controller.js';

export function createLogisticsController({resources, service}) {
  return createModuleController('logistics', resources, service);
}
