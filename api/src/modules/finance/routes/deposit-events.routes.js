import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.deposit_events',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.deposit_events);
  },
};
