import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'access_control.roles',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.roles);
  },
};
