import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.entries',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.entries);
  },
};
