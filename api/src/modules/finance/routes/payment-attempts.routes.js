import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.payment_attempts',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.payment_attempts);
  },
};
