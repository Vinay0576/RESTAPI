import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.payouts',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.payouts);
  },
};
