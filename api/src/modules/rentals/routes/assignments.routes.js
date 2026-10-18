import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.assignments',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.assignments);
  },
};
