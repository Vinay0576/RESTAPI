import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.currencies',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.currencies);
  },
};
