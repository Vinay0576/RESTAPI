import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.staffing',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.staffing);
  },
};
