import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.requests',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.requests);
  },
};
