import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'fleet.machines',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.machines);
  },
};
