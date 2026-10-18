import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'fleet.machine_rate_versions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.machine_rate_versions);
  },
};
