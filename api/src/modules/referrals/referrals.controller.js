import {createModuleController} from '../../http/resource-controller.js';

export function createReferralsController({resources, service}) {
  return createModuleController('referrals', resources, service);
}
