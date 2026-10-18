import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'access_control.role_grants',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.role_grants);
  },
};
