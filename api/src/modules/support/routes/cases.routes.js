import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'support.cases',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.cases);
  },
};
