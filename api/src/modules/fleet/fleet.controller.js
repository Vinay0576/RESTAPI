import {createModuleController} from '../../http/resource-controller.js';

export function createFleetController({resources, service}) {
  return createModuleController('fleet', resources, service);
}
