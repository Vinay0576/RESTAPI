import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.obligations',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.obligations);
  },
};
