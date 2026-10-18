import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.payment_events',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.payment_events);
  },
};
