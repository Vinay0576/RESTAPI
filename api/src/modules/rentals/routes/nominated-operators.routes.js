import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.nominated_operators',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.nominated_operators);
  },
};
