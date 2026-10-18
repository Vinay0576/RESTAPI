import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'compliance.identity_cases',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.identity_cases);
  },
};
