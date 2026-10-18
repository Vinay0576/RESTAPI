import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'reputation.reports',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.reports);
  },
};
