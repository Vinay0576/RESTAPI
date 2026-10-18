import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'fleet.onboarding_rule_versions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.onboarding_rule_versions);
  },
};
