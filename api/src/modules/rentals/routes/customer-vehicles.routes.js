import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.customer_vehicles',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.customer_vehicles);
  },
};
