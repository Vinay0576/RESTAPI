import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'messaging.push_devices',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.push_devices);
  },
};
