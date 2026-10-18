import {createModuleController} from '../../http/resource-controller.js';

export function createRentalsController({resources, service}) {
  return createModuleController('rentals', resources, service);
}
