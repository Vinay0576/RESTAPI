import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.access_entitlements',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.access_entitlements);
  },
};
