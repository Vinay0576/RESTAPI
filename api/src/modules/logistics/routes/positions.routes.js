import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'logistics.positions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.positions);
  },
};
