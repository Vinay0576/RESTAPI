import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'logistics.pickup_checks',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.pickup_checks);
  },
};
