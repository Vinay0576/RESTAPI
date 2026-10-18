import {createModuleController} from '../../http/resource-controller.js';

export function createAccessControlController({resources, service}) {
  return createModuleController('access_control', resources, service);
}
