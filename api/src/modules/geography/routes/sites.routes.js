import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'geography.sites',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.sites);
  },
};
