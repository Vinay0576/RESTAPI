import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'referrals.codes',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.codes);
  },
};
