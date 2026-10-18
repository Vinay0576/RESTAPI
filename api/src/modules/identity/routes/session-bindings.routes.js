import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'identity.session_bindings',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.session_bindings);
  },
};
