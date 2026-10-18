import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.journals',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.journals);
  },
};
