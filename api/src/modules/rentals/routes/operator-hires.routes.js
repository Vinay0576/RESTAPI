import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.operator_hires',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.operator_hires);
  },
};
