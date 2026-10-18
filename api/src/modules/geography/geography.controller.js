import {createModuleController} from '../../http/resource-controller.js';

export function createGeographyController({resources, service}) {
  return createModuleController('geography', resources, service);
}
