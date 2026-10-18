import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'scheduling.reservations',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.reservations);
  },
};
