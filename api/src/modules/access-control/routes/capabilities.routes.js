import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'access_control.capabilities',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.capabilities);
  },
};
