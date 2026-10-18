import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'fleet.machine_spec_overrides',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.machine_spec_overrides);
  },
};
