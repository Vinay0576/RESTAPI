import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'referrals.attributions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.attributions);
  },
};
