import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.refunds',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.refunds);
  },
};
