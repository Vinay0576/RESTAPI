import {createModuleController} from '../../http/resource-controller.js';

export function createAuditController({resources, service}) {
  return createModuleController('audit', resources, service);
}
