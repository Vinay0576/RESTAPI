import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.payout_events',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.payout_events);
  },
};
