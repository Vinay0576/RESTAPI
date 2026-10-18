import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.access_purchases',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.access_purchases);
  },
};
