import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'identity.app_registrations',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.app_registrations);
  },
};
