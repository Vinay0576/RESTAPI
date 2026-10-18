import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'identity.device_bindings',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.device_bindings);
  },
};
