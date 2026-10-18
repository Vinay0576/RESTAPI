import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.access_plan_versions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.access_plan_versions);
  },
};
