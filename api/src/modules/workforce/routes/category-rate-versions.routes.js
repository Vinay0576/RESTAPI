import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'workforce.category_rate_versions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.category_rate_versions);
  },
};
