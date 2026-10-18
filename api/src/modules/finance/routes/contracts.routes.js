import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.contracts',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.contracts);
  },
};
