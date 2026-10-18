import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.bookings',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.bookings);
  },
};
