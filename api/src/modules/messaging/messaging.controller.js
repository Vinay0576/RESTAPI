import {createModuleController} from '../../http/resource-controller.js';

export function createMessagingController({resources, service}) {
  return createModuleController('messaging', resources, service);
}
