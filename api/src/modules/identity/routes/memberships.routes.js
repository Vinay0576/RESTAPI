import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'identity.memberships',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.memberships);
  },
};
