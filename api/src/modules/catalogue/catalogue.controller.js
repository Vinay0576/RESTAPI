import {createModuleController} from '../../http/resource-controller.js';

export function createCatalogueController({resources, service}) {
  return createModuleController('catalogue', resources, service);
}
