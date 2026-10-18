import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.schedule_changes',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.schedule_changes);
  },
};
