import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.work_sessions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.work_sessions);
  },
};
