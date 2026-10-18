import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.overtime',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.overtime);
  },
};
