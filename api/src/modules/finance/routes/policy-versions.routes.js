import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.policy_versions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.policy_versions);
  },
};
