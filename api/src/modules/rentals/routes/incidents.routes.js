import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.incidents',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.incidents);
  },
};
