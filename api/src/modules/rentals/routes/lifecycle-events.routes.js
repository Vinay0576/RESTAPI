import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.lifecycle_events',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.lifecycle_events);
  },
};
