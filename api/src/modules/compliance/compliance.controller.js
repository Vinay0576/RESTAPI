import {createModuleController} from '../../http/resource-controller.js';

export function createComplianceController({resources, service}) {
  return createModuleController('compliance', resources, service);
}
