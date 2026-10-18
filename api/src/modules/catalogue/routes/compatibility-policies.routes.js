import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'catalogue.compatibility_policies',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.compatibility_policies);
  },
};
