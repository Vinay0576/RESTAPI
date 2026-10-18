import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'logistics.condition_reports',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.condition_reports);
  },
};
