import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'referrals.intents',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.intents);
  },
};
