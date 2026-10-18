import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'identity.accounts',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.accounts);
  },
};
