import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'support.payout_holds',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.payout_holds);
  },
};
