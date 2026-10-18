import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.wage_adjustments',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.wage_adjustments);
  },
};
